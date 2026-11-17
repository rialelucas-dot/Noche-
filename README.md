# Último en Pie

Battle royale en 3D para el navegador: 25 jugadores (vos + 24 bots) en una isla generada al azar, partidas de unos 7 minutos. Es un juego original del género, con cámara en tercera persona y gráficos realistas: cielo HDR real, texturas fotográficas, pasto con viento, árboles con hojas y postprocesado de cine.

**Para jugar en tu compu:** las texturas se cargan desde la carpeta `assets/`, y el navegador solo lo permite si el juego se abre desde un servidor web. Desde la carpeta del proyecto:

```bash
python3 -m http.server 8000
```

y abrí `http://localhost:8000` en Chrome, Edge, Firefox o Safari. Si abrís `index.html` directo con doble clic, el juego funciona igual pero con colores lisos en lugar de texturas.

**Versión liviana:** `cenital.html` es la primera versión, con vista desde arriba, para compus o celulares lentos (no necesita servidor).

## Cómo se juega

1. Arrancás en el avión. Saltá cuando quieras y elegí dónde caer.
2. Juntá armas, munición, chalecos y curaciones en los pueblos.
3. Quedate dentro del círculo: la zona azul se achica por fases y lastima a quien queda afuera.
4. Gana el último que queda en pie.

| Acción | Compu | Celular |
|---|---|---|
| Moverse | WASD / flechas | Stick izquierdo |
| Correr | Shift | Stick izquierdo hasta el fondo |
| Mirar | Mouse (hacé clic para tomar el control) | Arrastrar en el lado derecho |
| Disparar | Clic | Botón FUEGO (también sirve para mirar) |
| Apuntar / mira telescópica | Clic derecho (mantener) | MIRA |
| Recoger / cambiar arma del piso | E | Botón TOMAR |
| Recargar | R | REC. |
| Curarse | H (3 = venda, 4 = botiquín) | CURAR |
| Cambiar de arma | 1 / 2 / Q / rueda | ARMA |
| Mapa | M | MAPA |
| Saltar del avión | Espacio | SALTAR |

Armas: pistola, subfusil, fusil de asalto, escopeta y rifle de precisión, cada una con su munición (9mm, 5.56, 12g, 7.62). Los disparos son en 3D: el tiro a la cabeza hace 1,8 veces más daño y el chaleco no lo frena; las colinas, paredes y cajones cubren, y por las ventanas se puede disparar. Las vendas curan hasta 75; el botiquín cura todo.

## Gráficos y rendimiento

- **Cielo e iluminación:** cielo HDR de atardecer con nubes reales; de ahí salen la luz ambiental, los reflejos y la dirección del sol. Sombras suaves de alta resolución.
- **Texturas fotográficas PBR** (color, relieve y rugosidad): el terreno mezcla pasto, tierra, roca y arena según la pendiente, la altura y los caminos; casas de revoque con techos de tejas, pisos de madera y rocas con textura en las tres direcciones.
- **Vegetación:** pinos y árboles con hojas reales recortadas, arbustos y pasto alto con textura que se mueve con el viento (todo instanciado, en la placa de video).
- **Postprocesado:** oclusión ambiental (GTAO), brillo en las luces (bloom), corrección de color de cine con viñeta y grano, y suavizado de bordes (FXAA).
- **Calidad Auto:** mide los FPS cada 2 segundos y, si hace falta, apaga la oclusión ambiental, reduce el pasto, apaga sombras y baja la resolución. En celular arranca sin sombras ni oclusión. **Baja** apaga todo el postprocesado.
- El juego pesa ~230 KB y las texturas ~5 MB.

## Créditos

- Texturas y cielo HDR: [Poly Haven](https://polyhaven.com) (licencia CC0). Las hojas salen del modelo *island_tree_02*; las ramas de pino y el pasto se dibujan con `tools/make_assets.py`, que también baja y optimiza todo lo demás.
- [three.js](https://threejs.org) r160 y sus módulos de postprocesado y carga (licencia MIT), incluidos dentro de `index.html`.

## Código

El juego final es `index.html` más la carpeta `assets/`. Las fuentes están separadas en `src/` (y los módulos de three.js en `src/vendor/`) y se unen con:

```bash
node build.js
```

| Archivo | Contenido |
|---|---|
| `src/shell.html` | Interfaz, estilos y HUD |
| `src/01-core.js` | Utilidades, ajustes, audio |
| `src/02-world.js` | Render, cielo, luces, relieve, colisiones y rayos 3D |
| `src/03-assets.js` | Carga de texturas, materiales (terreno, paredes, follaje), árboles, agua y pasto |
| `src/03-mapgen.js` | Generación de la isla, casas con ventanas y vegetación |
| `src/04-entities.js` | Armas, objetos, efectos |
| `src/05-fighters.js` | Jugadores, disparo, daño, inventario |
| `src/06-ai.js` | Inteligencia de los bots |
| `src/07-zone-hud.js` | Zona, minimapa, HUD |
| `src/08-input.js` | Avión, mouse con captura del puntero, teclado y controles táctiles |
| `src/09-loop.js` | Flujo de la partida, cámara, postprocesado, calidad, bucle principal |
| `tools/make_assets.py` | Baja y genera la carpeta `assets/` |
