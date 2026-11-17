#include "UEPHUD.h"
#include "UltimoEnPie.h"
#include "UEPCharacter.h"
#include "UEPGameMode.h"
#include "UEPIsland.h"
#include "UEPActors.h"
#include "UEPPlayerController.h"
#include "Engine/Canvas.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "Engine/Texture2D.h"

namespace
{
	const FLinearColor Panel(0.03f, 0.04f, 0.06f, 0.62f), White(0.95f, 0.93f, 0.89f), Sun(1.f, 0.6f, 0.33f), Red(1.f, 0.3f, 0.25f), Blue(0.35f, 0.72f, 1.f), Muted(0.72f, 0.69f, 0.65f), Black(0.f, 0.f, 0.f, 1.f);
}

void AUEPHUD::Text(const FString& T, float X, float Y, const FLinearColor& C, float Scale, bool bCenter, bool bRight)
{
	UFont* F = GEngine->GetLargeFont();
	float Tw = 0.f, Th = 0.f;
	GetTextSize(T, Tw, Th, F, Scale * S);
	if (bCenter) X -= Tw * 0.5f; else if (bRight) X -= Tw;
	DrawText(T, FLinearColor(0.f, 0.f, 0.f, 0.6f * C.A), X + 1.5f * S, Y + 1.5f * S, F, Scale * S);
	DrawText(T, C, X, Y, F, Scale * S);
}

void AUEPHUD::Circle(float Cx, float Cy, float R, const FLinearColor& C, float Thick)
{
	constexpr int32 Seg = 64;
	for (int32 i = 0; i < Seg; ++i)
	{
		const float A0 = (float)i / Seg * 2.f * PI, A1 = (float)(i + 1) / Seg * 2.f * PI;
		DrawLine(Cx + FMath::Cos(A0) * R, Cy + FMath::Sin(A0) * R, Cx + FMath::Cos(A1) * R, Cy + FMath::Sin(A1) * R, C, Thick);
	}
}

void AUEPHUD::DrawMinimap(AUEPGameMode* G, AUEPCharacter* H, float X, float Y, float Size, float Span, bool bFull)
{
	Box(X, Y, Size, Size, FLinearColor(0.07f, 0.2f, 0.27f, 0.92f));
	FVector2D C = bFull ? FVector2D::ZeroVector : FVector2D(H->GetActorLocation().X, H->GetActorLocation().Y);
	if (H->bInPlane && !bFull) { C = FVector2D(G->PlanePos().X, G->PlanePos().Y); Span = 52000.f; }
	const float Full = AUEPIsland::HalfM * 2.f * UEP_M;
	if (G->Island && G->Island->Minimap)
		DrawTexture(G->Island->Minimap, X, Y, Size, Size, (C.X - Span / 2 + Full / 2) / Full, (C.Y - Span / 2 + Full / 2) / Full, Span / Full, Span / Full, FLinearColor::White, BLEND_Opaque);
	auto ToS = [&](float Wx, float Wy) { return FVector2D(X + (Wx - C.X) / Span * Size + Size / 2, Y + (Wy - C.Y) / Span * Size + Size / 2); };
	auto Inside = [&](const FVector2D& P) { return P.X >= X && P.X <= X + Size && P.Y >= Y && P.Y <= Y + Size; };
	auto ClipCircle = [&](const FVector2D& Ctr, float R, const FLinearColor& Col, float Thick) {
		constexpr int32 Seg = 96;
		for (int32 i = 0; i < Seg; ++i)
		{
			const float A0 = (float)i / Seg * 2.f * PI, A1 = (float)(i + 1) / Seg * 2.f * PI;
			const FVector2D P0 = Ctr + FVector2D(FMath::Cos(A0), FMath::Sin(A0)) * R, P1 = Ctr + FVector2D(FMath::Cos(A1), FMath::Sin(A1)) * R;
			if (Inside(P0) && Inside(P1)) DrawLine(P0.X, P0.Y, P1.X, P1.Y, Col, Thick);
		}
	};
	if (AUEPZone* Z = G->Zone)
	{
		ClipCircle(ToS(Z->CurC.X, Z->CurC.Y), Z->CurR / Span * Size, Blue, 2.5f * S);
		if (!Z->bFinal) ClipCircle(ToS(Z->NextC.X, Z->NextC.Y), Z->NextR / Span * Size, White, 1.5f * S);
	}
	if (H->bInPlane)
	{
		const FVector2D A = ToS(G->PlaneA.X, G->PlaneA.Y), B = ToS(G->PlaneB.X, G->PlaneB.Y);
		DrawLine(A.X, A.Y, B.X, B.Y, FLinearColor(1, 1, 1, 0.6f), 1.5f * S);
	}
	for (const FVector4& P : G->Pings) { const FVector2D Q = ToS(P.X, P.Y); if (Inside(Q)) Box(Q.X - 3 * S, Q.Y - 3 * S, 6 * S, 6 * S, FLinearColor(1.f, 0.3f, 0.25f, FMath::Clamp(P.W / 1.6f, 0.f, 1.f))); }
	if (bFull && G->Island)
		for (const FUEPTown& T : G->Island->Towns) { const FVector2D Q = ToS(T.Pos.X, T.Pos.Y); Text(T.Name.ToUpper(), Q.X, Q.Y - 10 * S, White, 0.8f, true); }
	if (!H->bInPlane || bFull)
	{
		const FVector2D P = ToS(H->GetActorLocation().X, H->GetActorLocation().Y);
		const float Yaw = FMath::DegreesToRadians(PlayerOwner->GetControlRotation().Yaw), R = 9.f * S;
		const FVector2D Tip = P + FVector2D(FMath::Cos(Yaw), FMath::Sin(Yaw)) * R, L = P + FVector2D(FMath::Cos(Yaw + 2.4f), FMath::Sin(Yaw + 2.4f)) * R * 0.7f, Rt = P + FVector2D(FMath::Cos(Yaw - 2.4f), FMath::Sin(Yaw - 2.4f)) * R * 0.7f;
		DrawLine(Tip.X, Tip.Y, L.X, L.Y, Sun, 2.5f * S); DrawLine(L.X, L.Y, Rt.X, Rt.Y, Sun, 2.5f * S); DrawLine(Rt.X, Rt.Y, Tip.X, Tip.Y, Sun, 2.5f * S);
	}
	DrawLine(X, Y, X + Size, Y, Panel, 2.f); DrawLine(X, Y + Size, X + Size, Y + Size, Panel, 2.f);
	DrawLine(X, Y, X, Y + Size, Panel, 2.f); DrawLine(X + Size, Y, X + Size, Y + Size, Panel, 2.f);
}

void AUEPHUD::DrawHUD()
{
	Super::DrawHUD();
	if (!Canvas) return;
	AUEPGameMode* G = GetWorld()->GetAuthGameMode<AUEPGameMode>();
	AUEPCharacter* H = Cast<AUEPCharacter>(GetOwningPawn());
	const AUEPPlayerController* PC = Cast<AUEPPlayerController>(PlayerOwner);
	if (!G || !H || !PC) return;
	const float CW = Canvas->ClipX, CH = Canvas->ClipY, Now = GetWorld()->GetTimeSeconds();
	S = CH / 1080.f;

	// tintes de pantalla
	if (G->Zone && H->bAlive && !H->bInPlane && G->Zone->IsOutside(H->GetActorLocation())) Box(0, 0, CW, CH, FLinearColor(0.1f, 0.35f, 1.f, 0.14f));
	if (Now - H->LastDamageTime < 0.25f) Box(0, 0, CW, CH, FLinearColor(1.f, 0.1f, 0.05f, 0.18f));
	else if (H->bAlive && H->Health < 30.f) Box(0, 0, CW, CH, FLinearColor(0.8f, 0.f, 0.f, 0.07f));

	// mira
	const float Cx = CW / 2, Cy = CH / 2;
	if (H->bScoped)
	{
		const float R = CH * 0.42f;
		Box(0, 0, Cx - R, CH, Black); Box(Cx + R, 0, CW - Cx - R, CH, Black); Box(Cx - R, 0, R * 2, Cy - R, Black); Box(Cx - R, Cy + R, R * 2, CH - Cy - R, Black);
		DrawLine(Cx - R, Cy, Cx + R, Cy, Black, 1.5f); DrawLine(Cx, Cy - R, Cx, Cy + R, Black, 1.5f); Circle(Cx, Cy, R, Black, 4.f);
	}
	else if (H->bAlive && !H->bInPlane && !H->bParachute)
	{
		const float Gap = (H->bAiming ? 4.f : 7.f) * S, Len = 9.f * S;
		DrawLine(Cx - Gap - Len, Cy, Cx - Gap, Cy, White, 2.f); DrawLine(Cx + Gap, Cy, Cx + Gap + Len, Cy, White, 2.f);
		DrawLine(Cx, Cy - Gap - Len, Cx, Cy - Gap, White, 2.f); DrawLine(Cx, Cy + Gap, Cx, Cy + Gap + Len, White, 2.f);
	}
	if (Now - H->LastHitMarkTime < 0.15f)
	{
		const FLinearColor Hc = H->bLastHitHead ? FLinearColor(1.f, 0.83f, 0.3f) : Red; const float A = 6.f * S, B = 14.f * S;
		DrawLine(Cx - B, Cy - B, Cx - A, Cy - A, Hc, 2.5f); DrawLine(Cx + A, Cy + A, Cx + B, Cy + B, Hc, 2.5f);
		DrawLine(Cx + B, Cy - B, Cx + A, Cy - A, Hc, 2.5f); DrawLine(Cx - A, Cy + A, Cx - B, Cy + B, Hc, 2.5f);
	}
	if (Now - H->LastDamageTime < 0.8f && !H->LastDamageFrom.IsZero())
	{
		const FVector To = H->LastDamageFrom - H->GetActorLocation();
		const float A = FMath::Atan2(To.Y, To.X) - FMath::DegreesToRadians(PC->GetControlRotation().Yaw);
		const float Px = Cx + FMath::Sin(A) * 170.f * S, Py = Cy - FMath::Cos(A) * 170.f * S;
		Box(Px - 9 * S, Py - 9 * S, 18 * S, 18 * S, FLinearColor(1.f, 0.25f, 0.15f, 0.85f));
	}

	// contadores
	Box(16 * S, 16 * S, 110 * S, 66 * S, Panel); Text(TEXT("VIVOS"), 28 * S, 22 * S, Muted, 0.7f); Text(FString::FromInt(G->AliveCount()), 28 * S, 40 * S, White, 1.6f);
	Box(134 * S, 16 * S, 110 * S, 66 * S, Panel); Text(TEXT("BAJAS"), 146 * S, 22 * S, Muted, 0.7f); Text(FString::FromInt(H->Kills), 146 * S, 40 * S, White, 1.6f);

	// zona
	FString ZL, ZT; FLinearColor ZC = White;
	if (H->bInPlane) { ZL = TEXT("EN EL AVIÓN"); ZT = TEXT("ESPACIO para saltar"); ZC = Sun; }
	else if (G->Zone && G->Zone->bFinal) { ZL = TEXT("ATENCIÓN"); ZT = TEXT("Zona final"); ZC = Blue; }
	else if (G->Zone && G->Zone->bShrinking) { ZL = TEXT("ATENCIÓN"); ZT = TEXT("La zona se está cerrando"); ZC = Blue; }
	else if (G->Zone) { const int32 Sec = FMath::CeilToInt(FMath::Max(0.f, G->Zone->Timer)); ZL = TEXT("ZONA SEGURA"); ZT = FString::Printf(TEXT("Cierre en %d:%02d"), Sec / 60, Sec % 60); }
	Box(Cx - 180 * S, 16 * S, 360 * S, 66 * S, Panel); Text(ZL, Cx, 22 * S, Muted, 0.7f, true); Text(ZT, Cx, 40 * S, ZC, 1.25f, true);

	// minimapa y bajas recientes
	const float MS = 270.f * S;
	DrawMinimap(G, H, CW - MS - 16 * S, 16 * S, MS, 26000.f, false);
	float FY = 26 * S + MS;
	for (int32 i = G->Feed.Num() - 1; i >= 0; --i) { Text(G->Feed[i].Text, CW - 20 * S, FY, White, 0.72f, false, true); FY += 26 * S; }

	// vida, chaleco y armas
	const float BW = 540.f * S, BX = Cx - BW / 2, BY = CH - 150.f * S;
	Text(FString::Printf(TEXT("Vendas %d · Botiquín %d"), H->Vendas, H->Botiquines), BX, BY - 6 * S, Muted, 0.75f);
	Text(H->Armor > 0.5f ? FString::Printf(TEXT("Chaleco %d"), FMath::CeilToInt(H->Armor)) : FString(TEXT("Sin chaleco")), BX + BW, BY - 6 * S, Muted, 0.75f, false, true);
	Box(BX, BY + 22 * S, BW, 14 * S, FLinearColor(1, 1, 1, 0.15f)); Box(BX, BY + 22 * S, BW * FMath::Clamp(H->Health / 100.f, 0.f, 1.f), 14 * S, H->Health < 30.f ? Red : White);
	Box(BX, BY + 40 * S, BW, 6 * S, FLinearColor(1, 1, 1, 0.12f)); Box(BX, BY + 40 * S, BW * FMath::Clamp(H->Armor / 100.f, 0.f, 1.f), 6 * S, Blue);
	for (int32 i = 0; i < 2; ++i)
	{
		const float SX = BX + i * (BW / 2 + 4 * S), SW = BW / 2 - 4 * S, SY = BY + 56 * S, SH = 50 * S;
		Box(SX, SY, SW, SH, Panel);
		if (i == H->Cur && !H->Slots[i].IsEmpty()) { Box(SX, SY, SW, 2 * S, Sun); Box(SX, SY + SH - 2 * S, SW, 2 * S, Sun); Box(SX, SY, 2 * S, SH, Sun); Box(SX + SW - 2 * S, SY, 2 * S, SH, Sun); }
		if (const FUEPWeaponDef* W = UEP::Weapon(H->Slots[i].Item))
		{
			Text(FString::Printf(TEXT("%d · %s"), i + 1, W->Name), SX + 12 * S, SY + 14 * S, White, 0.8f);
			Text(FString::Printf(TEXT("%d / %d"), H->Slots[i].Mag, H->Ammo[(int32)W->Ammo]), SX + SW - 12 * S, SY + 10 * S, White, 1.1f, false, true);
		}
		else Text(FString::Printf(TEXT("%d · Vacío"), i + 1), SX + 12 * S, SY + 14 * S, Muted, 0.8f);
	}
	if (H->ReloadT > 0.f || H->HealT > 0.f)
	{
		const bool bReload = H->ReloadT > 0.f;
		const float K = bReload ? 1.f - H->ReloadT / H->ReloadMax : 1.f - H->HealT / H->HealMax;
		Text(bReload ? TEXT("Recargando") : (H->HealType == EUEPItem::Venda ? TEXT("Vendándote") : TEXT("Usando botiquín")), Cx, BY - 70 * S, White, 0.8f, true);
		Box(Cx - 100 * S, BY - 44 * S, 200 * S, 6 * S, FLinearColor(1, 1, 1, 0.15f)); Box(Cx - 100 * S, BY - 44 * S, 200 * S * K, 6 * S, Sun);
	}
	// objeto cercano
	if (H->bAlive && !H->bInPlane && !H->bParachute)
	{
		const AUEPPickup* Best = nullptr; float Bd = 240.f * 240.f;
		for (const AUEPPickup* P : G->Pickups) if (P && !P->bTaken) { const float D = FVector::DistSquared2D(P->GetActorLocation(), H->GetActorLocation()); if (D < Bd) { Bd = D; Best = P; } }
		if (Best)
		{
			const bool bSwap = UEP::IsWeapon(Best->Item) && !H->Slots[0].IsEmpty() && !H->Slots[1].IsEmpty();
			const FString Msg = FString::Printf(TEXT("[E]  %s %s"), bSwap ? TEXT("Cambiar por") : TEXT("Tomar"), *UEP::ItemName(Best->Item));
			Box(Cx - 210 * S, BY - 128 * S, 420 * S, 40 * S, Panel); Text(Msg, Cx, BY - 120 * S, White, 0.95f, true);
		}
	}
	if (G->MatchTime < 25.f)
		Text(TEXT("WASD moverse · Mouse mirar · Clic disparar · Clic der. apuntar · Shift correr · E tomar · R recargar · H curar · Q arma · M mapa · P pausa"), Cx, CH - 34 * S, Muted, 0.68f, true);

	if (PC->bShowBigMap) { Box(0, 0, CW, CH, FLinearColor(0, 0, 0, 0.5f)); const float Sz = CH * 0.82f; DrawMinimap(G, H, Cx - Sz / 2, Cy - Sz / 2, Sz, 90000.f, true); }
	if (PC->IsPaused()) { Box(0, 0, CW, CH, FLinearColor(0, 0, 0, 0.45f)); Text(TEXT("PAUSA"), Cx, CH * 0.4f, White, 3.f, true); Text(TEXT("P para seguir"), Cx, CH * 0.4f + 90 * S, Muted, 1.f, true); }
	if (G->bMatchOver)
	{
		Box(0, 0, CW, CH, FLinearColor(0.02f, 0.02f, 0.03f, 0.55f));
		Text(G->EndTitle, Cx, CH * 0.34f, G->bPlayerWon ? Sun : White, 3.4f, true);
		Text(G->EndDetail, Cx, CH * 0.34f + 120 * S, White, 1.1f, true);
		Text(TEXT("Enter para jugar de nuevo"), Cx, CH * 0.34f + 170 * S, Sun, 1.f, true);
	}
}
