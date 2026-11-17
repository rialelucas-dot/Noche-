// ───────────────────────── texturas reales (Poly Haven, CC0) ─────────────────────────
const texLoader = new THREE.TextureLoader();
function canvasTex(size, draw, { repeat = 1, color = true } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = MAX_ANISO;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// carga una imagen; si falla (por ejemplo abriendo el archivo sin servidor) queda un color de respaldo
function loadTex(name, { srgb = true, fallback = '#8a8a8a' } = {}) {
  const t = texLoader.load('assets/' + name, () => assetEnd(true), undefined, () => {
    const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d'); g.fillStyle = fallback; g.fillRect(0, 0, 4, 4);
    t.image = c; t.needsUpdate = true; assetEnd(false);
  });
  assetStart();
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = MAX_ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const pbr = (n, col) => ({ d: loadTex(`${n}_d.jpg`, { fallback: col }), n: loadTex(`${n}_n.jpg`, { srgb: false, fallback: '#8080ff' }), r: loadTex(`${n}_r.jpg`, { srgb: false, fallback: '#ffd000' }) });
const T = {
  grass: pbr('grass', '#6d7a45'), dirt: pbr('dirt', '#6b5a45'), rock: pbr('rock', '#7d756b'), sand: pbr('sand', '#b9a882'),
  plaster: pbr('plaster', '#cfc6b6'), roof: pbr('roof', '#9c5a3c'), floor: pbr('floor', '#8a6a4c'), concrete: pbr('concrete', '#a3a199'),
  bark: pbr('bark', '#5a4a3a'), pinebark: pbr('pinebark', '#5a4232'),
  leaves: loadTex('leaves.webp', { fallback: 'rgba(80,110,50,1)' }), needles: loadTex('needles.webp', { fallback: 'rgba(50,80,45,1)' }),
};
T.grassCard = loadTex('grass.webp', { fallback: 'rgba(110,130,60,1)' });
for (const k of ['bark', 'pinebark']) for (const m of ['d', 'n']) T[k][m].channel = 1;

// ───────────────────────── materiales ─────────────────────────
// terreno: mezcla de 4 texturas (pasto, tierra, roca, arena) con bordes naturales
const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
terrainMat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, { tG: { value: T.grass.d }, tD: { value: T.dirt.d }, tR: { value: T.rock.d }, tS: { value: T.sand.d }, nG: { value: T.grass.n }, nD: { value: T.dirt.n }, nR: { value: T.rock.n }, nS: { value: T.sand.n } });
  sh.vertexShader = 'attribute vec4 aSplat; varying vec4 vSplat; varying vec3 vTW; varying vec3 vTN;\n' + sh.vertexShader.replace('#include <project_vertex>',
    '#include <project_vertex>\n vSplat = aSplat; vTW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTN = normalize(mat3(modelMatrix) * objectNormal);');
  sh.fragmentShader = `uniform sampler2D tG, tD, tR, tS, nG, nD, nR, nS; varying vec4 vSplat; varying vec3 vTW; varying vec3 vTN;
vec4 triT(sampler2D t, vec3 p, vec3 bw) { return texture2D(t, p.zy) * bw.x + texture2D(t, p.xz) * bw.y + texture2D(t, p.xy) * bw.z; }
` + sh.fragmentShader
    .replace('#include <map_fragment>', `
      vec3 Nw_ = normalize(vTN); vec3 bw_ = pow(abs(Nw_), vec3(4.0)); bw_ /= dot(bw_, vec3(1.0));
      vec2 u1_ = vTW.xz * 0.12, u2_ = vTW.xz * 0.029;
      vec3 cg = mix(texture2D(tG, u1_).rgb, texture2D(tG, u2_).rgb, 0.45);
      vec3 cd = mix(texture2D(tD, u1_ * 1.15).rgb, texture2D(tD, u2_ * 1.3).rgb, 0.4);
      vec3 cr = triT(tR, vTW * 0.085, bw_).rgb;
      vec3 cs = mix(texture2D(tS, u1_ * 0.9).rgb, texture2D(tS, u2_).rgb, 0.35);
      vec4 hw = max(vSplat, 0.0) * (vec4(dot(cg, vec3(.33)), dot(cd, vec3(.33)), dot(cr, vec3(.33)), dot(cs, vec3(.33))) * 0.7 + 0.3);
      float mx_ = max(max(hw.x, hw.y), max(hw.z, hw.w)); hw = max(hw - (mx_ - 0.16), 0.0); hw /= max(dot(hw, vec4(1.0)), 1e-4);
      diffuseColor.rgb *= cg * hw.x + cd * hw.y + cr * hw.z + cs * hw.w;`)
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = dot(hw, vec4(0.96, 0.94, 0.8, 0.9));')
    .replace('#include <normal_fragment_maps>', `
      vec3 tn_ = (texture2D(nG, u1_).xyz * 2.0 - 1.0) * hw.x + (texture2D(nD, u1_ * 1.15).xyz * 2.0 - 1.0) * hw.y
               + (texture2D(nR, (abs(Nw_.x) > abs(Nw_.z) ? vTW.zy : vTW.xy) * 0.085).xyz * 2.0 - 1.0) * hw.z + (texture2D(nS, u1_ * 0.9).xyz * 2.0 - 1.0) * hw.w;
      vec3 Tw_ = normalize(vec3(1.0, 0.0, 0.0) - Nw_ * Nw_.x), Bw_ = normalize(vec3(0.0, 0.0, 1.0) - Nw_ * Nw_.z);
      normal = normalize((viewMatrix * vec4(normalize((Tw_ * tn_.x + Bw_ * tn_.y) * 0.6 + Nw_ * max(tn_.z, 0.2)), 0.0)).xyz);`);
};
// material con coordenadas de mundo (paredes, techos, pisos, cajones, rocas): la textura no se estira
function worldMat(set, { scale = 0.5, color = 0xffffff, tri = false, roof = false, rough = 1, nScale = 1 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { wD: { value: set.d }, wN: { value: set.n }, wR: { value: set.r }, wS: { value: scale }, wK: { value: nScale } });
    sh.vertexShader = 'varying vec3 vWW; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 ww_ = vec4(transformed, 1.0); vec3 wn_ = objectNormal;
      #ifdef USE_INSTANCING
        ww_ = instanceMatrix * ww_; wn_ = mat3(instanceMatrix) * wn_;
      #endif
      vWW = (modelMatrix * ww_).xyz; vWN = normalize(mat3(modelMatrix) * wn_);`);
    const pick = tri ? `
      vec3 bw_ = pow(an_, vec3(4.0)); bw_ /= dot(bw_, vec3(1.0));
      vec2 ux_ = vWW.zy * wS, uy_ = vWW.xz * wS, uz_ = vWW.xy * wS;
      vec4 wc_ = texture2D(wD, ux_) * bw_.x + texture2D(wD, uy_) * bw_.y + texture2D(wD, uz_) * bw_.z;
      vec4 wr_ = texture2D(wR, ux_) * bw_.x + texture2D(wR, uy_) * bw_.y + texture2D(wR, uz_) * bw_.z;
      vec3 n1_ = texture2D(wN, ux_).xyz * 2.0 - 1.0, n2_ = texture2D(wN, uy_).xyz * 2.0 - 1.0, n3_ = texture2D(wN, uz_).xyz * 2.0 - 1.0;
      vec3 pn_ = Nw_ + wK * (bw_.x * (vec3(0., 0., 1.) * n1_.x + vec3(0., 1., 0.) * n1_.y) + bw_.y * (vec3(1., 0., 0.) * n2_.x + vec3(0., 0., 1.) * n2_.y) + bw_.z * (vec3(1., 0., 0.) * n3_.x + vec3(0., 1., 0.) * n3_.y));`
      : `
      vec2 wuv_; vec3 wT_, wB_;
      if (an_.y > max(an_.x, an_.z)) {
        ${roof ? 'if (an_.x > an_.z) { wuv_ = vWW.zx; wT_ = vec3(0., 0., 1.); wB_ = vec3(1., 0., 0.); } else { wuv_ = vWW.xz; wT_ = vec3(1., 0., 0.); wB_ = vec3(0., 0., 1.); }'
             : 'wuv_ = vWW.xz; wT_ = vec3(1., 0., 0.); wB_ = vec3(0., 0., 1.);'}
      } else if (an_.x > an_.z) { wuv_ = vWW.zy; wT_ = vec3(0., 0., 1.); wB_ = vec3(0., 1., 0.); }
      else { wuv_ = vWW.xy; wT_ = vec3(1., 0., 0.); wB_ = vec3(0., 1., 0.); }
      wuv_ *= wS;
      vec4 wc_ = texture2D(wD, wuv_), wr_ = texture2D(wR, wuv_);
      vec3 tn_ = texture2D(wN, wuv_).xyz * 2.0 - 1.0;
      vec3 pn_ = normalize(wT_ - Nw_ * dot(wT_, Nw_)) * tn_.x * wK + normalize(wB_ - Nw_ * dot(wB_, Nw_)) * tn_.y * wK + Nw_ * tn_.z;`;
    sh.fragmentShader = 'uniform sampler2D wD, wN, wR; uniform float wS, wK; varying vec3 vWW; varying vec3 vWN;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `vec3 Nw_ = normalize(vWN); vec3 an_ = abs(Nw_);${pick}
        diffuseColor.rgb *= wc_.rgb * mix(1.0, wr_.r, 0.3);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * wr_.g;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(normalize(pn_), 0.0)).xyz);');
  };
  return m;
}
const leafMat = (tex) => {
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    addFade(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec2 lx_ = dFdx(vMapUv * 1024.0), ly_ = dFdy(vMapUv * 1024.0);
      diffuseColor.a *= 1.0 + max(0.0, 0.5 * log2(max(dot(lx_, lx_), dot(ly_, ly_)))) * 0.4;`);
  };
  return m;
};
const leafDepth = (tex) => new THREE.MeshDepthMaterial({ map: tex, alphaTest: 0.42, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });

// ───────────────────────── geometrías ─────────────────────────
function joinGeos(list) { // une geometrías no indexadas con position, normal, uv y uv1
  let n = 0; const gs = list.map((g) => { const x = g.index ? g.toNonIndexed() : g; if (!x.attributes.uv1) x.setAttribute('uv1', x.attributes.uv.clone()); n += x.attributes.position.count; return x; });
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2], ['uv1', 2]]) {
    const arr = new Float32Array(n * size); let o = 0;
    for (const g of gs) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
// tarjeta de follaje: base en "base", crece hacia "dir"; las normales salen desde "center" (volumen suave)
function card(base, dir, side, w, h, center, out) {
  const p = [], nn = [], uv = [], up = dir.clone().normalize(), rt = side.clone().normalize();
  const c = [[-0.5, 0, 0.02, 0], [0.5, 0, 0.98, 0], [0.5, 1, 0.98, 1], [-0.5, 1, 0.02, 1]];
  const pt = (k) => base.clone().addScaledVector(rt, c[k][0] * w).addScaledVector(up, c[k][1] * h);
  for (const k of [0, 1, 2, 0, 2, 3]) {
    const v = pt(k); p.push(v.x, v.y, v.z); uv.push(c[k][2], c[k][3]);
    const n = v.clone().sub(center).normalize().lerp(rt.clone().cross(up).normalize(), 0.25).normalize(); nn.push(n.x, n.y, n.z);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.push(g);
}
function trunkGeo(r0, r1, h, seg, bend, uvRep) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 6, true).translate(0, h / 2, 0), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / h; p.setX(i, p.getX(i) + Math.sin(y * 2.2) * bend * y); }
  g.computeVertexNormals();
  const uv1 = g.attributes.uv.clone(); for (let i = 0; i < uv1.count; i++) uv1.setXY(i, uv1.getX(i) * uvRep[0], uv1.getY(i) * uvRep[1]);
  g.setAttribute('uv1', uv1); return g;
}
function branch(from, dir, len, r) {
  const g = trunkGeo(r, r * 0.4, len, 6, 0, [1, 1]);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize())); g.translate(from.x, from.y, from.z); return g;
}
function broadleafGeos(seed) {
  seedRand(seed);
  const bark = [trunkGeo(0.36, 0.2, 4.6, 9, 0.25, [2, 3])], cards = [], C = V3(0, 5.0, 0);
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + srand(), d = V3(Math.cos(a) * 0.9, 0.6, Math.sin(a) * 0.9); bark.push(branch(V3(0, 2.6 + k * 0.3, 0), d, 2.6, 0.13)); }
  for (let k = 0; k < 40; k++) {
    const a = srand() * TAU, e = srr(-0.7, 1.3), out = V3(Math.cos(a) * Math.cos(e), Math.sin(e) * 0.75, Math.sin(a) * Math.cos(e)).normalize();
    const base = C.clone().addScaledVector(out, srr(0.2, 1.6)).add(V3(0, srr(-0.6, 0.8), 0)), side = out.clone().cross(V3(srr(-1, 1), srr(-1, 1), srr(-1, 1))).normalize();
    card(base, out, side, srr(2.8, 3.8), srr(2.8, 3.6), C, cards);
  }
  return [joinGeos(bark), joinGeos(cards)];
}
function pineGeos(seed) {
  seedRand(seed);
  const bark = [trunkGeo(0.32, 0.1, 11, 8, 0.12, [1.5, 5])], cards = [], tiers = 10;
  for (let k = 0; k < tiers; k++) {
    const y = 1.8 + k * 0.92, R = 3.5 * (1 - k / tiers) + 0.7, n = Math.max(5, Math.round(9 - k * 0.4)), off = srand() * TAU;
    for (let j = 0; j < n; j++) {
      const a = off + j / n * TAU, out = V3(Math.cos(a), -0.32, Math.sin(a)).normalize(), side = V3(-Math.sin(a), 0, Math.cos(a)).applyAxisAngle(out, (j % 2 ? 1 : -1) * 0.45);
      card(V3(Math.cos(a) * 0.1, y, Math.sin(a) * 0.1), out, side, R * 0.95, R * 1.05, V3(0, y + 1.2, 0), cards);
    }
  }
  for (let j = 0; j < 2; j++) card(V3(0, 10.3, 0), V3(0, 1, 0), V3(Math.cos(j * Math.PI / 2), 0, Math.sin(j * Math.PI / 2)), 1.4, 2.0, V3(0, 10.4, 0), cards);
  return [joinGeos(bark), joinGeos(cards)];
}
function bushGeo(seed) {
  seedRand(seed); const cards = [], C = V3(0, 0.5, 0);
  for (let k = 0; k < 16; k++) { const a = srand() * TAU, out = V3(Math.cos(a), srr(0.35, 1.2), Math.sin(a)).normalize(); card(V3(srr(-0.2, 0.2), 0.05, srr(-0.2, 0.2)).addScaledVector(out, 0.1), out, out.clone().cross(V3(srr(-0.4, 0.4), 1, srr(-0.4, 0.4))).normalize(), srr(1.2, 1.7), srr(1.1, 1.5), C, cards); }
  return joinGeos(cards);
}
// deforma una figura con ruido continuo
function displace(geo, amt, freq) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * freq * 1.7 + v.y * freq * 2.3 + 1.3) * Math.sin(v.z * freq * 1.9 + v.x * freq * 0.7 + 0.4) + Math.sin(v.y * freq * 3.1 - v.z * freq * 1.3) * 0.5 + Math.sin(v.x * freq * 5.3 + v.z * freq * 4.1) * 0.15;
    const l = v.length() || 1; v.multiplyScalar(1 + (n * amt) / l); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}
function roofGeo() { // prisma unitario con cumbrera sobre X
  const P = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 0, -0.5, 0.5, 1, 0, -0.5, 1, 0,
    0.5, 0, 0.5, -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 0, 0.5, -0.5, 1, 0, 0.5, 1, 0,
    -0.5, 0, 0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 1, 0,
    -0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0, -0.5];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); return g;
}

// ───────────────────────── agua con reflejos del cielo ─────────────────────────
const waterNormal = canvasTex(512, (g, S) => {
  const img = g.createImageData(S, S), o = img.data, H = new Float32Array(S * S);
  const waves = Array.from({ length: 14 }, () => [((Math.random() * 6) | 0) + 1, ((Math.random() * 6) | 0) - 3, Math.random() * TAU, 0.3 + Math.random()]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let h = 0; for (const [a, b, ph, amp] of waves) h += Math.sin((a * x + b * y) / S * TAU + ph) * amp / (a + Math.abs(b)); H[y * S + x] = h; }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const hx = H[y * S + ((x + 1) % S)] - H[y * S + ((x + S - 1) % S)], hy = H[((y + 1) % S) * S + x] - H[((y + S - 1) % S) * S + x];
    const nx = -hx * 6, ny = -hy * 6, l = Math.hypot(nx, ny, 1), i = (y * S + x) * 4;
    o[i] = (nx / l * 0.5 + 0.5) * 255; o[i + 1] = (ny / l * 0.5 + 0.5) * 255; o[i + 2] = (1 / l * 0.5 + 0.5) * 255; o[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}, { repeat: 90, color: false });
const water = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), new THREE.MeshStandardMaterial({ color: 0x14323e, roughness: 0.07, metalness: 0, normalMap: waterNormal, normalScale: new THREE.Vector2(0.28, 0.28) }));
water.rotation.x = -Math.PI / 2; water.receiveShadow = true; scene.add(water);

// ───────────────────────── pasto con textura y viento (todo en la GPU) ─────────────────────────
const GRASS_MAX = 26000, GRASS_SIZE = 70;
const grassU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
  uCenter: { value: new THREE.Vector2() }, uTime: { value: 0 }, uSize: { value: GRASS_SIZE }, uHalf: { value: HALF }, uSeg: { value: HSEG },
  uHeight: { value: null }, uTex: { value: null }, uTint: { value: new THREE.Color(0.8, 0.84, 0.7) }, uSun: { value: SUN_DIR }, uSunCol: { value: new THREE.Color(1.0, 0.86, 0.68) }, uAmb: { value: new THREE.Color(0.32, 0.36, 0.42) },
}]);
grassU.uTex.value = T.grassCard;
const grass = (() => {
  const P = [], U = [];
  for (let k = 0; k < 2; k++) {
    const a = k * Math.PI / 2, c = Math.cos(a) * 0.5, s = Math.sin(a) * 0.5;
    P.push(-c, 0, -s, c, 0, s, c, 1, s, -c, 0, -s, c, 1, s, -c, 1, -s); U.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  const off = new Float32Array(GRASS_MAX * 2), rr = new Float32Array(GRASS_MAX * 2);
  for (let i = 0; i < GRASS_MAX; i++) { off[i * 2] = Math.random() * GRASS_SIZE; off[i * 2 + 1] = Math.random() * GRASS_SIZE; rr[i * 2] = Math.random() * TAU; rr[i * 2 + 1] = 0.5 + Math.random() * 0.5; }
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 2)); g.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rr, 2));
  g.instanceCount = 12000;
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: grassU, fog: true, side: THREE.DoubleSide,
    vertexShader: `uniform vec2 uCenter; uniform float uTime, uSize, uHalf, uSeg; uniform sampler2D uHeight;
      attribute vec2 aOff; attribute vec2 aRnd; varying vec2 vUv; varying float vShade;
      #include <fog_pars_vertex>
      vec2 hm(vec2 p){ vec2 g = (p + uHalf) / (2.0 * uHalf) * uSeg; vec2 i = floor(g), f = g - i; ivec2 c = ivec2(i);
        vec2 a = texelFetch(uHeight, c, 0).rg, b = texelFetch(uHeight, c + ivec2(1,0), 0).rg, d = texelFetch(uHeight, c + ivec2(0,1), 0).rg, e = texelFetch(uHeight, c + ivec2(1,1), 0).rg;
        return mix(mix(a, b, f.x), mix(d, e, f.x), f.y); }
      void main(){
        vec2 p = mod(aOff - uCenter + uSize * 0.5, uSize) - uSize * 0.5 + uCenter;
        vec2 h = hm(p);
        float fade = 1.0 - smoothstep(uSize * 0.3, uSize * 0.48, length(p - uCenter));
        float s = aRnd.y * smoothstep(0.35, 0.9, h.g) * fade;
        float c = cos(aRnd.x), sn = sin(aRnd.x);
        vec3 lp = position * vec3(1.15, 0.85, 1.15) * s;
        lp = vec3(lp.x * c - lp.z * sn, lp.y, lp.x * sn + lp.z * c);
        float sw = (sin(uTime * 1.6 + p.x * 0.3 + p.y * 0.23) * 0.18 + sin(uTime * 3.1 + p.x * 0.9) * 0.05) * position.y * s;
        lp.x += sw; lp.z += sw * 0.6;
        vUv = uv; vShade = aRnd.y;
        vec4 mvPosition = viewMatrix * vec4(p.x + lp.x, h.r - 0.03 + lp.y, p.y + lp.z, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D uTex; uniform vec3 uTint, uSun, uSunCol, uAmb; varying vec2 vUv; varying float vShade;
      #include <fog_pars_fragment>
      void main(){
        vec4 t = texture2D(uTex, vUv); if (t.a < 0.45) discard;
        float lit = max(uSun.y, 0.15) * 0.9 + 0.25;
        vec3 col = t.rgb * uTint * (uAmb + uSunCol * lit * (0.55 + 0.6 * vUv.y)) * (0.8 + 0.35 * vShade);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  }));
  m.frustumCulled = false; scene.add(m); return m;
})();
