// ───────────────────────── render y escena ─────────────────────────
const WORLD = 900, HALF = WORLD / 2;
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.type = THREE.PCFShadowMap;
$('game').appendChild(renderer.domElement);

const FOG = 0x7d6f7c;
const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG);
scene.fog = new THREE.Fog(FOG, 95, 230);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 1, 420);

const hemi = new THREE.HemisphereLight(0xc4ccff, 0x6a4c3a, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd1a6, 2.1);
sun.position.set(-40, 48, 22);
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 140 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

// Material que se "abre" con tramado alrededor del jugador: así árboles, techos y paredes no lo tapan.
const fadeU = { value: new THREE.Vector4(0, 0, 7, 1) };
function fadeMat(params) {
  const m = new THREE.MeshLambertMaterial(params);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFade = fadeU;
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 wp_ = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wp_ = instanceMatrix * wp_;
      #endif
      vWPos = (modelMatrix * wp_).xyz;`);
    sh.fragmentShader = `varying vec3 vWPos;
uniform vec4 uFade;
float bayer2_(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4_(vec2 a) { return bayer2_(0.5 * a) * 0.25 + bayer2_(a); }
` + sh.fragmentShader.replace('void main() {', `void main() {
      if (uFade.w > 0.5 && vWPos.y > 1.7) {
        float a_ = smoothstep(uFade.z * 0.45, uFade.z, length(vWPos.xz - uFade.xy));
        if (a_ < 0.999 && a_ < bayer4_(gl_FragCoord.xy) + 0.03) discard;
      }`);
  };
  return m;
}

// ───────────────────────── isla ─────────────────────────
let coastP = [0, 0, 0, 0];
function coastR(th) { return 345 + 32 * Math.sin(3 * th + coastP[0]) + 18 * Math.sin(5 * th + coastP[1]) + 9 * Math.sin(9 * th + coastP[2]) + 5 * Math.sin(14 * th + coastP[3]); }
function landAt(x, z) { return coastR(Math.atan2(z, x)) - Math.hypot(x, z); }
const forestAt = (x, z) => vnoise(x / 75 + 40, z / 75 - 13);

const World = { towns: [], buildings: [], roads: [], colliders: [], seed: 0 };

// grilla espacial de colisionadores
const CELL = 8, GN = Math.ceil(WORLD / CELL);
let grid = [];
let stamp = 1;
const cellOf = (v) => clamp(Math.floor((v + HALF) / CELL), 0, GN - 1);
function addCollider(c) {
  const i = World.colliders.length; c.s = 0; World.colliders.push(c);
  const x0 = c.t === 0 ? c.x - c.r : c.x0, x1 = c.t === 0 ? c.x + c.r : c.x1;
  const z0 = c.t === 0 ? c.z - c.r : c.z0, z1 = c.t === 0 ? c.z + c.r : c.z1;
  for (let gz = cellOf(z0); gz <= cellOf(z1); gz++) for (let gx = cellOf(x0); gx <= cellOf(x1); gx++) grid[gz * GN + gx].push(i);
}
function forNear(x, z, r, fn) {
  stamp++;
  const C = World.colliders;
  for (let gz = cellOf(z - r); gz <= cellOf(z + r); gz++) for (let gx = cellOf(x - r); gx <= cellOf(x + r); gx++) {
    const cell = grid[gz * GN + gx];
    for (let k = 0; k < cell.length; k++) { const c = C[cell[k]]; if (c.s === stamp) continue; c.s = stamp; fn(c); }
  }
}
function pointFree(x, z, r) {
  let free = true;
  forNear(x, z, r + 1, (c) => {
    if (!free) return;
    if (c.t === 0) { if (dist2(x, z, c.x, c.z) < (r + c.r) ** 2) free = false; }
    else { const cx = clamp(x, c.x0, c.x1), cz = clamp(z, c.z0, c.z1); if (dist2(x, z, cx, cz) < r * r) free = false; }
  });
  return free;
}
// empuja una entidad circular fuera de los obstáculos
function resolveCircle(e, r) {
  forNear(e.x, e.z, r + 0.5, (c) => {
    if (c.t === 0) {
      const dx = e.x - c.x, dz = e.z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2), p = rr - d; e.x += dx / d * p; e.z += dz / d * p; }
    } else {
      const cx = clamp(e.x, c.x0, c.x1), cz = clamp(e.z, c.z0, c.z1), dx = e.x - cx, dz = e.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2), p = r - d; e.x += dx / d * p; e.z += dz / d * p; }
        else {
          const l = e.x - c.x0, rg = c.x1 - e.x, t = e.z - c.z0, b = c.z1 - e.z, m = Math.min(l, rg, t, b);
          if (m === l) e.x = c.x0 - r; else if (m === rg) e.x = c.x1 + r; else if (m === t) e.z = c.z0 - r; else e.z = c.z1 + r;
        }
      }
    }
  });
}
function rayCircle(ox, oz, dx, dz, cx, cz, r) {
  const fx = ox - cx, fz = oz - cz, b = fx * dx + fz * dz, c = fx * fx + fz * fz - r * r;
  if (c < 0) return 0;
  const disc = b * b - c; if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc); return t >= 0 ? t : -1;
}
function rayBox(ox, oz, dx, dz, c) {
  let tmin = 0, tmax = 1e9;
  if (Math.abs(dx) < 1e-9) { if (ox < c.x0 || ox > c.x1) return -1; }
  else { let a = (c.x0 - ox) / dx, b = (c.x1 - ox) / dx; if (a > b) { const s = a; a = b; b = s; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); if (tmin > tmax) return -1; }
  if (Math.abs(dz) < 1e-9) { if (oz < c.z0 || oz > c.z1) return -1; }
  else { let a = (c.z0 - oz) / dz, b = (c.z1 - oz) / dz; if (a > b) { const s = a; a = b; b = s; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); if (tmin > tmax) return -1; }
  return tmin;
}
// distancia hasta el primer obstáculo a lo largo de un rayo (DDA sobre la grilla)
function raycastWorld(ox, oz, dx, dz, maxT) {
  stamp++;
  const C = World.colliders;
  let best = maxT, gx = cellOf(ox), gz = cellOf(oz);
  const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(CELL / dx) : 1e9, tdz = dz !== 0 ? Math.abs(CELL / dz) : 1e9;
  const bx = gx * CELL - HALF, bz = gz * CELL - HALF;
  let tmx = dx > 0 ? (bx + CELL - ox) / dx : dx < 0 ? (bx - ox) / dx : 1e9;
  let tmz = dz > 0 ? (bz + CELL - oz) / dz : dz < 0 ? (bz - oz) / dz : 1e9;
  let t = 0;
  while (t <= best) {
    const cell = grid[gz * GN + gx];
    for (let k = 0; k < cell.length; k++) {
      const c = C[cell[k]]; if (c.s === stamp) continue; c.s = stamp;
      const h = c.t === 0 ? rayCircle(ox, oz, dx, dz, c.x, c.z, c.r) : rayBox(ox, oz, dx, dz, c);
      if (h >= 0 && h < best) best = h;
    }
    if (tmx < tmz) { t = tmx; tmx += tdx; gx += sx; if (gx < 0 || gx >= GN) break; }
    else { t = tmz; tmz += tdz; gz += sz; if (gz < 0 || gz >= GN) break; }
  }
  return best;
}
function buildingAt(x, z, m = 0) {
  const B = World.buildings;
  for (let i = 0; i < B.length; i++) { const b = B[i]; if (Math.abs(x - b.x) < b.hw - m && Math.abs(z - b.z) < b.hd - m) return b; }
  return null;
}
function nearestLand(x, z, need = 4) {
  let k = 0;
  while (landAt(x, z) < need && k++ < 200) { x *= 0.98; z *= 0.98; }
  return { x, z };
}
