// ───────────────────────── flujo de la partida ─────────────────────────
Game.pings = [];
Game.aliveCount = () => { let n = 0; for (const f of fighters) if (f.alive) n++; return n; };
let worldFresh = false, hiddenRoof = null;

function newWorld() { buildWorld((Math.random() * 1e9) | 0); Hud.buildMapBase(); worldFresh = true; }
function startMatch() {
  Audio.init();
  if (!worldFresh) newWorld();
  worldFresh = false;
  spawnInitialLoot(); zoneReset(); clearFighters(); hiddenRoof = null;
  player = makeFighter(false, 'Vos', 0xff9b54);
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < 24; i++) initBrain(makeFighter(true, names[i], pick(BOT_COLORS)));
  planeStart();
  Object.assign(Game, { state: 'plane', time: 0, paused: false, pings: [], endShown: false });
  Hud.cache = {}; Hud.nums = []; $('feed').innerHTML = '';
  for (const id of ['menu', 'end', 'pause']) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden'); $('bJump').classList.remove('hidden');
  setTouchMode(input.touch); applyQuality(); setMenuView(false);
  Hud.toast('Sobrevolando Isla Ocaso', input.touch ? 'Tocá SALTAR para tirarte' : 'Apretá ESPACIO para saltar', 3.5);
}
function showEnd(win, killer) {
  if (Game.endShown) return; Game.endShown = true;
  const p = player, place = win ? 1 : p.place;
  $('endEyebrow').textContent = win ? 'Victoria' : 'Fin de la partida';
  $('endTitle').innerHTML = win ? 'Último<br>en <span>pie</span>' : 'Elimi<span>nado</span>';
  $('endTag').textContent = win ? `Te quedaste solo en la isla con ${p.kills} ${p.kills === 1 ? 'baja' : 'bajas'}.` : killer ? `Te eliminó ${killer.name}. Quedaban ${place - 1} en pie.` : `Te alcanzó la zona. Quedaban ${place - 1} en pie.`;
  $('endPlace').textContent = `#${place}`; $('endKills').textContent = String(p.kills); $('endTime').textContent = fmtTime(Game.time);
  try {
    const best = JSON.parse(localStorage.getItem('uep-best') || 'null');
    if (!best || place < best.place || (place === best.place && p.kills > best.kills)) localStorage.setItem('uep-best', JSON.stringify({ place, kills: p.kills }));
  } catch (e) { /* sin almacenamiento */ }
  $('end').classList.remove('hidden'); $('touch').classList.add('hidden'); $('cross').classList.add('hidden'); toggleMap(false);
  if (win) { Audio.tone(523, 0.18, 'triangle', 0.25); setTimeout(() => Audio.tone(659, 0.18, 'triangle', 0.25), 160); setTimeout(() => Audio.tone(784, 0.35, 'triangle', 0.25), 320); }
}
Game.onPlayerDeath = (src) => { Game.state = 'end'; setTimeout(() => showEnd(false, src), 1500); };
Game.checkWin = () => { if (player && player.alive && Game.aliveCount() === 1 && Game.state !== 'end') { Game.state = 'end'; setTimeout(() => showEnd(true), 900); } };
function togglePause(force) {
  if (Game.state !== 'play' && Game.state !== 'plane') return;
  Game.paused = force ?? !Game.paused;
  $('pause').classList.toggle('hidden', !Game.paused);
  $('cross').classList.toggle('hidden', Game.paused || input.touch);
  input.firing = false;
}
function toMenu() {
  Game.state = 'menu'; Game.paused = false;
  for (const id of ['end', 'pause', 'hud', 'touch', 'cross']) $(id).classList.add('hidden');
  $('menu').classList.remove('hidden'); toggleMap(false); refreshBest(); setMenuView(true);
}
function refreshBest() {
  let txt = '';
  try { const b = JSON.parse(localStorage.getItem('uep-best') || 'null'); if (b) txt = `Tu mejor resultado: puesto #${b.place} con ${b.kills} ${b.kills === 1 ? 'baja' : 'bajas'}.`; } catch (e) { /* nada */ }
  $('loading').textContent = txt;
}
document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });

// ───────────────────────── calidad y rendimiento ─────────────────────────
const Perf = { frames: 0, acc: 0, fps: 60 };
function applyQuality() {
  const q = SETTINGS.qual, dpr = devicePixelRatio || 1;
  Game.maxPR = q === 'alta' ? Math.min(dpr, 2) : q === 'baja' ? Math.min(dpr, 1) * 0.7 : Math.min(dpr, IS_TOUCH ? 1.5 : 1.75);
  Game.pr = q === 'auto' ? Math.min(Game.maxPR, IS_TOUCH ? 1.1 : 1.25) : Game.maxPR;
  renderer.setPixelRatio(Game.pr);
  setShadows(q === 'alta' || (q === 'auto' && !IS_TOUCH));
  $('fps').classList.toggle('hidden', SETTINGS.fps !== 'on');
}
function setShadows(on) {
  sun.castShadow = on;
  if (renderer.shadowMap.enabled !== on) { renderer.shadowMap.enabled = on; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
}
function perfTick(dt) {
  Perf.frames++; Perf.acc += dt;
  if (Perf.acc < 2) return;
  Perf.fps = Perf.frames / Perf.acc; Perf.frames = 0; Perf.acc = 0;
  if (SETTINGS.fps === 'on') $('fps').textContent = `${Math.round(Perf.fps)} FPS · res ${Game.pr.toFixed(2)}x${renderer.shadowMap.enabled ? ' · sombras' : ''}`;
  if (SETTINGS.qual !== 'auto' || Game.state === 'menu' || Game.paused) return;
  if (Perf.fps < 48) {
    if (renderer.shadowMap.enabled) setShadows(false);
    else if (Game.pr > 0.6) { Game.pr = Math.max(0.6, Game.pr - 0.15); renderer.setPixelRatio(Game.pr); }
  } else if (Perf.fps > 58 && Game.pr < Game.maxPR) { Game.pr = Math.min(Game.maxPR, Game.pr + 0.1); renderer.setPixelRatio(Game.pr); }
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; cam.shift = -1; camera.clearViewOffset(); camera.updateProjectionMatrix(); });

// ───────────────────────── cámara ─────────────────────────
const cam = { x: 0, z: 0, h: 120, shift: 0 };
function setMenuView(on) {
  if (on) { cam.shift = 0; camera.clearViewOffset(); } scene.fog.near = on ? 220 : 95; scene.fog.far = on ? 700 : SETTINGS.qual === 'baja' ? 175 : 230; camera.far = on ? 900 : 420; camera.updateProjectionMatrix(); }
function updateCamera(dt, now) {
  if (Game.state === 'menu') {
    const a = now * 0.00004, t = World.towns[0] || { x: 0, z: 0 };
    camera.position.set(t.x + Math.cos(a) * 170, 120, t.z + Math.sin(a) * 170); camera.lookAt(t.x, 0, t.z);
    sun.position.set(t.x - 40, 48, t.z + 22); sun.target.position.set(t.x, 0, t.z);
    return;
  }
  const p = player, portrait = clamp(0.8 / camera.aspect, 1, 1.55);
  let tx, tz, h;
  if (p.inPlane) { tx = Plane.x; tz = Plane.z; h = 125; }
  else {
    const w = curW(p), look = p.scoped ? 24 : input.touch ? 3 : 5;
    tx = p.x + (p.alive ? Math.cos(p.angle) * look : 0); tz = p.z + (p.alive ? Math.sin(p.angle) * look : 0);
    h = (p.falling ? 34 + p.y * 0.9 : p.scoped ? 62 : 30) * portrait;
  }
  const k = 1 - Math.exp(-dt * 6), kh = 1 - Math.exp(-dt * 3);
  cam.x += (tx - cam.x) * k; cam.z += (tz - cam.z) * k; cam.h += (h - cam.h) * kh;
  camera.position.set(cam.x, cam.h, cam.z + cam.h * 0.55); camera.lookAt(cam.x, 0, cam.z);
  // en celular vertical el jugador se dibuja más arriba para no quedar tapado por los controles
  const shift = input.touch && camera.aspect < 0.9 ? 0.15 : 0;
  if (shift !== cam.shift) { cam.shift = shift; if (shift) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * shift, innerWidth, innerHeight); else camera.clearViewOffset(); }
  const fogFar = cam.h * 3.6 + (SETTINGS.qual === 'baja' ? 60 : 110);
  scene.fog.near = cam.h * 1.6 + 40; scene.fog.far = fogFar;
  if (Math.abs(camera.far - (fogFar + 40)) > 15) { camera.far = fogFar + 40; camera.updateProjectionMatrix(); }
  sun.position.set(cam.x - 40, 48, cam.z + 22); sun.target.position.set(cam.x, 0, cam.z);
  Game.listener = p.inPlane ? Plane : p;
}

// ───────────────────────── paso de simulación ─────────────────────────
function step(dt) {
  Game.time += dt;
  planeUpdate(dt);
  zoneUpdate(dt);
  const p = player;
  if (p.alive && !p.inPlane) {
    readInput();
    if (p.falling) updateFalling(p, dt, input.mx, input.mz);
    else {
      moveFighter(p, input.mx, input.mz, fighterSpeed(p), dt);
      if (input.firing) fire(p, p.angle);
      // juntar automáticamente munición, curaciones, chalecos y armas si hay lugar
      for (const it of loot) {
        if (!it.alive || dist2(it.x, it.z, p.x, p.z) > 1.7) continue;
        if (!WEAP[it.k] || !p.slots[0] || !p.slots[1]) takeItem(p, it);
      }
    }
  }
  for (const f of fighters) {
    if (!f.alive) { f.deadT += dt; continue; }
    if (f.inPlane) continue;
    if (f.bot) {
      if (f.falling) {
        const ai = f.ai, dx = ai.landX - f.x, dz = ai.landZ - f.z, d = Math.hypot(dx, dz) || 1;
        const tLeft = f.y > 30 ? (f.y - 30) / 11 + 5 : f.y / 6, sp = Math.min(1, d / Math.max(0.5, tLeft) / 15);
        updateFalling(f, dt, dx / d * sp, dz / d * sp);
      } else botUpdate(f, dt);
    }
    updateTimers(f, dt);
    if (!f.falling && Zone.cur && dist2(f.x, f.z, Zone.cur.x, Zone.cur.z) > Zone.cur.r * Zone.cur.r) damage(f, Zone.dps * dt, null, 'zona');
  }
  updateEffects(dt);
  // techos y "corte" alrededor del jugador
  const b = p.alive && !p.inPlane && !p.falling ? buildingAt(p.x, p.z, -0.5) : null;
  if (b !== hiddenRoof) { setRoofHidden(hiddenRoof, false); setRoofHidden(b, true); hiddenRoof = b; }
  fadeU.value.set(p.x, p.z + 1.4, p.scoped ? 0 : 7.5, p.inPlane || p.y > 12 ? 0 : 1);
  // indicador de objeto cercano
  const near = p.alive && !p.inPlane && !p.falling ? nearestItem(p, 2.4) : null, pr = $('prompt');
  if (near) {
    const full = WEAP[near.k] && p.slots[0] && p.slots[1];
    const txt = (full ? `Cambiar por ${ITEM[near.k].label}` : `Tomar ${ITEM[near.k].label}`) + (near.amt && !WEAP[near.k] && !ITEM[near.k].armor ? ` ×${near.amt}` : '');
    const html = input.touch ? txt : `<kbd>E</kbd>${txt}`;
    if (Hud.cache.prompt !== html) { Hud.cache.prompt = html; pr.innerHTML = html; }
  }
  pr.classList.toggle('hidden', !near); $('bPick').classList.toggle('hot', !!near);
  const w = curW(p); $('bScope').classList.toggle('hidden', !(w && WEAP[w.k].scope)); $('bScope').classList.toggle('hot', p.scoped);
  if (p.scoped && !(w && WEAP[w.k].scope)) p.scoped = false;
  Hud.update(dt);
}

// ───────────────────────── bucle principal ─────────────────────────
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  perfTick(dt);
  if (Game.state !== 'menu' && !Game.paused) step(dt);
  if (Game.state !== 'menu') for (const f of fighters) syncMesh(f);
  updateCamera(dt, now);
  renderer.render(scene, camera);
  if (Game.state !== 'menu') Hud.drawFx(Game.paused ? 0 : dt);
}

// ───────────────────────── menú ─────────────────────────
function bindSeg(id, key, after) {
  const seg = $(id);
  const paint = () => { for (const b of seg.children) b.classList.toggle('on', b.dataset.v === SETTINGS[key]); };
  seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; SETTINGS[key] = b.dataset.v; saveSettings(); paint(); Audio.init(); Audio.click(); after && after(); });
  paint();
}
bindSeg('optDiff', 'diff'); bindSeg('optQual', 'qual', applyQuality); bindSeg('optSnd', 'snd'); bindSeg('optFps', 'fps', applyQuality);
$('playBtn').addEventListener('click', startMatch);
$('againBtn').addEventListener('click', startMatch);
$('menuBtn').addEventListener('click', () => { newWorld(); toMenu(); });
$('resumeBtn').addEventListener('click', () => togglePause(false));
$('quitBtn').addEventListener('click', () => { newWorld(); toMenu(); });

// arranque
setTouchMode(IS_TOUCH);
$('loading').textContent = 'Generando la isla…';
requestAnimationFrame(() => {
  newWorld(); applyQuality(); setMenuView(true); refreshBest();
  const btn = $('playBtn'); btn.disabled = false; btn.textContent = 'Jugar';
  requestAnimationFrame(frame);
});
// acceso para pruebas automáticas
window.__uep = { Game, Zone, World, step, get fighters() { return fighters; }, get player() { return player; }, get loot() { return loot; }, Perf };
