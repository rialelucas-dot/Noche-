# Último en Pie

Battle royale liviano para el navegador: 25 jugadores (vos + 24 bots) en una isla generada al azar, partidas de unos 7 minutos. Es un juego original del género, pensado para andar bien en compus modestas y en el celular.

**Para jugar:** abrí `index.html` en el navegador (Chrome, Edge, Firefox o Safari). No hace falta instalar nada.

## Cómo se juega

1. Arrancás en el avión. Saltá cuando quieras y elegí dónde caer.
2. Juntá armas, munición, chalecos y curaciones en los pueblos.
3. Quedate dentro del círculo: la zona azul se achica por fases y lastima a quien queda afuera.
4. Gana el último que queda en pie.

| Acción | Compu | Celular |
|---|---|---|
| Moverse | WASD / flechas | Stick izquierdo |
| Apuntar y disparar | Mouse + clic | Stick derecho (empujarlo al borde dispara) |
| Recoger / cambiar arma del piso | E | Botón TOMAR |
| Recargar | R | REC. |
| Curarse | H (3 = venda, 4 = botiquín) | CURAR |
| Cambiar de arma | 1 / 2 / Q / rueda | ARMA |
| Mira del rifle de precisión | Clic derecho | MIRA |
| Mapa | M | MAPA |
| Saltar del avión | Espacio | SALTAR |

Armas: pistola, subfusil, fusil de asalto, escopeta y rifle de precisión, cada una con su munición (9mm, 5.56, 12g, 7.62). Los chalecos absorben parte del daño. Las vendas curan hasta 75; el botiquín cura todo.

## Por qué rinde bien

- Vista cenital en 3D low-poly: la lógica del juego es 2D (plano XZ), así que colisiones y disparos son baratos.
- Árboles, rocas, paredes, techos, cajones y objetos del piso se dibujan con mallas instanciadas: unas pocas llamadas de dibujo para miles de objetos.
- Grilla espacial para colisiones y disparos (recorrido DDA), sin motor de física.
- Los bots piensan 4 veces por segundo, no en cada cuadro.
- Calidad **Auto**: mide los FPS cada 2 segundos y baja sombras o resolución si hace falta.
- Sonido sintetizado con Web Audio y sin texturas: todo el juego pesa ~100 KB más Three.js desde CDN.
- Techos y follaje se "abren" con un tramado alrededor del jugador para que nunca quede tapado.

## Código

El juego final es un único `index.html`. Las fuentes están separadas en `src/` y se unen con:

```bash
node build.js
```

| Archivo | Contenido |
|---|---|
| `src/shell.html` | Interfaz, estilos y HUD |
| `src/01-core.js` | Utilidades, ajustes, audio |
| `src/02-world.js` | Render, colisiones, rayos |
| `src/03-mapgen.js` | Generación de la isla, pueblos y vegetación |
| `src/04-entities.js` | Armas, objetos, efectos |
| `src/05-fighters.js` | Jugadores, disparo, daño, inventario |
| `src/06-ai.js` | Inteligencia de los bots |
| `src/07-zone-hud.js` | Zona, minimapa, HUD |
| `src/08-input.js` | Avión, teclado, mouse y controles táctiles |
| `src/09-loop.js` | Flujo de la partida, cámara, calidad, bucle principal |
