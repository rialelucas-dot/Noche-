#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "UEPHUD.generated.h"

class AUEPCharacter;
class AUEPGameMode;

// Pantalla del jugador dibujada con Canvas: no necesita widgets del editor.
UCLASS()
class ULTIMOENPIE_API AUEPHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;

private:
	float S = 1.f; // escala según el alto de la pantalla
	void Box(float X, float Y, float W, float H, const FLinearColor& C) { DrawRect(C, X, Y, W, H); }
	void Text(const FString& T, float X, float Y, const FLinearColor& C, float Scale, bool bCenter = false, bool bRight = false);
	void Circle(float Cx, float Cy, float R, const FLinearColor& C, float Thick);
	void DrawMinimap(AUEPGameMode* G, AUEPCharacter* H, float X, float Y, float Size, float SpanCm, bool bFull);
};
