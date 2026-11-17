#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "UEPTypes.h"
#include "UEPGameMode.generated.h"

class AUEPIsland;
class AUEPZone;
class AUEPFx;
class AUEPPlane;
class AUEPPickup;
class AUEPCharacter;
class UMaterialInterface;

struct FUEPFeedLine { FString Text; float Time; };

// Reglas de la partida: avión, botín, bots, zona y fin.
UCLASS(Config = Game)
class ULTIMOENPIE_API AUEPGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AUEPGameMode();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	// 0 fácil, 1 normal, 2 difícil (DefaultGame.ini)
	UPROPERTY(Config) int32 Difficulty = 1;
	UPROPERTY(Config) int32 BotCount = 24;

	UPROPERTY() TObjectPtr<AUEPIsland> Island;
	UPROPERTY() TObjectPtr<AUEPZone> Zone;
	UPROPERTY() TObjectPtr<AUEPFx> Fx;
	UPROPERTY() TObjectPtr<AUEPPlane> Plane;
	UPROPERTY() TArray<TObjectPtr<AUEPCharacter>> Fighters;
	UPROPERTY() TArray<TObjectPtr<AUEPPickup>> Pickups;
	TWeakObjectPtr<AUEPCharacter> Player;

	TArray<FUEPFeedLine> Feed;
	TArray<FVector4> Pings;       // disparos oídos: x, y, z, tiempo
	bool bPlanePhase = true;
	bool bMatchOver = false;
	bool bPlayerWon = false;
	float MatchTime = 0.f;
	float PlaneProgress = 0.f;
	FVector PlaneA = FVector::ZeroVector, PlaneB = FVector::ZeroVector;
	FString EndTitle, EndDetail;

	int32 AliveCount() const;
	AUEPPickup* SpawnPickup(EUEPItem Item, FVector At, int32 Amount = -1, int32 Mag = -1);
	void RemovePickup(AUEPPickup* P);
	void OnFighterDied(AUEPCharacter* Victim, AUEPCharacter* Killer, const FString& Cause);
	void OnShot(AUEPCharacter* Shooter);
	void PlayerJump();
	void Restart();
	FVector PlanePos() const { return FMath::Lerp(PlaneA, PlaneB, PlaneProgress); }

	float BotSight() const;
	float BotAim() const;
	float BotReaction() const;
	float BotRateMul() const;
	float BotDamageMul(bool bTargetIsBot) const;

private:
	void SpawnBots();
	void SpawnLoot();
	void BotJump(AUEPCharacter* C);
	void CheckEnd();
	UMaterialInterface* ItemMaterial(EUEPItem Item);

	UPROPERTY() TArray<TObjectPtr<AUEPPickup>> NewPickups;
	UPROPERTY() TMap<uint8, TObjectPtr<UMaterialInterface>> ItemMats;
	FRandomStream Rand;
	float PlaneDuration = 32.f;
};
