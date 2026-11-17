// ───────────────────────── render, cielo y luces ─────────────────────────
const WORLD = 900, HALF = WORLD / 2;
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('game').appendChild(renderer.domElement);
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const SUN_DIR = new THREE.Vector3(-0.6, 0.34, 0.72).normalize(); // se recalcula con el cielo HDR
const SKY = { top: new THREE.Color(0x3a6db5), horizon: new THREE.Color(0xf2cfa6), ground: new THREE.Color(0x7a7266), sun: new THREE.Color(0xfff1d6) };
const FOG_COLOR = new THREE.Color(0xc9c2b8);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0032);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);

// cielo de respaldo (si no carga el HDR)
function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR }, uTop: { value: SKY.top }, uHor: { value: SKY.horizon }, uGround: { value: SKY.ground }, uSunCol: { value: SKY.sun } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `varying vec3 vDir; uniform vec3 uSun, uTop, uHor, uGround, uSunCol;
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.42));
        col = mix(col, uGround, smoothstep(0.0, -0.25, h));
        float s = max(dot(d, uSun), 0.0);
        col += uSunCol * (pow(s, 900.0) * 14.0 + pow(s, 14.0) * 0.4 + pow(s, 3.0) * 0.12);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
}
const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMaterial());
sky.frustumCulled = false; sky.renderOrder = -1; scene.add(sky);
const pmrem = new THREE.PMREMGenerator(renderer);
{ const skyScene = new THREE.Scene(); skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), skyMaterial())); scene.environment = pmrem.fromScene(skyScene, 0.04).texture; }
const hemi = new THREE.HemisphereLight(0xc8d8ff, 0x5a4a3a, 0.15);
const sun = new THREE.DirectionalLight(0xffe2bf, 3.2);
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 320 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
const flash = new THREE.PointLight(0xffc070, 0, 10, 2);
scene.add(hemi, sun, sun.target, flash);

// Cielo HDR real (Poly Haven, CC0): fondo, luz ambiental y dirección del sol
const Assets = { total: 0, done: 0, failed: 0, onChange: () => {} };
function assetStart() { Assets.total++; Assets.onChange(); }
function assetEnd(ok) { Assets.done++; if (!ok) Assets.failed++; Assets.onChange(); }
function loadSky() {
  assetStart();
  new RGBELoader().load('assets/sky.hdr', (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const { width: W, height: H, data } = tex.image, half = data instanceof Uint16Array;
    const val = (i) => (half ? THREE.DataUtils.fromHalfFloat(data[i]) : data[i]);
    let best = -1, bx = 0, by = 0; const hor = [0, 0, 0]; let hn = 0;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const i = (y * W + x) * 4, l = val(i) * 0.3 + val(i + 1) * 0.59 + val(i + 2) * 0.11;
      if (l > best) { best = l; bx = x; by = y; }
      if (Math.abs(y - H / 2) < H * 0.03) { hor[0] += val(i); hor[1] += val(i + 1); hor[2] += val(i + 2); hn++; }
    }
    const u = (bx + 0.5) / W, v = 1 - (by + 0.5) / H, th = (u - 0.5) * TAU, ph = (v - 0.5) * Math.PI;
    SUN_DIR.set(Math.cos(ph) * Math.cos(th), Math.max(0.12, Math.sin(ph)), Math.cos(ph) * Math.sin(th)).normalize();
    const m = Math.max(hor[0], hor[1], hor[2]) / hn || 1;
    FOG_COLOR.setRGB(hor[0] / hn / m * 0.85, hor[1] / hn / m * 0.85, hor[2] / hn / m * 0.85); scene.fog.color.copy(FOG_COLOR);
    scene.background = tex; scene.backgroundIntensity = 1.0;
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    sky.visible = false; Assets.hdr = true; assetEnd(true);
  }, undefined, () => assetEnd(false));
}

// Material que se vuelve transparente (con tramado) muy cerca de la cámara: el follaje no tapa la vista.
const fadeU = { value: new THREE.Vector4(0, 0, 0, 1) };
function addFade(sh) {
  sh.uniforms.uFade = fadeU;
  sh.vertexShader = 'varying vec3 vFadeW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
    vec4 fw_ = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      fw_ = instanceMatrix * fw_;
    #endif
    vFadeW = (modelMatrix * fw_).xyz;`);
  sh.fragmentShader = `varying vec3 vFadeW;
uniform vec4 uFade;
float bayer2_(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4_(vec2 a) { return bayer2_(0.5 * a) * 0.25 + bayer2_(a); }
` + sh.fragmentShader.replace('void main() {', `void main() {
    if (uFade.w > 0.5) {
      float a_ = smoothstep(1.0, 3.6, distance(vFadeW, uFade.xyz));
      if (a_ < 0.999 && a_ < bayer4_(gl_FragCoord.xy) + 0.03) discard;
    }`);
}
function fadeMat(params) { const m = new THREE.MeshStandardMaterial(params); m.onBeforeCompile = addFade; return m; }

// ───────────────────────── isla y relieve ─────────────────────────
let coastP = [0, 0, 0, 0];
function coastR(th) { return 345 + 32 * Math.sin(3 * th + coastP[0]) + 18 * Math.sin(5 * th + coastP[1]) + 9 * Math.sin(9 * th + coastP[2]) + 5 * Math.sin(14 * th + coastP[3]); }
function landAt(x, z) { return coastR(Math.atan2(z, x)) - Math.hypot(x, z); }
const forestAt = (x, z) => vnoise(x / 75 + 40, z / 75 - 13);
const fbm = (x, z) => (vnoise(x, z) * 0.57 + vnoise(x * 2.1 + 5.3, z * 2.1 - 1.7) * 0.29 + vnoise(x * 4.3 - 2.1, z * 4.3 + 7.7) * 0.14);
const HSEG = 225, HCELL = WORLD / HSEG, HN = HSEG + 1;
let heights = new Float32Array(HN * HN);
// altura exacta del terreno, interpolando como los triángulos de la malla
function groundH(x, z) {
  const fx = (x + HALF) / HCELL, fz = (z + HALF) / HCELL, ix = Math.floor(fx), iz = Math.floor(fz);
  if (ix < 0 || iz < 0 || ix >= HSEG || iz >= HSEG) return -7;
  const u = fx - ix, v = fz - iz, i = iz * HN + ix;
  const ha = heights[i], hb = heights[i + HN], hc = heights[i + HN + 1], hd = heights[i + 1];
  return u + v <= 1 ? ha + (hd - ha) * u + (hb - ha) * v : hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
}
let MAX_H = 30;

const World = { towns: [], buildings: [], roads: [], colliders: [], seed: 0 };

// ───────────────────────── colisiones y rayos 3D ─────────────────────────
// colisionador: { t: 0 círculo (x, z, r) | 1 caja (x0, x1, z0, z1), y0, y1 }
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
function pointFree(x, z, r, gy = null) {
  let free = true;
  forNear(x, z, r + 1, (c) => {
    if (!free) return;
    if (gy !== null && (c.y0 > gy + 1.7 || c.y1 < gy + 0.35)) return;
    if (c.t === 0) { if (dist2(x, z, c.x, c.z) < (r + c.r) ** 2) free = false; }
    else { const cx = clamp(x, c.x0, c.x1), cz = clamp(z, c.z0, c.z1); if (dist2(x, z, cx, cz) < r * r) free = false; }
  });
  return free;
}
// empuja una entidad circular fuera de los obstáculos que tocan su cuerpo
function resolveCircle(e, r) {
  const gy = groundH(e.x, e.z);
  forNear(e.x, e.z, r + 0.5, (c) => {
    if (c.y0 > gy + 1.7 || c.y1 < gy + 0.35) return;
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
let _tin = 0, _tout = 0;
function ivCircle(ox, oz, dx, dz, cx, cz, r) {
  const fx = ox - cx, fz = oz - cz, a = dx * dx + dz * dz, c = fx * fx + fz * fz - r * r;
  if (a < 1e-12) { _tin = -1e9; _tout = 1e9; return c <= 0; }
  const b = fx * dx + fz * dz, disc = b * b - a * c; if (disc < 0) return false;
  const s = Math.sqrt(disc); _tin = (-b - s) / a; _tout = (-b + s) / a; return true;
}
function ivBox(ox, oz, dx, dz, c) {
  _tin = -1e9; _tout = 1e9;
  if (Math.abs(dx) < 1e-9) { if (ox < c.x0 || ox > c.x1) return false; }
  else { let a = (c.x0 - ox) / dx, b = (c.x1 - ox) / dx; if (a > b) { const s = a; a = b; b = s; } _tin = Math.max(_tin, a); _tout = Math.min(_tout, b); }
  if (Math.abs(dz) < 1e-9) { if (oz < c.z0 || oz > c.z1) return false; }
  else { let a = (c.z0 - oz) / dz, b = (c.z1 - oz) / dz; if (a > b) { const s = a; a = b; b = s; } _tin = Math.max(_tin, a); _tout = Math.min(_tout, b); }
  return _tin <= _tout;
}
function ivY(oy, dy, y0, y1) {
  if (Math.abs(dy) < 1e-9) return oy >= y0 && oy <= y1;
  let a = (y0 - oy) / dy, b = (y1 - oy) / dy; if (a > b) { const s = a; a = b; b = s; }
  _tin = Math.max(_tin, a); _tout = Math.min(_tout, b); return _tin <= _tout;
}
function hitCollider(c, ox, oy, oz, dx, dy, dz) {
  const ok = c.t === 0 ? ivCircle(ox, oz, dx, dz, c.x, c.z, c.r) : ivBox(ox, oz, dx, dz, c);
  if (!ok || !ivY(oy, dy, c.y0, c.y1) || _tout < 0) return -1;
  return Math.max(0, _tin);
}
function rayTerrain(ox, oy, oz, dx, dy, dz, maxT) {
  let prev = 0;
  for (let t = 1.2; ; t += 1.2) {
    const tt = Math.min(t, maxT), y = oy + dy * tt;
    if (y < groundH(ox + dx * tt, oz + dz * tt)) {
      let a = prev, b = tt;
      for (let k = 0; k < 6; k++) { const m = (a + b) / 2; if (oy + dy * m < groundH(ox + dx * m, oz + dz * m)) b = m; else a = m; }
      return b;
    }
    if (tt >= maxT || (dy >= 0 && y > MAX_H)) return maxT;
    prev = tt;
  }
}
// distancia hasta el primer obstáculo (o el suelo) a lo largo de un rayo 3D con dirección unitaria
function raycast3D(ox, oy, oz, dx, dy, dz, maxT, terrain = true) {
  stamp++;
  const C = World.colliders;
  let best = maxT, gx = cellOf(ox), gz = cellOf(oz);
  const flat = Math.abs(dx) + Math.abs(dz) < 1e-6;
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
      const h = hitCollider(c, ox, oy, oz, dx, dy, dz);
      if (h >= 0 && h < best) best = h;
    }
    if (flat) break;
    if (tmx < tmz) { t = tmx; tmx += tdx; gx += sx; if (gx < 0 || gx >= GN) break; }
    else { t = tmz; tmz += tdz; gz += sz; if (gz < 0 || gz >= GN) break; }
  }
  return terrain ? rayTerrain(ox, oy, oz, dx, dy, dz, best) : best;
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
