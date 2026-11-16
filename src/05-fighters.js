// ───────────────────────── combatientes ─────────────────────────
const BOT_NAMES = ['Puma', 'Tero', 'Chajá', 'Hornero', 'Yarará', 'Carancho', 'Ñandú', 'Vizcacha', 'Benteveo', 'Zorro', 'Cóndor', 'Tatú', 'Bagual', 'Quirquincho', 'Coipo', 'Yaguareté', 'Mara', 'Guanaco', 'Lechuza', 'Chimango', 'Pecarí', 'Hurón', 'Calandria', 'Biguá', 'Cuis', 'Tordo', 'Pampa', 'Surubí'];
const BOT_COLORS = [0x6b7f5a, 0x7d6b55, 0x5a6b7d, 0x8a5a4f, 0x707070, 0x8a7f4f, 0x4f6b6b, 0x7a5a7a, 0x5f5a48, 0x9a8a70];
const SKIN = [0xe0b494, 0xc69072, 0x9a6a4f, 0xf0c8a8, 0x7a5040];
const PLAYER_R = 0.6;
const bodyG = new THREE.CylinderGeometry(0.48, 0.56, 1.25, 8); bodyG.translate(0, 0.95, 0);
const headG = new THREE.SphereGeometry(0.36, 10, 8); headG.translate(0, 1.95, 0);
const packG = new THREE.BoxGeometry(0.72, 0.72, 0.34); packG.translate(0, 1.15, -0.55);
const gunG = new THREE.BoxGeometry(0.16, 0.16, 1); gunG.translate(0, 0, 0.5);
const chuteG = new THREE.SphereGeometry(2.8, 12, 5, 0, TAU, 0, Math.PI / 2.3); chuteG.translate(0, 5.2, 0);
const ringG = new THREE.RingGeometry(0.85, 1.08, 28); ringG.rotateX(-Math.PI / 2);
const gunMat = new THREE.MeshLambertMaterial({ color: 0x2a2c30 });
const packMat = new THREE.MeshLambertMaterial({ color: 0x4a4436 });
const matCache = {};
const lam = (c) => (matCache[c] ||= new THREE.MeshLambertMaterial({ color: c }));
const chuteMat = (c) => (matCache['ch' + c] ||= new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));

let fighters = [], player = null;
function makeFighter(isBot, name, color) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const body = new THREE.Mesh(bodyG, lam(color)), head = new THREE.Mesh(headG, lam(pick(SKIN))), pack = new THREE.Mesh(packG, packMat);
  const gun = new THREE.Mesh(gunG, gunMat); gun.position.set(0.3, 1.25, 0.2);
  const chute = new THREE.Mesh(chuteG, chuteMat(isBot ? 0xd8cfc0 : 0xff9b54)); chute.visible = false;
  for (const m of [body, head, pack, gun]) m.castShadow = true;
  g.add(body, head, pack, gun, chute);
  if (!isBot) { const ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0xff9b54, transparent: true, opacity: 0.85 })); ring.position.y = 0.06; g.add(ring); }
  scene.add(g);
  const f = {
    bot: isBot, name, mesh: g, gun, chute, x: 0, z: 0, y: 0, vx: 0, vz: 0, angle: 0, hp: 100, armor: 0, alive: true,
    slots: [null, null], cur: 0, ammo: { '9mm': 0, '5.56': 0, '12g': 0, '7.62': 0 }, heals: { venda: 0, botiquin: 0 },
    kills: 0, fireCd: 0, reloadT: 0, healT: 0, healType: null, falling: false, inPlane: true, deadT: 0, lastHit: -9, scoped: false, place: 0,
  };
  fighters.push(f); return f;
}
function clearFighters() { for (const f of fighters) scene.remove(f.mesh); fighters = []; player = null; }
const curW = (f) => f.slots[f.cur];

function syncMesh(f) {
  const m = f.mesh;
  m.visible = !f.inPlane && (f.alive || f.deadT < 2.5);
  if (!m.visible) return;
  m.position.set(f.x, f.y, f.z);
  m.rotation.y = Math.PI / 2 - f.angle;
  f.chute.visible = f.falling;
  const w = curW(f);
  f.gun.visible = !!w && !f.falling;
  if (w) f.gun.scale.z = WEAP[w.k].len;
  if (!f.alive) m.rotation.x = -Math.min(1, f.deadT * 3) * Math.PI / 2;
}

// ───────── disparo ─────────
function fire(f, angle) {
  if (f.fireCd > 0 || f.falling || !f.alive) return false;
  const w = curW(f);
  if (!w) return punch(f, angle);
  if (f.reloadT > 0) return false;
  if (w.mag <= 0) { startReload(f); return false; }
  const d = WEAP[w.k];
  cancelHeal(f);
  w.mag--; f.fireCd = d.rate * (f.bot ? DIFF[SETTINGS.diff].rateMul : 1);
  const moving = Math.abs(f.vx) + Math.abs(f.vz) > 2;
  const spread = d.spread * (moving ? 1.6 : 1) * (f.scoped ? 0.3 : 1);
  const mx = f.x + Math.cos(angle) * 0.85, mz = f.z + Math.sin(angle) * 0.85;
  for (let p = 0; p < d.pellets; p++) {
    const a = angle + gauss() * spread, dx = Math.cos(a), dz = Math.sin(a);
    let t = raycastWorld(mx, mz, dx, dz, d.range), hit = null;
    for (const o of fighters) {
      if (o === f || !o.alive || o.falling || o.inPlane) continue;
      const h = rayCircle(mx, mz, dx, dz, o.x, o.z, 0.62);
      if (h >= 0 && h < t) { t = h; hit = o; }
    }
    spawnTracer(mx, mz, mx + dx * t, mz + dz * t, d.tracer);
    if (hit) {
      const fall = t > d.range * 0.6 ? lerp(1, 0.6, (t / d.range - 0.6) / 0.4) : 1;
      damage(hit, d.dmg * fall * (f.bot ? DIFF[SETTINGS.diff].dmgMul : 1), f, d.label);
      burst(hit.x, 1.2, hit.z, 0xc4302b, 4, 4, 0.35);
    } else if (t < d.range - 0.05) burst(mx + dx * t, 1.2, mz + dz * t, 0xffd9a0, 3, 3, 0.25);
  }
  burst(mx, 1.3, mz, 0xffc060, 2, 1.5, 0.08, 0);
  Audio.shot(f.x, f.z, d.snd, d.loud);
  if (f !== player) Game.pings.push({ x: f.x, z: f.z, t: 1.6 });
  for (const o of fighters) if (o.bot && o !== f && o.alive && !o.ai.heard && dist2(o.x, o.z, f.x, f.z) < 65 * 65) o.ai.heard = { x: f.x, z: f.z, t: 2.5 };
  if (w.mag === 0 && f.ammo[d.ammo] > 0) startReload(f);
  return true;
}
function punch(f, angle) {
  f.fireCd = 0.45; cancelHeal(f);
  let best = null, bd = 2.2 * 2.2;
  for (const o of fighters) {
    if (o === f || !o.alive || o.falling || o.inPlane) continue;
    const d2 = dist2(o.x, o.z, f.x, f.z);
    if (d2 < bd && Math.abs(angDiff(angle, Math.atan2(o.z - f.z, o.x - f.x))) < 0.8) { bd = d2; best = o; }
  }
  if (best) { damage(best, 12, f, 'Puños'); Audio.tone(120, 0.06, 'square', 0.15); }
  return true;
}
function damage(t, amt, src, cause) {
  if (!t.alive) return;
  if (t.armor > 0 && src) { const ab = Math.min(t.armor, amt * 0.55); t.armor -= ab; amt -= ab; }
  t.hp -= amt; t.lastHit = Game.time;
  if (t.bot && src && src !== t) { t.ai.threat = src; t.ai.threatT = 4; }
  if (t === player && src) { Hud.hurt(); Audio.hurt(); }
  if (src === player && t !== player) { t.lastPHit = Game.time; Hud.hitmark(); Audio.hit(); Hud.dmgNum(t.x, t.z, amt); }
  if (t.hp <= 0) kill(t, src, cause);
}
function kill(t, src, cause) {
  t.alive = false; t.hp = 0; t.deadT = 0; t.place = Game.aliveCount() + 1;
  if (src && src !== t) src.kills++;
  Hud.feed(src && src !== t ? src.name : null, t.name, cause);
  dropLoot(t);
  if (t === player) Game.onPlayerDeath(src);
  Game.checkWin();
}
function dropLoot(f) {
  const drop = (k, extra) => { const [x, z] = freeSpot(f.x + rnd(-1.2, 1.2), f.z + rnd(-1.2, 1.2)); spawnItem(k, x, z, extra); };
  for (const w of f.slots) if (w) drop(w.k, { mag: w.mag });
  for (const a of AMMO_TYPES) if (f.ammo[a] > 0) drop(AMMO_ITEM[a], { amt: f.ammo[a] });
  if (f.heals.venda) drop('venda', { amt: f.heals.venda });
  if (f.heals.botiquin) drop('botiquin', { amt: f.heals.botiquin });
  if (f.armor > 8) drop(f.armor > 70 ? 'chaleco3' : f.armor > 40 ? 'chaleco2' : 'chaleco1', { amt: Math.round(f.armor) });
}

// ───────── recarga, curación, objetos ─────────
function startReload(f) {
  const w = curW(f); if (!w || f.reloadT > 0) return;
  const d = WEAP[w.k]; if (w.mag >= d.mag || f.ammo[d.ammo] <= 0) return;
  cancelHeal(f); f.reloadT = d.reload; f.reloadMax = d.reload;
  if (f === player) Audio.tone(420, 0.05, 'square', 0.08);
}
function startHeal(f, type) {
  if (f.healT > 0 || f.heals[type] <= 0 || f.falling) return false;
  if (type === 'venda' && f.hp >= 75) { if (f === player) Hud.toast('Las vendas curan hasta 75', '', 1.4); return false; }
  if (f.hp >= 100) return false;
  f.reloadT = 0; f.healType = type; f.healT = f.healMax = type === 'venda' ? 2.6 : 6; return true;
}
function cancelHeal(f) { f.healT = 0; f.healType = null; }
function updateTimers(f, dt) {
  if (f.fireCd > 0) f.fireCd -= dt;
  if (f.reloadT > 0) {
    f.reloadT -= dt;
    if (f.reloadT <= 0) { const w = curW(f); if (w) { const d = WEAP[w.k], n = Math.min(d.mag - w.mag, f.ammo[d.ammo]); w.mag += n; f.ammo[d.ammo] -= n; } f.reloadT = 0; }
  }
  if (f.healT > 0) {
    f.healT -= dt;
    if (f.healT <= 0) { f.heals[f.healType]--; f.hp = f.healType === 'venda' ? Math.min(75, f.hp + 18) : 100; f.healType = null; f.healT = 0; if (f === player) Audio.pickup(); }
  }
}
function switchSlot(f, i) { if (i === f.cur || !f.slots[i]) return; f.cur = i; f.reloadT = 0; f.fireCd = Math.max(f.fireCd, 0.25); f.scoped = false; }
// devuelve true si tomó el objeto; force = cambiar el arma actual por la del piso
function takeItem(f, it, force = false) {
  const def = ITEM[it.k];
  if (WEAP[it.k]) {
    let slot = f.slots[0] ? (f.slots[1] ? -1 : 1) : 0;
    if (slot < 0) { if (!force) return false; slot = f.cur; const old = f.slots[slot]; const [x, z] = freeSpot(f.x, f.z); spawnItem(old.k, x, z, { mag: old.mag }); }
    f.slots[slot] = { k: it.k, mag: it.mag };
    if (!f.slots[f.cur] || slot === f.cur || (f.bot && WEAP_RANK[it.k] > WEAP_RANK[f.slots[f.cur].k])) { f.cur = slot; f.reloadT = 0; }
  } else if (def.ammo) {
    if (f.ammo[def.ammo] >= MAX_AMMO) return false;
    const n = Math.min(it.amt, MAX_AMMO - f.ammo[def.ammo]); f.ammo[def.ammo] += n; it.amt -= n;
    if (it.amt > 0) return false;
  } else if (def.heal) {
    if (f.heals[def.heal] >= MAX_HEAL[def.heal]) return false;
    const n = Math.min(it.amt, MAX_HEAL[def.heal] - f.heals[def.heal]); f.heals[def.heal] += n; it.amt -= n;
    if (it.amt > 0) return false;
  } else if (def.armor) {
    const pts = it.amt || def.armor;
    if (pts <= f.armor + 4) return false;
    if (f.armor > 8) { const [x, z] = freeSpot(f.x, f.z); spawnItem(f.armor > 70 ? 'chaleco3' : f.armor > 40 ? 'chaleco2' : 'chaleco1', x, z, { amt: Math.round(f.armor) }); }
    f.armor = pts; f.armorMax = def.armor;
  }
  removeItem(it);
  if (f === player) { Audio.pickup(); Hud.toast('', `+ ${def.label}`, 0.9); }
  return true;
}

// ───────── movimiento ─────────
function moveFighter(f, dx, dz, speed, dt) {
  const k = 1 - Math.exp(-dt * 14);
  f.vx += (dx * speed - f.vx) * k; f.vz += (dz * speed - f.vz) * k;
  const ox = f.x, oz = f.z;
  f.x += f.vx * dt; f.z += f.vz * dt;
  resolveCircle(f, PLAYER_R);
  if (landAt(f.x, f.z) < 1.5) {
    if (landAt(f.x, oz) >= 1.5) f.z = oz; else if (landAt(ox, f.z) >= 1.5) f.x = ox; else { f.x = ox; f.z = oz; }
  }
}
function fighterSpeed(f) {
  let s = 7.2;
  const w = curW(f); if (w && w.k === 'precision') s *= 0.93;
  if (f.healT > 0) s *= 0.45; else if (f.reloadT > 0) s *= 0.85;
  if (f.scoped) s *= 0.5;
  return s;
}
