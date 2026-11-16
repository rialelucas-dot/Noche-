// ───────────────────────── avión ─────────────────────────
const Plane = { ax: 0, az: 0, bx: 0, bz: 0, x: 0, z: 0, t: 0, dur: 26, H: 70, mesh: new THREE.Group() };
{
  const m = lam(0xd9d2c4), d = lam(0x8c4a38);
  const parts = [[new THREE.BoxGeometry(2, 2, 11), m, 0, 0, 0], [new THREE.BoxGeometry(15, 0.3, 2.4), m, 0, 0, 0.5], [new THREE.BoxGeometry(5.5, 0.25, 1.4), d, 0, 0.4, -4.8], [new THREE.BoxGeometry(0.3, 2.4, 1.8), d, 0, 1.4, -4.8]];
  for (const [g, mat, x, y, z] of parts) { const me = new THREE.Mesh(g, mat); me.position.set(x, y, z); Plane.mesh.add(me); }
  Plane.mesh.visible = false; scene.add(Plane.mesh);
}
function planeStart() {
  const a = Math.random() * TAU, off = rnd(-110, 110), dx = Math.cos(a), dz = Math.sin(a), nx = -dz, nz = dx;
  Object.assign(Plane, { ax: nx * off - dx * 520, az: nz * off - dz * 520, bx: nx * off + dx * 520, bz: nz * off + dz * 520, t: 0 });
  Plane.mesh.rotation.y = Math.PI / 2 - a; Plane.mesh.visible = true;
}
function planeUpdate(dt) {
  if (!Plane.mesh.visible) return;
  Plane.t += dt; const k = Plane.t / Plane.dur;
  Plane.x = lerp(Plane.ax, Plane.bx, k); Plane.z = lerp(Plane.az, Plane.bz, k);
  Plane.mesh.position.set(Plane.x, Plane.H, Plane.z);
  for (const f of fighters) {
    if (!f.inPlane) continue;
    f.x = Plane.x; f.z = Plane.z;
    if (f.bot && k >= f.ai.jumpAt) botJump(f);
    if (!f.bot && k >= 0.9) playerJump();
  }
  if (k >= 1.15) Plane.mesh.visible = false;
}
function jumpOut(f) { f.inPlane = false; f.falling = true; f.y = Plane.H; f.x = Plane.x; f.z = Plane.z; }
function botJump(f) {
  jumpOut(f);
  const near = World.buildings.filter((b) => dist2(b.x, b.z, f.x, f.z) < 170 * 170);
  let p;
  if (near.length && Math.random() < 0.75) { const b = pick(near); p = { x: b.x + rnd(-b.hw + 1.5, b.hw - 1.5), z: b.z + rnd(-b.hd + 1.5, b.hd - 1.5) }; }
  else { const a = Math.random() * TAU, r = rnd(20, 140); p = nearestLand(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, 8); }
  f.ai.landX = p.x; f.ai.landZ = p.z;
}
function playerJump() {
  if (!player.inPlane) return;
  jumpOut(player); Game.state = 'play'; $('bJump').classList.add('hidden');
  Hud.toast('¡Adentro!', 'Elegí dónde caer con el movimiento', 2);
}
function updateFalling(f, dt, dx, dz) {
  f.y -= (f.y > 30 ? 11 : 6) * dt;
  f.x = clamp(f.x + dx * 15 * dt, -440, 440); f.z = clamp(f.z + dz * 15 * dt, -440, 440);
  f.angle = dx || dz ? Math.atan2(dz, dx) : f.angle;
  if (f.y <= 0) {
    f.y = 0; f.falling = false;
    if (landAt(f.x, f.z) < 3) { const p = nearestLand(f.x, f.z, 5); f.x = p.x; f.z = p.z; }
    resolveCircle(f, PLAYER_R);
  }
}

// ───────────────────────── entrada ─────────────────────────
const keys = {};
const input = { mx: 0, mz: 0, sx: innerWidth / 2, sy: innerHeight / 2, firing: false, scope: false, touch: IS_TOUCH, aimA: null, aiming: false };
const raycaster = new THREE.Raycaster(), aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.3), _ndc = new THREE.Vector2(), _hit = new THREE.Vector3();
const playing = () => (Game.state === 'play' || Game.state === 'plane') && !Game.paused;
function setTouchMode(on) {
  input.touch = on; document.body.classList.toggle('touch', on);
  $('touch').classList.toggle('hidden', !on || Game.state === 'menu');
  $('cross').classList.toggle('hidden', on || !playing());
  $('keysDesk').classList.toggle('hidden', on); $('keysTouch').classList.toggle('hidden', !on);
}
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
    case 'scope': { const w = curW(p); p.scoped = !!(w && WEAP[w.k].scope) && !p.scoped; break; }
  }
}
function toggleMap(show = $('bigmap').classList.contains('hidden')) { if (Game.state === 'menu') return; $('bigmap').classList.toggle('hidden', !show); Hud.bigT = 0; }
const KEYMAP = { KeyE: 'pick', KeyF: 'pick', KeyR: 'reload', KeyQ: 'swap', Digit1: 's0', Digit2: 's1', KeyH: 'heal', Digit3: 'venda', Digit4: 'botiquin', Space: 'jump' };
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Escape') { if (!$('bigmap').classList.contains('hidden')) toggleMap(false); else togglePause(); return; }
  if (e.code === 'KeyM' || e.code === 'Tab') { e.preventDefault(); toggleMap(); return; }
  if (KEYMAP[e.code]) { e.preventDefault(); if (!e.repeat) action(KEYMAP[e.code]); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; input.firing = false; });
const cv = renderer.domElement;
cv.addEventListener('mousemove', (e) => { input.sx = e.clientX; input.sy = e.clientY; const c = $('cross'); c.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; });
addEventListener('pointermove', (e) => { if (input.touch && e.pointerType === 'mouse' && (e.movementX || e.movementY)) setTouchMode(false); });
cv.addEventListener('mousedown', (e) => { Audio.init(); if (e.button === 0) input.firing = true; if (e.button === 2) { const w = player && curW(player); if (w && WEAP[w.k].scope) player.scoped = true; } });
addEventListener('mouseup', (e) => { if (e.button === 0) input.firing = false; if (e.button === 2 && player) player.scoped = false; });
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('wheel', (e) => { if (playing()) action('swap'); }, { passive: true });

// sticks táctiles
const sticks = { L: null, R: null };
function stickEl(s) { return $(s === 'L' ? 'stickL' : 'stickR'); }
function resetStick(s) { const el = stickEl(s); el.style.left = el.style.top = el.style.right = el.style.bottom = ''; el.firstElementChild.style.transform = ''; }
addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  Audio.init();
  if (!input.touch) setTouchMode(true);
  if (!playing() || e.target.closest('.tbtn, .screen, #bigmap')) return;
  const s = e.clientX < innerWidth * 0.45 ? 'L' : 'R'; if (sticks[s]) return;
  sticks[s] = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
  const el = stickEl(s); el.style.right = el.style.bottom = 'auto'; el.style.left = `${e.clientX - 60}px`; el.style.top = `${e.clientY - 60}px`;
});
addEventListener('pointermove', (e) => {
  for (const s of ['L', 'R']) {
    const st = sticks[s]; if (!st || st.id !== e.pointerId) continue;
    let dx = e.clientX - st.ox, dy = e.clientY - st.oy; const l = Math.hypot(dx, dy), m = 48;
    if (l > m) { dx = dx / l * m; dy = dy / l * m; }
    st.dx = dx / m; st.dy = dy / m;
    stickEl(s).firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
  }
});
const endStick = (e) => { for (const s of ['L', 'R']) if (sticks[s] && sticks[s].id === e.pointerId) { sticks[s] = null; resetStick(s); } };
addEventListener('pointerup', endStick); addEventListener('pointercancel', endStick);
for (const [id, act] of [['bJump', 'jump'], ['bPick', 'pick'], ['bReload', 'reload'], ['bHeal', 'heal'], ['bSwap', 'swap'], ['bScope', 'scope']]) {
  $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); Audio.init(); action(act); });
}
$('bMap').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); toggleMap(); });
$('bigmap').addEventListener('pointerdown', () => toggleMap(false));

// lee la entrada y la convierte en movimiento y puntería del jugador
const aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xff9b54, transparent: true, opacity: 0.55 }));
aimLine.frustumCulled = false; aimLine.visible = false; scene.add(aimLine);
function readInput() {
  const p = player;
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (sticks.L) { mx = sticks.L.dx; mz = sticks.L.dy; }
  const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  input.mx = mx; input.mz = mz;
  input.aiming = false;
  if (input.touch) {
    const R = sticks.R;
    if (R && Math.hypot(R.dx, R.dy) > 0.2) {
      let a = Math.atan2(R.dy, R.dx);
      // asistencia de puntería suave en pantallas táctiles
      const w = curW(p), range = w ? WEAP[w.k].range : 3; let best = null, bd = 0.32;
      for (const o of fighters) {
        if (o === p || !o.alive || o.inPlane || o.falling) continue;
        const d2 = dist2(o.x, o.z, p.x, p.z); if (d2 > range * range) continue;
        const da = Math.abs(angDiff(a, Math.atan2(o.z - p.z, o.x - p.x))); if (da < bd && hasLOS(p, o, Math.sqrt(d2))) { bd = da; best = o; }
      }
      if (best) a += angDiff(a, Math.atan2(best.z - p.z, best.x - p.x)) * 0.65;
      p.angle = a; input.aiming = true; input.firing = Math.hypot(R.dx, R.dy) > 0.62;
    } else { input.firing = false; if (l > 0.1) p.angle = Math.atan2(mz, mx); }
  } else {
    _ndc.set(input.sx / innerWidth * 2 - 1, -(input.sy / innerHeight) * 2 + 1);
    raycaster.setFromCamera(_ndc, camera);
    if (raycaster.ray.intersectPlane(aimPlane, _hit)) p.angle = Math.atan2(_hit.z - p.z, _hit.x - p.x);
  }
  aimLine.visible = input.touch && input.aiming && !p.falling && p.alive;
  if (aimLine.visible) {
    const w = curW(p), r = w ? Math.min(WEAP[w.k].range, 40) : 2, pa = aimLine.geometry.attributes.position;
    pa.setXYZ(0, p.x + Math.cos(p.angle) * 1, 1.3, p.z + Math.sin(p.angle) * 1); pa.setXYZ(1, p.x + Math.cos(p.angle) * r, 1.3, p.z + Math.sin(p.angle) * r); pa.needsUpdate = true;
  }
}
