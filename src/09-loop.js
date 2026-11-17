// ───────────────────────── flujo de la partida ─────────────────────────
Game.pings = []; Game.recoil = 0;
Game.aliveCount = () => { let n = 0; for (const f of fighters) if (f.alive) n++; return n; };
let worldFresh = false;

function newWorld() { buildWorld((Math.random() * 1e9) | 0); Hud.buildMapBase(); worldFresh = true; }
function startMatch() {
  Audio.init();
  if (!worldFresh) newWorld();
  worldFresh = false;
  spawnInitialLoot(); zoneReset(); clearFighters();
  player = makeFighter(false, 'Vos', 0x56604a);
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < 24; i++) initBrain(makeFighter(true, names[i], pick(BOT_COLORS)));
  planeStart();
  Object.assign(Game, { state: 'plane', time: 0, paused: false, pings: [], endShown: false, recoil: 0 });
  Hud.cache = {}; Hud.nums = []; $('feed').innerHTML = '';
  for (const id of ['menu', 'end', 'pause']) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden'); $('bJump').classList.remove('hidden'); $('cross').classList.remove('hidden');
  setTouchMode(input.touch); applyQuality(); setMenuView(false); lockPointer();
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
  if (document.pointerLockElement) document.exitPointerLock();
  $('end').classList.remove('hidden'); $('touch').classList.add('hidden'); $('cross').classList.add('hidden'); $('scope').classList.add('hidden'); toggleMap(false); updateLockHint();
  if (win) { Audio.tone(523, 0.18, 'triangle', 0.25); setTimeout(() => Audio.tone(659, 0.18, 'triangle', 0.25), 160); setTimeout(() => Audio.tone(784, 0.35, 'triangle', 0.25), 320); }
}
Game.onPlayerDeath = (src) => { Game.state = 'end'; Game.killer = src; setTimeout(() => showEnd(false, src), 2200); };
Game.checkWin = () => { if (player && player.alive && Game.aliveCount() === 1 && Game.state !== 'end') { Game.state = 'end'; setTimeout(() => showEnd(true), 900); } };
function togglePause(force) {
  if (Game.state !== 'play' && Game.state !== 'plane') return;
  Game.paused = force ?? !Game.paused;
  $('pause').classList.toggle('hidden', !Game.paused);
  input.firing = false; input.aimHold = false;
  if (Game.paused && document.pointerLockElement) document.exitPointerLock();
  updateLockHint();
}
function toMenu() {
  Game.state = 'menu'; Game.paused = false;
  if (document.pointerLockElement) document.exitPointerLock();
  for (const id of ['end', 'pause', 'hud', 'touch', 'cross', 'scope']) $(id).classList.add('hidden');
  $('menu').classList.remove('hidden'); toggleMap(false); refreshBest(); setMenuView(true); updateLockHint();
}
function refreshBest() {
  let txt = '';
  try { const b = JSON.parse(localStorage.getItem('uep-best') || 'null'); if (b) txt = `Tu mejor resultado: puesto #${b.place} con ${b.kills} ${b.kills === 1 ? 'baja' : 'bajas'}.`; } catch (e) { /* nada */ }
  $('loading').textContent = txt;
}
document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });

// ───────────────────────── calidad y rendimiento ─────────────────────────
const Perf = { frames: 0, acc: 0, fps: 60 };
// ───────────────────────── postprocesado tipo cine ─────────────────────────
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.3 }, uGrain: { value: 0.028 }, uSat: { value: 1.06 }, uCA: { value: 0.0018 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain, uSat, uCA; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec3 c = vec3(texture2D(tDiffuse, vUv + d * uCA * r2 * 4.0).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * uCA * r2 * 4.0).b);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c *= mix(vec3(0.95, 0.99, 1.06), vec3(1.05, 1.0, 0.93), smoothstep(0.15, 0.75, l)); // sombras frías, luces cálidas
      c = c * c * (3.0 - 2.0 * c) * 0.35 + c * 0.65;                                   // curva en S suave
      c *= 1.0 - uVig * smoothstep(0.2, 0.9, r2 * 2.2);
      c += (hash(vUv * 977.0 + fract(uTime)) - 0.5) * uGrain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};
const Post = { composer: null, level: 0, rt: null, gtao: null, grade: null, fxaa: null };
function setupPost(level) {
  if (Post.composer) { Post.composer.dispose(); Post.rt.dispose(); Post.composer = null; }
  Post.level = level; if (!level) return;
  const sz = renderer.getDrawingBufferSize(new THREE.Vector2()), w = sz.x, h = sz.y;
  Post.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType) });
  const c = new EffectComposer(renderer); c.setPixelRatio(1); c.setSize(w, h);
  const copy = new ShaderPass(CopyShader, 'tNone'); copy.uniforms.tDiffuse.value = Post.rt.texture; c.addPass(copy);
  Post.gtao = null;
  if (level >= 2) {
    Post.gtao = new GTAOPass(scene, camera, w, h, { depthTexture: Post.rt.depthTexture });
    Post.gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.6, thickness: 2.0, scale: 1.2, samples: 12 });
    Post.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
    c.addPass(Post.gtao);
  }
  c.addPass(new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.25, 0.6, 0.9));
  c.addPass(new OutputPass());
  Post.grade = new ShaderPass(GradeShader); c.addPass(Post.grade);
  Post.fxaa = new ShaderPass(FXAAShader); Post.fxaa.uniforms.resolution.value.set(1 / w, 1 / h); c.addPass(Post.fxaa);
  Post.composer = c;
}
function render() {
  if (!Post.composer) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
  renderer.setRenderTarget(Post.rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
  Post.grade.uniforms.uTime.value = performance.now() / 1000;
  Post.composer.render();
}
function applyQuality() {
  const q = SETTINGS.qual, dpr = devicePixelRatio || 1;
  Game.maxPR = q === 'alta' ? Math.min(dpr, 2) : q === 'baja' ? Math.min(dpr, 1) * 0.75 : Math.min(dpr, IS_TOUCH ? 1.25 : 1.5);
  Game.pr = q === 'auto' ? Math.min(Game.maxPR, IS_TOUCH ? 1 : 1.25) : Game.maxPR;
  renderer.setPixelRatio(Game.pr);
  setShadows(q !== 'baja' && !(q === 'auto' && IS_TOUCH));
  const sm = q === 'alta' ? 4096 : 2048; sun.shadow.mapSize.set(sm, sm); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  grass.geometry.instanceCount = q === 'baja' ? 0 : q === 'alta' ? GRASS_MAX : IS_TOUCH ? 9000 : 18000;
  grass.visible = grass.geometry.instanceCount > 0;
  setupPost(q === 'baja' ? 0 : q === 'auto' && IS_TOUCH ? 1 : 2);
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
  if (SETTINGS.fps === 'on') $('fps').textContent = `${Math.round(Perf.fps)} FPS · res ${Game.pr.toFixed(2)}x${renderer.shadowMap.enabled ? ' · sombras' : ''}${grass.visible ? ' · pasto' : ''}${Post.gtao && Post.gtao.enabled ? ' · AO' : ''}${Post.composer ? ' · post' : ''}`;
  if (SETTINGS.qual !== 'auto' || Game.state === 'menu' || Game.paused) return;
  if (Perf.fps < 45) {
    if (Post.gtao && Post.gtao.enabled) Post.gtao.enabled = false;
    else if (grass.geometry.instanceCount > 5000) grass.geometry.instanceCount = Math.floor(grass.geometry.instanceCount / 2);
    else if (renderer.shadowMap.enabled) setShadows(false);
    else if (Game.pr > 0.6) { Game.pr = Math.max(0.6, Game.pr - 0.15); renderer.setPixelRatio(Game.pr); setupPost(Post.level); }
  } else if (Perf.fps > 58 && Game.pr < Game.maxPR) { Game.pr = Math.min(Game.maxPR, Game.pr + 0.1); renderer.setPixelRatio(Game.pr); setupPost(Post.level); }
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); setupPost(Post.level); });

// ───────────────────────── cámara en tercera persona ─────────────────────────
const cam = { yaw: 0, pitch: -0.2, dist: 3.4, fov: 62, x: 0, y: 0, z: 0 };
function setMenuView(on) { scene.fog.density = on ? 0.0016 : SETTINGS.qual === 'baja' ? 0.004 : 0.0028; }
function updateCamera(dt, now) {
  const P = camera.position;
  if (Game.state === 'menu') {
    const a = now * 0.00005, t = World.towns[0] || { x: 0, z: 0, base: 5 };
    P.set(t.x + Math.cos(a) * 95, t.base + 38, t.z + Math.sin(a) * 95); camera.lookAt(t.x, t.base + 4, t.z);
    if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
    followSun(t.x, t.z); return;
  }
  const p = player;
  if (Game.recoil > 0) { const k = Math.min(Game.recoil, dt * 0.6 + Game.recoil * 0.5); cam.pitch = clamp(cam.pitch + k, -1.15, 0.8); Game.recoil -= k; }
  // objetivo de la cámara: el avión, el paracaídas o el hombro del personaje
  let px, py, pz, dist, side, fov;
  if (p.inPlane) { px = Plane.x; py = Plane.H; pz = Plane.z; dist = 34; side = 0; fov = 62; }
  else if (p.falling) { px = p.x; py = p.y + 1.6; pz = p.z; dist = 9; side = 0; fov = 66; }
  else if (!p.alive) { px = p.x; py = p.y + 0.5; pz = p.z; dist = 6; side = 0; fov = 60; }
  else if (p.scoped) { px = p.x; py = p.y + 1.62; pz = p.z; dist = 0.01; side = 0; fov = 13; }
  else { px = p.x; py = p.y + 1.62; pz = p.z; dist = p.aiming ? 1.7 : 3.3; side = p.aiming ? 0.62 : 0.55; fov = p.aiming ? 46 : 62; }
  if (camera.aspect < 0.9 && !p.scoped) { dist *= 1.35; fov += 10; }
  const cp = Math.cos(cam.pitch), lx = Math.cos(cam.yaw) * cp, ly = Math.sin(cam.pitch), lz = Math.sin(cam.yaw) * cp;
  const rx = -Math.sin(cam.yaw), rz = Math.cos(cam.yaw);
  const k = 1 - Math.exp(-dt * 22);
  cam.x += (px - cam.x) * k; cam.y += (py - cam.y) * k; cam.z += (pz - cam.z) * k;
  const sx = cam.x + rx * side, sz = cam.z + rz * side;
  let want = dist;
  if (!p.inPlane && dist > 0.05) { // la cámara no atraviesa paredes ni el suelo
    const hit = raycast3D(sx, cam.y, sz, -lx, -ly, -lz, dist + 0.3);
    want = Math.max(0.35, Math.min(dist, hit - 0.3));
  }
  cam.dist += (want - cam.dist) * (want < cam.dist ? 1 : 1 - Math.exp(-dt * 6));
  P.set(sx - lx * cam.dist, cam.y - ly * cam.dist, sz - lz * cam.dist);
  const gy = groundH(P.x, P.z) + 0.3; if (P.y < gy) P.y = gy;
  camera.lookAt(P.x + lx, P.y + ly, P.z + lz);
  const fk = 1 - Math.exp(-dt * 14); cam.fov += (fov - cam.fov) * fk;
  if (Math.abs(camera.fov - cam.fov) > 0.05) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  $('scope').classList.toggle('hidden', !p.scoped || !p.alive);
  $('cross').classList.toggle('hidden', p.scoped || p.inPlane || p.falling || !p.alive || Game.endShown);
  const baseFog = SETTINGS.qual === 'baja' ? 0.004 : 0.0028;
  scene.fog.density = baseFog / (1 + Math.max(0, P.y - groundH(P.x, P.z) - 15) / 30);
  followSun(cam.x, cam.z);
  Game.listener = p.inPlane ? Plane : p;
}
function followSun(x, z) {
  const s = 110 / 1024; x = Math.round(x / s) * s; z = Math.round(z / s) * s; // sin parpadeo de sombras
  const y = groundH(x, z);
  sun.position.set(x + SUN_DIR.x * 120, y + SUN_DIR.y * 120, z + SUN_DIR.z * 120); sun.target.position.set(x, y, z);
}

// ───────────────────────── paso de simulación ─────────────────────────
function step(dt) {
  Game.time += dt;
  planeUpdate(dt);
  zoneUpdate(dt);
  const p = player;
  if (p.alive && !p.inPlane) {
    readInput(dt);
    if (p.falling) updateFalling(p, dt, input.mx, input.mz);
    else {
      moveFighter(p, input.mx, input.mz, fighterSpeed(p), dt);
      if (input.firing) { const [dx, dy, dz] = playerAimDir(); fire(p, dx, dy, dz); }
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
        const ai = f.ai, dx = ai.landX - f.x, dz = ai.landZ - f.z, d = Math.hypot(dx, dz) || 1, above = f.y - groundH(f.x, f.z);
        const tLeft = above > 40 ? (above - 40) / 15 + 8 : above / 5, sp = Math.min(1, d / Math.max(0.5, tLeft) / 10);
        updateFalling(f, dt, dx / d * sp, dz / d * sp);
      } else botUpdate(f, dt);
    }
    updateTimers(f, dt);
    if (!f.falling && dist2(f.x, f.z, Zone.cur.x, Zone.cur.z) > Zone.cur.r * Zone.cur.r) damage(f, Zone.dps * dt, null, 'zona');
  }
  updateEffects(dt);
  const near = p.alive && !p.inPlane && !p.falling ? nearestItem(p, 2.4) : null, pr = $('prompt');
  if (near) {
    const full = WEAP[near.k] && p.slots[0] && p.slots[1];
    const txt = (full ? `Cambiar por ${ITEM[near.k].label}` : `Tomar ${ITEM[near.k].label}`) + (near.amt && !WEAP[near.k] && !ITEM[near.k].armor ? ` ×${near.amt}` : '');
    const html = input.touch ? txt : `<kbd>E</kbd>${txt}`;
    if (Hud.cache.prompt !== html) { Hud.cache.prompt = html; pr.innerHTML = html; }
  }
  pr.classList.toggle('hidden', !near); $('bPick').classList.toggle('hot', !!near);
  $('bAim').classList.toggle('hot', input.aimHold);
  Hud.update(dt);
}

// ───────────────────────── bucle principal ─────────────────────────
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  perfTick(dt);
  if (Game.state !== 'menu' && !Game.paused) step(dt);
  if (Game.state !== 'menu') for (const f of fighters) syncMesh(f, Game.paused ? 0 : dt);
  updateCamera(Game.paused ? 0 : dt, now);
  sky.position.copy(camera.position);
  grassU.uTime.value = zoneWallU.uTime.value = now / 1000; waterNormal.offset.set(now * 0.000011, now * 0.000007);
  grassU.uCenter.value.set(Game.state === 'menu' ? camera.position.x : cam.x, Game.state === 'menu' ? camera.position.z : cam.z);
  fadeU.value.set(camera.position.x, camera.position.y, camera.position.z, Game.state === 'menu' ? 0 : 1);
  render();
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
$('resumeBtn').addEventListener('click', () => { togglePause(false); lockPointer(); });
$('quitBtn').addEventListener('click', () => { newWorld(); toMenu(); });

// arranque
setTouchMode(IS_TOUCH);
$('loading').textContent = 'Generando la isla…';
loadSky();
let ready = false;
const enablePlay = () => { if (ready) return; ready = true; const btn = $('playBtn'); btn.disabled = false; btn.textContent = 'Jugar'; refreshBest(); if (Assets.failed) $('loading').textContent = 'Algunas texturas no cargaron: el juego usa colores de respaldo. Para verlo completo, abrilo desde un servidor web.'; };
Assets.onChange = () => {
  const pct = Assets.total ? Math.round(Assets.done / Assets.total * 100) : 0;
  if (!ready) { $('playBtn').textContent = `Cargando ${pct}%`; $('loadBar').style.transform = `scaleX(${pct / 100})`; }
  if (Assets.done >= Assets.total) enablePlay();
};
setTimeout(enablePlay, 25000);
requestAnimationFrame(() => {
  newWorld(); applyQuality(); setMenuView(true);
  Assets.onChange();
  requestAnimationFrame(frame);
});
// acceso para pruebas automáticas
window.__uep = { Game, Zone, World, step, cam, camera, input, groundH, get fighters() { return fighters; }, get player() { return player; }, get loot() { return loot; }, Perf };
