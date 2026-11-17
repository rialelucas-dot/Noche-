// ───────────────────────── generación del mapa ─────────────────────────
const TOWN_NAMES = ['Puerto Niebla', 'Villa Cardo', 'La Cantera', 'Base Cóndor', 'Los Pinos', 'Granja Ocaso', 'Bahía Seca', 'El Mirador'];
const WALL_H = 3.4, WALL_T = 0.35, DOOR_W = 1.9, DOOR_H = 2.4, WIN_W = 1.3, SILL = 1.0, WIN_TOP = 2.3, ROOF_H = 1.7;
const worldGroup = new THREE.Group();
scene.add(worldGroup);
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const unitBox = new THREE.BoxGeometry(1, 1, 1); unitBox.translate(0, 0.5, 0);
const ROOF_GEO = roofGeo(), ROCK_GEO = displace(new THREE.IcosahedronGeometry(1, 2), 0.26, 1.4);
const [LEAF_BARK, LEAF_CARDS] = broadleafGeos(11), [PINE_BARK, PINE_CARDS] = pineGeos(23), BUSH_CARDS = bushGeo(5);
const KEEP = [unitBox, ROOF_GEO, ROCK_GEO, LEAF_BARK, LEAF_CARDS, PINE_BARK, PINE_CARDS, BUSH_CARDS];
const MAT = {
  plaster: worldMat(T.plaster, { scale: 0.26, nScale: 0.9, color: new THREE.Color(1.55, 1.5, 1.44) }), concrete: worldMat(T.concrete, { scale: 0.3 }), roof: worldMat(T.roof, { scale: 0.55, roof: true }),
  floor: worldMat(T.floor, { scale: 0.45 }), planks: worldMat(T.floor, { scale: 0.7 }), rock: worldMat(T.rock, { tri: true, scale: 0.3, nScale: 1.3 }),
  sill: new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.6 }),
  bark: new THREE.MeshStandardMaterial({ map: T.bark.d, normalMap: T.bark.n, roughness: 0.95 }), pinebark: new THREE.MeshStandardMaterial({ map: T.pinebark.d, normalMap: T.pinebark.n, roughness: 0.95 }),
  leaves: leafMat(T.leaves), needles: leafMat(T.needles),
};
const DEPTH = { leaves: leafDepth(T.leaves), needles: leafDepth(T.needles) };
const heightTex = new THREE.DataTexture(new Float32Array(HN * HN * 2), HN, HN, THREE.RGFormat, THREE.FloatType);
heightTex.magFilter = heightTex.minFilter = THREE.NearestFilter;
grassU.uHeight.value = heightTex;

function setInst(mesh, i, x, y, z, sx, sy, sz, ry = 0, color = null, rx = 0, rz = 0) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  _m4.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
  mesh.setMatrixAt(i, _m4);
  if (color !== null) mesh.setColorAt(i, _c.set(color));
}
function segDist2(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0, 1);
  return dist2(px, pz, ax + vx * t, az + vz * t);
}
function rawH(x, z) {
  const L = landAt(x, z);
  if (L < 0) return Math.max(-7, L * 0.12);
  return Math.min(L, 14) / 14 * 1.3 + smooth(10, 75, L) * (Math.max(0, fbm(x / 170, z / 170) - 0.3) * 36 + fbm(x / 48 + 9, z / 48 - 3) * 4);
}
function inst(geo, mat, n, shadow = true) { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); m.count = n; m.castShadow = shadow; m.receiveShadow = true; worldGroup.add(m); return m; }

function buildWorld(seed) {
  for (const ch of [...worldGroup.children]) { worldGroup.remove(ch); if (ch.geometry && !KEEP.includes(ch.geometry)) ch.geometry.dispose(); }
  World.towns = []; World.buildings = []; World.roads = []; World.colliders = [];
  grid = Array.from({ length: GN * GN }, () => []);
  World.seed = seed; seedRand(seed); _noiseSeed = seed * 7 + 3;
  coastP = [srr(0, TAU), srr(0, TAU), srr(0, TAU), srr(0, TAU)];

  // pueblos y caminos
  for (let tries = 0; World.towns.length < 7 && tries < 800; tries++) {
    const a = srand() * TAU, r = Math.sqrt(srand()) * 285, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (landAt(x, z) < 75 || World.towns.some((t) => dist2(t.x, t.z, x, z) < 150 * 150)) continue;
    const i = World.towns.length;
    World.towns.push({ x, z, name: TOWN_NAMES[i], r: i < 2 ? 58 : 44, military: TOWN_NAMES[i].startsWith('Base'), base: Math.max(1.5, rawH(x, z)) });
  }
  const seen = new Set();
  World.towns.forEach((t, i) => {
    World.towns.map((o, j) => ({ j, d: dist2(t.x, t.z, o.x, o.z) })).filter((o) => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 2).forEach(({ j }) => {
      const k = i < j ? `${i}-${j}` : `${j}-${i}`; if (seen.has(k)) return; seen.add(k);
      World.roads.push([t.x, t.z, World.towns[j].x, World.towns[j].z]);
    });
  });

  // relieve (los pueblos quedan aplanados)
  MAX_H = 0;
  for (let iz = 0; iz < HN; iz++) for (let ix = 0; ix < HN; ix++) {
    const x = ix * HCELL - HALF, z = iz * HCELL - HALF; let h = rawH(x, z);
    for (const t of World.towns) { const w = 1 - smooth(t.r + 2, t.r + 32, Math.sqrt(dist2(x, z, t.x, t.z))); if (w > 0) h = lerp(h, t.base, w); }
    heights[iz * HN + ix] = h; MAX_H = Math.max(MAX_H, h);
  }
  MAX_H += 4;

  // terreno
  const gGeo = new THREE.PlaneGeometry(WORLD, WORLD, HSEG, HSEG); gGeo.rotateX(-Math.PI / 2);
  const pos = gGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heights[i]);
  gGeo.computeVertexNormals();
  const nrm = gGeo.attributes.normal, cols = new Float32Array(pos.count * 3), spl = new Float32Array(pos.count * 4), hdata = heightTex.image.data;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), L = landAt(x, z), slope = 1 - nrm.getY(i);
    let g = 0, d = 0, r = 0, sa = 0, mask = 0, tint = 1;
    if (L < 0) { sa = 1; d = clamp(-L / 25, 0, 0.7); tint = lerp(0.8, 0.45, clamp(-L / 30, 0, 1)); }
    else if (L < 12) { sa = 1; tint = L < 3 ? 0.82 : 1; }
    else {
      const n = vnoise(x / 30, z / 30), dry = vnoise(x / 90 + 3, z / 90 + 8), f = forestAt(x, z);
      g = 1; d = clamp((dry - 0.6) * 2.5, 0, 0.6) + (f > 0.5 ? clamp((f - 0.5) * 3, 0, 0.9) : 0);
      if (L < 22) sa = (22 - L) / 10;
      mask = L > 18 ? 1 - clamp((f - 0.6) * 2, 0, 0.6) : 0;
      for (const t of World.towns) { const dd = Math.sqrt(dist2(x, z, t.x, t.z)); if (dd < t.r + 8) { const k = clamp((t.r + 8 - dd) / 12, 0, 1); d = Math.max(d, k * 1.2); sa = Math.max(sa, k * 0.9); tint = Math.max(tint, 1 + k * 0.15); mask = 0; } }
      for (const rd of World.roads) if (segDist2(x, z, ...rd) < 14) { d = 2.2; g *= 0.3; mask = 0; break; }
      if (slope > 0.1) { r = clamp((slope - 0.1) * 7, 0, 2); if (slope > 0.2) mask = 0; }
      tint = Math.max(tint, 0.9 + n * 0.2);
    }
    cols[i * 3] = tint; cols[i * 3 + 1] = tint; cols[i * 3 + 2] = tint * 0.98;
    spl.set([g, d, r, sa], i * 4);
    hdata[i * 2] = heights[i]; hdata[i * 2 + 1] = mask;
  }
  heightTex.needsUpdate = true;
  gGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); gGeo.setAttribute('aSplat', new THREE.BufferAttribute(spl, 4));
  const ground = new THREE.Mesh(gGeo, terrainMat);
  ground.receiveShadow = true; worldGroup.add(ground);

  // edificios con ventanas y puertas
  const walls = [], sills = [];
  World.towns.forEach((t) => {
    const want = t.r > 50 ? 11 : 7;
    for (let tries = 0, n = 0; n < want && tries < 300; tries++) {
      const a = srand() * TAU, r = 7 + srand() * (t.r - 11), x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
      const hw = t.military ? srr(6.5, 10) : srr(4, 6.8), hd = t.military ? srr(5, 7.5) : srr(3.6, 5.8);
      if (World.buildings.some((b) => Math.abs(b.x - x) < b.hw + hw + 6 && Math.abs(b.z - z) < b.hd + hd + 6)) continue;
      if (World.roads.some((rd) => segDist2(x, z, ...rd) < (Math.max(hw, hd) + 4) ** 2)) continue;
      const wall = t.military ? [0x9ea19a, 0x8f938c, 0xa7a59b][(srand() * 3) | 0] : [0xffffff, 0xf6f1e8, 0xeef2f4, 0xf6e6cc, 0xe6ecdc, 0xf2dcc4, 0xfffaf0][(srand() * 7) | 0];
      const roof = t.military ? 0x8a8c8a : [0xffffff, 0xe0cfc6, 0xc9bdb5, 0xf0d8c8, 0xa9a6a6][(srand() * 5) | 0];
      const base = t.base, b = { x, z, hw, hd, base, doors: [], wall, roof, idx: World.buildings.length, town: t };
      const doorSides = [0, 1, 2, 3].sort(() => srand() - 0.5).slice(0, hw > 6 ? 2 : 1 + (srand() < 0.3 ? 1 : 0));
      for (let s = 0; s < 4; s++) {
        const alongX = s < 2, half = alongX ? hw : hd, line = s === 0 ? z - hd : s === 1 ? z + hd : s === 2 ? x - hw : x + hw, out = s === 0 || s === 2 ? -1 : 1;
        const ops = [];
        if (doorSides.includes(s)) {
          const o = srr(-half + DOOR_W, half - DOOR_W); ops.push({ c: o, w: DOOR_W, door: true });
          const dc = alongX ? x + o : z + o;
          b.doors.push(alongX ? { out: { x: dc, z: line + out * 2 }, in: { x: dc, z: line - out * 2 } } : { out: { x: line + out * 2, z: dc }, in: { x: line - out * 2, z: dc } });
        }
        const span = t.military ? 4.6 : 3.3, nw = Math.max(0, Math.floor((half * 2 - 1.6) / span));
        for (let k = 0; k < nw; k++) {
          const c = -half + 0.8 + (k + 0.5) * ((half * 2 - 1.6) / nw);
          if (ops.some((o) => Math.abs(o.c - c) < o.w / 2 + WIN_W / 2 + 0.5) || srand() < 0.2) continue;
          ops.push({ c, w: WIN_W, door: false });
        }
        ops.sort((p, q) => p.c - q.c);
        const piece = (a0, a1, y0, y1) => {
          if (a1 - a0 < 0.02) return;
          walls.push(alongX ? { x0: x + a0, x1: x + a1, z0: line - WALL_T / 2, z1: line + WALL_T / 2, y0: base + y0, y1: base + y1, c: wall }
            : { x0: line - WALL_T / 2, x1: line + WALL_T / 2, z0: z + a0, z1: z + a1, y0: base + y0, y1: base + y1, c: wall });
          walls[walls.length - 1].mil = t.military;
        };
        let cur = -half - WALL_T / 2;
        for (const o of ops) {
          piece(cur, o.c - o.w / 2, 0, WALL_H);
          if (o.door) piece(o.c - o.w / 2, o.c + o.w / 2, DOOR_H, WALL_H);
          else {
            piece(o.c - o.w / 2, o.c + o.w / 2, 0, SILL); piece(o.c - o.w / 2, o.c + o.w / 2, WIN_TOP, WALL_H);
            sills.push(alongX ? [x + o.c, base + SILL, line, WIN_W + 0.2, WALL_T + 0.18, 0] : [line, base + SILL, z + o.c, WIN_W + 0.2, WALL_T + 0.18, Math.PI / 2]);
          }
          cur = o.c + o.w / 2;
        }
        piece(cur, half + WALL_T / 2, 0, WALL_H);
      }
      World.buildings.push(b); n++;
    }
  });
  for (const mil of [false, true]) {
    const list = walls.filter((w) => !!w.mil === mil), mesh = inst(unitBox, mil ? MAT.concrete : MAT.plaster, list.length);
    list.forEach((w, i) => { setInst(mesh, i, (w.x0 + w.x1) / 2, w.y0, (w.z0 + w.z1) / 2, w.x1 - w.x0, w.y1 - w.y0, w.z1 - w.z0, 0, w.c); addCollider({ t: 1, ...w }); });
  }
  const sillMesh = inst(unitBox, MAT.sill, sills.length, false);
  sills.forEach(([x, y, z, w, d, ry], i) => setInst(sillMesh, i, x, y - 0.06, z, w, 0.08, d, ry));
  const nb = World.buildings.length, mil = World.buildings.filter((b) => b.town.military), civ = World.buildings.filter((b) => !b.town.military);
  const floors = inst(unitBox, MAT.floor, nb, false);
  const roofs = inst(ROOF_GEO, MAT.roof, civ.length);
  const flat = inst(unitBox, MAT.concrete, mil.length);
  World.buildings.forEach((b, i) => {
    setInst(floors, i, b.x, b.base - 0.06, b.z, b.hw * 2, 0.12, b.hd * 2, 0, b.town.military ? 0x9a9a96 : 0xffffff);
    addCollider({ t: 1, x0: b.x - b.hw - 0.4, x1: b.x + b.hw + 0.4, z0: b.z - b.hd - 0.4, z1: b.z + b.hd + 0.4, y0: b.base + WALL_H, y1: b.base + WALL_H + (b.town.military ? 0.35 : ROOF_H * 0.8) });
  });
  civ.forEach((b, i) => { const along = b.hw >= b.hd; setInst(roofs, i, b.x, b.base + WALL_H, b.z, (along ? b.hw : b.hd) * 2 + 0.9, ROOF_H, (along ? b.hd : b.hw) * 2 + 0.9, along ? 0 : Math.PI / 2, b.roof); });
  mil.forEach((b, i) => setInst(flat, i, b.x, b.base + WALL_H, b.z, b.hw * 2 + 0.4, 0.35, b.hd * 2 + 0.4));

  // cajones de madera (cobertura)
  const crates = [];
  const tryCrate = (x, z) => {
    if (landAt(x, z) < 8 || buildingAt(x, z, -2.5) || !pointFree(x, z, 1.4)) return false;
    const g = groundH(x, z), two = srand() < 0.3, h = 0.7;
    crates.push([x, g, z, srand() * 0.5]); if (two) crates.push([x, g + 1.4, z, srand() * 0.5]);
    addCollider({ t: 1, x0: x - h, x1: x + h, z0: z - h, z1: z + h, y0: g - 0.5, y1: g + (two ? 2.8 : 1.4) }); return true;
  };
  World.towns.forEach((t) => { for (let k = 0; k < 16; k++) { const a = srand() * TAU, r = srand() * t.r; const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r; if (tryCrate(x, z) && srand() < 0.5) tryCrate(x + 1.5, z); } });
  for (let k = 0; k < 70; k++) { const a = srand() * TAU, r = Math.sqrt(srand()) * 330; tryCrate(Math.cos(a) * r, Math.sin(a) * r); }
  const crateMesh = inst(unitBox, MAT.planks, crates.length);
  crates.forEach(([x, y, z, ry], i) => setInst(crateMesh, i, x, y, z, 1.4, 1.4, 1.4, ry, srand() < 0.3 ? 0xb8c4a0 : 0xffffff));

  // rocas
  const rocks = [];
  for (let k = 0; k < 1000 && rocks.length < 180; k++) {
    const a = srand() * TAU, r = Math.sqrt(srand()) * 360, x = Math.cos(a) * r, z = Math.sin(a) * r, s = srr(0.9, 2.6);
    if (landAt(x, z) < 3 || buildingAt(x, z, -4) || !pointFree(x, z, s + 1)) continue;
    const g = groundH(x, z); rocks.push([x, g, z, s]); addCollider({ t: 0, x, z, r: s * 0.85, y0: g - 1, y1: g + s * 0.85 });
  }
  const rockMesh = inst(ROCK_GEO, MAT.rock, rocks.length);
  rocks.forEach(([x, g, z, s], i) => setInst(rockMesh, i, x, g + s * 0.1, z, s * srr(0.95, 1.3), s * srr(0.6, 0.95), s * srr(0.95, 1.3), srand() * TAU, [0xffffff, 0xe8e4dc, 0xd6d2cc, 0xf2ead8][(srand() * 4) | 0], srand() * 0.4, srand() * 0.4));

  // árboles y arbustos
  const trees = [], bushes = [];
  for (let k = 0; k < 9000 && trees.length < 820; k++) {
    const a = srand() * TAU, r = Math.sqrt(srand()) * 370, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (srand() > (forestAt(x, z) > 0.5 ? 0.9 : 0.06)) continue;
    if (landAt(x, z) < 14 || buildingAt(x, z, -5) || World.roads.some((rd) => segDist2(x, z, ...rd) < 25)) continue;
    if (World.towns.some((t) => dist2(x, z, t.x, t.z) < (t.r - 6) ** 2) || !pointFree(x, z, 2.2)) continue;
    const s = srr(0.8, 1.35), g = groundH(x, z); trees.push([x, g, z, s, srand() < 0.55 ? 0 : 1]); addCollider({ t: 0, x, z, r: 0.32 * s, y0: g - 1, y1: g + 3.2 * s });
  }
  for (let k = 0; k < 4000 && bushes.length < 520; k++) {
    const a = srand() * TAU, r = Math.sqrt(srand()) * 365, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (landAt(x, z) < 12 || buildingAt(x, z, -2) || !pointFree(x, z, 1.2)) continue;
    bushes.push([x, groundH(x, z), z, srr(0.6, 1.25)]);
  }
  const tint = () => [0xffffff, 0xe8f0d8, 0xd8e2c0, 0xfff0d0, 0xc8d4b0][(srand() * 5) | 0];
  const plant = (barkGeo, barkMat, cardGeo, cardMat, depth, list, shadow = true) => {
    const bm = barkGeo ? inst(barkGeo, barkMat, list.length) : null, cm = inst(cardGeo, cardMat, list.length, shadow);
    cm.customDepthMaterial = depth;
    list.forEach(([x, g, z, s], i) => { const ry = srand() * TAU, sy = s * srr(0.9, 1.15), c = tint(); if (bm) setInst(bm, i, x, g - 0.15, z, s, sy, s, ry); setInst(cm, i, x, g - 0.15, z, s, sy, s, ry, c); });
  };
  plant(PINE_BARK, MAT.pinebark, PINE_CARDS, MAT.needles, DEPTH.needles, trees.filter((t) => t[4] === 0));
  plant(LEAF_BARK, MAT.bark, LEAF_CARDS, MAT.leaves, DEPTH.leaves, trees.filter((t) => t[4] === 1));
  plant(null, null, BUSH_CARDS, MAT.leaves, DEPTH.leaves, bushes, false);
  World.trees = trees.length; World.rocks = rocks.length; World.crates = crates.length; World.walls = walls.length;
}
