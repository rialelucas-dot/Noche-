#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "UEPPlayerController.generated.h"

class UInputAction;
class UInputMappingContext;
class AUEPCharacter;
struct FInputActionValue;

// Controles del jugador. Las acciones de Enhanced Input se crean en código: no hace falta ningún archivo del editor.
UCLASS()
class ULTIMOENPIE_API AUEPPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	virtual void BeginPlay() override;
	virtual void SetupInputComponent() override;
	virtual void PlayerTick(float DeltaTime) override;

	bool bShowBigMap = false;
	float MouseSensitivity = 0.12f;

private:
	void EnsureInput();
	AUEPCharacter* Hero() const;
	UInputAction* MakeAction(bool bAxis2D, bool bWhenPaused = false);

	void OnMove(const FInputActionValue& V);
	void OnMoveEnd(const FInputActionValue& V);
	void OnLook(const FInputActionValue& V);
	void OnFire(const FInputActionValue& V) { bFireHeld = true; }
	void OnFireEnd(const FInputActionValue& V) { bFireHeld = false; }
	void OnAim(const FInputActionValue& V);
	void OnAimEnd(const FInputActionValue& V);
	void OnSprint(const FInputActionValue& V) { bSprintHeld = true; }
	void OnSprintEnd(const FInputActionValue& V) { bSprintHeld = false; }
	void OnJump(const FInputActionValue& V);
	void OnUse(const FInputActionValue& V);
	void OnReload(const FInputActionValue& V);
	void OnHeal(const FInputActionValue& V);
	void OnSwap(const FInputActionValue& V);
	void OnSlot1(const FInputActionValue& V);
	void OnSlot2(const FInputActionValue& V);
	void OnPause(const FInputActionValue& V);
	void OnRestart(const FInputActionValue& V);
	void OnMap(const FInputActionValue& V) { bShowBigMap = !bShowBigMap; }

	UPROPERTY() TObjectPtr<UInputMappingContext> Context;
	UPROPERTY() TArray<TObjectPtr<UInputAction>> Actions;
	bool bBound = false;
	bool bContextAdded = false;
	bool bFireHeld = false;
	bool bSprintHeld = false;
	FVector2D MoveInput = FVector2D::ZeroVector;
};
