// ───────────────────────── generación del mapa ─────────────────────────
const TOWN_NAMES = ['Puerto Niebla', 'Villa Cardo', 'La Cantera', 'Base Cóndor', 'Los Pinos', 'Granja Ocaso', 'Bahía Seca', 'El Mirador'];
const WALL_H = 4.2, WALL_T = 0.6, DOOR_W = 3.4;
const worldGroup = new THREE.Group();
scene.add(worldGroup);
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
let roofMesh = null;

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

function buildWorld(seed) {
  // limpiar mapa anterior
  for (const ch of [...worldGroup.children]) { worldGroup.remove(ch); ch.geometry?.dispose(); }
  World.towns = []; World.buildings = []; World.roads = []; World.colliders = [];
  grid = Array.from({ length: GN * GN }, () => []);
  World.seed = seed; seedRand(seed); _noiseSeed = seed * 7 + 3;
  coastP = [srr(0, TAU), srr(0, TAU), srr(0, TAU), srr(0, TAU)];

  // pueblos
  for (let tries = 0; World.towns.length < 7 && tries < 800; tries++) {
    const a = srand() * TAU, r = Math.sqrt(srand()) * 285, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (landAt(x, z) < 75) continue;
    if (World.towns.some((t) => dist2(t.x, t.z, x, z) < 150 * 150)) continue;
    const i = World.towns.length;
    World.towns.push({ x, z, name: TOWN_NAMES[i], r: i < 2 ? 62 : 48, military: TOWN_NAMES[i].startsWith('Base') });
  }
  // caminos: cada pueblo con sus dos vecinos más cercanos
  const seen = new Set();
  World.towns.forEach((t, i) => {
    World.towns.map((o, j) => ({ j, d: dist2(t.x, t.z, o.x, o.z) })).filter((o) => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 2).forEach(({ j }) => {
      const k = i < j ? `${i}-${j}` : `${j}-${i}`; if (seen.has(k)) return; seen.add(k);
      World.roads.push([t.x, t.z, World.towns[j].x, World.towns[j].z]);
    });
  });

  // edificios
  const wallBoxes = [];
  World.towns.forEach((t) => {
    const want = t.r > 55 ? 10 : 6;
    for (let tries = 0, n = 0; n < want && tries < 300; tries++) {
      const a = srand() * TAU, r = 8 + srand() * (t.r - 12);
      const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
      const hw = t.military ? srr(7, 11) : srr(5, 8.5), hd = t.military ? srr(5, 8) : srr(4.5, 7);
      if (landAt(x, z) < 30) continue;
      if (World.buildings.some((b) => Math.abs(b.x - x) < b.hw + hw + 7 && Math.abs(b.z - z) < b.hd + hd + 7)) continue;
      if (World.roads.some((rd) => segDist2(x, z, ...rd) < (Math.max(hw, hd) + 4) ** 2)) continue;
      const wall = t.military ? [0x9ea19a, 0x8f938c, 0xa7a59b][(srand() * 3) | 0] : [0xe0caa6, 0xd2b48f, 0xc9ab92, 0xdcbca0, 0xb7bba4, 0xceaa84][(srand() * 6) | 0];
      const roof = t.military ? 0x4c5250 : [0x8c4a38, 0x6f5444, 0x5d6672, 0x7b3e33, 0x56604c][(srand() * 5) | 0];
      const b = { x, z, hw, hd, doors: [], wall, roof, idx: World.buildings.length, town: t };
      const sides = [0, 1, 2, 3].sort(() => srand() - 0.5).slice(0, hw > 7.5 ? 2 : 1 + (srand() < 0.35 ? 1 : 0));
      for (let s = 0; s < 4; s++) {
        const alongX = s < 2, half = alongX ? hw : hd, line = s === 0 ? z - hd : s === 1 ? z + hd : s === 2 ? x - hw : x + hw;
        const out = s === 0 || s === 2 ? -1 : 1;
        const segs = [];
        if (sides.includes(s)) {
          const o = srr(-half + DOOR_W, half - DOOR_W);
          segs.push([-half - WALL_T / 2, o - DOOR_W / 2], [o + DOOR_W / 2, half + WALL_T / 2]);
          const dc = alongX ? { x: x + o, z: line } : { x: line, z: z + o };
          b.doors.push(alongX
            ? { out: { x: dc.x, z: line + out * 2.4 }, in: { x: dc.x, z: line - out * 2.4 } }
            : { out: { x: line + out * 2.4, z: dc.z }, in: { x: line - out * 2.4, z: dc.z } });
          wallBoxes.push({ lintel: true, alongX, line, a: o - DOOR_W / 2, b: o + DOOR_W / 2, b0: b });
        } else segs.push([-half - WALL_T / 2, half + WALL_T / 2]);
        for (const [a0, a1] of segs) wallBoxes.push({ alongX, line, a: a0, b: a1, b0: b });
      }
      World.buildings.push(b); n++;
    }
  });

  // terreno
  const SEG = 180, gGeo = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG); gGeo.rotateX(-Math.PI / 2);
  const pos = gGeo.attributes.position, cols = new Float32Array(pos.count * 3), col = new THREE.Color(), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), land = landAt(x, z);
    if (land < 0) { pos.setY(i, Math.max(-5, land * 0.09)); col.set(0xb79f74).lerp(tmp.set(0x3f6a6c), clamp(-land / 30, 0, 1)); }
    else if (land < 11) { col.set(0xcdbf98).lerp(tmp.set(0xbfae86), clamp((11 - land) / 11, 0, 1) * 0.6); }
    else {
      const n = vnoise(x / 38, z / 38), f = forestAt(x, z);
      col.set(0x84a256).lerp(tmp.set(0xa2ac62), n * 0.8);
      if (f > 0.5) col.lerp(tmp.set(0x4f6c3c), clamp((f - 0.5) * 3, 0, 0.8));
      if (land < 18) col.lerp(tmp.set(0xc4b48c), (18 - land) / 7 * 0.6);
      for (const t of World.towns) { const d = Math.sqrt(dist2(x, z, t.x, t.z)); if (d < t.r) col.lerp(tmp.set(t.military ? 0x8d8c80 : 0xa8986f), clamp((t.r - d) / 18, 0, 0.75)); }
      for (const rd of World.roads) if (segDist2(x, z, ...rd) < 12) { col.lerp(tmp.set(0x9b825f), 0.85); break; }
    }
    cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b;
  }
  gGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  gGeo.computeVertexNormals();
  const ground = new THREE.Mesh(gGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true; worldGroup.add(ground);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), new THREE.MeshLambertMaterial({ color: 0x2e5f72 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -0.55; worldGroup.add(water);

  // paredes, dinteles, pisos y techos (instanciados: una llamada de dibujo cada uno)
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const walls = new THREE.InstancedMesh(box, fadeMat({}), wallBoxes.length);
  wallBoxes.forEach((w, i) => {
    const b = w.b0, lo = w.lintel ? 3.1 : 0, h = w.lintel ? WALL_H - 3.1 : WALL_H;
    if (w.alongX) {
      setInst(walls, i, b.x + (w.a + w.b) / 2, lo, w.line, w.b - w.a, h, WALL_T, 0, b.wall);
      if (!w.lintel) addCollider({ t: 1, x0: b.x + w.a, x1: b.x + w.b, z0: w.line - WALL_T / 2, z1: w.line + WALL_T / 2 });
    } else {
      setInst(walls, i, w.line, lo, b.z + (w.a + w.b) / 2, WALL_T, h, w.b - w.a, 0, b.wall);
      if (!w.lintel) addCollider({ t: 1, x0: w.line - WALL_T / 2, x1: w.line + WALL_T / 2, z0: b.z + w.a, z1: b.z + w.b });
    }
  });
  walls.castShadow = true; walls.receiveShadow = true; worldGroup.add(walls);
  const nb = World.buildings.length;
  const floors = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({}), nb);
  roofMesh = new THREE.InstancedMesh(box, fadeMat({}), nb);
  World.buildings.forEach((b, i) => {
    setInst(floors, i, b.x, 0.01, b.z, b.hw * 2, 0.08, b.hd * 2, 0, b.town.military ? 0x6f716b : 0x7d6048);
    setInst(roofMesh, i, b.x, WALL_H, b.z, b.hw * 2 + 1, 0.45, b.hd * 2 + 1, 0, b.roof);
    b.roofHidden = false;
  });
  floors.receiveShadow = true; roofMesh.castShadow = true; worldGroup.add(floors, roofMesh);

  // cajones de madera (cobertura)
  const crates = [];
  const tryCrate = (x, z) => {
    if (landAt(x, z) < 8 || buildingAt(x, z, -3) || !pointFree(x, z, 1.6)) return false;
    crates.push([x, z, srand() * 0.4]); const h = 0.75; addCollider({ t: 1, x0: x - h, x1: x + h, z0: z - h, z1: z + h }); return true;
  };
  World.towns.forEach((t) => { for (let k = 0; k < 14; k++) { const a = srand() * TAU, r = srand() * t.r; const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r; if (tryCrate(x, z) && srand() < 0.5) tryCrate(x + 1.6, z); } });
  for (let k = 0; k < 70; k++) { const a = srand() * TAU, r = Math.sqrt(srand()) * 330; tryCrate(Math.cos(a) * r, Math.sin(a) * r); }
  const crateMesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({}), crates.length);
  crates.forEach(([x, z], i) => setInst(crateMesh, i, x, 0, z, 1.5, 1.5, 1.5, 0, srand() < 0.3 ? 0x6d7d5a : 0x9b7448));
  crateMesh.castShadow = true; crateMesh.receiveShadow = true; worldGroup.add(crateMesh);

  // rocas
  const rocks = [];
  for (let k = 0; k < 900 && rocks.length < 170; k++) {
    const a = srand() * TAU, r = Math.sqrt(srand()) * 360, x = Math.cos(a) * r, z = Math.sin(a) * r, s = srr(1, 2.6);
    if (landAt(x, z) < 3 || buildingAt(x, z, -4) || !pointFree(x, z, s + 1)) continue;
    rocks.push([x, z, s]); addCollider({ t: 0, x, z, r: s * 0.95 });
  }
  const rockMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), rocks.length);
  rocks.forEach(([x, z, s], i) => setInst(rockMesh, i, x, s * 0.25, z, s * srr(0.95, 1.3), s * srr(0.6, 0.95), s * srr(0.95, 1.3), srand() * TAU, [0x8d8a85, 0x7e7b78, 0x9a958c][(srand() * 3) | 0], srand(), srand()));
  rockMesh.castShadow = true; rockMesh.receiveShadow = true; worldGroup.add(rockMesh);

  // árboles: bosques densos y campo abierto
  const trees = [];
  for (let k = 0; k < 9000 && trees.length < 760; k++) {
    const a = srand() * TAU, r = Math.sqrt(srand()) * 370, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const f = forestAt(x, z); if (srand() > (f > 0.5 ? 0.9 : 0.06)) continue;
    if (landAt(x, z) < 12 || buildingAt(x, z, -5)) continue;
    if (World.roads.some((rd) => segDist2(x, z, ...rd) < 25)) continue;
    const s = srr(0.8, 1.35); if (!pointFree(x, z, 2.2)) continue;
    trees.push([x, z, s, srand() < 0.6 ? 0 : 1]); addCollider({ t: 0, x, z, r: 0.5 * s });
  }
  const trunkG = new THREE.CylinderGeometry(0.26, 0.36, 2.6, 6); trunkG.translate(0, 1.3, 0);
  const pineG = new THREE.ConeGeometry(2.1, 5.4, 7); pineG.translate(0, 4.7, 0);
  const roundG = new THREE.IcosahedronGeometry(2.3, 0); roundG.translate(0, 4.1, 0);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x5a3d2b }), trees.length);
  const pines = trees.filter((t) => t[3] === 0), rounds = trees.filter((t) => t[3] === 1);
  const pineMesh = new THREE.InstancedMesh(pineG, fadeMat({ flatShading: true }), pines.length);
  const roundMesh = new THREE.InstancedMesh(roundG, fadeMat({ flatShading: true }), rounds.length);
  trees.forEach(([x, z, s], i) => setInst(trunks, i, x, 0, z, s, s, s));
  pines.forEach(([x, z, s], i) => setInst(pineMesh, i, x, 0, z, s, s * srr(0.9, 1.15), s, srand() * TAU, [0x2f5a3a, 0x37633f, 0x2a4f37][(srand() * 3) | 0]));
  rounds.forEach(([x, z, s], i) => setInst(roundMesh, i, x, 0, z, s, s * srr(0.85, 1.1), s, srand() * TAU, [0x5f7a3a, 0x6b8340, 0x86803c, 0x9a6a36][(srand() * 4) | 0]));
  for (const m of [trunks, pineMesh, roundMesh]) { m.castShadow = true; worldGroup.add(m); }

  World.trees = trees.length; World.rocks = rocks.length; World.crates = crates.length;
}

// mostrar/ocultar techo del edificio donde está el jugador
function setRoofHidden(b, hidden) {
  if (!b || b.roofHidden === hidden) return;
  b.roofHidden = hidden;
  const k = hidden ? 0.0001 : 1;
  setInst(roofMesh, b.idx, b.x, WALL_H, b.z, (b.hw * 2 + 1) * k, 0.45 * k, (b.hd * 2 + 1) * k);
  roofMesh.instanceMatrix.needsUpdate = true;
}
