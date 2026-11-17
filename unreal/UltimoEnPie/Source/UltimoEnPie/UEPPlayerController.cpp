#include "UEPPlayerController.h"
#include "UltimoEnPie.h"
#include "UEPCharacter.h"
#include "UEPGameMode.h"
#include "UEPActors.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "InputActionValue.h"
#include "Engine/LocalPlayer.h"

// índices de las acciones (con prefijo para no tapar otros nombres)
namespace EAct { enum Type { AMove, ALook, AFire, AAim, ASprint, AJump, AUse, AReload, AHeal, ASwap, ASlot1, ASlot2, APause, ARestart, AMap, ACount }; }

void AUEPPlayerController::BeginPlay()
{
	Super::BeginPlay();
	bShowMouseCursor = false;
	SetInputMode(FInputModeGameOnly());
	EnsureInput();
}

void AUEPPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();
	EnsureInput();
}

UInputAction* AUEPPlayerController::MakeAction(bool bAxis2D, bool bWhenPaused)
{
	UInputAction* A = NewObject<UInputAction>(this);
	A->ValueType = bAxis2D ? EInputActionValueType::Axis2D : EInputActionValueType::Boolean;
	A->bTriggerWhenPaused = bWhenPaused;
	Actions.Add(A);
	return A;
}

void AUEPPlayerController::EnsureInput()
{
	if (!Context)
	{
		Context = NewObject<UInputMappingContext>(this);
		for (int32 i = 0; i < EAct::ACount; ++i) MakeAction(i == EAct::AMove || i == EAct::ALook, i == EAct::APause || i == EAct::ARestart);
		auto AddKey = [this](int32 Act, const FKey& Key, bool bSwizzle = false, bool bNegate = false) {
			FEnhancedActionKeyMapping& M = Context->MapKey(Actions[Act], Key);
			if (bSwizzle) { UInputModifierSwizzleAxis* S = NewObject<UInputModifierSwizzleAxis>(this); S->Order = EInputAxisSwizzle::YXZ; M.Modifiers.Add(S); }
			if (bNegate) M.Modifiers.Add(NewObject<UInputModifierNegate>(this));
		};
		AddKey(EAct::AMove, EKeys::W, true); AddKey(EAct::AMove, EKeys::S, true, true); AddKey(EAct::AMove, EKeys::D); AddKey(EAct::AMove, EKeys::A, false, true);
		AddKey(EAct::AMove, EKeys::Up, true); AddKey(EAct::AMove, EKeys::Down, true, true); AddKey(EAct::AMove, EKeys::Right); AddKey(EAct::AMove, EKeys::Left, false, true);
		AddKey(EAct::ALook, EKeys::Mouse2D);
		AddKey(EAct::AFire, EKeys::LeftMouseButton); AddKey(EAct::AAim, EKeys::RightMouseButton); AddKey(EAct::ASprint, EKeys::LeftShift);
		AddKey(EAct::AJump, EKeys::SpaceBar); AddKey(EAct::AUse, EKeys::E); AddKey(EAct::AUse, EKeys::F); AddKey(EAct::AReload, EKeys::R); AddKey(EAct::AHeal, EKeys::H);
		AddKey(EAct::ASwap, EKeys::Q); AddKey(EAct::ASwap, EKeys::MouseScrollUp); AddKey(EAct::ASwap, EKeys::MouseScrollDown);
		AddKey(EAct::ASlot1, EKeys::One); AddKey(EAct::ASlot2, EKeys::Two); AddKey(EAct::APause, EKeys::P); AddKey(EAct::ARestart, EKeys::Enter); AddKey(EAct::AMap, EKeys::M);
	}
	if (!bBound)
		if (UEnhancedInputComponent* E = Cast<UEnhancedInputComponent>(InputComponent))
		{
			E->BindAction(Actions[EAct::AMove], ETriggerEvent::Triggered, this, &AUEPPlayerController::OnMove);
			E->BindAction(Actions[EAct::AMove], ETriggerEvent::Completed, this, &AUEPPlayerController::OnMoveEnd);
			E->BindAction(Actions[EAct::ALook], ETriggerEvent::Triggered, this, &AUEPPlayerController::OnLook);
			E->BindAction(Actions[EAct::AFire], ETriggerEvent::Started, this, &AUEPPlayerController::OnFire);
			E->BindAction(Actions[EAct::AFire], ETriggerEvent::Completed, this, &AUEPPlayerController::OnFireEnd);
			E->BindAction(Actions[EAct::AAim], ETriggerEvent::Started, this, &AUEPPlayerController::OnAim);
			E->BindAction(Actions[EAct::AAim], ETriggerEvent::Completed, this, &AUEPPlayerController::OnAimEnd);
			E->BindAction(Actions[EAct::ASprint], ETriggerEvent::Started, this, &AUEPPlayerController::OnSprint);
			E->BindAction(Actions[EAct::ASprint], ETriggerEvent::Completed, this, &AUEPPlayerController::OnSprintEnd);
			E->BindAction(Actions[EAct::AJump], ETriggerEvent::Started, this, &AUEPPlayerController::OnJump);
			E->BindAction(Actions[EAct::AUse], ETriggerEvent::Started, this, &AUEPPlayerController::OnUse);
			E->BindAction(Actions[EAct::AReload], ETriggerEvent::Started, this, &AUEPPlayerController::OnReload);
			E->BindAction(Actions[EAct::AHeal], ETriggerEvent::Started, this, &AUEPPlayerController::OnHeal);
			E->BindAction(Actions[EAct::ASwap], ETriggerEvent::Started, this, &AUEPPlayerController::OnSwap);
			E->BindAction(Actions[EAct::ASlot1], ETriggerEvent::Started, this, &AUEPPlayerController::OnSlot1);
			E->BindAction(Actions[EAct::ASlot2], ETriggerEvent::Started, this, &AUEPPlayerController::OnSlot2);
			E->BindAction(Actions[EAct::APause], ETriggerEvent::Started, this, &AUEPPlayerController::OnPause);
			E->BindAction(Actions[EAct::ARestart], ETriggerEvent::Started, this, &AUEPPlayerController::OnRestart);
			E->BindAction(Actions[EAct::AMap], ETriggerEvent::Started, this, &AUEPPlayerController::OnMap);
			bBound = true;
		}
	if (!bContextAdded)
		if (ULocalPlayer* LP = GetLocalPlayer())
			if (UEnhancedInputLocalPlayerSubsystem* Sub = LP->GetSubsystem<UEnhancedInputLocalPlayerSubsystem>())
			{
				Sub->AddMappingContext(Context, 0);
				bContextAdded = true;
			}
}

AUEPCharacter* AUEPPlayerController::Hero() const { return Cast<AUEPCharacter>(GetPawn()); }

void AUEPPlayerController::OnMove(const FInputActionValue& V)
{
	MoveInput = V.Get<FVector2D>();
	AUEPCharacter* H = Hero();
	if (!H || !H->bAlive || H->bInPlane) return;
	const FRotator Yaw(0.f, GetControlRotation().Yaw, 0.f);
	H->AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::X), MoveInput.Y);
	H->AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y), MoveInput.X);
}

void AUEPPlayerController::OnMoveEnd(const FInputActionValue& V) { MoveInput = FVector2D::ZeroVector; }

void AUEPPlayerController::OnLook(const FInputActionValue& V)
{
	const FVector2D L = V.Get<FVector2D>();
	const AUEPCharacter* H = Hero();
	const float K = MouseSensitivity * (H && H->bScoped ? 0.22f : H && H->bAiming ? 0.6f : 1.f);
	FRotator R = GetControlRotation();
	R.Yaw += L.X * K;
	R.Pitch = FMath::Clamp(FRotator::NormalizeAxis(R.Pitch + L.Y * K), -75.f, 70.f);
	SetControlRotation(R);
}

void AUEPPlayerController::OnAim(const FInputActionValue& V) { if (AUEPCharacter* H = Hero()) H->SetAim(true); }
void AUEPPlayerController::OnAimEnd(const FInputActionValue& V) { if (AUEPCharacter* H = Hero()) H->SetAim(false); }

void AUEPPlayerController::OnJump(const FInputActionValue& V)
{
	AUEPCharacter* H = Hero();
	if (!H || !H->bAlive) return;
	if (H->bInPlane) { if (AUEPGameMode* G = H->GM()) G->PlayerJump(); }
	else H->Jump();
}

void AUEPPlayerController::OnUse(const FInputActionValue& V)
{
	AUEPCharacter* H = Hero();
	AUEPGameMode* G = H ? H->GM() : nullptr;
	if (!G || !H->bAlive) return;
	AUEPPickup* Best = nullptr; float Bd = 240.f * 240.f;
	for (AUEPPickup* P : G->Pickups)
		if (P && !P->bTaken) { const float D = FVector::DistSquared2D(P->GetActorLocation(), H->GetActorLocation()); if (D < Bd) { Bd = D; Best = P; } }
	if (Best) H->TakeItem(Best, true);
}

void AUEPPlayerController::OnReload(const FInputActionValue& V) { if (AUEPCharacter* H = Hero()) H->StartReload(); }

void AUEPPlayerController::OnHeal(const FInputActionValue& V)
{
	AUEPCharacter* H = Hero();
	if (!H) return;
	const bool bVenda = H->Health < 75.f && H->Vendas > 0 && !(H->Health < 40.f && H->Botiquines > 0);
	H->StartHeal(bVenda ? EUEPItem::Venda : EUEPItem::Botiquin);
}

void AUEPPlayerController::OnSwap(const FInputActionValue& V) { if (AUEPCharacter* H = Hero()) H->SwitchSlot(1 - H->Cur); }
void AUEPPlayerController::OnSlot1(const FInputActionValue& V) { if (AUEPCharacter* H = Hero()) H->SwitchSlot(0); }
void AUEPPlayerController::OnSlot2(const FInputActionValue& V) { if (AUEPCharacter* H = Hero()) H->SwitchSlot(1); }
void AUEPPlayerController::OnPause(const FInputActionValue& V) { SetPause(!IsPaused()); }

void AUEPPlayerController::OnRestart(const FInputActionValue& V)
{
	if (const AUEPCharacter* H = Hero()) if (AUEPGameMode* G = H->GM()) if (G->bMatchOver) G->Restart();
}

void AUEPPlayerController::PlayerTick(float Dt)
{
	Super::PlayerTick(Dt);
	EnsureInput();
	AUEPCharacter* H = Hero();
	if (!H || !H->bAlive || IsPaused()) return;
	const bool bSprint = bSprintHeld && !bFireHeld && !H->bAiming && MoveInput.Y > 0.5f;
	if (bSprint != H->bSprinting) { H->bSprinting = bSprint; H->UpdateMovementSpeed(); }
	if (H->RecoilPitch > 0.f)
	{
		const float K = FMath::Min(H->RecoilPitch, Dt * 25.f + H->RecoilPitch * 0.5f);
		FRotator R = GetControlRotation();
		R.Pitch = FMath::Clamp(FRotator::NormalizeAxis(R.Pitch + K), -75.f, 70.f);
		SetControlRotation(R);
		H->RecoilPitch -= K;
	}
	if (bFireHeld && !H->bInPlane && !H->bParachute)
	{
		// el disparo va hacia donde apunta la mira del centro de la pantalla
		FVector CamLoc; FRotator CamRot;
		GetPlayerViewPoint(CamLoc, CamRot);
		const FVector Fwd = CamRot.Vector();
		FVector Target = CamLoc + Fwd * 60000.f;
		FHitResult Hit;
		FCollisionQueryParams Q(SCENE_QUERY_STAT(UEPAim), true, H);
		if (GetWorld()->LineTraceSingleByChannel(Hit, CamLoc + Fwd * 50.f, Target, ECC_Visibility, Q)) Target = Hit.ImpactPoint;
		H->Fire((Target - H->MuzzleLocation()).GetSafeNormal());
	}
}
