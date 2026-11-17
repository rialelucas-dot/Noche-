#include "UEPGameMode.h"
#include "UltimoEnPie.h"
#include "UEPCharacter.h"
#include "UEPBotController.h"
#include "UEPPlayerController.h"
#include "UEPHUD.h"
#include "UEPIsland.h"
#include "UEPActors.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/Material.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/SpringArmComponent.h"

namespace
{
	const TCHAR* GBotNames[] = { TEXT("Puma"), TEXT("Tero"), TEXT("Chajá"), TEXT("Hornero"), TEXT("Yarará"), TEXT("Carancho"), TEXT("Ñandú"), TEXT("Vizcacha"),
		TEXT("Benteveo"), TEXT("Zorro"), TEXT("Cóndor"), TEXT("Tatú"), TEXT("Bagual"), TEXT("Quirquincho"), TEXT("Coipo"), TEXT("Yaguareté"), TEXT("Mara"),
		TEXT("Guanaco"), TEXT("Lechuza"), TEXT("Chimango"), TEXT("Pecarí"), TEXT("Hurón"), TEXT("Calandria"), TEXT("Biguá"), TEXT("Cuis"), TEXT("Tordo"), TEXT("Pampa"), TEXT("Surubí") };
}

AUEPGameMode::AUEPGameMode()
{
	PrimaryActorTick.bCanEverTick = true;
	DefaultPawnClass = AUEPCharacter::StaticClass();
	PlayerControllerClass = AUEPPlayerController::StaticClass();
	HUDClass = AUEPHUD::StaticClass();
}

void AUEPGameMode::BeginPlay()
{
	Super::BeginPlay();
	const int32 Seed = FMath::Rand();
	Rand.Initialize(Seed);
	FActorSpawnParameters Sp; Sp.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	UWorld* W = GetWorld();
	Island = W->SpawnActor<AUEPIsland>(AUEPIsland::StaticClass(), FTransform::Identity, Sp);
	Island->Generate(Seed);
	Zone = W->SpawnActor<AUEPZone>(AUEPZone::StaticClass(), FTransform::Identity, Sp);
	Zone->Start(Island, Seed + 1);
	Fx = W->SpawnActor<AUEPFx>(AUEPFx::StaticClass(), FTransform::Identity, Sp);

	// el avión cruza la isla en línea recta
	const float A = Rand.FRand() * 2.f * PI, Off = Rand.FRandRange(-110.f, 110.f) * UEP_M;
	const FVector D(FMath::Cos(A), FMath::Sin(A), 0.f), N(-D.Y, D.X, 0.f), Up(0.f, 0.f, 15000.f);
	PlaneA = N * Off - D * 52000.f + Up; PlaneB = N * Off + D * 52000.f + Up;
	Plane = W->SpawnActor<AUEPPlane>(AUEPPlane::StaticClass(), FTransform(D.Rotation(), PlaneA), Sp);

	SpawnLoot();
	SpawnBots();
}

int32 AUEPGameMode::AliveCount() const
{
	int32 N = 0;
	for (const AUEPCharacter* C : Fighters) if (C && C->bAlive) ++N;
	return N;
}

UMaterialInterface* AUEPGameMode::ItemMaterial(EUEPItem Item)
{
	if (TObjectPtr<UMaterialInterface>* Found = ItemMats.Find((uint8)Item)) return *Found;
	UMaterialInterface* Base = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/UEP/Materials/M_Color.M_Color"), nullptr, LOAD_NoWarn | LOAD_Quiet);
	if (!Base) Base = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	UMaterialInstanceDynamic* Mid = UMaterialInstanceDynamic::Create(Base, this);
	if (Mid) Mid->SetVectorParameterValue(TEXT("Color"), UEP::ItemColor(Item));
	ItemMats.Add((uint8)Item, Mid);
	return Mid;
}

AUEPPickup* AUEPGameMode::SpawnPickup(EUEPItem Item, FVector At, int32 Amount, int32 Mag)
{
	if (Item == EUEPItem::None) return nullptr;
	// apoya el objeto sobre el piso o el suelo (ignora personajes)
	FHitResult Hit;
	FCollisionObjectQueryParams Obj; Obj.AddObjectTypesToQuery(ECC_WorldStatic); Obj.AddObjectTypesToQuery(ECC_WorldDynamic);
	FCollisionQueryParams Q(SCENE_QUERY_STAT(UEPPickupFloor), true);
	if (GetWorld()->LineTraceSingleByObjectType(Hit, At + FVector(0, 0, 100), At - FVector(0, 0, 3000), Obj, Q)) At = Hit.ImpactPoint + FVector(0, 0, 2);
	if (Amount < 0) Amount = UEP::DefaultAmount(Item);
	if (Mag < 0) { const FUEPWeaponDef* W = UEP::Weapon(Item); Mag = W ? W->Mag : 0; }
	FActorSpawnParameters Sp; Sp.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	AUEPPickup* P = GetWorld()->SpawnActor<AUEPPickup>(AUEPPickup::StaticClass(), FTransform(FRotator(0.f, FMath::FRand() * 360.f, 0.f), At), Sp);
	if (!P) return nullptr;
	P->Init(Item, Amount, Mag, ItemMaterial(Item));
	NewPickups.Add(P);
	return P;
}

void AUEPGameMode::RemovePickup(AUEPPickup* P)
{
	if (!P) return;
	P->bTaken = true;
	P->SetActorHiddenInGame(true);
}

void AUEPGameMode::SpawnLoot()
{
	auto Put = [&](EUEPItem I, const FVector& At) {
		SpawnPickup(I, At);
		if (const FUEPWeaponDef* W = UEP::Weapon(I)) SpawnPickup(UEP::AmmoItem(W->Ammo), At + FVector(90.f, 30.f, 0.f));
	};
	for (const FUEPBuilding& B : Island->Buildings)
	{
		const int32 N = (B.bMilitary ? 5 : 3) + Rand.RandRange(0, 3);
		for (int32 i = 0; i < N; ++i)
			Put(UEP::RollLoot(Rand, B.bMilitary), FVector(B.Pos.X + Rand.FRandRange(-B.HW + 140.f, B.HW - 140.f), B.Pos.Y + Rand.FRandRange(-B.HD + 140.f, B.HD - 140.f), B.Base));
	}
	for (int32 i = 0; i < 110; ++i)
	{
		FVector P;
		if (Island->RandomLandPoint(Rand, 6.f, P, 330.f)) Put(UEP::RollLoot(Rand, false), P);
	}
}

void AUEPGameMode::SpawnBots()
{
	TArray<FString> Names;
	for (const TCHAR* N : GBotNames) Names.Add(N);
	for (int32 i = Names.Num() - 1; i > 0; --i) Names.Swap(i, Rand.RandRange(0, i));
	const FTransform T(PlanePos());
	for (int32 i = 0; i < FMath::Min(BotCount, Names.Num()); ++i)
	{
		AUEPCharacter* C = GetWorld()->SpawnActorDeferred<AUEPCharacter>(AUEPCharacter::StaticClass(), T, nullptr, nullptr, ESpawnActorCollisionHandlingMethod::AlwaysSpawn);
		if (!C) continue;
		C->bBot = true; C->DisplayName = Names[i];
		C->FinishSpawning(T);
		FActorSpawnParameters Sp; Sp.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		AUEPBotController* AI = GetWorld()->SpawnActor<AUEPBotController>(AUEPBotController::StaticClass(), T, Sp);
		AI->Possess(C);
		AI->JumpAt = Rand.FRandRange(0.12f, 0.82f);
		C->bUseControllerRotationYaw = true;
		C->GetCharacterMovement()->bOrientRotationToMovement = false;
		C->EnterPlane();
		Fighters.Add(C);
	}
}

void AUEPGameMode::BotJump(AUEPCharacter* C)
{
	AUEPBotController* AI = Cast<AUEPBotController>(C->GetController());
	const FVector From = PlanePos();
	TArray<const FUEPBuilding*> Near;
	for (const FUEPBuilding& B : Island->Buildings) if (FVector2D::Distance(B.Pos, FVector2D(From.X, From.Y)) < 17000.f) Near.Add(&B);
	FVector Target;
	if (Near.Num() && Rand.FRand() < 0.75f)
	{
		const FUEPBuilding* B = Near[Rand.RandRange(0, Near.Num() - 1)];
		Target = FVector(B->Pos.X + Rand.FRandRange(-B->HW + 120.f, B->HW - 120.f), B->Pos.Y + Rand.FRandRange(-B->HD + 120.f, B->HD - 120.f), B->Base);
	}
	else
	{
		const float A = Rand.FRand() * 2.f * PI, R = Rand.FRandRange(2000.f, 14000.f);
		Target = Island->NearestLand(From + FVector(FMath::Cos(A) * R, FMath::Sin(A) * R, 0.f), 8.f);
	}
	if (AI) AI->LandTarget = Target;
	C->LeavePlane(From - FVector(0, 0, 300));
}

void AUEPGameMode::PlayerJump()
{
	AUEPCharacter* P = Player.Get();
	if (!P || !P->bInPlane) return;
	P->LeavePlane(PlanePos() - FVector(0, 0, 300));
	bPlanePhase = false;
}

void AUEPGameMode::Tick(float Dt)
{
	Super::Tick(Dt);
	MatchTime += Dt;
	// el jugador arranca dentro del avión
	if (!Player.IsValid())
		if (APlayerController* PC = GetWorld()->GetFirstPlayerController())
			if (AUEPCharacter* C = Cast<AUEPCharacter>(PC->GetPawn()))
			{
				Player = C; C->DisplayName = TEXT("Vos");
				C->EnterPlane();
				Fighters.Add(C);
				PC->SetControlRotation(FRotator(-25.f, (PlaneB - PlaneA).Rotation().Yaw + 50.f, 0.f));
			}

	Pickups.Append(NewPickups); NewPickups.Reset();
	for (int32 i = Pickups.Num() - 1; i >= 0; --i)
		if (!Pickups[i] || Pickups[i]->bTaken) { if (Pickups[i]) Pickups[i]->Destroy(); Pickups.RemoveAtSwap(i); }

	if (PlaneProgress < 1.15f)
	{
		PlaneProgress = FMath::Min(1.15f, PlaneProgress + Dt / PlaneDuration);
		Plane->SetActorLocation(PlanePos());
		for (AUEPCharacter* C : Fighters)
		{
			if (!C || !C->bInPlane) continue;
			C->SetActorLocation(PlanePos() - FVector(0, 0, 200));
			if (C->bBot) { const AUEPBotController* AI = Cast<AUEPBotController>(C->GetController()); if (!AI || PlaneProgress >= AI->JumpAt) BotJump(C); }
			else
			{
				C->Boom->TargetArmLength = 3600.f;
				if (PlaneProgress >= 0.9f) PlayerJump();
			}
		}
		if (PlaneProgress >= 1.15f) Plane->SetActorHiddenInGame(true);
	}

	if (Zone)
		for (AUEPCharacter* C : Fighters)
			if (C && C->bAlive && !C->bInPlane && !C->bParachute && Zone->IsOutside(C->GetActorLocation()))
				C->ApplyHit(Zone->Dps * Dt, nullptr, TEXT("zona"), false);

	for (int32 i = Pings.Num() - 1; i >= 0; --i) { Pings[i].W -= Dt; if (Pings[i].W <= 0.f) Pings.RemoveAtSwap(i); }
	Feed.RemoveAll([this](const FUEPFeedLine& L) { return MatchTime - L.Time > 7.f; });
	CheckEnd();
}

void AUEPGameMode::OnFighterDied(AUEPCharacter* Victim, AUEPCharacter* Killer, const FString& Cause)
{
	Feed.Add({ Killer && Killer != Victim ? FString::Printf(TEXT("%s eliminó a %s · %s"), *Killer->DisplayName, *Victim->DisplayName, *Cause)
		: FString::Printf(TEXT("%s quedó fuera de la zona"), *Victim->DisplayName), MatchTime });
	if (Feed.Num() > 5) Feed.RemoveAt(0);
	if (Victim == Player.Get() && !bMatchOver)
	{
		bMatchOver = true; bPlayerWon = false; EndTitle = TEXT("ELIMINADO");
		EndDetail = Killer && Killer != Victim
			? FString::Printf(TEXT("Te eliminó %s · Puesto #%d · %d bajas"), *Killer->DisplayName, Victim->Place, Victim->Kills)
			: FString::Printf(TEXT("Te alcanzó la zona · Puesto #%d · %d bajas"), Victim->Place, Victim->Kills);
	}
	CheckEnd();
}

void AUEPGameMode::CheckEnd()
{
	AUEPCharacter* P = Player.Get();
	if (bMatchOver || !P || !P->bAlive || P->bInPlane || AliveCount() != 1) return;
	bMatchOver = true; bPlayerWon = true; EndTitle = TEXT("ÚLTIMO EN PIE");
	EndDetail = FString::Printf(TEXT("Te quedaste solo en la isla con %d bajas"), P->Kills);
}

void AUEPGameMode::OnShot(AUEPCharacter* Shooter)
{
	const FVector L = Shooter->GetActorLocation();
	if (Shooter != Player.Get()) Pings.Add(FVector4(L.X, L.Y, L.Z, 1.6f));
	for (AUEPCharacter* C : Fighters)
		if (C && C != Shooter && C->bBot && C->bAlive && FVector::DistSquared(C->GetActorLocation(), L) < 7000.f * 7000.f)
			if (AUEPBotController* AI = Cast<AUEPBotController>(C->GetController())) AI->OnHeardShot(L);
}

void AUEPGameMode::Restart()
{
	UGameplayStatics::OpenLevel(this, FName(*UGameplayStatics::GetCurrentLevelName(this)));
}

float AUEPGameMode::BotSight() const { const float V[3] = { 4400.f, 5400.f, 6400.f }; return V[FMath::Clamp(Difficulty, 0, 2)]; }
float AUEPGameMode::BotAim() const { const float V[3] = { 0.11f, 0.07f, 0.045f }; return V[FMath::Clamp(Difficulty, 0, 2)]; }
float AUEPGameMode::BotReaction() const { const float V[3] = { 0.95f, 0.6f, 0.36f }; return V[FMath::Clamp(Difficulty, 0, 2)]; }
float AUEPGameMode::BotRateMul() const { const float V[3] = { 1.5f, 1.15f, 1.f }; return V[FMath::Clamp(Difficulty, 0, 2)]; }
float AUEPGameMode::BotDamageMul(bool bTargetIsBot) const { return (Difficulty == 0 ? 0.8f : 1.f) * (bTargetIsBot ? 0.7f : 1.f); }
