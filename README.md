# Último en Pie

Battle royale en 3D para el navegador: 25 jugadores (vos + 24 bots) en una isla generada al azar, partidas de unos 7 minutos. Es un juego original del género, con cámara en tercera persona, colinas, pasto con viento, cielo de atardecer, agua animada y sombras.

**Para jugar:** abrí `index.html` en el navegador (Chrome, Edge, Firefox o Safari). No hace falta instalar nada.

**Versión liviana:** `cenital.html` es la versión anterior, con vista desde arriba, para compus o celulares lentos.

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

- Cielo con sol, luz ambiental calculada a partir del cielo, sombras suaves y materiales PBR (Three.js).
- Terreno con relieve y texturas generadas en el momento; el pasto se dibuja y se mueve con el viento todo en la placa de video.
- Árboles, rocas, paredes, techos, cajones y objetos del piso usan mallas instanciadas: pocas llamadas de dibujo para miles de objetos.
- Colisiones y disparos con una grilla espacial y rayos 3D (incluye el relieve), sin motor de física. Los bots piensan 4 veces por segundo.
- Calidad **Auto**: mide los FPS cada 2 segundos y, si hace falta, reduce el pasto, apaga sombras y baja la resolución. **Baja** quita pasto y sombras.
- Sin imágenes ni sonidos externos: texturas y sonido se generan en el navegador. Todo pesa ~130 KB más Three.js desde CDN.

## Código

El juego final es un único `index.html`. Las fuentes están separadas en `src/` y se unen con:

```bash
node build.js
```

| Archivo | Contenido |
|---|---|
| `src/shell.html` | Interfaz, estilos y HUD |
| `src/01-core.js` | Utilidades, ajustes, audio |
| `src/02-world.js` | Render, cielo, luces, relieve, colisiones y rayos 3D |
| `src/03-assets.js` | Texturas procedurales, árboles, agua y pasto |
| `src/03-mapgen.js` | Generación de la isla, casas con ventanas y vegetación |
| `src/04-entities.js` | Armas, objetos, efectos |
| `src/05-fighters.js` | Jugadores, disparo, daño, inventario |
| `src/06-ai.js` | Inteligencia de los bots |
| `src/07-zone-hud.js` | Zona, minimapa, HUD |
| `src/08-input.js` | Avión, mouse con captura del puntero, teclado y controles táctiles |
| `src/09-loop.js` | Flujo de la partida, cámara en tercera persona, calidad, bucle principal |
