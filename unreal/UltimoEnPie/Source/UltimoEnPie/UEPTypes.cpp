#include "UEPTypes.h"

namespace
{
	// Nombre, munición, daño, cadencia, cargador, recarga, dispersión, alcance, perdigones, distancia preferida, rango, retroceso
	const FUEPWeaponDef GWeapons[] = {
		{ TEXT("Pistola"),            EUEPAmmo::A9,   17.f, 0.22f,  12, 1.3f, 0.045f,  4400.f, 1, 1300.f, 1, 1.2f },
		{ TEXT("Subfusil"),           EUEPAmmo::A9,   12.f, 0.075f, 30, 1.9f, 0.075f,  4400.f, 1, 1200.f, 3, 0.6f },
		{ TEXT("Fusil de asalto"),    EUEPAmmo::A556, 19.f, 0.115f, 30, 2.2f, 0.038f,  7400.f, 1, 2400.f, 4, 0.8f },
		{ TEXT("Escopeta"),           EUEPAmmo::A12,  10.f, 0.85f,   5, 2.6f, 0.17f,   2100.f, 8,  600.f, 3, 3.5f },
		{ TEXT("Rifle de precisión"), EUEPAmmo::A762, 84.f, 1.35f,   5, 2.9f, 0.005f, 15000.f, 1, 4200.f, 4, 4.0f },
	};
	struct FLootEntry { EUEPItem Item; float Weight; };
	const FLootEntry GLoot[] = {
		{ EUEPItem::Pistola, 10 }, { EUEPItem::Subfusil, 7 }, { EUEPItem::Escopeta, 6 }, { EUEPItem::Fusil, 6 }, { EUEPItem::Precision, 1.4f },
		{ EUEPItem::Ammo9, 8 }, { EUEPItem::Ammo556, 7 }, { EUEPItem::Ammo12, 5 }, { EUEPItem::Ammo762, 2.5f },
		{ EUEPItem::Venda, 9 }, { EUEPItem::Botiquin, 2.6f }, { EUEPItem::Chaleco1, 4 }, { EUEPItem::Chaleco2, 2.2f }, { EUEPItem::Chaleco3, 0.8f },
	};
	const FLootEntry GLootMil[] = {
		{ EUEPItem::Subfusil, 5 }, { EUEPItem::Fusil, 9 }, { EUEPItem::Escopeta, 4 }, { EUEPItem::Precision, 3 },
		{ EUEPItem::Ammo556, 8 }, { EUEPItem::Ammo762, 4 }, { EUEPItem::Ammo12, 3 }, { EUEPItem::Venda, 6 },
		{ EUEPItem::Botiquin, 4 }, { EUEPItem::Chaleco2, 4 }, { EUEPItem::Chaleco3, 2 },
	};
}

namespace UEP
{
	const FUEPWeaponDef* Weapon(EUEPItem Item)
	{
		switch (Item)
		{
		case EUEPItem::Pistola: return &GWeapons[0];
		case EUEPItem::Subfusil: return &GWeapons[1];
		case EUEPItem::Fusil: return &GWeapons[2];
		case EUEPItem::Escopeta: return &GWeapons[3];
		case EUEPItem::Precision: return &GWeapons[4];
		default: return nullptr;
		}
	}

	bool IsWeapon(EUEPItem Item) { return Weapon(Item) != nullptr; }

	bool IsAmmo(EUEPItem Item, EUEPAmmo& OutAmmo)
	{
		switch (Item)
		{
		case EUEPItem::Ammo9: OutAmmo = EUEPAmmo::A9; return true;
		case EUEPItem::Ammo556: OutAmmo = EUEPAmmo::A556; return true;
		case EUEPItem::Ammo12: OutAmmo = EUEPAmmo::A12; return true;
		case EUEPItem::Ammo762: OutAmmo = EUEPAmmo::A762; return true;
		default: return false;
		}
	}

	EUEPItem AmmoItem(EUEPAmmo Ammo)
	{
		switch (Ammo)
		{
		case EUEPAmmo::A9: return EUEPItem::Ammo9;
		case EUEPAmmo::A556: return EUEPItem::Ammo556;
		case EUEPAmmo::A12: return EUEPItem::Ammo12;
		default: return EUEPItem::Ammo762;
		}
	}

	FString ItemName(EUEPItem Item)
	{
		if (const FUEPWeaponDef* W = Weapon(Item)) return W->Name;
		switch (Item)
		{
		case EUEPItem::Ammo9: return TEXT("Munición 9mm");
		case EUEPItem::Ammo556: return TEXT("Munición 5.56");
		case EUEPItem::Ammo12: return TEXT("Cartuchos 12g");
		case EUEPItem::Ammo762: return TEXT("Munición 7.62");
		case EUEPItem::Venda: return TEXT("Vendas");
		case EUEPItem::Botiquin: return TEXT("Botiquín");
		case EUEPItem::Chaleco1: return TEXT("Chaleco Nv. 1");
		case EUEPItem::Chaleco2: return TEXT("Chaleco Nv. 2");
		case EUEPItem::Chaleco3: return TEXT("Chaleco Nv. 3");
		default: return TEXT("");
		}
	}

	FLinearColor ItemColor(EUEPItem Item)
	{
		if (Item == EUEPItem::Precision) return FLinearColor(1.f, 0.7f, 0.1f);
		if (IsWeapon(Item)) return FLinearColor(0.9f, 0.4f, 0.08f);
		switch (Item)
		{
		case EUEPItem::Ammo9: return FLinearColor(0.8f, 0.68f, 0.25f);
		case EUEPItem::Ammo556: return FLinearColor(0.35f, 0.65f, 0.15f);
		case EUEPItem::Ammo12: return FLinearColor(0.85f, 0.2f, 0.12f);
		case EUEPItem::Ammo762: return FLinearColor(0.2f, 0.55f, 0.85f);
		case EUEPItem::Venda: return FLinearColor(0.9f, 0.88f, 0.82f);
		case EUEPItem::Botiquin: return FLinearColor(0.9f, 0.08f, 0.08f);
		default: return FLinearColor(0.15f, 0.3f, 0.85f);
		}
	}

	int32 DefaultAmount(EUEPItem Item)
	{
		switch (Item)
		{
		case EUEPItem::Ammo9: case EUEPItem::Ammo556: return 30;
		case EUEPItem::Ammo12: case EUEPItem::Ammo762: return 10;
		case EUEPItem::Venda: return 3;
		case EUEPItem::Botiquin: return 1;
		default: return FMath::RoundToInt(ArmorValue(Item));
		}
	}

	float ArmorValue(EUEPItem Item)
	{
		switch (Item)
		{
		case EUEPItem::Chaleco1: return 40.f;
		case EUEPItem::Chaleco2: return 70.f;
		case EUEPItem::Chaleco3: return 100.f;
		default: return 0.f;
		}
	}

	EUEPItem ArmorItemFor(float Armor) { return Armor > 70.f ? EUEPItem::Chaleco3 : Armor > 40.f ? EUEPItem::Chaleco2 : EUEPItem::Chaleco1; }

	EUEPItem RollLoot(FRandomStream& R, bool bMilitary)
	{
		const FLootEntry* Table = bMilitary ? GLootMil : GLoot;
		const int32 Num = bMilitary ? UE_ARRAY_COUNT(GLootMil) : UE_ARRAY_COUNT(GLoot);
		float Sum = 0.f;
		for (int32 i = 0; i < Num; ++i) Sum += Table[i].Weight;
		float Roll = R.FRand() * Sum;
		for (int32 i = 0; i < Num; ++i) { Roll -= Table[i].Weight; if (Roll <= 0.f) return Table[i].Item; }
		return Table[0].Item;
	}
}
