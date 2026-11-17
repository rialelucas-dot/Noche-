#include "UEPCharacter.h"
#include "UltimoEnPie.h"
#include "UEPGameMode.h"
#include "UEPIsland.h"
#include "UEPActors.h"
#include "UEPBotController.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Animation/AnimInstance.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "UObject/ConstructorHelpers.h"

AUEPCharacter::AUEPCharacter()
{
	PrimaryActorTick.bCanEverTick = true;
	GetCapsuleComponent()->InitCapsuleSize(42.f, 96.f);
	GetCapsuleComponent()->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block); // las balas pegan en la cápsula
	bUseControllerRotationPitch = false; bUseControllerRotationYaw = false; bUseControllerRotationRoll = false;
	AutoPossessAI = EAutoPossessAI::Disabled;
	AIControllerClass = AUEPBotController::StaticClass();

	UCharacterMovementComponent* Mv = GetCharacterMovement();
	Mv->bOrientRotationToMovement = true;
	Mv->RotationRate = FRotator(0.f, 600.f, 0.f);
	Mv->MaxWalkSpeed = 560.f;
	Mv->JumpZVelocity = 520.f;
	Mv->AirControl = 0.35f;
	Mv->BrakingDecelerationWalking = 2000.f;

	Boom = CreateDefaultSubobject<USpringArmComponent>(TEXT("Boom"));
	Boom->SetupAttachment(RootComponent);
	Boom->TargetArmLength = 340.f;
	Boom->SocketOffset = FVector(0.f, 60.f, 70.f);
	Boom->bUsePawnControlRotation = true;
	Boom->bEnableCameraLag = true;
	Boom->CameraLagSpeed = 18.f;
	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(Boom, USpringArmComponent::SocketName);
	Camera->bUsePawnControlRotation = false;
	Camera->FieldOfView = 80.f;

	GetMesh()->SetRelativeLocationAndRotation(FVector(0.f, 0.f, -96.f), FRotator(0.f, -90.f, 0.f));
	GetMesh()->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Sphere(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cyl(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	Gun = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Gun"));
	Gun->SetupAttachment(GetMesh());
	if (Cube.Succeeded()) Gun->SetStaticMesh(Cube.Object);
	Gun->SetRelativeScale3D(FVector(0.6f, 0.06f, 0.11f));
	Gun->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Gun->SetVisibility(false);
	Chute = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Chute"));
	Chute->SetupAttachment(RootComponent);
	if (Sphere.Succeeded()) Chute->SetStaticMesh(Sphere.Object);
	Chute->SetRelativeLocation(FVector(0.f, 0.f, 520.f));
	Chute->SetRelativeScale3D(FVector(6.f, 6.f, 1.8f));
	Chute->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Chute->SetVisibility(false);
	Body = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Body"));
	Body->SetupAttachment(RootComponent);
	if (Cyl.Succeeded()) Body->SetStaticMesh(Cyl.Object);
	Body->SetRelativeScale3D(FVector(0.7f, 0.7f, 1.85f));
	Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Body->SetVisibility(false);
}

AUEPGameMode* AUEPCharacter::GM() const { return GetWorld() ? GetWorld()->GetAuthGameMode<AUEPGameMode>() : nullptr; }

void AUEPCharacter::BeginPlay()
{
	Super::BeginPlay();
	TryLoadMannequin();
	LastValidPos = GetActorLocation();
}

void AUEPCharacter::TryLoadMannequin()
{
	// El maniquí viene con el contenido "Third Person" de Unreal; se prueban las rutas de varias versiones.
	TArray<FString> Meshes, Anims;
	if (!MeshPathOverride.IsEmpty()) Meshes.Add(MeshPathOverride);
	if (!AnimClassPathOverride.IsEmpty()) Anims.Add(AnimClassPathOverride);
	const bool bAlt = bBot && FMath::RandBool();
	Meshes.Append({
		bAlt ? TEXT("/Game/Characters/Mannequins/Meshes/SKM_Quinn_Simple.SKM_Quinn_Simple") : TEXT("/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple.SKM_Manny_Simple"),
		bAlt ? TEXT("/Game/Characters/Mannequins/Meshes/SKM_Quinn.SKM_Quinn") : TEXT("/Game/Characters/Mannequins/Meshes/SKM_Manny.SKM_Manny"),
		TEXT("/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple.SKM_Manny_Simple"), TEXT("/Game/Characters/Mannequins/Meshes/SKM_Manny.SKM_Manny") });
	Anims.Append({
		TEXT("/Game/Characters/Mannequins/Anims/Unarmed/ABP_Unarmed.ABP_Unarmed_C"), TEXT("/Game/Characters/Mannequins/Animations/ABP_Manny.ABP_Manny_C"),
		TEXT("/Game/Characters/Mannequins/Animations/ABP_Quinn.ABP_Quinn_C"), TEXT("/Game/Characters/Mannequins/Anims/ABP_Manny.ABP_Manny_C") });
	USkeletalMesh* Sk = nullptr;
	for (const FString& P : Meshes) if ((Sk = LoadObject<USkeletalMesh>(nullptr, *P, nullptr, LOAD_NoWarn | LOAD_Quiet)) != nullptr) break;
	UClass* Anim = nullptr;
	for (const FString& P : Anims) if ((Anim = LoadClass<UAnimInstance>(nullptr, *P, nullptr, LOAD_NoWarn | LOAD_Quiet)) != nullptr) break;
	bHasMannequin = Sk != nullptr;
	if (Sk)
	{
		GetMesh()->SetSkeletalMeshAsset(Sk);
		if (Anim) GetMesh()->SetAnimInstanceClass(Anim);
		Gun->AttachToComponent(GetMesh(), FAttachmentTransformRules::SnapToTargetNotIncludingScale, TEXT("hand_r"));
		Gun->SetRelativeLocation(FVector(-8.f, 4.f, 0.f));
	}
	else
	{
		if (!bBot) UE_LOG(LogUEP, Warning, TEXT("No encontré el maniquí: agregá el contenido Third Person (Add > Add Feature or Content Pack)."));
		Body->SetVisibility(true);
		Gun->AttachToComponent(Body, FAttachmentTransformRules::KeepRelativeTransform);
		Gun->SetRelativeLocation(FVector(55.f, 25.f, 10.f));
		Gun->SetRelativeScale3D(FVector(0.9f, 0.1f, 0.05f));
	}
}

const FUEPWeaponDef* AUEPCharacter::CurrentWeapon() const { return UEP::Weapon(Slots[Cur].Item); }

FVector AUEPCharacter::MuzzleLocation() const
{
	const FRotator Yaw(0.f, GetControlRotation().Yaw, 0.f);
	return GetActorLocation() + FVector(0.f, 0.f, 50.f) + Yaw.RotateVector(FVector(45.f, 22.f, 0.f));
}

void AUEPCharacter::Tick(float Dt)
{
	Super::Tick(Dt);
	AUEPGameMode* G = GM();
	if (!bAlive || !G) return;
	const float Now = GetWorld()->GetTimeSeconds();
	if (FireCd > 0.f) FireCd -= Dt;
	if (ReloadT > 0.f)
	{
		ReloadT -= Dt;
		if (ReloadT <= 0.f)
		{
			if (const FUEPWeaponDef* W = CurrentWeapon())
			{
				int32& Pool = Ammo[(int32)W->Ammo];
				const int32 N = FMath::Min(W->Mag - Slots[Cur].Mag, Pool);
				Slots[Cur].Mag += N; Pool -= N;
			}
			ReloadT = 0.f; UpdateMovementSpeed();
		}
	}
	if (HealT > 0.f)
	{
		HealT -= Dt;
		if (HealT <= 0.f)
		{
			if (HealType == EUEPItem::Venda) { --Vendas; Health = FMath::Min(75.f, Health + 18.f); }
			else { --Botiquines; Health = 100.f; }
			HealType = EUEPItem::None; HealT = 0.f; UpdateMovementSpeed();
			if (!bBot && G->Fx) G->Fx->Play(G->Fx->PickupSound, GetActorLocation(), 0.6f);
		}
	}
	if (bInPlane) return;

	UCharacterMovementComponent* Mv = GetCharacterMovement();
	const float Ground = G->Island ? G->Island->HeightAt(GetActorLocation().X, GetActorLocation().Y) : 0.f;
	if (bParachute)
	{
		const float Above = GetActorLocation().Z - Ground;
		Mv->Velocity.Z = FMath::Max(Mv->Velocity.Z, Above > 4000.f ? -1600.f : -500.f);
		Chute->SetVisibility(Above < 4500.f);
	}
	else if (!Mv->IsFalling() && G->Island)
	{
		// no se puede entrar al mar
		if (G->Island->LandAt(GetActorLocation().X, GetActorLocation().Y) < 1.f) { SetActorLocation(LastValidPos); Mv->Velocity = FVector::ZeroVector; }
		else LastValidPos = GetActorLocation();
	}
	// el jugador junta munición, curaciones, chalecos y armas si tiene lugar
	if (!bBot && !bParachute)
		for (AUEPPickup* P : G->Pickups)
			if (P && !P->bTaken && FVector::DistSquared2D(P->GetActorLocation(), GetActorLocation()) < 170.f * 170.f && FMath::Abs(P->GetActorLocation().Z - GetActorLocation().Z) < 200.f)
				if (!UEP::IsWeapon(P->Item) || Slots[0].IsEmpty() || Slots[1].IsEmpty()) TakeItem(P, false);
	// el jugador mira hacia donde apunta cuando dispara o apunta
	if (!bBot)
	{
		const bool bFace = bAiming || Now - LastFireTime < 1.2f;
		bUseControllerRotationYaw = bFace; Mv->bOrientRotationToMovement = !bFace;
		const float Arm = bParachute ? 900.f : bScoped ? 0.f : bAiming ? 150.f : 340.f;
		Boom->TargetArmLength = FMath::FInterpTo(Boom->TargetArmLength, Arm, Dt, 10.f);
		Camera->FieldOfView = FMath::FInterpTo(Camera->FieldOfView, bScoped ? 14.f : bAiming ? 55.f : 80.f, Dt, 12.f);
		GetMesh()->SetVisibility(!bScoped, true);
	}
}

void AUEPCharacter::Landed(const FHitResult& Hit)
{
	Super::Landed(Hit);
	if (bParachute)
	{
		bParachute = false; Chute->SetVisibility(false);
		GetCharacterMovement()->AirControl = 0.35f;
		UpdateMovementSpeed();
	}
}

void AUEPCharacter::UpdateMovementSpeed()
{
	float S = bParachute ? 1300.f : bSprinting ? 790.f : 560.f;
	if (!bParachute)
	{
		if (Slots[Cur].Item == EUEPItem::Precision) S *= 0.94f;
		if (HealT > 0.f) S = FMath::Min(S, 260.f); else if (ReloadT > 0.f) S *= 0.85f;
		if (bScoped) S *= 0.45f; else if (bAiming) S *= 0.65f;
	}
	GetCharacterMovement()->MaxWalkSpeed = S;
}

void AUEPCharacter::SetAim(bool bAim)
{
	const FUEPWeaponDef* W = CurrentWeapon();
	bAiming = bAim && W && !bParachute && !bInPlane;
	bScoped = bAiming && Slots[Cur].Item == EUEPItem::Precision && HealT <= 0.f;
	if (bAiming) bSprinting = false;
	UpdateMovementSpeed();
}

bool AUEPCharacter::Fire(const FVector& Dir)
{
	AUEPGameMode* G = GM();
	if (!bAlive || bInPlane || bParachute || FireCd > 0.f || !G) return false;
	const FUEPWeaponDef* W = CurrentWeapon();
	if (!W) { Punch(); return true; }
	if (ReloadT > 0.f) return false;
	FUEPWeaponSlot& S = Slots[Cur];
	if (S.Mag <= 0) { StartReload(); return false; }
	CancelHeal(); bSprinting = false;
	--S.Mag; FireCd = W->Rate * (bBot ? G->BotRateMul() : 1.f);
	LastFireTime = GetWorld()->GetTimeSeconds();
	const bool bMoving = GetVelocity().Size2D() > 200.f;
	const float Spread = W->Spread * (bMoving ? 1.6f : 1.f) * (bScoped ? 0.12f : bAiming ? 0.5f : 1.f);
	const FVector Start = MuzzleLocation();
	FCollisionQueryParams Q(SCENE_QUERY_STAT(UEPShot), true, this);
	for (int32 P = 0; P < W->Pellets; ++P)
	{
		const FVector D = FMath::VRandCone(Dir.GetSafeNormal(), Spread);
		FHitResult Hit;
		FVector End = Start + D * W->Range;
		if (GetWorld()->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility, Q))
		{
			End = Hit.ImpactPoint;
			if (AUEPCharacter* C = Cast<AUEPCharacter>(Hit.GetActor()))
			{
				if (C->bAlive)
				{
					const bool bHead = Hit.ImpactPoint.Z > C->GetActorLocation().Z + C->GetCapsuleComponent()->GetScaledCapsuleHalfHeight() - 28.f;
					const float Frac = Hit.Distance / W->Range, Fall = Frac > 0.6f ? FMath::Lerp(1.f, 0.6f, (Frac - 0.6f) / 0.4f) : 1.f;
					C->ApplyHit(W->Damage * Fall * (bHead ? 1.8f : 1.f) * (bBot ? G->BotDamageMul(C->bBot) : 1.f), this, W->Name, bHead);
				}
			}
		}
		if (G->Fx) G->Fx->Tracer(Start, End);
	}
	if (G->Fx) G->Fx->Play(G->Fx->ShotSound, GetActorLocation(), W->Pellets > 1 || W->Rank >= 4 ? 1.f : 0.7f, W->Pellets > 1 ? 0.75f : W->Mag > 20 ? 1.15f : 1.f);
	G->OnShot(this);
	if (!bBot) RecoilPitch += W->Recoil;
	if (S.Mag == 0 && Ammo[(int32)W->Ammo] > 0) StartReload();
	return true;
}

void AUEPCharacter::Punch()
{
	AUEPGameMode* G = GM();
	FireCd = 0.45f; CancelHeal();
	AUEPCharacter* Best = nullptr; float Bd = 200.f * 200.f;
	const FVector Fwd = FRotator(0.f, GetControlRotation().Yaw, 0.f).Vector();
	for (AUEPCharacter* O : G->Fighters)
	{
		if (!O || O == this || !O->bAlive || O->bInPlane) continue;
		const FVector To = O->GetActorLocation() - GetActorLocation();
		if (To.SizeSquared() < Bd && FVector::DotProduct(To.GetSafeNormal2D(), Fwd) > 0.6f) { Bd = To.SizeSquared(); Best = O; }
	}
	if (Best) Best->ApplyHit(12.f, this, TEXT("Puños"), false);
}

void AUEPCharacter::ApplyHit(float Damage, AUEPCharacter* Source, const FString& Cause, bool bHead)
{
	if (!bAlive) return;
	if (Armor > 0.f && Source && !bHead) { const float Ab = FMath::Min(Armor, Damage * 0.55f); Armor -= Ab; Damage -= Ab; }
	Health -= Damage;
	LastDamageTime = GetWorld()->GetTimeSeconds();
	if (Source)
	{
		LastDamageFrom = Source->GetActorLocation();
		if (!Source->bBot && Source != this) { Source->LastHitMarkTime = LastDamageTime; Source->bLastHitHead = bHead; if (GM() && GM()->Fx) GM()->Fx->Play(GM()->Fx->HitSound, Source->GetActorLocation(), 0.5f); }
		if (AUEPBotController* B = Cast<AUEPBotController>(GetController())) B->OnDamaged(Source);
	}
	if (Health <= 0.f) Die(Source, bHead ? Cause + TEXT(" · a la cabeza") : Cause);
}

void AUEPCharacter::Die(AUEPCharacter* Killer, const FString& Cause)
{
	bAlive = false; Health = 0.f;
	AUEPGameMode* G = GM();
	Place = G ? G->AliveCount() + 1 : 0;
	if (Killer && Killer != this) ++Killer->Kills;
	DropLoot();
	GetCharacterMovement()->DisableMovement();
	GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Gun->SetVisibility(false); Chute->SetVisibility(false);
	if (bHasMannequin)
	{
		GetMesh()->SetCollisionProfileName(TEXT("Ragdoll"));
		GetMesh()->SetSimulatePhysics(true);
	}
	else Body->SetRelativeRotation(FRotator(90.f, 0.f, 0.f));
	if (G) G->OnFighterDied(this, Killer, Cause);
}

void AUEPCharacter::DropLoot()
{
	AUEPGameMode* G = GM();
	if (!G) return;
	auto Drop = [&](EUEPItem I, int32 Amount, int32 Mag) {
		const FVector At = GetActorLocation() + FVector(FMath::FRandRange(-120.f, 120.f), FMath::FRandRange(-120.f, 120.f), 0.f);
		G->SpawnPickup(I, At, Amount, Mag);
	};
	for (const FUEPWeaponSlot& S : Slots) if (!S.IsEmpty()) Drop(S.Item, 0, S.Mag);
	for (int32 A = 0; A < 4; ++A) if (Ammo[A] > 0) Drop(UEP::AmmoItem((EUEPAmmo)A), Ammo[A], 0);
	if (Vendas > 0) Drop(EUEPItem::Venda, Vendas, 0);
	if (Botiquines > 0) Drop(EUEPItem::Botiquin, Botiquines, 0);
	if (Armor > 8.f) Drop(UEP::ArmorItemFor(Armor), FMath::RoundToInt(Armor), 0);
}

void AUEPCharacter::StartReload()
{
	const FUEPWeaponDef* W = CurrentWeapon();
	if (!W || ReloadT > 0.f || Slots[Cur].Mag >= W->Mag || Ammo[(int32)W->Ammo] <= 0) return;
	CancelHeal(); ReloadT = ReloadMax = W->Reload; UpdateMovementSpeed();
}

bool AUEPCharacter::StartHeal(EUEPItem Type)
{
	const int32 Have = Type == EUEPItem::Venda ? Vendas : Botiquines;
	if (HealT > 0.f || Have <= 0 || bParachute || bInPlane || Health >= 100.f) return false;
	if (Type == EUEPItem::Venda && Health >= 75.f) return false;
	ReloadT = 0.f; bScoped = false; HealType = Type; HealT = HealMax = Type == EUEPItem::Venda ? 2.6f : 6.f;
	UpdateMovementSpeed();
	return true;
}

void AUEPCharacter::CancelHeal() { if (HealT > 0.f) { HealT = 0.f; HealType = EUEPItem::None; UpdateMovementSpeed(); } }

void AUEPCharacter::SwitchSlot(int32 Index)
{
	if (Index == Cur || Slots[Index].IsEmpty()) return;
	Cur = Index; ReloadT = 0.f; FireCd = FMath::Max(FireCd, 0.3f); bScoped = false;
	UpdateMovementSpeed();
}

bool AUEPCharacter::TakeItem(AUEPPickup* P, bool bForce)
{
	AUEPGameMode* G = GM();
	if (!P || P->bTaken || !G) return false;
	EUEPAmmo AmmoType;
	if (UEP::IsWeapon(P->Item))
	{
		int32 Slot = Slots[0].IsEmpty() ? 0 : Slots[1].IsEmpty() ? 1 : -1;
		if (Slot < 0)
		{
			if (!bForce) return false;
			Slot = Cur;
			G->SpawnPickup(Slots[Slot].Item, GetActorLocation(), 0, Slots[Slot].Mag);
		}
		Slots[Slot].Item = P->Item; Slots[Slot].Mag = P->Mag;
		const FUEPWeaponDef* Have = CurrentWeapon();
		if (!Have || Slot == Cur || (bBot && UEP::Weapon(P->Item)->Rank > Have->Rank)) { Cur = Slot; ReloadT = 0.f; }
	}
	else if (UEP::IsAmmo(P->Item, AmmoType))
	{
		int32& Pool = Ammo[(int32)AmmoType];
		if (Pool >= UEP::MaxAmmo) return false;
		const int32 N = FMath::Min(P->Amount, UEP::MaxAmmo - Pool); Pool += N; P->Amount -= N;
		if (P->Amount > 0) return false;
	}
	else if (P->Item == EUEPItem::Venda || P->Item == EUEPItem::Botiquin)
	{
		int32& Have = P->Item == EUEPItem::Venda ? Vendas : Botiquines;
		const int32 Max = P->Item == EUEPItem::Venda ? UEP::MaxVendas : UEP::MaxBotiquines;
		if (Have >= Max) return false;
		const int32 N = FMath::Min(P->Amount, Max - Have); Have += N; P->Amount -= N;
		if (P->Amount > 0) return false;
	}
	else
	{
		const float Pts = P->Amount > 0 ? (float)P->Amount : UEP::ArmorValue(P->Item);
		if (Pts <= Armor + 4.f) return false;
		if (Armor > 8.f) G->SpawnPickup(UEP::ArmorItemFor(Armor), GetActorLocation(), FMath::RoundToInt(Armor), 0);
		Armor = Pts;
	}
	Gun->SetVisibility(CurrentWeapon() != nullptr);
	G->RemovePickup(P);
	if (!bBot && G->Fx) G->Fx->Play(G->Fx->PickupSound, GetActorLocation(), 0.8f);
	UpdateMovementSpeed();
	return true;
}

void AUEPCharacter::EnterPlane()
{
	bInPlane = true; bParachute = false;
	SetActorHiddenInGame(true);
	SetActorEnableCollision(false);
	GetCharacterMovement()->DisableMovement();
}

void AUEPCharacter::LeavePlane(const FVector& At)
{
	bInPlane = false; bParachute = true;
	SetActorLocation(At, false, nullptr, ETeleportType::TeleportPhysics);
	SetActorHiddenInGame(false);
	SetActorEnableCollision(true);
	Gun->SetVisibility(CurrentWeapon() != nullptr);
	UCharacterMovementComponent* Mv = GetCharacterMovement();
	Mv->SetMovementMode(MOVE_Falling);
	Mv->AirControl = 0.9f;
	UpdateMovementSpeed();
}
