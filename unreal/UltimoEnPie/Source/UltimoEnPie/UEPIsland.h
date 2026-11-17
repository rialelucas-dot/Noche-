#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "UEPIsland.generated.h"

class UProceduralMeshComponent;
class UStaticMeshComponent;
class UTexture2D;
class UMaterialInterface;
struct FUEPMeshBuf;

// Todas las distancias en centímetros (unidades de Unreal), salvo donde dice metros.
struct FUEPTown { FVector2D Pos = FVector2D::ZeroVector; float Radius = 0.f; float Base = 0.f; FString Name; bool bMilitary = false; };
struct FUEPDoor { FVector Out = FVector::ZeroVector; FVector In = FVector::ZeroVector; };
struct FUEPBuilding { FVector2D Pos = FVector2D::ZeroVector; float HW = 0.f, HD = 0.f, Base = 0.f; bool bMilitary = false; TArray<FUEPDoor> Doors; };
struct FUEPBox { FVector Min, Max; FLinearColor Tint; int32 Section; };

UCLASS(Config = Game)
class ULTIMOENPIE_API AUEPIsland : public AActor
{
	GENERATED_BODY()

public:
	AUEPIsland();

	// Arma toda la isla (relieve, pueblos, vegetación) a partir de una semilla.
	void Generate(int32 Seed);

	float HeightAt(float X, float Y) const;      // altura del suelo en cm
	float LandAt(float X, float Y) const;        // metros tierra adentro desde la costa (negativo = mar)
	bool RandomLandPoint(FRandomStream& R, float MinLandM, FVector& Out, float RadiusM = 340.f) const;
	const FUEPBuilding* BuildingAt(float X, float Y, float MarginCm = 0.f) const;
	FVector NearestLand(FVector P, float NeedM = 4.f) const;

	TArray<FUEPTown> Towns;
	TArray<FUEPBuilding> Buildings;
	TArray<FVector4> Roads; // x0, y0, x1, y1 en cm

	UPROPERTY(Transient) TObjectPtr<UTexture2D> Minimap;

	// Si las superficies se ven "al revés", se puede invertir desde DefaultGame.ini
	UPROPERTY(Config) bool bFlipWinding = false;

	static constexpr float HalfM = 450.f;   // la isla entra en un cuadrado de 900 m
	static constexpr int32 HSeg = 225;      // celdas del relieve (4 m cada una)

private:
	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> Root;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Water;
	UPROPERTY(Transient) TArray<TObjectPtr<UProceduralMeshComponent>> Parts;

	TArray<float> Heights;   // metros
	float CoastP[4] = { 0, 0, 0, 0 };
	int32 NoiseSeed = 1337;
	TArray<FUEPBox> Boxes;   // piezas de edificios y cajones
	TMap<int32, TArray<FVector2D>> Occupied; // para no superponer árboles y rocas (metros)

	// ruido y relieve (en metros)
	float Hash2(int32 X, int32 Y) const;
	float VNoise(float X, float Y) const;
	float Fbm(float X, float Y) const;
	float CoastR(float Theta) const;
	float LandM(float X, float Y) const;
	float RawH(float X, float Y) const;
	float ForestAt(float X, float Y) const;
	float SegDist2(const FVector2D& P, const FVector4& Road) const;
	bool FreeAt(float X, float Y, float R) const;
	void Occupy(float X, float Y, float R);

	void BuildTownsAndRoads(FRandomStream& R);
	void BuildHeights();
	void BuildBuildings(FRandomStream& R);
	void BuildTerrainMesh();
	void BuildBuildingMesh(FRandomStream& R);
	void BuildNature(FRandomStream& R);
	void BuildMinimap();

	UProceduralMeshComponent* NewPart(const FString& Name, bool bDoubleSidedCollision = true);
	void Commit(UProceduralMeshComponent* Part, int32 Section, FUEPMeshBuf& Buf, UMaterialInterface* Mat, bool bCollision);
	static UMaterialInterface* LoadMat(const TCHAR* Name);
};
