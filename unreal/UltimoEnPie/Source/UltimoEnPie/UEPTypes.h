#pragma once

#include "CoreMinimal.h"
#include "UEPTypes.generated.h"

// Objetos que se pueden encontrar en la isla
UENUM()
enum class EUEPItem : uint8
{
	None, Pistola, Subfusil, Fusil, Escopeta, Precision,
	Ammo9, Ammo556, Ammo12, Ammo762, Venda, Botiquin, Chaleco1, Chaleco2, Chaleco3
};

enum class EUEPAmmo : uint8 { A9 = 0, A556, A12, A762, Count };

struct FUEPWeaponDef
{
	const TCHAR* Name;
	EUEPAmmo Ammo;
	float Damage;   // por perdigón
	float Rate;     // segundos entre disparos
	int32 Mag;
	float Reload;   // segundos
	float Spread;   // radianes
	float Range;    // cm
	int32 Pellets;
	float Prefer;   // distancia preferida de los bots (cm)
	int32 Rank;
	float Recoil;   // grados
};

USTRUCT()
struct FUEPWeaponSlot
{
	GENERATED_BODY()
	UPROPERTY() EUEPItem Item = EUEPItem::None;
	UPROPERTY() int32 Mag = 0;
	bool IsEmpty() const { return Item == EUEPItem::None; }
};

namespace UEP
{
	constexpr float M = 100.f;          // centímetros por metro
	constexpr int32 MaxAmmo = 240;
	constexpr int32 MaxVendas = 10;
	constexpr int32 MaxBotiquines = 4;

	const FUEPWeaponDef* Weapon(EUEPItem Item);
	bool IsWeapon(EUEPItem Item);
	bool IsAmmo(EUEPItem Item, EUEPAmmo& OutAmmo);
	EUEPItem AmmoItem(EUEPAmmo Ammo);
	FString ItemName(EUEPItem Item);
	FLinearColor ItemColor(EUEPItem Item);
	int32 DefaultAmount(EUEPItem Item);
	float ArmorValue(EUEPItem Item);
	EUEPItem ArmorItemFor(float Armor);
	EUEPItem RollLoot(FRandomStream& R, bool bMilitary);
}
