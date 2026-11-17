#pragma once

#include "CoreMinimal.h"
#include "AIController.h"
#include "UEPBotController.generated.h"

class AUEPCharacter;
class AUEPPickup;

enum class EUEPBotState : uint8 { Loot, Zone, Fight, Brawl, Flee, Heal, Hunt, Investigate, Wander };

// Cerebro de los bots: decide 4 veces por segundo y maneja al personaje en cada cuadro.
UCLASS()
class ULTIMOENPIE_API AUEPBotController : public AAIController
{
	GENERATED_BODY()

public:
	AUEPBotController();
	virtual void Tick(float DeltaSeconds) override;
	void OnDamaged(AUEPCharacter* Source);
	void OnHeardShot(const FVector& Where);

	float JumpAt = 0.5f;               // en qué parte del recorrido del avión salta
	FVector LandTarget = FVector::ZeroVector;

private:
	AUEPCharacter* Me() const;
	void Think();
	void Drive(float Dt);
	void SetGoal(const FVector& G);
	bool HasLOS(const AUEPCharacter* Other) const;
	float WantItem(const AUEPPickup* P) const;
	bool Usable(int32 Slot) const;

	EUEPBotState State = EUEPBotState::Loot;
	TWeakObjectPtr<AUEPCharacter> Target;
	TWeakObjectPtr<AUEPCharacter> Threat;
	TWeakObjectPtr<AUEPPickup> LootTarget;
	TWeakObjectPtr<AUEPPickup> Banned;
	TArray<FVector> Waypoints;
	FVector Goal = FVector::ZeroVector;
	bool bHasGoal = false;
	bool bLOS = false;
	bool bHeard = false;
	bool bHeadAim = false;
	FVector HeardPos = FVector::ZeroVector;
	float HeardT = 0.f, ThreatT = 0.f, ThinkT = 0.f, ReactT = 0.f, AimT = 0.f, AimYaw = 0.f, AimPitch = 0.f;
	float StrafeT = 0.f, StrafeDir = 1.f, CheckT = 0.8f, UnstickT = 0.f, UnstickYaw = 0.f, SwapT = 0.f;
	int32 Stuck = 0;
	FVector LastPos = FVector::ZeroVector;
};
