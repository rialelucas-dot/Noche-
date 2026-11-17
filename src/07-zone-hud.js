// ───────────────────────── zona ─────────────────────────
const PHASES = [
  { wait: 75, shrink: 40, r: 235, dps: 1 }, { wait: 45, shrink: 35, r: 145, dps: 2 }, { wait: 40, shrink: 30, r: 88, dps: 3 },
  { wait: 35, shrink: 25, r: 50, dps: 5 }, { wait: 30, shrink: 20, r: 24, dps: 8 }, { wait: 25, shrink: 20, r: 9, dps: 11 }, { wait: 20, shrink: 25, r: 0, dps: 15 },
];
const Zone = { cur: { x: 0, z: 0, r: 430 }, next: { x: 0, z: 0, r: 235 }, from: null, phase: 0, mode: 'wait', timer: 75, dps: 0.6 };
const zoneWallGeo = new THREE.CylinderGeometry(1, 1, 1, 128, 1, true); zoneWallGeo.translate(0, 0.5, 0);
const zoneWall = new THREE.Mesh(zoneWallGeo, new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false }));
const zoneRing = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }));
scene.add(zoneWall, zoneRing);
function zoneReset() { Object.assign(Zone, { cur: { x: 0, z: 0, r: 430 }, phase: 0, mode: 'wait', timer: PHASES[0].wait, dps: 0.6 }); pickNext(); }
function pickNext() {
  const P = PHASES[Zone.phase], c = Zone.cur;
  let nx = c.x, nz = c.z;
  for (let k = 0; k < 60; k++) {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * (c.r - P.r) * 0.85, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    if (Math.hypot(x, z) + P.r > 400 && P.r > 100) continue;
    if (landAt(x, z) > (P.r > 60 ? 45 : 14)) { nx = x; nz = z; break; }
  }
  Zone.next = { x: nx, z: nz, r: P.r };
  zoneRing.geometry.dispose();
  const g = new THREE.RingGeometry(Math.max(0.01, P.r - 0.5), P.r + 0.5, 128); g.rotateX(-Math.PI / 2);
  zoneRing.geometry = g; zoneRing.position.set(nx, 0.18, nz); zoneRing.visible = false;
}
function zoneUpdate(dt) {
  if (Zone.mode === 'final') return;
  const P = PHASES[Zone.phase];
  Zone.timer -= dt;
  if (Zone.mode === 'wait' && Zone.timer <= 0) { Zone.mode = 'shrink'; Zone.timer = P.shrink; Zone.from = { ...Zone.cur }; Hud.toast('La zona se está cerrando', 'Movete hacia el círculo blanco', 2.2); }
  if (Zone.mode === 'shrink') {
    const k = clamp(1 - Zone.timer / P.shrink, 0, 1), f = Zone.from, n = Zone.next;
    Zone.cur = { x: lerp(f.x, n.x, k), z: lerp(f.z, n.z, k), r: lerp(f.r, n.r, k) };
    if (Zone.timer <= 0) {
      Zone.cur = { ...n }; Zone.dps = P.dps; Zone.phase++;
      if (Zone.phase < PHASES.length) { Zone.mode = 'wait'; Zone.timer = PHASES[Zone.phase].wait; pickNext(); }
      else { Zone.mode = 'final'; Zone.timer = 0; Zone.dps = 20; zoneRing.visible = false; }
    }
  }
  zoneWall.position.set(Zone.cur.x, -12, Zone.cur.z);
  zoneWall.scale.set(Math.max(0.01, Zone.cur.r), 110, Math.max(0.01, Zone.cur.r));
}

// ───────────────────────── HUD ─────────────────────────
const fx = $('fx'), fxc = fx.getContext('2d');
const mini = $('mini'), mctx = mini.getContext('2d');
const big = $('bigCanvas'), bctx = big.getContext('2d');
const mapBase = document.createElement('canvas'); mapBase.width = mapBase.height = 512;
const _pv = new THREE.Vector3();
const Hud = {
  cache: {}, nums: [], miniT: 0, bigT: 0, toastT: 0,
  set(id, v) { if (this.cache[id] !== v) { this.cache[id] = v; $(id).textContent = v; } },
  feed(killer, victim, cause) {
    const el = document.createElement('div');
    el.innerHTML = killer ? `<b>${killer}</b> eliminó a ${victim} <i>· ${cause}</i>` : `${victim} <i>quedó fuera de la zona</i>`;
    const feed = $('feed'); feed.prepend(el); while (feed.children.length > 5) feed.lastChild.remove();
    setTimeout(() => el.remove(), 6500);
  },
  toast(title, sub = '', dur = 2) { $('toast').innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`; this.toastT = dur; },
  hitmark(head) { const c = $('cross'); c.classList.toggle('head', !!head); c.classList.add('hit'); clearTimeout(this._hm); this._hm = setTimeout(() => c.classList.remove('hit', 'head'), 140); },
  hurt(src) {
    if (src && player) { const a = Math.atan2(src.z - player.z, src.x - player.x) - camYaw(); const el = $('dmgDir'); el.style.transform = `translate(-50%, -50%) rotate(${a + Math.PI / 2}rad)`; el.style.opacity = '1'; clearTimeout(this._dd); this._dd = setTimeout(() => (el.style.opacity = '0'), 700); }
    const v = $('vignette'); v.style.opacity = '1'; clearTimeout(this._hu); this._hu = setTimeout(() => (v.style.opacity = player && player.hp < 30 ? '0.55' : '0'), 160); },
  dmgNum(x, y, z, amt, head) { this.nums.push({ x, y, z, head, amt: Math.max(1, Math.round(amt)), t: 0.8, ox: rnd(-0.4, 0.4) }); },
  buildMapBase() {
    const c = mapBase.getContext('2d'), img = c.createImageData(512, 512), d = img.data, S = WORLD / 512;
    for (let py = 0; py < 512; py++) for (let px = 0; px < 512; px++) {
      const x = px * S - HALF, z = py * S - HALF, land = landAt(x, z), i = (py * 512 + px) * 4;
      let r, g, b;
      if (land < 0) { const k = clamp(-land / 40, 0, 1); r = 40 - k * 14; g = 92 - k * 22; b = 108 - k * 18; }
      else if (land < 11) { r = 205; g = 182; b = 132; }
      else { const f = forestAt(x, z); if (f > 0.5) { r = 74; g = 104; b = 66; } else { r = 112; g = 140; b = 82; } }
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    const k = 512 / WORLD, P = (v) => (v + HALF) * k;
    c.strokeStyle = 'rgba(160,130,95,.9)'; c.lineWidth = 2.2;
    for (const [ax, az, bx, bz] of World.roads) { c.beginPath(); c.moveTo(P(ax), P(az)); c.lineTo(P(bx), P(bz)); c.stroke(); }
    c.fillStyle = '#e9dcc6';
    for (const b of World.buildings) c.fillRect(P(b.x - b.hw), P(b.z - b.hd), b.hw * 2 * k, b.hd * 2 * k);
  },
  drawMap(ctx, W, cx, cz, span, full) {
    const s = W / span, toX = (x) => (x - cx) * s + W / 2, toY = (z) => (z - cz) * s + W / 2, bk = 512 / WORLD;
    ctx.fillStyle = '#1d4352'; ctx.fillRect(0, 0, W, W);
    ctx.drawImage(mapBase, (cx - span / 2 + HALF) * bk, (cz - span / 2 + HALF) * bk, span * bk, span * bk, 0, 0, W, W);
    ctx.beginPath(); ctx.rect(0, 0, W, W); ctx.arc(toX(Zone.cur.x), toY(Zone.cur.z), Math.max(0, Zone.cur.r * s), 0, TAU); ctx.fillStyle = 'rgba(60,140,255,.28)'; ctx.fill('evenodd');
    ctx.lineWidth = full ? 3 : 2.5; ctx.strokeStyle = '#59b8ff'; ctx.beginPath(); ctx.arc(toX(Zone.cur.x), toY(Zone.cur.z), Math.max(0, Zone.cur.r * s), 0, TAU); ctx.stroke();
    if (Zone.mode !== 'final') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(toX(Zone.next.x), toY(Zone.next.z), Zone.next.r * s, 0, TAU); ctx.stroke(); }
    if (Game.state === 'plane') {
      const p = Plane; ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.setLineDash([8, 6]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(toX(p.ax), toY(p.az)); ctx.lineTo(toX(p.bx), toY(p.bz)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(toX(p.x), toY(p.z), full ? 7 : 5, 0, TAU); ctx.fill();
    }
    if (full) {
      ctx.font = `700 ${Math.round(W / 42)}px "Saira Condensed", "Arial Narrow", sans-serif`; ctx.textAlign = 'center';
      for (const t of World.towns) { ctx.fillStyle = 'rgba(14,17,23,.75)'; ctx.fillText(t.name.toUpperCase(), toX(t.x) + 1.5, toY(t.z) + 1.5); ctx.fillStyle = '#f3ece2'; ctx.fillText(t.name.toUpperCase(), toX(t.x), toY(t.z)); }
    }
    for (const p of Game.pings) { ctx.fillStyle = `rgba(255,90,79,${clamp(p.t / 1.6, 0, 1)})`; ctx.beginPath(); ctx.arc(toX(p.x), toY(p.z), full ? 5 : 3.5, 0, TAU); ctx.fill(); }
    if (player && Game.state !== 'plane') {
      const x = toX(player.x), y = toY(player.z), a = player.angle, r = full ? 11 : 9;
      if (Zone.mode !== 'final' && dist2(player.x, player.z, Zone.next.x, Zone.next.z) > Zone.next.r ** 2) {
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(toX(Zone.next.x), toY(Zone.next.z)); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.fillStyle = '#ff9b54'; ctx.strokeStyle = '#0e1117'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.lineTo(x + Math.cos(a + 2.4) * r * 0.7, y + Math.sin(a + 2.4) * r * 0.7); ctx.lineTo(x + Math.cos(a - 2.4) * r * 0.7, y + Math.sin(a - 2.4) * r * 0.7); ctx.closePath(); ctx.stroke(); ctx.fill();
    }
  },
  update(dt) {
    const p = player;
    this.set('alive', String(Game.aliveCount())); this.set('kills', String(p.kills));
    const zt = Zone.mode === 'wait' ? `Cierre en ${fmtTime(Zone.timer)}` : Zone.mode === 'shrink' ? 'Cerrándose' : 'Zona final';
    this.set('zoneLbl', Zone.mode === 'wait' ? 'Zona segura' : 'Atención'); this.set('zoneTime', Game.state === 'plane' ? 'En el avión' : zt);
    $('zoneMsg').classList.toggle('alert', Zone.mode !== 'wait');
    const hpk = clamp(p.hp / 100, 0, 1); const hp = $('hpFill'); hp.style.transform = `scaleX(${hpk})`; hp.classList.toggle('low', p.hp < 30);
    $('armorFill').style.transform = `scaleX(${clamp(p.armor / 100, 0, 1)})`;
    this.set('armorTxt', p.armor > 0.5 ? `Chaleco ${Math.ceil(p.armor)}` : 'Sin chaleco');
    this.set('vendaN', String(p.heals.venda)); this.set('botiN', String(p.heals.botiquin));
    for (let i = 0; i < 2; i++) {
      const w = p.slots[i], el = $('slot' + i);
      el.classList.toggle('on', i === p.cur && !!w); el.classList.toggle('empty', !w);
      const name = w ? `${i + 1} · ${input.touch || innerWidth < 700 ? WEAP[w.k].short : WEAP[w.k].label}` : `${i + 1} · Vacío`, ammo = w ? `${w.mag} <small>/ ${p.ammo[WEAP[w.k].ammo]}</small>` : '';
      const key = name + ammo; if (this.cache['s' + i] !== key) { this.cache['s' + i] = key; el.children[0].textContent = name; el.children[1].innerHTML = ammo; }
    }
    const act = p.reloadT > 0 ? ['Recargando', 1 - p.reloadT / p.reloadMax] : p.healT > 0 ? [p.healType === 'venda' ? 'Vendándote' : 'Usando botiquín', 1 - p.healT / p.healMax] : null;
    $('actBar').classList.toggle('hidden', !act);
    if (act) { this.set('actTxt', act[0]); $('actFill').style.transform = `scaleX(${act[1]})`; }
    const out = Game.state === 'play' && p.alive && dist2(p.x, p.z, Zone.cur.x, Zone.cur.z) > Zone.cur.r ** 2;
    $('zoneTint').style.opacity = out ? '1' : '0';
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').innerHTML = ''; }
    for (const g of Game.pings) g.t -= dt; Game.pings = Game.pings.filter((g) => g.t > 0);
    this.miniT -= dt;
    if (this.miniT <= 0) {
      this.miniT = 0.1;
      const cx = Game.state === 'plane' ? Plane.x : p.x, cz = Game.state === 'plane' ? Plane.z : p.z;
      this.drawMap(mctx, mini.width, cx, cz, Game.state === 'plane' ? 520 : 230, false);
    }
    if (!$('bigmap').classList.contains('hidden')) { this.bigT -= dt; if (this.bigT <= 0) { this.bigT = 0.2; this.drawMap(bctx, big.width, 0, 0, WORLD * 0.95, true); } }
  },
  drawFx(dt) {
    const dpr = Math.min(devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
    if (fx.width !== Math.round(W * dpr)) { fx.width = Math.round(W * dpr); fx.height = Math.round(H * dpr); }
    fxc.setTransform(dpr, 0, 0, dpr, 0, 0); fxc.clearRect(0, 0, W, H);
    const proj = (x, y, z) => { _pv.set(x, y, z).project(camera); return [(_pv.x + 1) / 2 * W, (1 - _pv.y) / 2 * H, _pv.z < 1 && _pv.z > -1]; };
    for (const f of fighters) {
      if (f === player || !f.alive || f.inPlane || Game.time - (f.lastPHit || -9) > 3) continue;
      if (dist2(f.x, f.z, camera.position.x, camera.position.z) > 160 * 160) continue;
      const [x, y, ok] = proj(f.x, f.y + 2.15, f.z); if (!ok) continue;
      fxc.fillStyle = 'rgba(14,17,23,.7)'; fxc.fillRect(x - 21, y - 4, 42, 7);
      fxc.fillStyle = '#ff5a4f'; fxc.fillRect(x - 20, y - 3, 40 * clamp(f.hp / 100, 0, 1), 5);
      if (f.armor > 0) { fxc.fillStyle = '#7fb0ff'; fxc.fillRect(x - 20, y + 3, 40 * clamp(f.armor / 100, 0, 1), 2); }
    }
    fxc.font = '800 18px "Saira Condensed", "Arial Narrow", sans-serif'; fxc.textAlign = 'center';
    for (const n of this.nums) {
      n.t -= dt; const [x, y, ok] = proj(n.x + n.ox, n.y + (0.8 - n.t) * 1.2, n.z); if (!ok) continue;
      fxc.globalAlpha = clamp(n.t / 0.4, 0, 1); fxc.fillStyle = '#0e1117'; fxc.fillText(n.amt, x + 1, y + 1); fxc.fillStyle = n.head ? '#ffd34d' : '#f3ece2'; fxc.fillText(n.amt, x, y);
    }
    fxc.globalAlpha = 1; this.nums = this.nums.filter((n) => n.t > 0);
  },
};
