# Último en Pie — versión Unreal Engine 5

Proyecto de Unreal Engine 5 del battle royale "Último en Pie": isla generada al azar con colinas, pueblos de casas con puertas y ventanas, bosques, rocas y mar; avión y paracaídas; zona que se achica; armas, munición, chalecos y curaciones; 24 bots con inteligencia; tercera persona con el maniquí animado de Unreal, mira y mira telescópica, tiro a la cabeza y ragdoll.

La luz y el ambiente son de Unreal: iluminación global Lumen, sombras virtuales, cielo con atmósfera, nubes volumétricas y niebla. Las texturas son fotográficas, de Poly Haven (licencia CC0).

> **Importante:** este código se escribió sin poder compilarlo (no había Unreal disponible donde se armó). Es posible que la primera compilación muestre algún error. Si pasa, copiá el mensaje y mandámelo, y lo corrijo.

## Qué necesitás

| | Mínimo | Recomendado |
|---|---|---|
| Sistema | Windows 10 u 11 de 64 bits | Windows 11 |
| Placa de video | NVIDIA GTX 1080 / AMD RX 5700 (8 GB) | NVIDIA RTX 3060 o mejor |
| Memoria | 16 GB | 32 GB |
| Disco libre | 150 GB (Unreal + Visual Studio) | SSD |

## Paso a paso

1. **Instalá Unreal Engine.** Bajá el *Epic Games Launcher* desde epicgames.com, entrá a *Unreal Engine → Biblioteca* e instalá la versión **5.5** (sirve también una 5.x más nueva).
2. **Instalá Visual Studio 2022 Community** (gratis, desde visualstudio.microsoft.com). En el instalador marcá **"Desarrollo de juegos con C++"** y **"Desarrollo para el escritorio con C++"**. Unreal lo necesita para compilar el código del juego.
3. **Bajá el proyecto.** En GitHub abrí el repositorio, elegí la rama `claude/amazing-ramanujan-bwywbp`, botón **Code → Download ZIP**, y descomprimilo. El proyecto está en la carpeta `unreal/UltimoEnPie`.
4. **Abrí el proyecto.** Doble clic en `UltimoEnPie.uproject`.
   - Si pregunta *"Missing UltimoEnPie modules… rebuild them now?"*, respondé **Sí**. Compila solo; tarda unos minutos.
   - Si tenés otra versión de Unreal, primero hacé clic derecho en `UltimoEnPie.uproject` → **Switch Unreal Engine version** y elegí la tuya.
   - Si la compilación falla, Unreal ofrece abrir el proyecto en Visual Studio: el error aparece en la ventana *Lista de errores*. Mandame ese texto.
5. **Prepará el contenido (una sola vez).** En el editor: menú **Tools → Execute Python Script…** y elegí `Scripts/setup_unreal.py`. El script:
   - copia el maniquí animado de Unreal al proyecto,
   - importa las texturas de `SourceArt/` y genera los sonidos,
   - crea los materiales (terreno, revoque, tejas, madera, corteza, hojas, agua, zona),
   - arma el mapa `Maps/Isla` con sol, cielo, nubes, niebla y postprocesado.

   La primera vez Unreal compila muchos *shaders*: puede tardar 10 a 20 minutos (abajo a la derecha se ve el contador).
6. **Jugá.** Apretá **Play** (o Alt+P). Para jugar en pantalla completa: flecha al lado de Play → *Standalone Game*.

## Controles

| Acción | Tecla |
|---|---|
| Moverse / correr | WASD / Shift |
| Mirar | Mouse |
| Disparar / apuntar | Clic izquierdo / clic derecho (mira telescópica con el rifle) |
| Saltar del avión / saltar | Espacio |
| Tomar objeto o cambiar arma del piso | E |
| Recargar / curarse | R / H |
| Cambiar de arma | Q, 1, 2 o la rueda |
| Mapa grande | M |
| Pausa | P |
| Jugar de nuevo (al terminar) | Enter |

En el editor, **Esc** sale del juego.

## Ajustes

En `Config/DefaultGame.ini`:
- `Difficulty=0, 1 o 2` (fácil, normal, difícil) y `BotCount` (cantidad de bots).
- Si las superficies se ven "dadas vuelta" (se ve el interior de las casas o el piso desaparece), poné `bFlipWinding=True`.
- Si el maniquí no aparece (los personajes se ven como cilindros), agregalo a mano: *Content Drawer → Add → Add Feature or Content Pack → Third Person*.

Si anda lento: *Settings → Engine Scalability Settings → Medium* en el editor.

## Cómo está armado

| Archivo | Qué hace |
|---|---|
| `Source/UltimoEnPie/UEPIsland*` | Genera la isla: relieve, pueblos, casas, árboles, rocas, agua y minimapa |
| `Source/UltimoEnPie/UEPCharacter*` | Jugador y bots: maniquí, cámara, disparos, inventario, curación, paracaídas |
| `Source/UltimoEnPie/UEPBotController*` | Inteligencia de los bots |
| `Source/UltimoEnPie/UEPGameMode*` | Partida: avión, botín, zona, bajas y fin |
| `Source/UltimoEnPie/UEPPlayerController*` | Controles (Enhanced Input armado desde el código) |
| `Source/UltimoEnPie/UEPHUD*` | Pantalla del jugador |
| `Source/UltimoEnPie/UEPActors*` | Objetos del piso, zona, avión y trazadoras |
| `Scripts/setup_unreal.py` | Prepara texturas, sonidos, materiales y mapa dentro del editor |
| `SourceArt/` | Texturas (Poly Haven, CC0) |

## Siguientes pasos para que se vea aún mejor

- Reemplazar los árboles y rocas por modelos de Fab (la tienda de Epic) o Quixel Megascans.
- Pasar el terreno a *Landscape* para usar pasto pintado y Nanite.
- Animaciones de apuntado con arma (el maniquí usa las de caminar sin arma).
