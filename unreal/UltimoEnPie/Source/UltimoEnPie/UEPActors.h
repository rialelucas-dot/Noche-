#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "UEPTypes.h"
#include "UEPActors.generated.h"

class UStaticMeshComponent;
class UMaterialInterface;
class USoundBase;
class AUEPIsland;

// Objeto en el piso (arma, munición, curación o chaleco)
UCLASS()
class ULTIMOENPIE_API AUEPPickup : public AActor
{
	GENERATED_BODY()
public:
	AUEPPickup();
	void Init(EUEPItem InItem, int32 InAmount, int32 InMag, UMaterialInterface* Mat);

	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Mesh;
	EUEPItem Item = EUEPItem::None;
	int32 Amount = 0;
	int32 Mag = 0;
	bool bTaken = false;
};

// Zona segura que se achica por fases
UCLASS()
class ULTIMOENPIE_API AUEPZone : public AActor
{
	GENERATED_BODY()
public:
	AUEPZone();
	virtual void Tick(float DeltaSeconds) override;
	void Start(AUEPIsland* InIsland, int32 Seed);
	bool IsOutside(const FVector& P) const { return FVector2D::DistSquared(FVector2D(P.X, P.Y), CurC) > CurR * CurR; }

	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Wall;
	FVector2D CurC = FVector2D::ZeroVector, NextC = FVector2D::ZeroVector, FromC = FVector2D::ZeroVector;
	float CurR = 43000.f, NextR = 23500.f, FromR = 43000.f;
	int32 Phase = 0;
	bool bShrinking = false;
	bool bFinal = false;
	float Timer = 75.f;
	float Dps = 0.6f;

private:
	void PickNext();
	TWeakObjectPtr<AUEPIsland> Island;
	FRandomStream Rand;
};

// Trazadoras de los disparos y sonidos con atenuación por distancia
UCLASS()
class ULTIMOENPIE_API AUEPFx : public AActor
{
	GENERATED_BODY()
public:
	AUEPFx();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	void Tracer(const FVector& A, const FVector& B);
	void Play(USoundBase* Sound, const FVector& At, float Volume = 1.f, float Pitch = 1.f);

	UPROPERTY() TObjectPtr<USoundBase> ShotSound;
	UPROPERTY() TObjectPtr<USoundBase> HitSound;
	UPROPERTY() TObjectPtr<USoundBase> PickupSound;

private:
	UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> Pool;
	TArray<float> Life;
	int32 Head = 0;
};

// Avión que cruza la isla al comienzo
UCLASS()
class ULTIMOENPIE_API AUEPPlane : public AActor
{
	GENERATED_BODY()
public:
	AUEPPlane();
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Body;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Wings;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Tail;
};
