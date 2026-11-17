#pragma once

#include "CoreMinimal.h"
#include "ProceduralMeshComponent.h"

// Acumula triángulos para una sección de malla procedural.
// En Unreal la cara visible de un triángulo es la que cumple Dot(Cross(B-A, C-A), Normal) < 0;
// Tri() ordena los vértices solo para respetarlo (bFlip invierte la regla).
struct FUEPMeshBuf
{
	TArray<FVector> V;
	TArray<int32> T;
	TArray<FVector> N;
	TArray<FVector2D> UV;
	TArray<FLinearColor> C;
	TArray<FProcMeshTangent> Tan;
	bool bFlip = false;

	int32 Add(const FVector& P, const FVector& Nrm, const FVector2D& Uv, const FLinearColor& Col, const FVector& Tangent)
	{
		V.Add(P); N.Add(Nrm); UV.Add(Uv); C.Add(Col); Tan.Add(FProcMeshTangent(Tangent, false));
		return V.Num() - 1;
	}
	void Tri(int32 A, int32 B, int32 Cc, const FVector& Facing)
	{
		const float D = FVector::DotProduct(FVector::CrossProduct(V[B] - V[A], V[Cc] - V[A]), Facing);
		const bool bSwap = bFlip ? (D < 0.f) : (D > 0.f);
		T.Add(A); T.Add(bSwap ? Cc : B); T.Add(bSwap ? B : Cc);
	}
	// cuadrilátero plano: P0..P3 en orden alrededor del borde
	void Quad(const FVector& P0, const FVector& P1, const FVector& P2, const FVector& P3, const FVector& Nrm,
		const FVector2D& U0, const FVector2D& U1, const FVector2D& U2, const FVector2D& U3, const FLinearColor& Col, const FVector& Tangent)
	{
		const int32 A = Add(P0, Nrm, U0, Col, Tangent), B = Add(P1, Nrm, U1, Col, Tangent), Cc = Add(P2, Nrm, U2, Col, Tangent), D = Add(P3, Nrm, U3, Col, Tangent);
		Tri(A, B, Cc, Nrm); Tri(A, Cc, D, Nrm);
	}
	// caja con coordenadas de textura en escala de mundo (Tile = cm por repetición)
	void Box(const FVector& Mn, const FVector& Mx, const FLinearColor& Col, float Tile)
	{
		const FVector P[8] = { {Mn.X, Mn.Y, Mn.Z}, {Mx.X, Mn.Y, Mn.Z}, {Mx.X, Mx.Y, Mn.Z}, {Mn.X, Mx.Y, Mn.Z}, {Mn.X, Mn.Y, Mx.Z}, {Mx.X, Mn.Y, Mx.Z}, {Mx.X, Mx.Y, Mx.Z}, {Mn.X, Mx.Y, Mx.Z} };
		auto UvOf = [Tile](const FVector& Q, int32 Axis) {
			return Axis == 0 ? FVector2D(Q.Y / Tile, -Q.Z / Tile) : Axis == 1 ? FVector2D(Q.X / Tile, -Q.Z / Tile) : FVector2D(Q.X / Tile, Q.Y / Tile);
		};
		auto Face = [&](int32 a, int32 b, int32 c, int32 d, const FVector& Nrm, int32 Axis) {
			const FVector Tg = Axis == 0 ? FVector(0, 1, 0) : FVector(1, 0, 0);
			Quad(P[a], P[b], P[c], P[d], Nrm, UvOf(P[a], Axis), UvOf(P[b], Axis), UvOf(P[c], Axis), UvOf(P[d], Axis), Col, Tg);
		};
		Face(0, 3, 7, 4, FVector(-1, 0, 0), 0); Face(1, 2, 6, 5, FVector(1, 0, 0), 0);
		Face(0, 1, 5, 4, FVector(0, -1, 0), 1); Face(3, 2, 6, 7, FVector(0, 1, 0), 1);
		Face(0, 1, 2, 3, FVector(0, 0, -1), 2); Face(4, 5, 6, 7, FVector(0, 0, 1), 2);
	}
	bool IsEmpty() const { return T.Num() == 0; }
};
