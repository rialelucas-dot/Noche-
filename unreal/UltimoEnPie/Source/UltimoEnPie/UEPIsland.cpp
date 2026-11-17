#include "UEPIsland.h"
#include "UltimoEnPie.h"
#include "UEPMeshBuf.h"
#include "ProceduralMeshComponent.h"
#include "PhysicsEngine/BodySetup.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/Texture2D.h"
#include "TextureResource.h"
#include "Materials/Material.h"
#include "MaterialDomain.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	const TCHAR* GTownNames[] = { TEXT("Puerto Niebla"), TEXT("Villa Cardo"), TEXT("La Cantera"), TEXT("Base Cóndor"), TEXT("Los Pinos"), TEXT("Granja Ocaso"), TEXT("Bahía Seca"), TEXT("El Mirador") };
	float SmoothStep(float A, float B, float X) { const float T = FMath::Clamp((X - A) / (B - A), 0.f, 1.f); return T * T * (3.f - 2.f * T); }
}

AUEPIsland::AUEPIsland()
{
	PrimaryActorTick.bCanEverTick = false;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
	Water = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Water"));
	Water->SetupAttachment(Root);
	static ConstructorHelpers::FObjectFinder<UStaticMesh> PlaneMesh(TEXT("/Engine/BasicShapes/Plane.Plane"));
	if (PlaneMesh.Succeeded()) Water->SetStaticMesh(PlaneMesh.Object);
	Water->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Water->SetCastShadow(false);
	Water->SetRelativeScale3D(FVector(3000.f, 3000.f, 1.f));
}

UMaterialInterface* AUEPIsland::LoadMat(const TCHAR* Name)
{
	const FString Path = FString::Printf(TEXT("/Game/UEP/Materials/%s.%s"), Name, Name);
	if (UMaterialInterface* M = LoadObject<UMaterialInterface>(nullptr, *Path, nullptr, LOAD_NoWarn | LOAD_Quiet)) return M;
	UE_LOG(LogUEP, Warning, TEXT("Falta el material %s: corré Scripts/setup_unreal.py desde el editor."), Name);
	return UMaterial::GetDefaultMaterial(MD_Surface);
}

// ───────────── ruido ─────────────
float AUEPIsland::Hash2(int32 X, int32 Y) const
{
	uint32 H = (uint32)X * 374761393u + (uint32)Y * 668265263u + (uint32)NoiseSeed;
	H = (H ^ (H >> 13)) * 1274126177u;
	return (float)((H ^ (H >> 16)) & 0xFFFFFFu) / (float)0xFFFFFFu;
}

float AUEPIsland::VNoise(float X, float Y) const
{
	const int32 Xi = FMath::FloorToInt(X), Yi = FMath::FloorToInt(Y);
	const float Xf = X - Xi, Yf = Y - Yi, U = Xf * Xf * (3 - 2 * Xf), W = Yf * Yf * (3 - 2 * Yf);
	const float A = Hash2(Xi, Yi), B = Hash2(Xi + 1, Yi), C = Hash2(Xi, Yi + 1), D = Hash2(Xi + 1, Yi + 1);
	return FMath::Lerp(FMath::Lerp(A, B, U), FMath::Lerp(C, D, U), W);
}

float AUEPIsland::Fbm(float X, float Y) const
{
	return VNoise(X, Y) * 0.57f + VNoise(X * 2.1f + 5.3f, Y * 2.1f - 1.7f) * 0.29f + VNoise(X * 4.3f - 2.1f, Y * 4.3f + 7.7f) * 0.14f;
}

float AUEPIsland::CoastR(float Th) const
{
	return 345.f + 32.f * FMath::Sin(3 * Th + CoastP[0]) + 18.f * FMath::Sin(5 * Th + CoastP[1]) + 9.f * FMath::Sin(9 * Th + CoastP[2]) + 5.f * FMath::Sin(14 * Th + CoastP[3]);
}

float AUEPIsland::LandM(float X, float Y) const { return CoastR(FMath::Atan2(Y, X)) - FMath::Sqrt(X * X + Y * Y); }
float AUEPIsland::LandAt(float X, float Y) const { return LandM(X / UEP_M, Y / UEP_M); }
float AUEPIsland::ForestAt(float X, float Y) const { return VNoise(X / 75.f + 40.f, Y / 75.f - 13.f); }

float AUEPIsland::RawH(float X, float Y) const
{
	const float L = LandM(X, Y);
	if (L < 0.f) return FMath::Max(-7.f, L * 0.12f);
	return FMath::Min(L, 14.f) / 14.f * 1.3f + SmoothStep(10.f, 75.f, L) * (FMath::Max(0.f, Fbm(X / 170.f, Y / 170.f) - 0.3f) * 36.f + Fbm(X / 48.f + 9.f, Y / 48.f - 3.f) * 4.f);
}

float AUEPIsland::SegDist2(const FVector2D& P, const FVector4& Rd) const
{
	const FVector2D A(Rd.X, Rd.Y), B(Rd.Z, Rd.W), Ab = B - A;
	const float T = FMath::Clamp(FVector2D::DotProduct(P - A, Ab) / FMath::Max(1.f, Ab.SizeSquared()), 0.f, 1.f);
	return FVector2D::DistSquared(P, A + Ab * T);
}

bool AUEPIsland::FreeAt(float X, float Y, float R) const
{
	const int32 Cx = FMath::FloorToInt(X / 10.f), Cy = FMath::FloorToInt(Y / 10.f);
	for (int32 Dy = -1; Dy <= 1; ++Dy) for (int32 Dx = -1; Dx <= 1; ++Dx)
		if (const TArray<FVector2D>* Cell = Occupied.Find((Cx + Dx) * 1000 + (Cy + Dy)))
			for (const FVector2D& P : *Cell) if (FVector2D::DistSquared(P, FVector2D(X, Y)) < R * R) return false;
	return true;
}

void AUEPIsland::Occupy(float X, float Y, float R)
{
	Occupied.FindOrAdd(FMath::FloorToInt(X / 10.f) * 1000 + FMath::FloorToInt(Y / 10.f)).Add(FVector2D(X, Y));
}

// ───────────── consultas ─────────────
float AUEPIsland::HeightAt(float X, float Y) const
{
	if (Heights.Num() == 0) return 0.f;
	const float Fx = (X / UEP_M + HalfM) / HCell, Fy = (Y / UEP_M + HalfM) / HCell;
	const int32 Ix = FMath::FloorToInt(Fx), Iy = FMath::FloorToInt(Fy);
	if (Ix < 0 || Iy < 0 || Ix >= HSeg || Iy >= HSeg) return -700.f;
	const float U = Fx - Ix, W = Fy - Iy;
	const float A = Heights[Iy * HN + Ix], B = Heights[Iy * HN + Ix + 1], C = Heights[(Iy + 1) * HN + Ix], D = Heights[(Iy + 1) * HN + Ix + 1];
	return FMath::Lerp(FMath::Lerp(A, B, U), FMath::Lerp(C, D, U), W) * UEP_M;
}

bool AUEPIsland::RandomLandPoint(FRandomStream& R, float MinLandM, FVector& Out, float RadiusM) const
{
	for (int32 K = 0; K < 60; ++K)
	{
		const float A = R.FRand() * 2.f * PI, Rr = FMath::Sqrt(R.FRand()) * RadiusM;
		const float X = FMath::Cos(A) * Rr * UEP_M, Y = FMath::Sin(A) * Rr * UEP_M;
		if (LandAt(X, Y) > MinLandM && !BuildingAt(X, Y, -150.f)) { Out = FVector(X, Y, HeightAt(X, Y)); return true; }
	}
	Out = FVector(0, 0, HeightAt(0, 0));
	return false;
}

const FUEPBuilding* AUEPIsland::BuildingAt(float X, float Y, float Margin) const
{
	for (const FUEPBuilding& B : Buildings)
		if (FMath::Abs(X - B.Pos.X) < B.HW - Margin && FMath::Abs(Y - B.Pos.Y) < B.HD - Margin) return &B;
	return nullptr;
}

FVector AUEPIsland::NearestLand(FVector P, float NeedM) const
{
	for (int32 K = 0; K < 200 && LandAt(P.X, P.Y) < NeedM; ++K) { P.X *= 0.98f; P.Y *= 0.98f; }
	P.Z = HeightAt(P.X, P.Y);
	return P;
}

// ───────────── generación ─────────────
void AUEPIsland::Generate(int32 Seed)
{
	FRandomStream R(Seed);
	NoiseSeed = Seed * 7 + 3;
	for (float& C : CoastP) C = R.FRand() * 2.f * PI;
	Towns.Reset(); Buildings.Reset(); Roads.Reset(); Boxes.Reset(); Occupied.Reset();
	for (UProceduralMeshComponent* P : Parts) if (P) P->DestroyComponent();
	Parts.Reset();

	BuildTownsAndRoads(R);
	BuildHeights();
	BuildBuildings(R);
	BuildTerrainMesh();
	BuildBuildingMesh(R);
	BuildNature(R);
	BuildMinimap();
	Water->SetMaterial(0, LoadMat(TEXT("M_Water")));
	UE_LOG(LogUEP, Log, TEXT("Isla generada: %d pueblos, %d edificios, %d piezas"), Towns.Num(), Buildings.Num(), Parts.Num());
}

void AUEPIsland::BuildTownsAndRoads(FRandomStream& R)
{
	for (int32 Tries = 0; Towns.Num() < 7 && Tries < 800; ++Tries)
	{
		const float A = R.FRand() * 2.f * PI, Rr = FMath::Sqrt(R.FRand()) * 285.f, X = FMath::Cos(A) * Rr, Y = FMath::Sin(A) * Rr;
		if (LandM(X, Y) < 75.f) continue;
		bool bFar = true;
		for (const FUEPTown& T : Towns) if (FVector2D::DistSquared(T.Pos, FVector2D(X, Y) * UEP_M) < FMath::Square(150.f * UEP_M)) bFar = false;
		if (!bFar) continue;
		FUEPTown T;
		const int32 I = Towns.Num();
		T.Pos = FVector2D(X, Y) * UEP_M; T.Radius = (I < 2 ? 58.f : 44.f) * UEP_M; T.Name = GTownNames[I];
		T.bMilitary = T.Name.StartsWith(TEXT("Base")); T.Base = FMath::Max(1.5f, RawH(X, Y)) * UEP_M;
		Towns.Add(T);
	}
	TSet<int32> Seen;
	for (int32 I = 0; I < Towns.Num(); ++I)
	{
		TArray<TPair<float, int32>> Near;
		for (int32 J = 0; J < Towns.Num(); ++J) if (J != I) Near.Emplace((float)FVector2D::DistSquared(Towns[I].Pos, Towns[J].Pos), J);
		Near.Sort([](const TPair<float, int32>& A, const TPair<float, int32>& B) { return A.Key < B.Key; });
		for (int32 K = 0; K < FMath::Min(2, Near.Num()); ++K)
		{
			const int32 J = Near[K].Value, Key = FMath::Min(I, J) * 100 + FMath::Max(I, J);
			if (Seen.Contains(Key)) continue;
			Seen.Add(Key);
			Roads.Add(FVector4(Towns[I].Pos.X, Towns[I].Pos.Y, Towns[J].Pos.X, Towns[J].Pos.Y));
		}
	}
}

void AUEPIsland::BuildHeights()
{
	Heights.SetNumUninitialized(HN * HN);
	for (int32 Iy = 0; Iy < HN; ++Iy) for (int32 Ix = 0; Ix < HN; ++Ix)
	{
		const float X = Ix * HCell - HalfM, Y = Iy * HCell - HalfM;
		float H = RawH(X, Y);
		for (const FUEPTown& T : Towns)
		{
			const float D = FVector2D::Distance(FVector2D(X, Y), T.Pos / UEP_M), W = 1.f - SmoothStep(T.Radius / UEP_M + 2.f, T.Radius / UEP_M + 32.f, D);
			if (W > 0.f) H = FMath::Lerp(H, T.Base / UEP_M, W);
		}
		Heights[Iy * HN + Ix] = H;
	}
}

void AUEPIsland::BuildBuildings(FRandomStream& R)
{
	constexpr float WallH = 340.f, WallT = 30.f, DoorW = 190.f, DoorH = 240.f, WinW = 130.f, Sill = 100.f, WinTop = 230.f;
	for (const FUEPTown& T : Towns)
	{
		const int32 Want = T.Radius > 50.f * UEP_M ? 11 : 7;
		for (int32 Tries = 0, Made = 0; Made < Want && Tries < 300; ++Tries)
		{
			const float A = R.FRand() * 2.f * PI, Rr = 700.f + R.FRand() * (T.Radius - 1100.f);
			const float X = T.Pos.X + FMath::Cos(A) * Rr, Y = T.Pos.Y + FMath::Sin(A) * Rr;
			const float HW = T.bMilitary ? R.FRandRange(650.f, 1000.f) : R.FRandRange(400.f, 680.f);
			const float HD = T.bMilitary ? R.FRandRange(500.f, 750.f) : R.FRandRange(360.f, 580.f);
			bool bOk = true;
			for (const FUEPBuilding& B : Buildings) if (FMath::Abs(B.Pos.X - X) < B.HW + HW + 600.f && FMath::Abs(B.Pos.Y - Y) < B.HD + HD + 600.f) bOk = false;
			for (const FVector4& Rd : Roads) if (SegDist2(FVector2D(X, Y), Rd) < FMath::Square(FMath::Max(HW, HD) + 400.f)) bOk = false;
			if (!bOk) continue;

			FUEPBuilding B; B.Pos = FVector2D(X, Y); B.HW = HW; B.HD = HD; B.Base = T.Base; B.bMilitary = T.bMilitary;
			const FLinearColor Wall = T.bMilitary ? FLinearColor(0.8f, 0.8f, 0.78f) : FLinearColor::MakeFromHSV8((uint8)R.RandRange(15, 40), (uint8)R.RandRange(0, 40), (uint8)R.RandRange(215, 255));
			const int32 Section = T.bMilitary ? 1 : 0;
			TArray<int32> DoorSides = { 0, 1, 2, 3 };
			for (int32 I = 3; I > 0; --I) DoorSides.Swap(I, R.RandRange(0, I));
			DoorSides.SetNum(HW > 600.f ? 2 : (R.FRand() < 0.3f ? 2 : 1));

			for (int32 S = 0; S < 4; ++S)
			{
				const bool bAlongX = S < 2; const float Half = bAlongX ? HW : HD;
				const float Line = S == 0 ? Y - HD : S == 1 ? Y + HD : S == 2 ? X - HW : X + HW;
				const float OutDir = (S == 0 || S == 2) ? -1.f : 1.f;
				struct FOp { float C, W; bool bDoor; };
				TArray<FOp> Ops;
				if (DoorSides.Contains(S))
				{
					const float O = R.FRandRange(-Half + DoorW, Half - DoorW);
					Ops.Add({ O, DoorW, true });
					FUEPDoor D;
					if (bAlongX) { D.Out = FVector(X + O, Line + OutDir * 200.f, B.Base); D.In = FVector(X + O, Line - OutDir * 200.f, B.Base); }
					else { D.Out = FVector(Line + OutDir * 200.f, Y + O, B.Base); D.In = FVector(Line - OutDir * 200.f, Y + O, B.Base); }
					B.Doors.Add(D);
				}
				const float Span = T.bMilitary ? 460.f : 330.f;
				const int32 NumWin = FMath::Max(0, FMath::FloorToInt((Half * 2.f - 160.f) / Span));
				for (int32 K = 0; K < NumWin; ++K)
				{
					const float C = -Half + 80.f + (K + 0.5f) * ((Half * 2.f - 160.f) / NumWin);
					bool bClash = R.FRand() < 0.2f;
					for (const FOp& O : Ops) if (FMath::Abs(O.C - C) < O.W / 2 + WinW / 2 + 50.f) bClash = true;
					if (!bClash) Ops.Add({ C, WinW, false });
				}
				Ops.Sort([](const FOp& P, const FOp& Q) { return P.C < Q.C; });
				auto Piece = [&](float A0, float A1, float Z0, float Z1, int32 Sec, const FLinearColor& Col) {
					if (A1 - A0 < 2.f) return;
					FUEPBox Bx; Bx.Tint = Col; Bx.Section = Sec;
					if (bAlongX) { Bx.Min = FVector(X + A0, Line - WallT / 2, B.Base + Z0); Bx.Max = FVector(X + A1, Line + WallT / 2, B.Base + Z1); }
					else { Bx.Min = FVector(Line - WallT / 2, Y + A0, B.Base + Z0); Bx.Max = FVector(Line + WallT / 2, Y + A1, B.Base + Z1); }
					Boxes.Add(Bx);
				};
				float Cur = -Half - WallT / 2;
				for (const FOp& O : Ops)
				{
					Piece(Cur, O.C - O.W / 2, 0, WallH, Section, Wall);
					if (O.bDoor) Piece(O.C - O.W / 2, O.C + O.W / 2, DoorH, WallH, Section, Wall);
					else
					{
						Piece(O.C - O.W / 2, O.C + O.W / 2, 0, Sill, Section, Wall);
						Piece(O.C - O.W / 2, O.C + O.W / 2, WinTop, WallH, Section, Wall);
						Piece(O.C - O.W / 2 - 10.f, O.C + O.W / 2 + 10.f, Sill - 8.f, Sill, 5, FLinearColor(0.95f, 0.94f, 0.9f)); // alféizar
					}
					Cur = O.C + O.W / 2;
				}
				Piece(Cur, Half + WallT / 2, 0, WallH, Section, Wall);
			}
			// piso
			FUEPBox Floor; Floor.Min = FVector(X - HW, Y - HD, B.Base - 12.f); Floor.Max = FVector(X + HW, Y + HD, B.Base + 2.f);
			Floor.Tint = T.bMilitary ? FLinearColor(0.6f, 0.6f, 0.58f) : FLinearColor::White; Floor.Section = 3;
			Boxes.Add(Floor);
			Buildings.Add(B); ++Made;
			Occupy(X / UEP_M, Y / UEP_M, FMath::Max(HW, HD) / UEP_M + 2.f);
		}
	}
	// cajones de madera para cubrirse
	auto TryCrate = [&](float X, float Y) {
		if (LandAt(X, Y) < 8.f || BuildingAt(X, Y, -250.f) || !FreeAt(X / UEP_M, Y / UEP_M, 1.6f)) return false;
		const float G = HeightAt(X, Y), H = 70.f; const bool bTwo = R.FRand() < 0.3f;
		FUEPBox Bx; Bx.Min = FVector(X - H, Y - H, G - 30.f); Bx.Max = FVector(X + H, Y + H, G + (bTwo ? 280.f : 140.f));
		Bx.Tint = R.FRand() < 0.3f ? FLinearColor(0.75f, 0.8f, 0.65f) : FLinearColor::White; Bx.Section = 4;
		Boxes.Add(Bx); Occupy(X / UEP_M, Y / UEP_M, 1.2f);
		return true;
	};
	for (const FUEPTown& T : Towns) for (int32 K = 0; K < 16; ++K)
	{
		const float A = R.FRand() * 2.f * PI, Rr = R.FRand() * T.Radius, X = T.Pos.X + FMath::Cos(A) * Rr, Y = T.Pos.Y + FMath::Sin(A) * Rr;
		if (TryCrate(X, Y) && R.FRand() < 0.5f) TryCrate(X + 150.f, Y);
	}
	for (int32 K = 0; K < 70; ++K) { const float A = R.FRand() * 2.f * PI, Rr = FMath::Sqrt(R.FRand()) * 330.f * UEP_M; TryCrate(FMath::Cos(A) * Rr, FMath::Sin(A) * Rr); }
}

void AUEPIsland::BuildMinimap()
{
	constexpr int32 S = 256;
	TArray<FColor> Px; Px.SetNumUninitialized(S * S);
	for (int32 Py = 0; Py < S; ++Py) for (int32 Pxi = 0; Pxi < S; ++Pxi)
	{
		const float X = (Pxi + 0.5f) / S * HalfM * 2.f - HalfM, Y = (Py + 0.5f) / S * HalfM * 2.f - HalfM, L = LandM(X, Y);
		FColor C = L < 0.f ? FColor(28, 70, 88) : L < 11.f ? FColor(205, 182, 132) : (ForestAt(X, Y) > 0.5f ? FColor(74, 104, 66) : FColor(112, 140, 82));
		for (const FVector4& Rd : Roads) if (L > 0.f && SegDist2(FVector2D(X, Y) * UEP_M, Rd) < FMath::Square(2.5f * UEP_M)) C = FColor(160, 130, 95);
		if (BuildingAt(X * UEP_M, Y * UEP_M)) C = FColor(233, 220, 198);
		Px[Py * S + Pxi] = C;
	}
	Minimap = UTexture2D::CreateTransient(S, S, PF_B8G8R8A8);
	if (!Minimap) return;
	Minimap->Filter = TF_Bilinear;
	Minimap->AddressX = TA_Clamp;
	Minimap->AddressY = TA_Clamp;
	void* Data = Minimap->GetPlatformData()->Mips[0].BulkData.Lock(LOCK_READ_WRITE);
	FMemory::Memcpy(Data, Px.GetData(), Px.Num() * sizeof(FColor));
	Minimap->GetPlatformData()->Mips[0].BulkData.Unlock();
	Minimap->UpdateResource();
}

UProceduralMeshComponent* AUEPIsland::NewPart(const FString& Name, bool bDoubleSidedCollision)
{
	UProceduralMeshComponent* P = NewObject<UProceduralMeshComponent>(this, FName(*Name));
	P->SetupAttachment(Root);
	P->bUseAsyncCooking = true;
	P->bUseComplexAsSimpleCollision = true;
	if (bDoubleSidedCollision) if (UBodySetup* BS = P->GetBodySetup()) BS->bDoubleSidedGeometry = true;
	P->RegisterComponent();
	Parts.Add(P);
	return P;
}

void AUEPIsland::Commit(UProceduralMeshComponent* Part, int32 Section, FUEPMeshBuf& Buf, UMaterialInterface* Mat, bool bCollision)
{
	if (Buf.IsEmpty()) return;
	Part->CreateMeshSection_LinearColor(Section, Buf.V, Buf.T, Buf.N, Buf.UV, Buf.C, Buf.Tan, bCollision);
	Part->SetMaterial(Section, Mat);
}
