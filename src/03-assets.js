// ───────────────────────── texturas procedurales ─────────────────────────
function canvasTex(size, draw, { repeat = 1, color = true } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 4;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.userData.canvas = c; return t;
}
function blobs(g, S, n, r0, r1, style) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = rnd(r0, r1); g.fillStyle = style();
    for (const ox of x < r ? [0, S] : x > S - r ? [0, -S] : [0]) for (const oy of y < r ? [0, S] : y > S - r ? [0, -S] : [0]) { g.beginPath(); g.arc(x + ox, y + oy, r, 0, TAU); g.fill(); }
  }
}
const gray = (a, b, al) => { const v = (a + Math.random() * (b - a)) | 0; return `rgba(${v},${v},${v},${al})`; };
const groundTex = canvasTex(512, (g, S) => {
  g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, S, S);
  blobs(g, S, 700, 8, 26, () => (Math.random() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.035)'));
  blobs(g, S, 6000, 0.6, 1.7, () => gray(150, 255, 0.32));
}, { repeat: 170 });
function normalFrom(tex, strength = 2.2) {
  const src = tex.userData.canvas, S = src.width, d = src.getContext('2d').getImageData(0, 0, S, S).data;
  return canvasTex(S, (g) => {
    const img = g.createImageData(S, S), o = img.data, H = (x, y) => d[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const nx = (H(x - 1, y) - H(x + 1, y)) * strength, ny = (H(x, y - 1) - H(x, y + 1)) * strength, l = Math.hypot(nx, ny, 1), i = (y * S + x) * 4;
      o[i] = (nx / l * 0.5 + 0.5) * 255; o[i + 1] = (ny / l * 0.5 + 0.5) * 255; o[i + 2] = (1 / l * 0.5 + 0.5) * 255; o[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { repeat: tex.repeat.x, color: false });
}
const groundNormal = normalFrom(groundTex);
const plasterTex = canvasTex(256, (g, S) => { g.fillStyle = '#ececec'; g.fillRect(0, 0, S, S); blobs(g, S, 2500, 0.5, 1.6, () => gray(150, 255, 0.35)); blobs(g, S, 60, 6, 20, () => 'rgba(0,0,0,.03)'); });
const plasterNormal = normalFrom(plasterTex, 1.5);
const roofTex = canvasTex(256, (g, S) => {
  g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 32) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y + 28, S, 4); for (let x = (y / 32) % 2 ? 12 : 0; x < S; x += 24) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, y, 2, 28); } }
  blobs(g, S, 900, 0.5, 1.5, () => gray(90, 255, 0.3));
});
const woodTex = canvasTex(256, (g, S) => {
  for (let x = 0; x < S; x += 32) { const v = 170 + Math.random() * 60; g.fillStyle = `rgb(${v},${v * 0.9},${v * 0.8})`; g.fillRect(x, 0, 32, S); g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, 0, 2, S); }
  for (let i = 0; i < 400; i++) { g.fillStyle = 'rgba(60,40,20,.12)'; g.fillRect(Math.random() * S, Math.random() * S, 1, 10 + Math.random() * 30); }
});

// ───────────────────────── geometrías ─────────────────────────
function mergeGeos(parts) {
  let n = 0;
  const list = parts.map(([g, c]) => { const gg = g.index ? g.toNonIndexed() : g; if (!gg.attributes.normal) gg.computeVertexNormals(); n += gg.attributes.position.count; return [gg, new THREE.Color(c)]; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const [g, c] of list) {
    const k = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < k; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += k;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
// deforma una figura con ruido continuo; soft = normales redondeadas (follaje)
function displace(geo, amt, freq, soft = false) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * freq * 1.7 + v.y * freq * 2.3 + 1.3) * Math.sin(v.z * freq * 1.9 + v.x * freq * 0.7 + 0.4) + Math.sin(v.y * freq * 3.1 - v.z * freq * 1.3) * 0.5;
    const l = v.length() || 1; v.multiplyScalar(1 + (n * amt) / l); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  if (soft) { const nn = g.attributes.normal; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).normalize(); nn.setXYZ(i, v.x, v.y, v.z); } }
  return g;
}
function pineGeo() {
  const parts = [], trunk = new THREE.CylinderGeometry(0.15, 0.27, 3.4, 7); trunk.translate(0, 1.7, 0); parts.push([trunk, 0x5a4232]);
  for (const [r, h, y, c] of [[2.2, 3.0, 3.0, 0x2b482a], [1.75, 2.7, 4.6, 0x30512e], [1.3, 2.4, 6.0, 0x365a33], [0.8, 1.9, 7.2, 0x3c6238]]) {
    const g = displace(new THREE.ConeGeometry(r, h, 10, 2), 0.16, 2.4); g.translate(0, y, 0); parts.push([g, c]);
  }
  return mergeGeos(parts);
}
function leafGeo() {
  const parts = [], trunk = new THREE.CylinderGeometry(0.17, 0.3, 3.4, 7); trunk.translate(0, 1.7, 0); parts.push([trunk, 0x5e4a38]);
  for (const [r, x, y, z, c] of [[1.8, 0, 4.7, 0, 0x4a682b], [1.35, 1.0, 4.1, 0.5, 0x55732f], [1.45, -0.9, 4.3, -0.5, 0x5d7a32], [1.15, 0.2, 5.8, -0.3, 0x678337]]) {
    const g = displace(new THREE.IcosahedronGeometry(r, 1), 0.22, 1.8, true); g.translate(x, y, z); parts.push([g, c]);
  }
  return mergeGeos(parts);
}
function roofGeo() { // prisma unitario con cumbrera sobre X
  const P = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 0, -0.5, 0.5, 1, 0, -0.5, 1, 0,
    0.5, 0, 0.5, -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 0, 0.5, -0.5, 1, 0, 0.5, 1, 0,
    -0.5, 0, 0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 1, 0,
    -0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0, -0.5];
  const U = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0, 0.5, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.computeVertexNormals(); return g;
}

// ───────────────────────── agua ─────────────────────────
const waterU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSun: { value: SUN_DIR }, uSunCol: { value: SKY.sun }, uDeep: { value: new THREE.Color(0x1d4a5c) }, uSky: { value: SKY.horizon } }]);
const water = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), new THREE.ShaderMaterial({
  uniforms: waterU, fog: true,
  vertexShader: `varying vec3 vW;
    #include <fog_pars_vertex>
    void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
    }`,
  fragmentShader: `uniform float uTime; uniform vec3 uSun, uSunCol, uDeep, uSky; varying vec3 vW;
    #include <fog_pars_fragment>
    void main(){
      vec2 p = vW.xz; float t = uTime;
      vec3 n = normalize(vec3(sin(p.x*0.21+t*1.1)*0.16 + sin(p.x*0.63+p.y*0.41+t*1.7)*0.09 + sin(p.y*1.7-t*2.3+p.x*0.3)*0.05, 1.0,
                              cos(p.y*0.19+t*0.9)*0.16 + cos(p.y*0.71-p.x*0.33+t*1.5)*0.09 + cos(p.x*1.5+t*2.6)*0.05));
      vec3 v = normalize(cameraPosition - vW);
      float fr = pow(1.0 - max(dot(n, v), 0.0), 4.0);
      vec3 col = mix(uDeep, uSky * 0.8, clamp(fr * 0.65 + 0.04, 0.0, 1.0));
      col += uSunCol * pow(max(dot(reflect(-v, n), uSun), 0.0), 240.0) * 5.0;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
}));
water.rotation.x = -Math.PI / 2; scene.add(water);

// ───────────────────────── pasto con viento (todo en la GPU) ─────────────────────────
const GRASS_MAX = 18000, GRASS_SIZE = 72;
const grassU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
  uCenter: { value: new THREE.Vector2() }, uTime: { value: 0 }, uSize: { value: GRASS_SIZE }, uHalf: { value: HALF }, uSeg: { value: HSEG },
  uHeight: { value: null }, uBase: { value: new THREE.Color(0x3c5420) }, uTip: { value: new THREE.Color(0x9aa651) }, uLight: { value: 1.0 },
}]);
const grass = (() => {
  const blade = [], hgt = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI + 0.3, c = Math.cos(a), s = Math.sin(a), lean = 0.12 * (k - 1);
    blade.push(-0.05 * c, 0, -0.05 * s, 0.05 * c, 0, 0.05 * s, lean, 1, lean * 0.5); hgt.push(0, 0, 1);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(blade, 3));
  const off = new Float32Array(GRASS_MAX * 2), rr = new Float32Array(GRASS_MAX * 2);
  for (let i = 0; i < GRASS_MAX; i++) { off[i * 2] = Math.random() * GRASS_SIZE; off[i * 2 + 1] = Math.random() * GRASS_SIZE; rr[i * 2] = Math.random() * TAU; rr[i * 2 + 1] = 0.45 + Math.random() * 0.55; }
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 2)); g.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rr, 2));
  g.instanceCount = 9000;
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: grassU, fog: true, side: THREE.DoubleSide,
    vertexShader: `uniform vec2 uCenter; uniform float uTime, uSize, uHalf, uSeg; uniform sampler2D uHeight;
      attribute vec2 aOff; attribute vec2 aRnd; varying float vH; varying float vShade;
      #include <fog_pars_vertex>
      vec2 hm(vec2 p){ vec2 g = (p + uHalf) / (2.0 * uHalf) * uSeg; vec2 i = floor(g), f = g - i; ivec2 c = ivec2(i);
        vec2 a = texelFetch(uHeight, c, 0).rg, b = texelFetch(uHeight, c + ivec2(1,0), 0).rg, d = texelFetch(uHeight, c + ivec2(0,1), 0).rg, e = texelFetch(uHeight, c + ivec2(1,1), 0).rg;
        return mix(mix(a, b, f.x), mix(d, e, f.x), f.y); }
      void main(){
        vec2 p = mod(aOff - uCenter + uSize * 0.5, uSize) - uSize * 0.5 + uCenter;
        vec2 h = hm(p);
        float fade = 1.0 - smoothstep(uSize * 0.3, uSize * 0.48, length(p - uCenter));
        float s = aRnd.y * step(0.5, h.g) * fade;
        float c = cos(aRnd.x), sn = sin(aRnd.x);
        vec3 lp = position * vec3(1.0, 0.75 * s, 1.0);
        lp = vec3(lp.x * c - lp.z * sn, lp.y, lp.x * sn + lp.z * c);
        float sw = (sin(uTime * 1.7 + p.x * 0.35 + p.y * 0.27) * 0.16 + sin(uTime * 3.3 + p.x * 0.9) * 0.04) * position.y * s;
        lp.x += sw; lp.z += sw * 0.6;
        vH = position.y; vShade = aRnd.y;
        vec4 mvPosition = viewMatrix * vec4(p.x + lp.x, h.r - 0.04 + lp.y, p.y + lp.z, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 uBase, uTip; uniform float uLight; varying float vH; varying float vShade;
      #include <fog_pars_fragment>
      void main(){ vec3 col = mix(uBase, uTip, vH * vH) * (0.75 + 0.5 * vShade) * uLight; gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  }));
  m.frustumCulled = false; scene.add(m); return m;
})();
