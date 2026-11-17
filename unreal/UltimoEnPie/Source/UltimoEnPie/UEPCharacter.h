#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "UEPTypes.h"
#include "UEPCharacter.generated.h"

class USpringArmComponent;
class UCameraComponent;
class UStaticMeshComponent;
class AUEPPickup;
class AUEPGameMode;

// Combatiente: lo usan tanto el jugador como los bots.
UCLASS(Config = Game)
class ULTIMOENPIE_API AUEPCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AUEPCharacter();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void Landed(const FHitResult& Hit) override;

	UPROPERTY(VisibleAnywhere) TObjectPtr<USpringArmComponent> Boom;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UCameraComponent> Camera;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Gun;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Chute;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Body;   // se usa si no está el maniquí

	// rutas opcionales al maniquí (DefaultGame.ini)
	UPROPERTY(Config) FString MeshPathOverride;
	UPROPERTY(Config) FString AnimClassPathOverride;

	// estado
	FString DisplayName;
	bool bBot = false;
	bool bAlive = true;
	bool bInPlane = false;
	bool bParachute = false;
	float Health = 100.f;
	float Armor = 0.f;
	UPROPERTY() FUEPWeaponSlot Slots[2];
	int32 Cur = 0;
	int32 Ammo[4] = { 0, 0, 0, 0 };
	int32 Vendas = 0;
	int32 Botiquines = 0;
	int32 Kills = 0;
	int32 Place = 0;
	float FireCd = 0.f, ReloadT = 0.f, ReloadMax = 1.f, HealT = 0.f, HealMax = 1.f;
	EUEPItem HealType = EUEPItem::None;
	bool bAiming = false;
	bool bScoped = false;
	bool bSprinting = false;
	float LastDamageTime = -100.f;
	float LastHitMarkTime = -100.f;
	float LastFireTime = -100.f;
	bool bLastHitHead = false;
	FVector LastDamageFrom = FVector::ZeroVector;
	float RecoilPitch = 0.f;

	const FUEPWeaponDef* CurrentWeapon() const;
	FVector MuzzleLocation() const;
	bool Fire(const FVector& Dir);
	void StartReload();
	bool StartHeal(EUEPItem Type);
	void CancelHeal();
	void SwitchSlot(int32 Index);
	bool TakeItem(AUEPPickup* P, bool bForce);
	void ApplyHit(float Damage, AUEPCharacter* Source, const FString& Cause, bool bHead);
	void EnterPlane();
	void LeavePlane(const FVector& At);
	void SetAim(bool bAim);
	void UpdateMovementSpeed();
	AUEPGameMode* GM() const;

private:
	void Die(AUEPCharacter* Killer, const FString& Cause);
	void DropLoot();
	void Punch();
	void TryLoadMannequin();
	FVector LastValidPos = FVector::ZeroVector;
	bool bHasMannequin = false;
};
