#include "UEPBotController.h"
#include "UltimoEnPie.h"
#include "UEPCharacter.h"
#include "UEPGameMode.h"
#include "UEPIsland.h"
#include "UEPActors.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Engine/World.h"

namespace
{
	float Gauss() { return (FMath::FRand() + FMath::FRand() + FMath::FRand() - 1.5f) * 1.15f; }
}

AUEPBotController::AUEPBotController()
{
	PrimaryActorTick.bCanEverTick = true;
	ThinkT = FMath::FRand() * 0.3f;
}

AUEPCharacter* AUEPBotController::Me() const { return Cast<AUEPCharacter>(GetPawn()); }
void AUEPBotController::OnDamaged(AUEPCharacter* Source) { Threat = Source; ThreatT = 4.f; }
void AUEPBotController::OnHeardShot(const FVector& Where) { if (!bHeard) { bHeard = true; HeardPos = Where; HeardT = 2.5f; } }

bool AUEPBotController::HasLOS(const AUEPCharacter* Other) const
{
	const AUEPCharacter* M = Me();
	FHitResult Hit;
	FCollisionQueryParams Q(SCENE_QUERY_STAT(UEPSight), true, M);
	const bool bHit = GetWorld()->LineTraceSingleByChannel(Hit, M->GetActorLocation() + FVector(0, 0, 60), Other->GetActorLocation() + FVector(0, 0, 30), ECC_Visibility, Q);
	return !bHit || Hit.GetActor() == Other;
}

bool AUEPBotController::Usable(int32 Slot) const
{
	const AUEPCharacter* M = Me();
	const FUEPWeaponDef* W = UEP::Weapon(M->Slots[Slot].Item);
	return W && (M->Slots[Slot].Mag > 0 || M->Ammo[(int32)W->Ammo] > 0);
}

float AUEPBotController::WantItem(const AUEPPickup* P) const
{
	const AUEPCharacter* M = Me();
	EUEPAmmo A;
	if (const FUEPWeaponDef* W = UEP::Weapon(P->Item))
	{
		if (M->Slots[0].Item == P->Item || M->Slots[1].Item == P->Item) return 0.f;
		if (M->Slots[0].IsEmpty() || M->Slots[1].IsEmpty()) return 10.f + W->Rank;
		return W->Rank > FMath::Min(UEP::Weapon(M->Slots[0].Item)->Rank, UEP::Weapon(M->Slots[1].Item)->Rank) ? 3.f : 0.f;
	}
	if (UEP::IsAmmo(P->Item, A))
	{
		for (const FUEPWeaponSlot& S : M->Slots) if (const FUEPWeaponDef* W = UEP::Weapon(S.Item)) if (W->Ammo == A && M->Ammo[(int32)A] < 120) return 6.f;
		return 0.f;
	}
	if (P->Item == EUEPItem::Venda) return M->Vendas < 5 ? 4.f : 0.f;
	if (P->Item == EUEPItem::Botiquin) return M->Botiquines < 2 ? 4.f : 0.f;
	return (P->Amount > 0 ? P->Amount : UEP::ArmorValue(P->Item)) > M->Armor + 4.f ? 7.f : 0.f;
}

void AUEPBotController::SetGoal(const FVector& G)
{
	AUEPCharacter* M = Me();
	AUEPIsland* Isl = M->GM()->Island;
	Goal = G; bHasGoal = true; Stuck = 0; Waypoints.Reset();
	const FVector P = M->GetActorLocation();
	const FUEPBuilding* In = Isl->BuildingAt(P.X, P.Y, 20.f);
	const FUEPBuilding* To = Isl->BuildingAt(G.X, G.Y, 20.f);
	auto NearestDoor = [](const FUEPBuilding* B, const FVector& Q) {
		const FUEPDoor* Best = &B->Doors[0];
		for (const FUEPDoor& D : B->Doors) if (FVector::DistSquared2D(D.Out, Q) < FVector::DistSquared2D(Best->Out, Q)) Best = &D;
		return Best;
	};
	if (In && In != To && In->Doors.Num()) { const FUEPDoor* D = NearestDoor(In, G); Waypoints.Add(D->In); Waypoints.Add(D->Out); }
	if (To && To != In && To->Doors.Num()) { const FUEPDoor* D = NearestDoor(To, P); Waypoints.Add(D->Out); Waypoints.Add(D->In); }
	Waypoints.Add(G);
}

void AUEPBotController::Tick(float Dt)
{
	Super::Tick(Dt);
	AUEPCharacter* M = Me();
	if (!M || !M->bAlive || M->bInPlane || !M->GM()) return;
	if (M->bParachute)
	{
		const FVector To = LandTarget - M->GetActorLocation();
		if (To.Size2D() > 300.f) { M->AddMovementInput(To.GetSafeNormal2D(), FMath::Clamp(To.Size2D() / 3000.f, 0.2f, 1.f)); SetControlRotation(FRotator(0.f, To.Rotation().Yaw, 0.f)); }
		return;
	}
	ThinkT -= Dt;
	if (ThinkT <= 0.f) { ThinkT = FMath::FRandRange(0.2f, 0.3f); Think(); }
	Drive(Dt);
}

void AUEPBotController::Think()
{
	AUEPCharacter* M = Me();
	AUEPGameMode* G = M->GM();
	AUEPIsland* Isl = G->Island;
	AUEPZone* Z = G->Zone;
	const FVector P = M->GetActorLocation();

	// percepción: los 3 rivales más cercanos con línea de visión
	TArray<TPair<float, AUEPCharacter*>> Cands;
	const float Sight = G->BotSight();
	for (AUEPCharacter* O : G->Fighters)
	{
		if (!O || O == M || !O->bAlive || O->bInPlane || O->bParachute) continue;
		const float R = O->bBot && O != Threat.Get() ? Sight * 0.55f : Sight, D2 = FVector::DistSquared(O->GetActorLocation(), P);
		if (D2 < R * R) Cands.Emplace(D2, O);
	}
	Cands.Sort([](const TPair<float, AUEPCharacter*>& A, const TPair<float, AUEPCharacter*>& B) { return A.Key < B.Key; });
	AUEPCharacter* Seen = nullptr; float Sd = 0.f;
	for (int32 i = 0; i < FMath::Min(3, Cands.Num()); ++i) if (HasLOS(Cands[i].Value)) { Seen = Cands[i].Value; Sd = FMath::Sqrt(Cands[i].Key); break; }
	if (!Seen && Threat.IsValid() && Threat->bAlive && ThreatT > 0.f)
	{
		const float D = FVector::Dist(Threat->GetActorLocation(), P);
		if (D < 9000.f && HasLOS(Threat.Get())) { Seen = Threat.Get(); Sd = D; }
	}
	if (Seen && Target.Get() != Seen) ReactT = G->BotReaction() * FMath::FRandRange(0.8f, 1.35f);
	Target = Seen; bLOS = Seen != nullptr;

	// recoger lo que está a mano
	for (AUEPPickup* Pk : G->Pickups)
	{
		if (!Pk || Pk->bTaken || FVector::DistSquared2D(Pk->GetActorLocation(), P) > 220.f * 220.f || WantItem(Pk) <= 0.f) continue;
		if (UEP::IsWeapon(Pk->Item) && !M->Slots[0].IsEmpty() && !M->Slots[1].IsEmpty())
			M->Cur = UEP::Weapon(M->Slots[0].Item)->Rank <= UEP::Weapon(M->Slots[1].Item)->Rank ? 0 : 1;
		M->TakeItem(Pk, true);
	}

	const bool bGun = Usable(0) || Usable(1);
	SwapT -= 0.25f;
	if (Seen && SwapT <= 0.f && M->ReloadT <= 0.f)
	{
		int32 Best = M->Cur; float Bs = -1e9f;
		for (int32 i = 0; i < 2; ++i) if (Usable(i)) { const FUEPWeaponDef* W = UEP::Weapon(M->Slots[i].Item); const float S = -FMath::Abs(Sd - W->Prefer) + (M->Slots[i].Mag > 0 ? 600.f : 0.f); if (S > Bs) { Bs = S; Best = i; } }
		if (Best != M->Cur) { M->SwitchSlot(Best); SwapT = 2.f; }
	}
	else if (!Usable(M->Cur) && Usable(1 - M->Cur)) M->SwitchSlot(1 - M->Cur);
	if (const FUEPWeaponDef* W = M->CurrentWeapon()) if (M->Slots[M->Cur].Mag < W->Mag * 0.4f && !Seen && M->HealT <= 0.f) M->StartReload();

	const float DCur = FVector2D::Distance(FVector2D(P.X, P.Y), Z->CurC), DNext = FVector2D::Distance(FVector2D(P.X, P.Y), Z->NextC);
	const bool bOutside = DCur > Z->CurR - 300.f, bMustMove = DNext > Z->NextR * 0.8f && (Z->bShrinking || Z->Timer < 32.f);
	auto GoalOk = [&]() { return bHasGoal && FVector2D::Distance(FVector2D(Goal.X, Goal.Y), Z->NextC) < Z->NextR * 0.85f; };
	auto InNext = [&](float Frac) {
		for (int32 K = 0; K < 30; ++K)
		{
			const float A = FMath::FRand() * 2.f * PI, R = FMath::Sqrt(FMath::FRand()) * Z->NextR * Frac;
			const FVector Q(Z->NextC.X + FMath::Cos(A) * R, Z->NextC.Y + FMath::Sin(A) * R, 0.f);
			if (Isl->LandAt(Q.X, Q.Y) > 6.f) return FVector(Q.X, Q.Y, Isl->HeightAt(Q.X, Q.Y));
		}
		return Isl->NearestLand(FVector(Z->NextC.X, Z->NextC.Y, 0.f), 6.f);
	};

	if (Seen && bGun) { State = EUEPBotState::Fight; if (M->HealT > 0.f && Sd < 3000.f) M->CancelHeal(); return; }
	if (Seen && Sd < 1400.f)
	{
		if (Sd < 250.f) { State = EUEPBotState::Brawl; return; }
		State = EUEPBotState::Flee;
		SetGoal(P + (P - Seen->GetActorLocation()).GetSafeNormal2D() * 2000.f);
		return;
	}
	if (M->HealT > 0.f) { State = EUEPBotState::Heal; return; }
	const bool bThreat = Threat.IsValid() && Threat->bAlive && ThreatT > 0.f;
	if (!bOutside && M->Health < 60.f && (M->Botiquines > 0 || (M->Vendas > 0 && M->Health < 75.f)) && !bThreat)
	{
		const EUEPItem Type = M->Health < 45.f && M->Botiquines > 0 ? EUEPItem::Botiquin : (M->Vendas > 0 && M->Health < 75.f ? EUEPItem::Venda : EUEPItem::Botiquin);
		if (M->StartHeal(Type)) { State = EUEPBotState::Heal; return; }
	}
	if (bOutside || bMustMove) { if (State != EUEPBotState::Zone || !GoalOk()) SetGoal(InNext(0.6f)); State = EUEPBotState::Zone; return; }
	if (bThreat && bGun) { State = EUEPBotState::Hunt; SetGoal(Threat->GetActorLocation()); return; }
	if (bHeard && bGun && M->Health > 60.f && State != EUEPBotState::Investigate && FMath::FRand() < 0.35f)
	{
		State = EUEPBotState::Investigate; SetGoal(HeardPos + FVector(FMath::FRandRange(-600.f, 600.f), FMath::FRandRange(-600.f, 600.f), 0.f)); return;
	}
	if (State == EUEPBotState::Investigate && bHasGoal) return;

	// buscar objetos
	AUEPPickup* Cur = LootTarget.Get();
	if (!Cur || Cur->bTaken || WantItem(Cur) <= 0.f)
	{
		AUEPPickup* Best = nullptr; float Bs = 0.f;
		for (AUEPPickup* Pk : G->Pickups)
		{
			if (!Pk || Pk->bTaken || Pk == Banned.Get()) continue;
			const float D2 = FVector::DistSquared2D(Pk->GetActorLocation(), P);
			if (D2 > 4800.f * 4800.f) continue;
			const float S = WantItem(Pk) / (1.f + FMath::Sqrt(D2) / 1400.f);
			if (S > Bs) { Bs = S; Best = Pk; }
		}
		LootTarget = Best;
		if (Best) SetGoal(Best->GetActorLocation());
	}
	if (LootTarget.IsValid()) { State = EUEPBotState::Loot; return; }
	if (State != EUEPBotState::Wander || !bHasGoal)
	{
		TArray<const FUEPBuilding*> InZone;
		for (const FUEPBuilding& B : Isl->Buildings) if (FVector2D::Distance(B.Pos, Z->NextC) < Z->NextR * 0.8f) InZone.Add(&B);
		if (InZone.Num() && FMath::FRand() < 0.6f) { const FUEPBuilding* B = InZone[FMath::RandRange(0, InZone.Num() - 1)]; SetGoal(FVector(B->Pos.X, B->Pos.Y, B->Base)); }
		else SetGoal(InNext(0.7f));
		State = EUEPBotState::Wander;
	}
}

void AUEPBotController::Drive(float Dt)
{
	AUEPCharacter* M = Me();
	AUEPGameMode* G = M->GM();
	ReactT -= Dt; ThreatT -= Dt;
	if (bHeard) { HeardT -= Dt; if (HeardT <= 0.f) bHeard = false; }
	const FVector P = M->GetActorLocation();
	FVector Move = FVector::ZeroVector;
	bool bYaw = false; float WantYaw = 0.f;
	AUEPCharacter* T = Target.Get();

	if ((State == EUEPBotState::Fight || State == EUEPBotState::Brawl) && T && T->bAlive)
	{
		const FVector To = T->GetActorLocation() - P; const float D = To.Size2D(); const FVector N = To.GetSafeNormal2D();
		const FUEPWeaponDef* W = M->CurrentWeapon();
		const float Pref = W && State == EUEPBotState::Fight ? W->Prefer : 120.f;
		const float Rad = D > Pref * 1.25f ? 1.f : D < Pref * 0.7f ? -0.8f : 0.f;
		StrafeT -= Dt;
		if (StrafeT <= 0.f) { StrafeT = FMath::FRandRange(0.5f, 1.4f); StrafeDir = FMath::FRand() < 0.15f ? 0.f : (FMath::RandBool() ? 1.f : -1.f); }
		Move = N * Rad + FVector(-N.Y, N.X, 0.f) * StrafeDir * (M->ReloadT > 0.f ? 1.1f : 0.8f);
		AimT -= Dt;
		if (AimT <= 0.f)
		{
			AimT = FMath::FRandRange(0.22f, 0.42f);
			const float Tv = T->GetVelocity().Size2D();
			AimYaw = Gauss() * G->BotAim() * (1.f + Tv / 800.f) * (D > 5000.f ? 1.3f : 1.f); AimPitch = Gauss() * G->BotAim() * 0.5f;
			bHeadAim = G->Difficulty >= 2 && FMath::FRand() < 0.25f;
		}
		const FVector Aim = T->GetActorLocation() + FVector(0.f, 0.f, bHeadAim ? 70.f : 20.f) - M->MuzzleLocation();
		const float Yaw = FMath::Atan2(Aim.Y, Aim.X) + AimYaw, Pitch = FMath::Atan2(Aim.Z, Aim.Size2D()) + AimPitch;
		WantYaw = FMath::RadiansToDegrees(Yaw); bYaw = true;
		if (ReactT <= 0.f && bLOS && FMath::Abs(FMath::FindDeltaAngleDegrees(GetControlRotation().Yaw, WantYaw)) < 12.f)
		{
			if (!W) { if (D < 220.f) M->Fire(N); }
			else if (D < W->Range * 0.95f) M->Fire(FRotator(FMath::RadiansToDegrees(Pitch), WantYaw, 0.f).Vector());
		}
	}
	else if (bHasGoal && State != EUEPBotState::Heal)
	{
		const FVector Wp = Waypoints.Num() ? Waypoints[0] : Goal; const FVector To = Wp - P;
		if (To.Size2D() < 110.f)
		{
			if (Waypoints.Num()) Waypoints.RemoveAt(0);
			if (!Waypoints.Num()) { bHasGoal = false; if (State == EUEPBotState::Investigate || State == EUEPBotState::Hunt) State = EUEPBotState::Wander; }
		}
		else Move = To.GetSafeNormal2D();
		if (bHeard && !T) { WantYaw = (HeardPos - P).Rotation().Yaw; bYaw = true; }
	}

	if (!Move.IsNearlyZero())
	{
		Move = Move.GetSafeNormal2D();
		if (UnstickT > 0.f) { UnstickT -= Dt; Move = FRotator(0.f, UnstickYaw, 0.f).Vector(); }
		else
		{
			// antenas: si hay algo adelante prueba otros ángulos
			const float Base = Move.Rotation().Yaw;
			FCollisionQueryParams Q(SCENE_QUERY_STAT(UEPFeel), false, M);
			for (const float Off : { 0.f, 35.f, -35.f, 70.f, -70.f, 105.f, -105.f })
			{
				const FVector D = FRotator(0.f, Base + Off, 0.f).Vector(), End = P + D * 200.f - FVector(0, 0, 50);
				FHitResult Hit;
				if (!GetWorld()->LineTraceSingleByChannel(Hit, P - FVector(0, 0, 50), End, ECC_Visibility, Q) && G->Island->LandAt(End.X, End.Y) > 1.5f) { Move = D; break; }
			}
		}
		CheckT -= Dt;
		if (CheckT <= 0.f)
		{
			CheckT = 0.8f;
			if (FVector::DistSquared2D(P, LastPos) < 70.f * 70.f && State != EUEPBotState::Fight)
			{
				UnstickT = 0.7f; UnstickYaw = FMath::FRand() * 360.f; ++Stuck; M->Jump();
				if (Stuck > 3) { Banned = LootTarget; LootTarget = nullptr; bHasGoal = false; Stuck = 0; }
			}
			LastPos = P;
		}
		if (!bYaw) { WantYaw = Move.Rotation().Yaw; bYaw = true; }
		M->AddMovementInput(Move, State == EUEPBotState::Fight ? 0.85f : 1.f);
	}
	const FVector Wp = Waypoints.Num() ? Waypoints[0] : Goal;
	const bool bSprint = !T && State != EUEPBotState::Heal && bHasGoal && FVector::DistSquared2D(P, Wp) > 1500.f * 1500.f;
	if (bSprint != M->bSprinting) { M->bSprinting = bSprint; M->UpdateMovementSpeed(); }
	if (bYaw) SetControlRotation(FRotator(0.f, FMath::FixedTurn(GetControlRotation().Yaw, WantYaw, 540.f * Dt), 0.f));
}
