#include "UEPActors.h"
#include "UEPIsland.h"
#include "UltimoEnPie.h"
#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInterface.h"
#include "Engine/World.h"
#include "Engine/StaticMesh.h"
#include "Kismet/GameplayStatics.h"
#include "Sound/SoundBase.h"
#include "UObject/ConstructorHelpers.h"
#include "Camera/PlayerCameraManager.h"
#include "GameFramework/PlayerController.h"

namespace
{
	UStaticMesh* EngineMesh(const TCHAR* Path) { return LoadObject<UStaticMesh>(nullptr, Path); }
	struct FPhase { float Wait, Shrink, Radius, Dps; };
	// tiempos en segundos, radio en metros, daño por segundo fuera de la zona
	const FPhase GPhases[] = { {75, 40, 235, 1}, {45, 35, 145, 2}, {40, 30, 88, 3}, {35, 25, 50, 5}, {30, 20, 24, 8}, {25, 20, 9, 11}, {20, 25, 0, 15} };
	constexpr int32 NumPhases = UE_ARRAY_COUNT(GPhases);
}

// ───────────── objeto en el piso ─────────────
AUEPPickup::AUEPPickup()
{
	PrimaryActorTick.bCanEverTick = false;
	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	RootComponent = Mesh;
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
	if (Cube.Succeeded()) Mesh->SetStaticMesh(Cube.Object);
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

void AUEPPickup::Init(EUEPItem InItem, int32 InAmount, int32 InMag, UMaterialInterface* Mat)
{
	Item = InItem; Amount = InAmount; Mag = InMag;
	FVector S(0.3f, 0.3f, 0.3f);
	if (UEP::IsWeapon(Item)) S = FVector(Item == EUEPItem::Precision ? 1.1f : Item == EUEPItem::Pistola ? 0.45f : 0.85f, 0.12f, 0.16f);
	else if (UEP::ArmorValue(Item) > 0.f) S = FVector(0.5f, 0.18f, 0.45f);
	else if (Item == EUEPItem::Venda || Item == EUEPItem::Botiquin) S = FVector(0.38f, 0.3f, 0.2f);
	Mesh->SetRelativeScale3D(S);
	Mesh->AddLocalOffset(FVector(0, 0, S.Z * 50.f));
	if (Mat) Mesh->SetMaterial(0, Mat);
}

// ───────────── zona ─────────────
AUEPZone::AUEPZone()
{
	PrimaryActorTick.bCanEverTick = true;
	Wall = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Wall"));
	RootComponent = Wall;
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cyl(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	if (Cyl.Succeeded()) Wall->SetStaticMesh(Cyl.Object);
	Wall->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Wall->SetCastShadow(false);
}

void AUEPZone::Start(AUEPIsland* InIsland, int32 Seed)
{
	Island = InIsland; Rand.Initialize(Seed);
	CurC = FVector2D::ZeroVector; CurR = 43000.f; Phase = 0; bShrinking = false; bFinal = false; Timer = GPhases[0].Wait; Dps = 0.6f;
	PickNext();
	if (UMaterialInterface* M = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/UEP/Materials/M_ZoneWall.M_ZoneWall"), nullptr, LOAD_NoWarn | LOAD_Quiet)) Wall->SetMaterial(0, M);
	else Wall->SetVisibility(false);
}

void AUEPZone::PickNext()
{
	const FPhase& P = GPhases[Phase];
	const float R = P.Radius * UEP_M;
	FVector2D C = CurC;
	for (int32 K = 0; K < 60; ++K)
	{
		const float A = Rand.FRand() * 2.f * PI, D = FMath::Sqrt(Rand.FRand()) * (CurR - R) * 0.85f;
		const FVector2D Q = CurC + FVector2D(FMath::Cos(A), FMath::Sin(A)) * D;
		if (Q.Size() + R > 40000.f && R > 10000.f) continue;
		if (!Island.IsValid() || Island->LandAt(Q.X, Q.Y) > (R > 6000.f ? 45.f : 14.f)) { C = Q; break; }
	}
	NextC = C; NextR = R;
}

void AUEPZone::Tick(float Dt)
{
	Super::Tick(Dt);
	if (!bFinal)
	{
		const FPhase& P = GPhases[Phase];
		Timer -= Dt;
		if (!bShrinking && Timer <= 0.f) { bShrinking = true; Timer = P.Shrink; FromC = CurC; FromR = CurR; }
		if (bShrinking)
		{
			const float K = FMath::Clamp(1.f - Timer / P.Shrink, 0.f, 1.f);
			CurC = FMath::Lerp(FromC, NextC, K); CurR = FMath::Lerp(FromR, NextR, K);
			if (Timer <= 0.f)
			{
				CurC = NextC; CurR = NextR; Dps = P.Dps; ++Phase; bShrinking = false;
				if (Phase < NumPhases) { Timer = GPhases[Phase].Wait; PickNext(); }
				else { bFinal = true; Dps = 20.f; Timer = 0.f; }
			}
		}
	}
	SetActorLocation(FVector(CurC.X, CurC.Y, 0.f));
	SetActorScale3D(FVector(FMath::Max(1.f, CurR / 50.f), FMath::Max(1.f, CurR / 50.f), 160.f));
}

// ───────────── efectos ─────────────
AUEPFx::AUEPFx()
{
	PrimaryActorTick.bCanEverTick = true;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
}

void AUEPFx::BeginPlay()
{
	Super::BeginPlay();
	UStaticMesh* Cyl = EngineMesh(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	UMaterialInterface* Mat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/UEP/Materials/M_Tracer.M_Tracer"), nullptr, LOAD_NoWarn | LOAD_Quiet);
	for (int32 i = 0; i < 48; ++i)
	{
		UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(this);
		C->SetStaticMesh(Cyl);
		if (Mat) C->SetMaterial(0, Mat);
		C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		C->SetCastShadow(false);
		C->SetVisibility(false);
		C->SetupAttachment(RootComponent);
		C->RegisterComponent();
		Pool.Add(C); Life.Add(0.f);
	}
	ShotSound = LoadObject<USoundBase>(nullptr, TEXT("/Game/UEP/Sounds/S_Shot.S_Shot"), nullptr, LOAD_NoWarn | LOAD_Quiet);
	HitSound = LoadObject<USoundBase>(nullptr, TEXT("/Game/UEP/Sounds/S_Hit.S_Hit"), nullptr, LOAD_NoWarn | LOAD_Quiet);
	PickupSound = LoadObject<USoundBase>(nullptr, TEXT("/Game/UEP/Sounds/S_Pickup.S_Pickup"), nullptr, LOAD_NoWarn | LOAD_Quiet);
}

void AUEPFx::Tick(float Dt)
{
	Super::Tick(Dt);
	for (int32 i = 0; i < Pool.Num(); ++i)
		if (Life[i] > 0.f) { Life[i] -= Dt; if (Life[i] <= 0.f) Pool[i]->SetVisibility(false); }
}

void AUEPFx::Tracer(const FVector& A, const FVector& B)
{
	if (Pool.Num() == 0) return;
	const FVector D = B - A; const float Len = D.Size();
	if (Len < 50.f) return;
	UStaticMeshComponent* C = Pool[Head];
	C->SetWorldLocationAndRotation((A + B) * 0.5f, FRotationMatrix::MakeFromZ(D / Len).Rotator());
	C->SetWorldScale3D(FVector(0.025f, 0.025f, Len / 100.f));
	C->SetVisibility(true);
	Life[Head] = 0.06f;
	Head = (Head + 1) % Pool.Num();
}

void AUEPFx::Play(USoundBase* Sound, const FVector& At, float Volume, float Pitch)
{
	if (!Sound) return;
	APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0);
	const FVector Ear = PC && PC->PlayerCameraManager ? PC->PlayerCameraManager->GetCameraLocation() : At;
	const float K = FMath::Square(FMath::Clamp(1.f - FVector::Dist(Ear, At) / 12000.f, 0.f, 1.f)) * Volume;
	if (K > 0.02f) UGameplayStatics::PlaySound2D(this, Sound, K, Pitch);
}

// ───────────── avión ─────────────
AUEPPlane::AUEPPlane()
{
	PrimaryActorTick.bCanEverTick = false;
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cyl(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
	Body = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Body"));
	RootComponent = Body;
	Wings = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Wings"));
	Wings->SetupAttachment(Body);
	Tail = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Tail"));
	Tail->SetupAttachment(Body);
	if (Cyl.Succeeded()) Body->SetStaticMesh(Cyl.Object);
	if (Cube.Succeeded()) { Wings->SetStaticMesh(Cube.Object); Tail->SetStaticMesh(Cube.Object); }
	// el cilindro es vertical: se acuesta para que el fuselaje quede sobre X
	Body->SetRelativeRotation(FRotator(90.f, 0.f, 0.f));
	Body->SetRelativeScale3D(FVector(2.6f, 2.6f, 15.f));
	Wings->SetRelativeLocation(FVector(0.f, 0.f, 8.f));
	Wings->SetRelativeScale3D(FVector(0.12f, 7.3f, 0.2f));
	// con el cuerpo acostado, X local apunta hacia arriba y Z local hacia atrás
	Tail->SetRelativeLocation(FVector(60.f, 0.f, 42.f));
	Tail->SetRelativeScale3D(FVector(1.f, 0.1f, 0.13f));
	for (UStaticMeshComponent* C : { Body.Get(), Wings.Get(), Tail.Get() }) C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}
