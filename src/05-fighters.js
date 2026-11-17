// ───────────────────────── combatientes ─────────────────────────
const BOT_NAMES = ['Puma', 'Tero', 'Chajá', 'Hornero', 'Yarará', 'Carancho', 'Ñandú', 'Vizcacha', 'Benteveo', 'Zorro', 'Cóndor', 'Tatú', 'Bagual', 'Quirquincho', 'Coipo', 'Yaguareté', 'Mara', 'Guanaco', 'Lechuza', 'Chimango', 'Pecarí', 'Hurón', 'Calandria', 'Biguá', 'Cuis', 'Tordo', 'Pampa', 'Surubí'];
const BOT_COLORS = [0x5d6b4a, 0x6f6450, 0x4f5d6b, 0x7a5648, 0x6a6a68, 0x7c7350, 0x4c6262, 0x6b5a6e, 0x57533f, 0x8a7d63];
const SKIN = [0xe0b494, 0xc69072, 0x9a6a4f, 0xf0c8a8, 0x7a5040];
const RECOIL = { pistola: 0.014, subfusil: 0.008, fusil: 0.011, escopeta: 0.05, precision: 0.06 };
const PLAYER_R = 0.45, BODY_H = 1.82, HEAD_Y = 1.52;
const gunGeo = (() => { // fusil genérico: cajón, cañón, cargador y culata
  const parts = [new THREE.BoxGeometry(0.07, 0.11, 0.5).translate(0, 0, 0.3), new THREE.CylinderGeometry(0.017, 0.017, 0.5, 8).rotateX(Math.PI / 2).translate(0, 0.02, 0.78),
    new THREE.BoxGeometry(0.05, 0.16, 0.08).rotateX(0.25).translate(0, -0.12, 0.36), new THREE.BoxGeometry(0.06, 0.1, 0.24).translate(0, -0.02, -0.04),
    new THREE.BoxGeometry(0.03, 0.05, 0.16).translate(0, 0.09, 0.32)];
  const g = joinGeos(parts); g.scale(1, 1, 1 / 1.04); return g;
})();
const G = {
  leg: new THREE.CapsuleGeometry(0.085, 0.7, 4, 10).translate(0, -0.43, 0),
  boot: new THREE.BoxGeometry(0.15, 0.1, 0.27).translate(0, -0.86, 0.04),
  hips: new THREE.CapsuleGeometry(0.15, 0.2, 4, 10).rotateZ(Math.PI / 2).translate(0, 0.92, 0),
  torso: new THREE.CapsuleGeometry(0.19, 0.34, 4, 12).scale(1.18, 1, 0.78).translate(0, 1.24, 0),
  vest: new THREE.CapsuleGeometry(0.2, 0.26, 4, 12).scale(1.25, 1, 0.92).translate(0, 1.26, 0.005),
  neck: new THREE.CylinderGeometry(0.055, 0.065, 0.12, 10).translate(0, 1.52, 0),
  head: new THREE.SphereGeometry(0.115, 18, 14).scale(0.92, 1.08, 1).translate(0, 1.66, 0.01),
  helmet: new THREE.SphereGeometry(0.135, 18, 10, 0, TAU, 0, Math.PI / 1.9).scale(1, 0.95, 1.08).translate(0, 1.69, 0),
  arm: new THREE.CapsuleGeometry(0.058, 0.44, 4, 8).translate(0, -0.27, 0),
  gun: gunGeo,
  pack: new THREE.CapsuleGeometry(0.15, 0.22, 4, 10).scale(1.2, 1, 0.65).translate(0, 1.22, -0.2),
  chute: new THREE.SphereGeometry(3, 20, 8, 0, TAU, 0, Math.PI / 2.4).scale(1, 0.55, 1).translate(0, 5.6, 0),
};
const matCache = {};
const std = (c, r = 0.85) => (matCache[c + ':' + r] ||= new THREE.MeshStandardMaterial({ color: c, roughness: r }));
const chuteMat = (c) => (matCache['ch' + c] ||= new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, side: THREE.DoubleSide }));

let fighters = [], player = null;
function makeFighter(isBot, name, color) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const pants = new THREE.Color(color).multiplyScalar(0.7).getHex();
  const part = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const legL = part(G.leg, std(pants), -0.1, 0.9), legR = part(G.leg, std(pants), 0.1, 0.9);
  legL.add(new THREE.Mesh(G.boot, std(0x2a2622, 0.7))); legR.add(new THREE.Mesh(G.boot, std(0x2a2622, 0.7)));
  part(G.hips, std(pants)); part(G.torso, std(color)); const vest = part(G.vest, std(0x3b412f, 0.75));
  part(G.neck, std(0xc69072, 0.6)); part(G.head, std(pick(SKIN), 0.55));
  if (!isBot || Math.random() < 0.6) part(G.helmet, std(isBot ? 0x4a4f3c : 0x2f3329, 0.6));
  const armR = part(G.arm, std(color), 0.27, 1.43, 0), armL = part(G.arm, std(color), -0.27, 1.43, 0);
  armR.rotation.set(-1.25, 0, 0.08); armL.rotation.set(-1.4, 0, 0.6);
  const gun = part(G.gun, std(0x2a2c2e, 0.4), 0.1, 1.36, 0.08); part(G.pack, std(0x4a4436));
  const chute = new THREE.Mesh(G.chute, chuteMat(isBot ? 0xd8cfc0 : 0xff9b54)); chute.visible = false; g.add(chute);
  scene.add(g);
  const f = {
    bot: isBot, name, mesh: g, gun, chute, vest, legL, legR, x: 0, z: 0, y: 0, vx: 0, vz: 0, angle: 0, walk: 0, hp: 100, armor: 0, alive: true,
    slots: [null, null], cur: 0, ammo: { '9mm': 0, '5.56': 0, '12g': 0, '7.62': 0 }, heals: { venda: 0, botiquin: 0 },
    kills: 0, fireCd: 0, reloadT: 0, healT: 0, healType: null, falling: false, inPlane: true, deadT: 0, lastHit: -9, scoped: false, aiming: false, sprint: false, place: 0,
  };
  fighters.push(f); return f;
}
function clearFighters() { for (const f of fighters) scene.remove(f.mesh); fighters = []; player = null; }
const curW = (f) => f.slots[f.cur];

function syncMesh(f, dt) {
  const m = f.mesh;
  m.visible = !f.inPlane && (f.alive || f.deadT < 4) && !(f === player && f.scoped);
  if (!m.visible) return;
  m.position.set(f.x, f.y, f.z);
  m.rotation.y = Math.PI / 2 - f.angle;
  f.chute.visible = f.falling;
  const w = curW(f);
  f.gun.visible = !!w && !f.falling;
  if (w) f.gun.scale.z = WEAP[w.k].len * 0.8;
  f.vest.visible = f.armor > 1;
  if (!f.alive) { m.rotation.x = -Math.min(1, f.deadT * 2.5) * Math.PI / 2; return; }
  const sp = Math.hypot(f.vx, f.vz);
  if (dt && dist2(f.x, f.z, camera.position.x, camera.position.z) < 120 * 120) {
    f.walk += sp * dt * 1.9;
    const a = f.falling ? 0.25 : Math.sin(f.walk) * 0.75 * Math.min(1, sp / 5);
    f.legL.rotation.x = a; f.legR.rotation.x = -a;
  }
}
function muzzle(f) {
  const c = Math.cos(f.angle), s = Math.sin(f.angle);
  return { x: f.x + c * 0.75 - s * 0.12, y: f.y + 1.42, z: f.z + s * 0.75 + c * 0.12 };
}

// ───────── disparo en 3D (con tiro a la cabeza) ─────────
function fire(f, dx, dy, dz) {
  if (f.fireCd > 0 || f.falling || !f.alive) return false;
  const w = curW(f);
  if (!w) return punch(f, f.angle);
  if (f.reloadT > 0) return false;
  if (w.mag <= 0) { startReload(f); return false; }
  const d = WEAP[w.k];
  cancelHeal(f); f.sprint = false;
  w.mag--; f.fireCd = d.rate * (f.bot ? DIFF[SETTINGS.diff].rateMul : 1);
  const moving = Math.abs(f.vx) + Math.abs(f.vz) > 2;
  const spread = d.spread * (moving ? 1.6 : 1) * (f.scoped ? 0.12 : f.aiming ? 0.5 : 1);
  const m = muzzle(f), yaw0 = Math.atan2(dz, dx), pit0 = Math.asin(clamp(dy, -1, 1));
  for (let p = 0; p < d.pellets; p++) {
    const yaw = yaw0 + gauss() * spread, pit = pit0 + gauss() * spread * 0.6, cp = Math.cos(pit);
    const rx = Math.cos(yaw) * cp, ry = Math.sin(pit), rz = Math.sin(yaw) * cp;
    let t = raycast3D(m.x, m.y, m.z, rx, ry, rz, d.range), hit = null, head = false;
    for (const o of fighters) {
      if (o === f || !o.alive || o.falling || o.inPlane) continue;
      if (!ivCircle(m.x, m.z, rx, rz, o.x, o.z, 0.42) || !ivY(m.y, ry, o.y, o.y + BODY_H) || _tout < 0) continue;
      const h = Math.max(0, _tin); if (h < t) { t = h; hit = o; head = m.y + ry * h > o.y + HEAD_Y; }
    }
    const hx = m.x + rx * t, hy = m.y + ry * t, hz = m.z + rz * t;
    spawnTracer(m.x, m.y, m.z, hx, hy, hz, d.tracer);
    if (hit) {
      const fall = t > d.range * 0.6 ? lerp(1, 0.6, (t / d.range - 0.6) / 0.4) : 1;
      damage(hit, d.dmg * fall * (head ? 1.8 : 1) * (f.bot ? DIFF[SETTINGS.diff].dmgMul * (hit.bot ? 0.7 : 1) : 1), f, d.label, head);
      burst(hx, hy, hz, 0xb3261e, 5, 2.5, 0.35, 9);
    } else if (t < d.range - 0.05) burst(hx, hy, hz, hy < groundH(hx, hz) + 0.3 ? 0x8a7558 : 0xd9cdb8, 4, 2, 0.4, 9);
  }
  muzzleFlash(m.x, m.y, m.z, d.pellets > 1 || d.loud > 1);
  if (f === player) { flash.position.set(m.x, m.y, m.z); flash.intensity = 5; Game.recoil += RECOIL[w.k]; }
  Audio.shot(f.x, f.z, d.snd, d.loud);
  if (f !== player) Game.pings.push({ x: f.x, z: f.z, t: 1.6 });
  for (const o of fighters) if (o.bot && o !== f && o.alive && !o.ai.heard && dist2(o.x, o.z, f.x, f.z) < 70 * 70) o.ai.heard = { x: f.x, z: f.z, t: 2.5 };
  if (w.mag === 0 && f.ammo[d.ammo] > 0) startReload(f);
  return true;
}
function punch(f, angle) {
  f.fireCd = 0.45; cancelHeal(f);
  let best = null, bd = 1.9 * 1.9;
  for (const o of fighters) {
    if (o === f || !o.alive || o.falling || o.inPlane) continue;
    const d2 = dist2(o.x, o.z, f.x, f.z);
    if (d2 < bd && Math.abs(angDiff(angle, Math.atan2(o.z - f.z, o.x - f.x))) < 0.8) { bd = d2; best = o; }
  }
  if (best) { damage(best, 12, f, 'Puños'); Audio.tone(120, 0.06, 'square', 0.15); }
  return true;
}
function damage(t, amt, src, cause, head = false) {
  if (!t.alive) return;
  if (t.armor > 0 && src && !head) { const ab = Math.min(t.armor, amt * 0.55); t.armor -= ab; amt -= ab; }
  t.hp -= amt; t.lastHit = Game.time;
  if (t.bot && src && src !== t) { t.ai.threat = src; t.ai.threatT = 4; }
  if (t === player && src) { Hud.hurt(src); Audio.hurt(); }
  if (src === player && t !== player) { t.lastPHit = Game.time; Hud.hitmark(head); Audio.hit(); Hud.dmgNum(t.x, t.y + (head ? 1.9 : 1.5), t.z, amt, head); }
  if (t.hp <= 0) kill(t, src, head ? `${cause} · a la cabeza` : cause);
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
  f.reloadT = 0; f.scoped = false; f.healType = type; f.healT = f.healMax = type === 'venda' ? 2.6 : 6; return true;
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
function switchSlot(f, i) { if (i === f.cur || !f.slots[i]) return; f.cur = i; f.reloadT = 0; f.fireCd = Math.max(f.fireCd, 0.3); f.scoped = false; }
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

// ───────── movimiento sobre el relieve ─────────
function moveFighter(f, dx, dz, speed, dt) {
  const k = 1 - Math.exp(-dt * 12);
  f.vx += (dx * speed - f.vx) * k; f.vz += (dz * speed - f.vz) * k;
  const ox = f.x, oz = f.z;
  f.x += f.vx * dt; f.z += f.vz * dt;
  resolveCircle(f, PLAYER_R);
  if (landAt(f.x, f.z) < 1.5) {
    if (landAt(f.x, oz) >= 1.5) f.z = oz; else if (landAt(ox, f.z) >= 1.5) f.x = ox; else { f.x = ox; f.z = oz; }
  }
  f.y = groundH(f.x, f.z);
}
function fighterSpeed(f) {
  let s = f.sprint ? 7.9 : 5.6;
  const w = curW(f); if (w && w.k === 'precision') s *= 0.94;
  if (f.healT > 0) s = Math.min(s, 2.6); else if (f.reloadT > 0) s *= 0.85;
  if (f.scoped) s *= 0.45; else if (f.aiming) s *= 0.65;
  return s;
}
