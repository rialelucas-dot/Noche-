// ───────────────────────── armas y objetos ─────────────────────────
const WEAP = {
  pistola:   { short: 'Pistola', label: 'Pistola', ammo: '9mm', dmg: 17, rate: 0.22, mag: 12, reload: 1.3, spread: 0.05, range: 44, pellets: 1, snd: 2600, loud: 0.7, len: 0.5, tracer: 0xffe7b0, prefer: 13 },
  subfusil:  { short: 'Subfusil', label: 'Subfusil', ammo: '9mm', dmg: 12, rate: 0.075, mag: 30, reload: 1.9, spread: 0.085, range: 44, pellets: 1, snd: 3000, loud: 0.75, len: 0.8, tracer: 0xffe7b0, prefer: 12 },
  fusil:     { short: 'Fusil', label: 'Fusil de asalto', ammo: '5.56', dmg: 19, rate: 0.115, mag: 30, reload: 2.2, spread: 0.042, range: 74, pellets: 1, snd: 2000, loud: 0.95, len: 1.1, tracer: 0xfff2a0, prefer: 24 },
  escopeta:  { short: 'Escopeta', label: 'Escopeta', ammo: '12g', dmg: 10, rate: 0.85, mag: 5, reload: 2.6, spread: 0.19, range: 21, pellets: 8, snd: 1300, loud: 1, len: 1.0, tracer: 0xffc890, prefer: 6 },
  precision: { short: 'Rifle', label: 'Rifle de precisión', ammo: '7.62', dmg: 84, rate: 1.35, mag: 5, reload: 2.9, spread: 0.006, range: 150, pellets: 1, snd: 1500, loud: 1.2, len: 1.55, tracer: 0xbfe8ff, prefer: 42, scope: true },
};
const WEAP_RANK = { pistola: 1, subfusil: 3, escopeta: 3, fusil: 4, precision: 4 };
const AMMO_TYPES = ['9mm', '5.56', '12g', '7.62'];
const ITEM = {
  pistola: { label: 'Pistola', color: 0xf2a541, sc: [1.0, 0.7, 0.5] },
  subfusil: { label: 'Subfusil', color: 0xf2a541, sc: [1.3, 0.7, 0.5] },
  fusil: { label: 'Fusil de asalto', color: 0xf2a541, sc: [1.7, 0.7, 0.5] },
  escopeta: { label: 'Escopeta', color: 0xf2a541, sc: [1.6, 0.7, 0.5] },
  precision: { label: 'Rifle de precisión', color: 0xffd34d, sc: [2.0, 0.7, 0.5] },
  a9: { label: 'Munición 9mm', ammo: '9mm', amt: 30, color: 0xe6d38a, sc: [0.6, 0.8, 0.6] },
  a556: { label: 'Munición 5.56', ammo: '5.56', amt: 30, color: 0x9fd36a, sc: [0.6, 0.8, 0.6] },
  a12: { label: 'Cartuchos 12g', ammo: '12g', amt: 10, color: 0xf07a5a, sc: [0.6, 0.8, 0.6] },
  a762: { label: 'Munición 7.62', ammo: '7.62', amt: 10, color: 0x7cc8f0, sc: [0.6, 0.8, 0.6] },
  venda: { label: 'Vendas', heal: 'venda', amt: 3, color: 0xf3efe4, sc: [0.7, 0.5, 0.7] },
  botiquin: { label: 'Botiquín', heal: 'botiquin', amt: 1, color: 0xff4f4f, sc: [0.9, 0.6, 0.7] },
  chaleco1: { label: 'Chaleco Nv. 1', armor: 40, color: 0x8fb3ff, sc: [1.0, 0.5, 0.9] },
  chaleco2: { label: 'Chaleco Nv. 2', armor: 70, color: 0x5b8def, sc: [1.0, 0.5, 0.9] },
  chaleco3: { label: 'Chaleco Nv. 3', armor: 100, color: 0x3a5fd0, sc: [1.0, 0.5, 0.9] },
};
const AMMO_ITEM = { '9mm': 'a9', '5.56': 'a556', '12g': 'a12', '7.62': 'a762' };
const MAX_AMMO = 240, MAX_HEAL = { venda: 10, botiquin: 4 };
const LOOT_TABLE = [['pistola', 10], ['subfusil', 7], ['escopeta', 6], ['fusil', 6], ['precision', 1.4], ['a9', 8], ['a556', 7], ['a12', 5], ['a762', 2.5], ['venda', 9], ['botiquin', 2.6], ['chaleco1', 4], ['chaleco2', 2.2], ['chaleco3', 0.8]];
const LOOT_MIL = [['subfusil', 5], ['fusil', 9], ['escopeta', 4], ['precision', 3], ['a556', 8], ['a762', 4], ['a12', 3], ['venda', 6], ['botiquin', 4], ['chaleco2', 4], ['chaleco3', 2]];
function rollLoot(table) { let s = 0; for (const [, w] of table) s += w; let r = Math.random() * s; for (const [k, w] of table) { r -= w; if (r <= 0) return k; } return table[0][0]; }

// objetos en el piso: una sola malla instanciada
const LOOT_CAP = 1800;
const lootGeo = new THREE.BoxGeometry(0.8, 0.4, 0.8); lootGeo.translate(0, 0.2, 0);
const lootMesh = new THREE.InstancedMesh(lootGeo, new THREE.MeshStandardMaterial({ emissive: 0x3a2a16, roughness: 0.55, metalness: 0.1 }), LOOT_CAP);
lootMesh.count = 0; lootMesh.frustumCulled = false; scene.add(lootMesh);
let loot = [], lootFree = [];
function spawnItem(k, x, z, extra = {}) {
  const slot = lootFree.length ? lootFree.pop() : lootMesh.count++;
  if (slot >= LOOT_CAP) { lootMesh.count = LOOT_CAP; return null; }
  const it = { k, x, z, slot, alive: true, amt: ITEM[k].amt || 0, mag: WEAP[k] ? WEAP[k].mag : 0, ...extra };
  const sc = ITEM[k].sc;
  setInst(lootMesh, slot, x, groundH(x, z) + 0.02, z, sc[0] * 0.6, sc[1] * 0.6, sc[2] * 0.6, Math.random() * TAU, ITEM[k].color);
  lootMesh.instanceMatrix.needsUpdate = true; if (lootMesh.instanceColor) lootMesh.instanceColor.needsUpdate = true;
  loot.push(it); return it;
}
function removeItem(it) {
  it.alive = false; setInst(lootMesh, it.slot, 0, -50, 0, 0.001, 0.001, 0.001);
  lootMesh.instanceMatrix.needsUpdate = true; lootFree.push(it.slot);
}
function clearLoot() { loot = []; lootFree = []; lootMesh.count = 0; }
function freeSpot(x, z) {
  for (let k = 0; k < 12; k++) { const a = Math.random() * TAU, r = k * 0.35; const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (pointFree(px, pz, 0.45, groundH(px, pz)) && landAt(px, pz) > 1) return [px, pz]; }
  return [x, z];
}
function spawnInitialLoot() {
  clearLoot();
  const put = (k, x, z) => { spawnItem(k, x, z); if (WEAP[k]) { const [ax, az] = freeSpot(x + 1, z); spawnItem(AMMO_ITEM[WEAP[k].ammo], ax, az); } };
  for (const b of World.buildings) {
    const n = (b.town.military ? 5 : 3) + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) put(rollLoot(b.town.military ? LOOT_MIL : LOOT_TABLE), b.x + rnd(-b.hw + 1.4, b.hw - 1.4), b.z + rnd(-b.hd + 1.4, b.hd - 1.4));
  }
  for (let i = 0; i < 110; i++) {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 330, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (landAt(x, z) < 6 || !pointFree(x, z, 0.8, groundH(x, z))) continue; put(rollLoot(LOOT_TABLE), x, z);
  }
}

// ───────────────────────── efectos ─────────────────────────
const MAX_TR = 160;
const trGeo = new THREE.BufferGeometry();
const trPos = new Float32Array(MAX_TR * 6), trCol = new Float32Array(MAX_TR * 6);
trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3)); trGeo.setAttribute('color', new THREE.BufferAttribute(trCol, 3));
const tracerLines = new THREE.LineSegments(trGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
tracerLines.frustumCulled = false; scene.add(tracerLines);
const tracers = []; let trHead = 0;
function spawnTracer(x0, y0, z0, x1, y1, z1, color) { tracers[trHead] = { x0, y0, z0, x1, y1, z1, life: 0.06, max: 0.06, c: new THREE.Color(color) }; trHead = (trHead + 1) % MAX_TR; }
// fogonazo del disparo: sprites aditivos reutilizables
const flashTex = canvasTex(64, (g, S) => { const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); r.addColorStop(0, 'rgba(255,250,220,1)'); r.addColorStop(0.25, 'rgba(255,200,90,.9)'); r.addColorStop(1, 'rgba(255,120,20,0)'); g.fillStyle = r; g.fillRect(0, 0, S, S); });
const flashes = Array.from({ length: 8 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.visible = false; s.userData.t = 0; scene.add(s); return s; });
let flashHead = 0;
function muzzleFlash(x, y, z, big) { const s = flashes[flashHead]; flashHead = (flashHead + 1) % flashes.length; s.position.set(x, y, z); s.scale.setScalar(big ? 1.1 : 0.7); s.material.rotation = Math.random() * TAU; s.visible = true; s.userData.t = 0.05; }

const MAX_P = 500;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(MAX_P * 3), pCol = new Float32Array(MAX_P * 3);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, depthWrite: false }));
points.frustumCulled = false; scene.add(points);
const parts = Array.from({ length: MAX_P }, () => ({ life: 0 })); let pHead = 0;
function burst(x, y, z, color, n, spd, life = 0.4, grav = 14) {
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const p = parts[pHead]; pHead = (pHead + 1) % MAX_P;
    const a = Math.random() * TAU, s = spd * (0.4 + Math.random() * 0.8);
    Object.assign(p, { x, y, z, fy: groundH(x, z) + 0.03, vx: Math.cos(a) * s, vy: Math.random() * spd, vz: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.6), max: life, r: c.r, g: c.g, b: c.b, grav });
  }
}
function updateEffects(dt) {
  for (let i = 0; i < MAX_TR; i++) {
    const t = tracers[i], o = i * 6;
    if (!t || t.life <= 0) { trPos.fill(0, o, o + 6); trCol.fill(0, o, o + 6); continue; }
    t.life -= dt; const k = Math.max(0, t.life / t.max);
    trPos[o] = t.x0; trPos[o + 1] = t.y0; trPos[o + 2] = t.z0; trPos[o + 3] = t.x1; trPos[o + 4] = t.y1; trPos[o + 5] = t.z1;
    trCol[o] = t.c.r * k * 0.4; trCol[o + 1] = t.c.g * k * 0.4; trCol[o + 2] = t.c.b * k * 0.4; trCol[o + 3] = t.c.r * k; trCol[o + 4] = t.c.g * k; trCol[o + 5] = t.c.b * k;
  }
  trGeo.attributes.position.needsUpdate = true; trGeo.attributes.color.needsUpdate = true;
  for (let i = 0; i < MAX_P; i++) {
    const p = parts[i], o = i * 3;
    if (p.life <= 0) { pPos[o + 1] = -100; continue; }
    p.life -= dt; p.vy -= p.grav * dt; p.x += p.vx * dt; p.y = Math.max(p.fy, p.y + p.vy * dt); p.z += p.vz * dt;
    const k = Math.max(0, p.life / p.max);
    pPos[o] = p.x; pPos[o + 1] = p.y; pPos[o + 2] = p.z; pCol[o] = p.r * k; pCol[o + 1] = p.g * k; pCol[o + 2] = p.b * k;
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  for (const s of flashes) if (s.visible) { s.userData.t -= dt; if (s.userData.t <= 0) s.visible = false; }
  if (flash.intensity > 0) flash.intensity = Math.max(0, flash.intensity - dt * 120);
}
