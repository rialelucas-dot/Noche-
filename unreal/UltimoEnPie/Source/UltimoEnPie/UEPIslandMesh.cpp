// Mallas de la isla: terreno, edificios y vegetación (todo con ProceduralMeshComponent).
#include "UEPIsland.h"
#include "UltimoEnPie.h"
#include "UEPMeshBuf.h"
#include "ProceduralMeshComponent.h"

namespace
{
	constexpr float HCell = 4.f;
	constexpr int32 HN = AUEPIsland::HSeg + 1;

	FVector Perp(const FVector& Axis) { return FMath::Abs(Axis.Z) < 0.9f ? FVector::CrossProduct(Axis, FVector::UpVector).GetSafeNormal() : FVector::CrossProduct(Axis, FVector::ForwardVector).GetSafeNormal(); }

	// tronco o rama: cilindro con conicidad y una leve curva
	void AddCylinder(FUEPMeshBuf& B, const FVector& Base, const FVector& Axis, float R0, float R1, float Len, int32 Sides, int32 Rings, const FVector& Bend, float URep, float VTile)
	{
		const FVector A = Perp(Axis), C = FVector::CrossProduct(Axis, A);
		const int32 Start = B.V.Num();
		for (int32 i = 0; i <= Rings; ++i)
		{
			const float T = (float)i / Rings, Rad = FMath::Lerp(R0, R1, T);
			const FVector Center = Base + Axis * Len * T + Bend * FMath::Sin(T * 2.2f) * T;
			for (int32 j = 0; j <= Sides; ++j)
			{
				const float Ang = (float)j / Sides * 2.f * PI;
				const FVector Dir = A * FMath::Cos(Ang) + C * FMath::Sin(Ang);
				B.Add(Center + Dir * Rad, Dir, FVector2D((float)j / Sides * URep, T * Len / VTile), FLinearColor::White, FVector::CrossProduct(Axis, Dir).GetSafeNormal());
			}
		}
		for (int32 i = 0; i < Rings; ++i) for (int32 j = 0; j < Sides; ++j)
		{
			const int32 a = Start + i * (Sides + 1) + j, b = a + 1, c = a + Sides + 1, d = c + 1;
			const FVector Facing = (B.N[a] + B.N[b]).GetSafeNormal();
			B.Tri(a, b, d, Facing); B.Tri(a, d, c, Facing);
		}
	}

	// tarjeta de follaje: nace en Base y crece hacia Up; las normales salen desde Center (copa con volumen)
	void AddCard(FUEPMeshBuf& B, const FVector& Base, const FVector& Up, const FVector& Side, float W, float H, const FVector& Center, const FLinearColor& Tint)
	{
		const FVector U = Up.GetSafeNormal(), S = Side.GetSafeNormal(), Face = FVector::CrossProduct(S, U).GetSafeNormal();
		const FVector P[4] = { Base - S * W * 0.5f, Base + S * W * 0.5f, Base + S * W * 0.5f + U * H, Base - S * W * 0.5f + U * H };
		const FVector2D Uv[4] = { {0.02f, 1.f}, {0.98f, 1.f}, {0.98f, 0.f}, {0.02f, 0.f} };
		int32 Idx[4];
		for (int32 k = 0; k < 4; ++k)
		{
			const FVector Nrm = FMath::Lerp((P[k] - Center).GetSafeNormal(), Face, 0.25f).GetSafeNormal();
			Idx[k] = B.Add(P[k], Nrm, Uv[k], Tint, S);
		}
		B.Tri(Idx[0], Idx[1], Idx[2], Face); B.Tri(Idx[0], Idx[2], Idx[3], Face);
	}

	void Icosphere(TArray<FVector>& V, TArray<FIntVector>& F)
	{
		const float t = (1.f + FMath::Sqrt(5.f)) / 2.f;
		V = { {-1, t, 0}, {1, t, 0}, {-1, -t, 0}, {1, -t, 0}, {0, -1, t}, {0, 1, t}, {0, -1, -t}, {0, 1, -t}, {t, 0, -1}, {t, 0, 1}, {-t, 0, -1}, {-t, 0, 1} };
		for (FVector& P : V) P.Normalize();
		F = { {0, 11, 5}, {0, 5, 1}, {0, 1, 7}, {0, 7, 10}, {0, 10, 11}, {1, 5, 9}, {5, 11, 4}, {11, 10, 2}, {10, 7, 6}, {7, 1, 8},
			{3, 9, 4}, {3, 4, 2}, {3, 2, 6}, {3, 6, 8}, {3, 8, 9}, {4, 9, 5}, {2, 4, 11}, {6, 2, 10}, {8, 6, 7}, {9, 8, 1} };
		TArray<FIntVector> Out; TMap<uint64, int32> Mid;
		auto M = [&](int32 a, int32 b) {
			const uint64 K = a < b ? ((uint64)a << 32) | (uint32)b : ((uint64)b << 32) | (uint32)a;
			if (int32* Found = Mid.Find(K)) return *Found;
			V.Add(((V[a] + V[b]) * 0.5f).GetSafeNormal()); return Mid.Add(K, V.Num() - 1);
		};
		for (const FIntVector& Tri : F)
		{
			const int32 a = M(Tri.X, Tri.Y), b = M(Tri.Y, Tri.Z), c = M(Tri.Z, Tri.X);
			Out.Add({ Tri.X, a, c }); Out.Add({ Tri.Y, b, a }); Out.Add({ Tri.Z, c, b }); Out.Add({ a, b, c });
		}
		F = Out;
	}
}

void AUEPIsland::BuildTerrainMesh()
{
	UMaterialInterface* Mat = LoadMat(TEXT("M_Terrain"));
	constexpr int32 Chunk = 25;
	auto Hm = [&](int32 X, int32 Y) { return Heights[FMath::Clamp(Y, 0, HSeg) * HN + FMath::Clamp(X, 0, HSeg)]; };
	for (int32 Cy = 0; Cy * Chunk < HSeg; ++Cy) for (int32 Cx = 0; Cx * Chunk < HSeg; ++Cx)
	{
		const int32 X0 = Cx * Chunk, Y0 = Cy * Chunk, X1 = FMath::Min(X0 + Chunk, HSeg), Y1 = FMath::Min(Y0 + Chunk, HSeg);
		float MaxH = -100.f;
		for (int32 Iy = Y0; Iy <= Y1; ++Iy) for (int32 Ix = X0; Ix <= X1; ++Ix) MaxH = FMath::Max(MaxH, Hm(Ix, Iy));
		if (MaxH < -6.5f) continue; // fondo del mar: no hace falta
		FUEPMeshBuf B; B.bFlip = bFlipWinding;
		const int32 W = X1 - X0 + 1;
		for (int32 Iy = Y0; Iy <= Y1; ++Iy) for (int32 Ix = X0; Ix <= X1; ++Ix)
		{
			const float X = Ix * HCell - HalfM, Y = Iy * HCell - HalfM, H = Hm(Ix, Iy);
			const float Dx = (Hm(Ix + 1, Iy) - Hm(Ix - 1, Iy)) / (2.f * HCell), Dy = (Hm(Ix, Iy + 1) - Hm(Ix, Iy - 1)) / (2.f * HCell);
			const FVector Nrm = FVector(-Dx, -Dy, 1.f).GetSafeNormal();
			const float L = LandM(X, Y), Slope = 1.f - Nrm.Z;
			// canales: R = tono, G = tierra, B = roca, A = arena (se mezclan en ese orden en el material)
			float Dirt = 0.f, Rock = 0.f, Sand = 0.f, Tint = 1.f;
			if (L < 12.f) { Sand = 1.f; Tint = L < 0.f ? FMath::Lerp(0.85f, 0.5f, FMath::Clamp(-L / 30.f, 0.f, 1.f)) : 1.f; }
			else
			{
				const float F = ForestAt(X, Y), Dry = VNoise(X / 90.f + 3.f, Y / 90.f + 8.f);
				Dirt = FMath::Clamp((Dry - 0.6f) * 2.5f, 0.f, 0.6f) + (F > 0.5f ? FMath::Clamp((F - 0.5f) * 3.f, 0.f, 0.9f) : 0.f);
				if (L < 22.f) Sand = (22.f - L) / 10.f;
				for (const FUEPTown& T : Towns)
				{
					const float D = FVector2D::Distance(FVector2D(X, Y), T.Pos / UEP_M), K = FMath::Clamp((T.Radius / UEP_M + 8.f - D) / 12.f, 0.f, 1.f);
					Dirt = FMath::Max(Dirt, K); Sand = FMath::Max(Sand, K * 0.4f);
				}
				for (const FVector4& Rd : Roads) if (SegDist2(FVector2D(X, Y) * UEP_M, Rd) < FMath::Square(3.7f * UEP_M)) { Dirt = 1.f; Sand = 0.f; break; }
				Rock = FMath::Clamp((Slope - 0.1f) * 7.f, 0.f, 1.f);
				Tint = 0.88f + VNoise(X / 30.f, Y / 30.f) * 0.12f;
			}
			const FLinearColor Col(Tint, FMath::Clamp(Dirt, 0.f, 1.f), Rock, FMath::Clamp(Sand, 0.f, 1.f));
			B.Add(FVector(X, Y, H) * UEP_M, Nrm, FVector2D(X / 4.f, Y / 4.f), Col, FVector(1.f, 0.f, Dx).GetSafeNormal());
		}
		for (int32 Iy = 0; Iy < Y1 - Y0; ++Iy) for (int32 Ix = 0; Ix < X1 - X0; ++Ix)
		{
			const int32 a = Iy * W + Ix, b = a + 1, c = a + W, d = c + 1;
			B.Tri(a, b, d, FVector::UpVector); B.Tri(a, d, c, FVector::UpVector);
		}
		Commit(NewPart(FString::Printf(TEXT("Terreno_%d_%d"), Cx, Cy)), 0, B, Mat, true);
	}
}

void AUEPIsland::BuildBuildingMesh(FRandomStream& R)
{
	UProceduralMeshComponent* P = NewPart(TEXT("Edificios"));
	FUEPMeshBuf Sec[6];
	for (FUEPMeshBuf& S : Sec) S.bFlip = bFlipWinding;
	const float Tile[6] = { 260.f, 300.f, 200.f, 180.f, 140.f, 100.f };
	for (const FUEPBox& Bx : Boxes) Sec[Bx.Section].Box(Bx.Min, Bx.Max, Bx.Tint, Tile[Bx.Section]);

	constexpr float WallH = 340.f, RoofH = 170.f, Over = 45.f;
	for (const FUEPBuilding& Bd : Buildings)
	{
		const float Z0 = Bd.Base + WallH;
		if (Bd.bMilitary) { Sec[1].Box(FVector(Bd.Pos.X - Bd.HW - 20.f, Bd.Pos.Y - Bd.HD - 20.f, Z0), FVector(Bd.Pos.X + Bd.HW + 20.f, Bd.Pos.Y + Bd.HD + 20.f, Z0 + 35.f), FLinearColor(0.55f, 0.56f, 0.55f), Tile[1]); continue; }
		const bool bAlong = Bd.HW >= Bd.HD;
		const float L = (bAlong ? Bd.HW : Bd.HD) + Over, S = (bAlong ? Bd.HD : Bd.HW) + Over;
		const FLinearColor Tint = FLinearColor::MakeFromHSV8((uint8)R.RandRange(0, 20), (uint8)R.RandRange(0, 60), (uint8)R.RandRange(170, 255));
		// local (u = cumbrera, v = transversal, z) -> mundo
		auto W = [&](float U, float V, float Z) { return bAlong ? FVector(Bd.Pos.X + U, Bd.Pos.Y + V, Z0 + Z) : FVector(Bd.Pos.X + V, Bd.Pos.Y + U, Z0 + Z); };
		auto Wd = [&](const FVector& D) { return bAlong ? D : FVector(D.Y, D.X, D.Z); };
		const FVector Ridge = Wd(FVector(1, 0, 0));
		const float Sl = FMath::Sqrt(S * S + RoofH * RoofH);
		for (int32 Side = -1; Side <= 1; Side += 2)
		{
			const FVector Nrm = Wd(FVector(0, Side * RoofH, S).GetSafeNormal());
			Sec[2].Quad(W(-L, Side * S, 0), W(L, Side * S, 0), W(L, 0, RoofH), W(-L, 0, RoofH), Nrm,
				FVector2D(-L / 200.f, Sl / 200.f), FVector2D(L / 200.f, Sl / 200.f), FVector2D(L / 200.f, 0), FVector2D(-L / 200.f, 0), Tint, Ridge);
		}
		for (int32 End = -1; End <= 1; End += 2) // hastiales (revoque)
		{
			const FVector Nrm = Wd(FVector(End, 0, 0)), Tg = Wd(FVector(0, 1, 0));
			const int32 a = Sec[0].Add(W(End * (L - Over), -S + Over, 0), Nrm, FVector2D((-S + Over) / 260.f, 0), FLinearColor::White, Tg);
			const int32 b = Sec[0].Add(W(End * (L - Over), S - Over, 0), Nrm, FVector2D((S - Over) / 260.f, 0), FLinearColor::White, Tg);
			const int32 c = Sec[0].Add(W(End * (L - Over), 0, RoofH * (S - Over) / S), Nrm, FVector2D(0, -RoofH / 260.f), FLinearColor::White, Tg);
			Sec[0].Tri(a, b, c, Nrm);
		}
		// cielorraso
		Sec[3].Quad(W(-L, -S, -2.f), W(L, -S, -2.f), W(L, S, -2.f), W(-L, S, -2.f), FVector(0, 0, -1),
			FVector2D(-L / 180.f, -S / 180.f), FVector2D(L / 180.f, -S / 180.f), FVector2D(L / 180.f, S / 180.f), FVector2D(-L / 180.f, S / 180.f), FLinearColor(0.85f, 0.85f, 0.85f), Ridge);
	}
	const TCHAR* Mats[6] = { TEXT("M_Plaster"), TEXT("M_Concrete"), TEXT("M_Roof"), TEXT("M_Wood"), TEXT("M_Wood"), TEXT("M_Plaster") };
	for (int32 i = 0; i < 6; ++i) Commit(P, i, Sec[i], LoadMat(Mats[i]), true);
}

void AUEPIsland::BuildNature(FRandomStream& R)
{
	struct FObj { FVector P; float S; int32 Kind; }; // 0 pino, 1 árbol, 2 arbusto, 3 roca
	TArray<FObj> Objs;
	auto Pick = [&](float RadiusM, float& X, float& Y) { const float A = R.FRand() * 2.f * PI, Rr = FMath::Sqrt(R.FRand()) * RadiusM; X = FMath::Cos(A) * Rr; Y = FMath::Sin(A) * Rr; };
	int32 Count = 0;
	for (int32 K = 0; K < 1000 && Count < 180; ++K)
	{
		float X, Y; Pick(360.f, X, Y); const float S = R.FRandRange(0.9f, 2.6f);
		if (LandM(X, Y) < 3.f || BuildingAt(X * UEP_M, Y * UEP_M, -400.f) || !FreeAt(X, Y, S + 1.f)) continue;
		Occupy(X, Y, S); Objs.Add({ FVector(X * UEP_M, Y * UEP_M, HeightAt(X * UEP_M, Y * UEP_M)), S, 3 }); ++Count;
	}
	Count = 0;
	for (int32 K = 0; K < 9000 && Count < 820; ++K)
	{
		float X, Y; Pick(370.f, X, Y);
		if (R.FRand() > (ForestAt(X, Y) > 0.5f ? 0.9f : 0.06f) || LandM(X, Y) < 14.f || BuildingAt(X * UEP_M, Y * UEP_M, -500.f)) continue;
		bool bBad = false;
		for (const FVector4& Rd : Roads) if (SegDist2(FVector2D(X, Y) * UEP_M, Rd) < FMath::Square(5.f * UEP_M)) bBad = true;
		for (const FUEPTown& T : Towns) if (FVector2D::Distance(FVector2D(X, Y) * UEP_M, T.Pos) < T.Radius - 600.f) bBad = true;
		if (bBad || !FreeAt(X, Y, 2.2f)) continue;
		Occupy(X, Y, 2.f); Objs.Add({ FVector(X * UEP_M, Y * UEP_M, HeightAt(X * UEP_M, Y * UEP_M)), R.FRandRange(0.8f, 1.35f), R.FRand() < 0.55f ? 0 : 1 }); ++Count;
	}
	Count = 0;
	for (int32 K = 0; K < 4000 && Count < 520; ++K)
	{
		float X, Y; Pick(365.f, X, Y);
		if (LandM(X, Y) < 12.f || BuildingAt(X * UEP_M, Y * UEP_M, -200.f) || !FreeAt(X, Y, 1.2f)) continue;
		Objs.Add({ FVector(X * UEP_M, Y * UEP_M, HeightAt(X * UEP_M, Y * UEP_M)), R.FRandRange(0.6f, 1.25f), 2 }); ++Count;
	}

	// se agrupan en parcelas de 100 m para que Unreal pueda descartar lo que no se ve
	constexpr int32 Tiles = 9;
	const FLinearColor Tints[5] = { FLinearColor(1, 1, 1), FLinearColor(0.9f, 0.95f, 0.82f), FLinearColor(0.82f, 0.88f, 0.72f), FLinearColor(1, 0.94f, 0.8f), FLinearColor(0.76f, 0.83f, 0.66f) };
	TArray<FVector> IcoV; TArray<FIntVector> IcoF; Icosphere(IcoV, IcoF);
	const TCHAR* Mats[5] = { TEXT("M_PineBark"), TEXT("M_Bark"), TEXT("M_Needles"), TEXT("M_Leaves"), TEXT("M_Rock") };
	UMaterialInterface* Loaded[5]; for (int32 i = 0; i < 5; ++i) Loaded[i] = LoadMat(Mats[i]);
	for (int32 Ty = 0; Ty < Tiles; ++Ty) for (int32 Tx = 0; Tx < Tiles; ++Tx)
	{
		FUEPMeshBuf Sec[5];
		for (FUEPMeshBuf& S : Sec) S.bFlip = bFlipWinding;
		for (const FObj& O : Objs)
		{
			const int32 Ox = FMath::Clamp(FMath::FloorToInt((O.P.X / UEP_M + HalfM) / 100.f), 0, Tiles - 1), Oy = FMath::Clamp(FMath::FloorToInt((O.P.Y / UEP_M + HalfM) / 100.f), 0, Tiles - 1);
			if (Ox != Tx || Oy != Ty) continue;
			const float S = O.S;
			const FLinearColor Tint = Tints[R.RandRange(0, 4)];
			const FVector G = O.P - FVector(0, 0, 15.f);
			if (O.Kind == 0) // pino
			{
				AddCylinder(Sec[0], G, FVector::UpVector, 32.f * S, 10.f * S, 1100.f * S, 8, 5, FVector(12.f * S, 0, 0), 1.5f, 200.f);
				for (int32 K = 0; K < 10; ++K)
				{
					const float Z = (180.f + K * 92.f) * S, Rt = (350.f * (1.f - K / 10.f) + 70.f) * S, Off = R.FRand() * 2.f * PI;
					const int32 N = FMath::Max(5, FMath::RoundToInt(9.f - K * 0.4f));
					for (int32 J = 0; J < N; ++J)
					{
						const float A = Off + (float)J / N * 2.f * PI;
						const FVector Out = FVector(FMath::Cos(A), FMath::Sin(A), -0.32f).GetSafeNormal();
						const FVector Side = FVector(-FMath::Sin(A), FMath::Cos(A), 0).RotateAngleAxis((J % 2 ? 1.f : -1.f) * 26.f, Out);
						AddCard(Sec[2], G + FVector(FMath::Cos(A) * 10.f, FMath::Sin(A) * 10.f, Z), Out, Side, Rt * 0.95f, Rt * 1.05f, G + FVector(0, 0, Z + 120.f * S), Tint);
					}
				}
				for (int32 J = 0; J < 2; ++J) AddCard(Sec[2], G + FVector(0, 0, 1030.f * S), FVector::UpVector, J ? FVector::RightVector : FVector::ForwardVector, 140.f * S, 200.f * S, G + FVector(0, 0, 1040.f * S), Tint);
			}
			else if (O.Kind == 1) // árbol de hojas
			{
				AddCylinder(Sec[1], G, FVector::UpVector, 36.f * S, 20.f * S, 460.f * S, 9, 6, FVector(25.f * S, 0, 0), 2.f, 150.f);
				for (int32 K = 0; K < 6; ++K)
				{
					const float A = K / 6.f * 2.f * PI + R.FRand();
					AddCylinder(Sec[1], G + FVector(0, 0, (260.f + K * 30.f) * S), FVector(FMath::Cos(A) * 0.9f, FMath::Sin(A) * 0.9f, 0.6f).GetSafeNormal(), 13.f * S, 5.f * S, 260.f * S, 6, 2, FVector::ZeroVector, 1.f, 150.f);
				}
				const FVector C = G + FVector(0, 0, 500.f * S);
				for (int32 K = 0; K < 40; ++K)
				{
					const float A = R.FRand() * 2.f * PI, E = R.FRandRange(-0.7f, 1.3f);
					const FVector Out = FVector(FMath::Cos(A) * FMath::Cos(E), FMath::Sin(A) * FMath::Cos(E), FMath::Sin(E) * 0.75f).GetSafeNormal();
					const FVector Base = C + Out * R.FRandRange(20.f, 160.f) * S + FVector(0, 0, R.FRandRange(-60.f, 80.f) * S);
					const FVector Side = FVector::CrossProduct(Out, FVector(R.FRandRange(-1.f, 1.f), R.FRandRange(-1.f, 1.f), R.FRandRange(-1.f, 1.f))).GetSafeNormal();
					AddCard(Sec[3], Base, Out, Side.IsNearlyZero() ? Perp(Out) : Side, R.FRandRange(280.f, 380.f) * S, R.FRandRange(280.f, 360.f) * S, C, Tint);
				}
			}
			else if (O.Kind == 2) // arbusto
			{
				for (int32 K = 0; K < 16; ++K)
				{
					const float A = R.FRand() * 2.f * PI;
					const FVector Out = FVector(FMath::Cos(A), FMath::Sin(A), R.FRandRange(0.35f, 1.2f)).GetSafeNormal();
					const FVector Side = FVector::CrossProduct(Out, FVector(R.FRandRange(-0.4f, 0.4f), R.FRandRange(-0.4f, 0.4f), 1.f)).GetSafeNormal();
					AddCard(Sec[3], G + FVector(R.FRandRange(-20.f, 20.f), R.FRandRange(-20.f, 20.f), 5.f) * S + Out * 10.f * S, Out, Side.IsNearlyZero() ? Perp(Out) : Side,
						R.FRandRange(120.f, 170.f) * S, R.FRandRange(110.f, 150.f) * S, G + FVector(0, 0, 50.f * S), Tint * 0.85f);
				}
			}
			else // roca facetada
			{
				const FVector Scl = FVector(R.FRandRange(0.95f, 1.3f), R.FRandRange(0.95f, 1.3f), R.FRandRange(0.6f, 0.95f)) * S * UEP_M;
				const float Yaw = R.FRand() * 360.f;
				auto Pt = [&](const FVector& D) {
					const float Nz = FMath::Sin(D.X * 4.1f + D.Y * 2.3f + 1.3f) * FMath::Sin(D.Z * 3.7f + D.X * 1.1f) + FMath::Sin(D.Y * 5.3f - D.Z * 2.1f) * 0.5f;
					return G + FVector(D * (1.f + Nz * 0.22f) * Scl).RotateAngleAxis(Yaw, FVector::UpVector) - FVector(0, 0, S * 15.f);
				};
				const FLinearColor RockTint = FLinearColor::LerpUsingHSV(FLinearColor(0.85f, 0.83f, 0.8f), FLinearColor(1.f, 0.96f, 0.9f), R.FRand());
				for (const FIntVector& F : IcoF)
				{
					const FVector A = Pt(IcoV[F.X]), Bp = Pt(IcoV[F.Y]), Cp = Pt(IcoV[F.Z]);
					FVector Nrm = FVector::CrossProduct(Bp - A, Cp - A).GetSafeNormal();
					if (FVector::DotProduct(Nrm, (A + Bp + Cp) / 3.f - G) < 0.f) Nrm = -Nrm;
					const FVector An = Nrm.GetAbs();
					auto Uv = [&](const FVector& Q) { return An.Z > FMath::Max(An.X, An.Y) ? FVector2D(Q.X, Q.Y) / 150.f : An.X > An.Y ? FVector2D(Q.Y, -Q.Z) / 150.f : FVector2D(Q.X, -Q.Z) / 150.f; };
					const FVector Tg = An.X > An.Y && An.X > An.Z ? FVector(0, 1, 0) : FVector(1, 0, 0);
					const int32 a = Sec[4].Add(A, Nrm, Uv(A), RockTint, Tg), b = Sec[4].Add(Bp, Nrm, Uv(Bp), RockTint, Tg), c = Sec[4].Add(Cp, Nrm, Uv(Cp), RockTint, Tg);
					Sec[4].Tri(a, b, c, Nrm);
				}
			}
		}
		bool bAny = false;
		for (const FUEPMeshBuf& S : Sec) bAny |= !S.IsEmpty();
		if (!bAny) continue;
		UProceduralMeshComponent* P = NewPart(FString::Printf(TEXT("Vegetacion_%d_%d"), Tx, Ty));
		for (int32 i = 0; i < 5; ++i) Commit(P, i, Sec[i], Loaded[i], i == 0 || i == 1 || i == 4);
	}
}
