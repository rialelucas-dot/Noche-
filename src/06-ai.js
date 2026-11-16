// ───────────────────────── bots ─────────────────────────
function initBrain(f) {
  f.ai = { think: Math.random() * 0.3, target: null, los: false, threat: null, threatT: 0, heard: null, goal: null, wps: [], state: 'loot',
    react: 0, aimErr: 0, aimT: 0, strafe: 1, strafeT: 0, chkT: 0.8, lastX: 0, lastZ: 0, unstickT: 0, unstickA: 0, stuck: 0,
    lootIt: null, ban: null, swapT: 0, jumpAt: rnd(0.12, 0.82), landX: 0, landZ: 0 };
}
function hasLOS(a, b, d) { const dx = (b.x - a.x) / d, dz = (b.z - a.z) / d; return raycastWorld(a.x, a.z, dx, dz, d) >= d - 0.7; }
function nearestDoor(b, x, z) { let best = b.doors[0], bd = 1e12; for (const d of b.doors) { const v = dist2(d.out.x, d.out.z, x, z); if (v < bd) { bd = v; best = d; } } return best; }
function setGoal(f, x, z) {
  const ai = f.ai; ai.goal = { x, z }; ai.wps = []; ai.stuck = 0;
  const bIn = buildingAt(f.x, f.z, 0.2), bG = buildingAt(x, z, 0.2);
  if (bIn && bIn !== bG) { const d = nearestDoor(bIn, x, z); ai.wps.push(d.in, d.out); }
  if (bG && bG !== bIn) { const d = nearestDoor(bG, f.x, f.z); ai.wps.push(d.out, d.in); }
  ai.wps.push({ x, z });
}
function randomInCircle(c, frac = 0.8) {
  for (let k = 0; k < 30; k++) {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * c.r * frac, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    if (landAt(x, z) > 6 && pointFree(x, z, 1)) return { x, z };
  }
  return nearestLand(c.x, c.z, 6);
}
function wantItem(f, it) {
  const def = ITEM[it.k];
  if (WEAP[it.k]) {
    if (f.slots.some((w) => w && w.k === it.k)) return 0;
    if (!f.slots[0] || !f.slots[1]) return 10 + WEAP_RANK[it.k];
    return WEAP_RANK[it.k] > Math.min(WEAP_RANK[f.slots[0].k], WEAP_RANK[f.slots[1].k]) ? 3 : 0;
  }
  if (def.ammo) return f.slots.some((w) => w && WEAP[w.k].ammo === def.ammo) && f.ammo[def.ammo] < 120 ? 6 : 0;
  if (def.heal) return f.heals[def.heal] < (def.heal === 'venda' ? 5 : 2) ? 4 : 0;
  if (def.armor) return (it.amt || def.armor) > f.armor + 4 ? 7 : 0;
  return 0;
}
function botTake(f, it) {
  if (WEAP[it.k] && f.slots[0] && f.slots[1]) {
    const worst = WEAP_RANK[f.slots[0].k] <= WEAP_RANK[f.slots[1].k] ? 0 : 1;
    f.cur = worst; f.reloadT = 0; return takeItem(f, it, true);
  }
  return takeItem(f, it);
}
const usable = (f, w) => w && (w.mag > 0 || f.ammo[WEAP[w.k].ammo] > 0);

function botThink(f) {
  const ai = f.ai, D = DIFF[SETTINGS.diff];
  // percepción: los 3 rivales más cercanos dentro de la vista, con línea de visión
  const cands = [];
  for (const o of fighters) {
    if (o === f || !o.alive || o.falling || o.inPlane) continue;
    const d2 = dist2(o.x, o.z, f.x, f.z), r = o.bot && o !== ai.threat ? D.sight * 0.7 : D.sight; if (d2 < r * r) cands.push([d2, o]);
  }
  cands.sort((a, b) => a[0] - b[0]);
  let seen = null, sd = 0;
  for (let i = 0; i < Math.min(3, cands.length); i++) { const d = Math.sqrt(cands[i][0]); if (hasLOS(f, cands[i][1], d)) { seen = cands[i][1]; sd = d; break; } }
  if (!seen && ai.threat && ai.threat.alive && ai.threatT > 0) { const d = Math.sqrt(dist2(ai.threat.x, ai.threat.z, f.x, f.z)); if (d < 80 && hasLOS(f, ai.threat, d)) { seen = ai.threat; sd = d; } }
  if (seen && ai.target !== seen) ai.react = D.reaction * rnd(0.8, 1.35);
  ai.target = seen; ai.los = !!seen;

  // recoger lo que está a mano
  for (const it of loot) if (it.alive && dist2(it.x, it.z, f.x, f.z) < 2.2 && wantItem(f, it) > 0) botTake(f, it);

  const hasGun = usable(f, f.slots[0]) || usable(f, f.slots[1]);
  // elegir el arma según la distancia
  ai.swapT -= 0.25;
  if (seen && ai.swapT <= 0 && f.reloadT <= 0) {
    let bi = f.cur, bs = -1e9;
    f.slots.forEach((w, i) => { if (usable(f, w)) { const s = -Math.abs(sd - WEAP[w.k].prefer) + (w.mag > 0 ? 6 : 0); if (s > bs) { bs = s; bi = i; } } });
    if (bi !== f.cur) { switchSlot(f, bi); ai.swapT = 2; }
  } else if (!usable(f, curW(f)) && usable(f, f.slots[1 - f.cur])) switchSlot(f, 1 - f.cur);
  const w = curW(f);
  if (w && w.mag < WEAP[w.k].mag * 0.4 && !seen && f.healT <= 0) startReload(f);

  const z = Zone, dCur = Math.sqrt(dist2(f.x, f.z, z.cur.x, z.cur.z)), dNext = Math.sqrt(dist2(f.x, f.z, z.next.x, z.next.z));
  const outside = dCur > z.cur.r - 3, mustMove = dNext > z.next.r * 0.8 && (z.mode === 'shrink' || z.timer < 32);
  const goalOk = (g) => g && dist2(g.x, g.z, z.next.x, z.next.z) < (z.next.r * 0.85) ** 2;

  if (seen && hasGun) { ai.state = 'fight'; if (f.healT > 0 && sd < 30) cancelHeal(f); return; }
  if (seen && sd < 14) {
    ai.state = 'flee';
    if (sd < 2.5) { ai.state = 'brawl'; return; }
    const ax = f.x - seen.x, az = f.z - seen.z, l = Math.hypot(ax, az) || 1;
    setGoal(f, f.x + ax / l * 20, f.z + az / l * 20); return;
  }
  if (f.healT > 0) { ai.state = 'heal'; return; }
  if (!outside && f.hp < 60 && (f.heals.botiquin > 0 || (f.heals.venda > 0 && f.hp < 75)) && (!ai.threat || ai.threatT <= 0)) {
    if (startHeal(f, f.hp < 45 && f.heals.botiquin ? 'botiquin' : f.heals.venda && f.hp < 75 ? 'venda' : 'botiquin')) { ai.state = 'heal'; return; }
  }
  if (outside || mustMove) { if (ai.state !== 'zone' || !goalOk(ai.goal)) { const p = randomInCircle(z.next, 0.6); setGoal(f, p.x, p.z); } ai.state = 'zone'; return; }
  if (ai.threat && ai.threat.alive && ai.threatT > 0 && hasGun) { ai.state = 'hunt'; setGoal(f, ai.threat.x, ai.threat.z); return; }
  if (ai.heard && hasGun && f.hp > 60 && ai.state !== 'investigate' && Math.random() < 0.35) { ai.state = 'investigate'; setGoal(f, ai.heard.x + rnd(-6, 6), ai.heard.z + rnd(-6, 6)); return; }
  if (ai.state === 'investigate' && ai.goal) return;

  // buscar objetos
  if (!ai.lootIt || !ai.lootIt.alive || wantItem(f, ai.lootIt) <= 0) {
    let best = null, bs = 0;
    for (const it of loot) {
      if (!it.alive || it === ai.ban) continue;
      const d2 = dist2(it.x, it.z, f.x, f.z); if (d2 > 48 * 48) continue;
      const s = wantItem(f, it) / (1 + Math.sqrt(d2) / 14); if (s > bs) { bs = s; best = it; }
    }
    ai.lootIt = best; if (best) setGoal(f, best.x, best.z);
  }
  if (ai.lootIt) { ai.state = 'loot'; return; }
  if (ai.state !== 'wander' || !ai.goal) {
    const inZone = World.buildings.filter((b) => dist2(b.x, b.z, z.next.x, z.next.z) < (z.next.r * 0.8) ** 2);
    if (inZone.length && Math.random() < 0.6) { const b = pick(inZone); setGoal(f, b.x + rnd(-2, 2), b.z + rnd(-2, 2)); }
    else { const p = randomInCircle(z.next, 0.7); setGoal(f, p.x, p.z); }
    ai.state = 'wander';
  }
}

function botUpdate(f, dt) {
  const ai = f.ai, D = DIFF[SETTINGS.diff];
  ai.think -= dt; if (ai.think <= 0) { ai.think = rnd(0.2, 0.3); botThink(f); }
  ai.react -= dt; ai.threatT -= dt;
  if (ai.heard) { ai.heard.t -= dt; if (ai.heard.t <= 0) ai.heard = null; }
  let mx = 0, mz = 0, want = null;
  const t = ai.target;
  if ((ai.state === 'fight' || ai.state === 'brawl') && t && t.alive) {
    const dx = t.x - f.x, dz = t.z - f.z, d = Math.hypot(dx, dz) || 1, nx = dx / d, nz = dz / d;
    const w = curW(f), pref = w && ai.state === 'fight' ? WEAP[w.k].prefer : 1.2;
    const rad = d > pref * 1.25 ? 1 : d < pref * 0.7 ? -0.8 : 0;
    ai.strafeT -= dt;
    if (ai.strafeT <= 0) { ai.strafeT = rnd(0.5, 1.4); ai.strafe = Math.random() < 0.15 ? 0 : Math.random() < 0.5 ? -1 : 1; }
    const st = f.reloadT > 0 ? 1.1 : 0.8;
    mx = nx * rad - nz * ai.strafe * st; mz = nz * rad + nx * ai.strafe * st;
    ai.aimT -= dt;
    if (ai.aimT <= 0) { ai.aimT = rnd(0.22, 0.42); const tv = Math.hypot(t.vx, t.vz); ai.aimErr = gauss() * D.aim * (1 + tv / 8) * (d > 50 ? 1.3 : 1); }
    want = Math.atan2(dz, dx) + ai.aimErr;
    if (ai.react <= 0 && ai.los && Math.abs(angDiff(f.angle, want)) < 0.22) {
      if (!w) { if (d < 2.2) fire(f, f.angle); }
      else if (d < WEAP[w.k].range * 0.95) fire(f, f.angle);
    }
  } else if (ai.goal && ai.state !== 'heal') {
    const wp = ai.wps[0] || ai.goal, dx = wp.x - f.x, dz = wp.z - f.z, d = Math.hypot(dx, dz);
    if (d < 1.1) { ai.wps.shift(); if (!ai.wps.length) { ai.goal = null; if (ai.state === 'investigate' || ai.state === 'hunt') ai.state = 'wander'; } }
    else { mx = dx / d; mz = dz / d; }
    if (ai.heard && !t) want = Math.atan2(ai.heard.z - f.z, ai.heard.x - f.x);
  }
  // esquivar obstáculos con antenas
  let ml = Math.hypot(mx, mz);
  if (ml > 0.01) {
    mx /= ml; mz /= ml;
    if (ai.unstickT > 0) { ai.unstickT -= dt; mx = Math.cos(ai.unstickA); mz = Math.sin(ai.unstickA); }
    else {
      const base = Math.atan2(mz, mx);
      for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
        const a = base + off, px = f.x + Math.cos(a) * 1.7, pz = f.z + Math.sin(a) * 1.7;
        if (pointFree(px, pz, 0.62) && landAt(px, pz) > 1.5) { mx = Math.cos(a); mz = Math.sin(a); break; }
      }
    }
    ai.chkT -= dt;
    if (ai.chkT <= 0) {
      ai.chkT = 0.8;
      if (dist2(f.x, f.z, ai.lastX, ai.lastZ) < 0.7 && ai.state !== 'fight') {
        ai.unstickT = 0.7; ai.unstickA = Math.random() * TAU; ai.stuck++;
        if (ai.stuck > 3) { ai.ban = ai.lootIt; ai.lootIt = null; ai.goal = null; ai.stuck = 0; }
      }
      ai.lastX = f.x; ai.lastZ = f.z;
    }
  }
  if (want === null && ml > 0.01) want = Math.atan2(mz, mx);
  if (want !== null) f.angle += clamp(angDiff(f.angle, want), -9 * dt, 9 * dt);
  moveFighter(f, mx, mz, fighterSpeed(f) * (ai.state === 'fight' ? 0.85 : 1), dt);
}
