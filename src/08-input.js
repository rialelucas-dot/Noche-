// ───────────────────────── avión ─────────────────────────
const Plane = { ax: 0, az: 0, bx: 0, bz: 0, x: 0, z: 0, t: 0, dur: 30, H: 95, mesh: new THREE.Group() };
{
  const body = new THREE.MeshStandardMaterial({ color: 0xd9dcdc, roughness: 0.45, metalness: 0.35 }), dark = new THREE.MeshStandardMaterial({ color: 0x8c4a38, roughness: 0.6 });
  const add = (g, m, x, y, z, rx = 0) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.rotation.x = rx; me.castShadow = true; Plane.mesh.add(me); };
  add(new THREE.CylinderGeometry(1.25, 1.05, 15, 14), body, 0, 0, 0, Math.PI / 2);
  add(new THREE.SphereGeometry(1.25, 14, 10), body, 0, 0, 7.4);
  add(new THREE.BoxGeometry(19, 0.28, 2.8), body, 0, -0.2, 0.8);
  add(new THREE.BoxGeometry(6.5, 0.22, 1.6), body, 0, 0.4, -6.6);
  add(new THREE.BoxGeometry(0.25, 2.6, 2.1), dark, 0, 1.6, -6.6);
  for (const x of [-4.2, 4.2]) add(new THREE.CylinderGeometry(0.55, 0.5, 2.6, 12), dark, x, -0.55, 1.5, Math.PI / 2);
  Plane.mesh.visible = false; scene.add(Plane.mesh);
}
function planeStart() {
  const a = Math.random() * TAU, off = rnd(-110, 110), dx = Math.cos(a), dz = Math.sin(a), nx = -dz, nz = dx;
  Object.assign(Plane, { ax: nx * off - dx * 520, az: nz * off - dz * 520, bx: nx * off + dx * 520, bz: nz * off + dz * 520, t: 0, a });
  Plane.mesh.rotation.y = Math.PI / 2 - a; Plane.mesh.visible = true;
  cam.yaw = a + 0.9; cam.pitch = -0.55;
}
function planeUpdate(dt) {
  if (!Plane.mesh.visible) return;
  Plane.t += dt; const k = Plane.t / Plane.dur;
  Plane.x = lerp(Plane.ax, Plane.bx, k); Plane.z = lerp(Plane.az, Plane.bz, k);
  Plane.mesh.position.set(Plane.x, Plane.H, Plane.z);
  for (const f of fighters) {
    if (!f.inPlane) continue;
    f.x = Plane.x; f.z = Plane.z; f.y = Plane.H;
    if (f.bot && k >= f.ai.jumpAt) botJump(f);
    if (!f.bot && k >= 0.9) playerJump();
  }
  if (k >= 1.15) Plane.mesh.visible = false;
}
function jumpOut(f) { f.inPlane = false; f.falling = true; f.y = Plane.H - 3; f.x = Plane.x; f.z = Plane.z; }
function botJump(f) {
  jumpOut(f);
  const near = World.buildings.filter((b) => dist2(b.x, b.z, f.x, f.z) < 170 * 170);
  let p;
  if (near.length && Math.random() < 0.75) { const b = pick(near); p = { x: b.x + rnd(-b.hw + 1.2, b.hw - 1.2), z: b.z + rnd(-b.hd + 1.2, b.hd - 1.2) }; }
  else { const a = Math.random() * TAU, r = rnd(20, 140); p = nearestLand(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, 8); }
  f.ai.landX = p.x; f.ai.landZ = p.z;
}
function playerJump() {
  if (!player.inPlane) return;
  jumpOut(player); Game.state = 'play'; $('bJump').classList.add('hidden');
  Hud.toast('¡Adentro!', 'Mirá hacia dónde querés caer y avanzá', 2.2);
}
function updateFalling(f, dt, dx, dz) {
  const gy = groundH(f.x, f.z), free = f.y - gy > 40;
  f.y -= (free ? 15 : 5) * dt;
  const sp = free ? 12 : 9;
  f.x = clamp(f.x + dx * sp * dt, -440, 440); f.z = clamp(f.z + dz * sp * dt, -440, 440);
  f.vx = dx * sp; f.vz = dz * sp;
  if (f.bot && (dx || dz)) f.angle = Math.atan2(dz, dx);
  if (f.y <= groundH(f.x, f.z)) {
    f.falling = false; f.vx = f.vz = 0;
    if (landAt(f.x, f.z) < 3) { const p = nearestLand(f.x, f.z, 5); f.x = p.x; f.z = p.z; }
    resolveCircle(f, PLAYER_R); f.y = groundH(f.x, f.z);
  }
}

// ───────────────────────── entrada ─────────────────────────
const keys = {};
const input = { mx: 0, mz: 0, firing: false, aimHold: false, touch: IS_TOUCH, locked: false };
const camYaw = () => cam.yaw;
const cv = renderer.domElement;
const playing = () => (Game.state === 'play' || Game.state === 'plane') && !Game.paused;
function setTouchMode(on) {
  input.touch = on; document.body.classList.toggle('touch', on);
  $('touch').classList.toggle('hidden', !on || Game.state === 'menu');
  $('keysDesk').classList.toggle('hidden', on); $('keysTouch').classList.toggle('hidden', !on);
  updateLockHint();
}
function updateLockHint() { $('lockHint').classList.toggle('hidden', input.touch || input.locked || !playing() || !$('end').classList.contains('hidden')); }
function lockPointer() {
  if (input.touch || !cv.requestPointerLock) return;
  try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* sin bloqueo del puntero */ }
}
document.addEventListener('pointerlockchange', () => {
  const was = input.locked; input.locked = document.pointerLockElement === cv;
  if (was && !input.locked && playing()) togglePause(true);
  updateLockHint();
});
function nearestItem(f, r) { let best = null, bd = r * r; for (const it of loot) { if (!it.alive) continue; const d = dist2(it.x, it.z, f.x, f.z); if (d < bd) { bd = d; best = it; } } return best; }
function action(name) {
  if (!playing() || !player.alive) return;
  const p = player;
  switch (name) {
    case 'jump': if (p.inPlane) playerJump(); break;
    case 'pick': { const it = nearestItem(p, 2.4); if (it) takeItem(p, it, true); break; }
    case 'reload': startReload(p); break;
    case 'swap': switchSlot(p, 1 - p.cur); break;
    case 's0': switchSlot(p, 0); break;
    case 's1': switchSlot(p, 1); break;
    case 'heal': if (!startHeal(p, p.hp < 75 && p.heals.venda && !(p.hp < 40 && p.heals.botiquin) ? 'venda' : 'botiquin') && p.heals.venda + p.heals.botiquin === 0) Hud.toast('', 'No tenés curaciones', 1.2); break;
    case 'venda': startHeal(p, 'venda'); break;
    case 'botiquin': startHeal(p, 'botiquin'); break;
    case 'aim': input.aimHold = !input.aimHold; break;
  }
}
function toggleMap(show = $('bigmap').classList.contains('hidden')) { if (Game.state === 'menu') return; $('bigmap').classList.toggle('hidden', !show); Hud.bigT = 0; }
const KEYMAP = { KeyE: 'pick', KeyF: 'pick', KeyR: 'reload', KeyQ: 'swap', Digit1: 's0', Digit2: 's1', KeyH: 'heal', Digit3: 'venda', Digit4: 'botiquin', Space: 'jump' };
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Escape') { if (!$('bigmap').classList.contains('hidden')) toggleMap(false); else if (!input.locked) togglePause(); return; }
  if (e.code === 'KeyM' || e.code === 'Tab') { e.preventDefault(); toggleMap(); return; }
  if (KEYMAP[e.code]) { e.preventDefault(); if (!e.repeat) action(KEYMAP[e.code]); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; input.firing = false; input.aimHold = false; });
function look(dx, dy, sens) {
  const k = player && player.scoped ? 0.22 : input.aimHold ? 0.6 : 1;
  cam.yaw += dx * sens * k; cam.pitch = clamp(cam.pitch - dy * sens * k, -1.15, 0.8);
}
addEventListener('mousemove', (e) => {
  if (e.pointerType === 'touch' || input.touch || !playing()) return;
  if (input.locked || e.buttons) look(e.movementX, e.movementY, 0.0022);
});
addEventListener('pointermove', (e) => { if (input.touch && e.pointerType === 'mouse' && (e.movementX || e.movementY)) setTouchMode(false); });
cv.addEventListener('mousedown', (e) => {
  Audio.init();
  if (!playing() || input.touch) return;
  if (!input.locked) lockPointer();
  if (e.button === 0) input.firing = true;
  if (e.button === 2) input.aimHold = true;
});
$('lockHint').addEventListener('click', () => { Audio.init(); lockPointer(); });
addEventListener('mouseup', (e) => { if (e.button === 0) input.firing = false; if (e.button === 2) input.aimHold = false; });
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('wheel', () => { if (playing()) action('swap'); }, { passive: true });

// táctil: stick a la izquierda, arrastrar a la derecha para mirar, botón de disparo
const touches = { move: null, look: null, fire: null };
function resetStick() { const el = $('stickL'); el.style.left = el.style.top = el.style.bottom = ''; el.firstElementChild.style.transform = ''; }
addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  Audio.init();
  if (!input.touch) setTouchMode(true);
  if (!playing() || e.target.closest('.tbtn, .screen, #bigmap')) return;
  if (e.clientX < innerWidth * 0.42) {
    if (touches.move) return;
    touches.move = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    const el = $('stickL'); el.style.bottom = 'auto'; el.style.left = `${e.clientX - 60}px`; el.style.top = `${e.clientY - 60}px`;
  } else if (!touches.look) touches.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
addEventListener('pointermove', (e) => {
  const m = touches.move;
  if (m && m.id === e.pointerId) {
    let dx = e.clientX - m.ox, dy = e.clientY - m.oy; const l = Math.hypot(dx, dy), r = 48;
    if (l > r) { dx = dx / l * r; dy = dy / l * r; }
    m.dx = dx / r; m.dy = dy / r; $('stickL').firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  for (const k of ['look', 'fire']) { const t = touches[k]; if (t && t.id === e.pointerId) { look(e.clientX - t.x, e.clientY - t.y, 0.0055); t.x = e.clientX; t.y = e.clientY; } }
});
const endTouch = (e) => {
  if (touches.move && touches.move.id === e.pointerId) { touches.move = null; resetStick(); }
  if (touches.look && touches.look.id === e.pointerId) touches.look = null;
  if (touches.fire && touches.fire.id === e.pointerId) { touches.fire = null; input.firing = false; }
};
addEventListener('pointerup', endTouch); addEventListener('pointercancel', endTouch);
$('bFire').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); Audio.init(); touches.fire = { id: e.pointerId, x: e.clientX, y: e.clientY }; input.firing = true; });
for (const [id, act] of [['bJump', 'jump'], ['bPick', 'pick'], ['bReload', 'reload'], ['bHeal', 'heal'], ['bSwap', 'swap'], ['bAim', 'aim']]) {
  $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); Audio.init(); action(act); });
}
$('bMap').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); toggleMap(); });
$('bigmap').addEventListener('pointerdown', () => toggleMap(false));

// convierte la entrada en movimiento relativo a la cámara y en la dirección del disparo
const _dir = new THREE.Vector3();
function readInput(dt) {
  const p = player, fx = Math.cos(cam.yaw), fz = Math.sin(cam.yaw);
  let f = 0, s = 0;
  if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1;
  if (keys.KeyD || keys.ArrowRight) s += 1; if (keys.KeyA || keys.ArrowLeft) s -= 1;
  if (touches.move) { f = -touches.move.dy; s = touches.move.dx; }
  const l = Math.hypot(f, s); if (l > 1) { f /= l; s /= l; }
  input.mx = fx * f - fz * s; input.mz = fz * f + fx * s;
  const w = curW(p);
  p.scoped = input.aimHold && !!w && !!WEAP[w.k].scope && !p.falling && p.healT <= 0;
  p.aiming = input.aimHold && !p.scoped && !!w && !p.falling;
  p.sprint = !input.firing && !input.aimHold && f > 0.5 && (keys.ShiftLeft || keys.ShiftRight || (touches.move && l > 0.92));
  if (p.sprint && l > 0.1) p.angle = Math.atan2(input.mz, input.mx); else p.angle = cam.yaw;
  // asistencia de puntería suave en pantallas táctiles mientras se dispara
  if (input.touch && input.firing && w && !p.falling) {
    let best = null, bd = 0.14;
    for (const o of fighters) {
      if (o === p || !o.alive || o.inPlane || o.falling || dist2(o.x, o.z, p.x, p.z) > WEAP[w.k].range ** 2) continue;
      const da = Math.abs(angDiff(cam.yaw, Math.atan2(o.z - p.z, o.x - p.x))); if (da < bd && hasLOS(p, o)) { bd = da; best = o; }
    }
    if (best) cam.yaw += angDiff(cam.yaw, Math.atan2(best.z - p.z, best.x - p.x)) * Math.min(1, dt * 4);
  }
}
function playerAimDir() {
  camera.getWorldDirection(_dir);
  const c = camera.position, s0 = Math.max(0, cam.dist - 0.6);
  let t = s0 + raycast3D(c.x + _dir.x * s0, c.y + _dir.y * s0, c.z + _dir.z * s0, _dir.x, _dir.y, _dir.z, 500);
  for (const o of fighters) {
    if (o === player || !o.alive || o.inPlane || o.falling) continue;
    if (!ivCircle(c.x, c.z, _dir.x, _dir.z, o.x, o.z, 0.42) || !ivY(c.y, _dir.y, o.y, o.y + BODY_H) || _tout < 0) continue;
    if (_tin > s0 && _tin < t) t = _tin;
  }
  const m = muzzle(player), ax = c.x + _dir.x * t - m.x, ay = c.y + _dir.y * t - m.y, az = c.z + _dir.z * t - m.z, l = Math.hypot(ax, ay, az) || 1;
  return [ax / l, ay / l, az / l];
}
