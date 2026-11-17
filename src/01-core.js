import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js';

// ───────────────────────── utilidades ─────────────────────────
const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// generador con semilla para el mapa
let _seed = 1;
function seedRand(s) { _seed = s >>> 0 || 1; }
function srand() { _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0; let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const srr = (a, b) => a + srand() * (b - a);

function hash2(x, z) { let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + _noiseSeed; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
let _noiseSeed = 1337;
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

// ───────────────────────── ajustes ─────────────────────────
const SETTINGS = { diff: 'normal', qual: 'auto', snd: 'on', fps: 'off' };
try { Object.assign(SETTINGS, JSON.parse(localStorage.getItem('uep-settings') || '{}')); } catch (e) { /* sin almacenamiento */ }
function saveSettings() { try { localStorage.setItem('uep-settings', JSON.stringify(SETTINGS)); } catch (e) { /* ignorar */ } }

const DIFF = {
  facil:   { reaction: 0.95, aim: 0.11, sight: 44, rateMul: 1.5, dmgMul: 0.8 },
  normal:  { reaction: 0.6,  aim: 0.07, sight: 54, rateMul: 1.15, dmgMul: 1.0 },
  dificil: { reaction: 0.36, aim: 0.045, sight: 64, rateMul: 1.0, dmgMul: 1.0 },
};

const IS_TOUCH = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);

// ───────────────────────── audio sintetizado ─────────────────────────
const Audio = {
  ctx: null, master: null, noise: null, recent: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch (e) { this.ctx = null; }
  },
  ok() { return this.ctx && SETTINGS.snd === 'on' && this.ctx.state === 'running'; },
  vol(x, z) {
    if (!Game.listener) return 1;
    const d = Math.sqrt(dist2(x, z, Game.listener.x, Game.listener.z));
    return clamp(1 - d / 110, 0, 1) ** 2;
  },
  shot(x, z, freq, loud = 1) {
    if (!this.ok()) return;
    const v = this.vol(x, z) * loud; if (v < 0.02) return;
    const now = this.ctx.currentTime; if (now - this.recent < 0.012) return; this.recent = now;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, now); f.frequency.exponentialRampToValueAtTime(220, now + 0.18);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.9 * v, now + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(now, Math.random() * 0.2); src.stop(now + 0.25);
  },
  tone(freq, dur = 0.08, type = 'sine', vol = 0.25, slide = 0) {
    if (!this.ok()) return;
    const now = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, now); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), now + dur);
    g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(this.master); o.start(now); o.stop(now + dur + 0.02);
  },
  hit() { this.tone(1500, 0.05, 'square', 0.08); },
  pickup() { this.tone(660, 0.06, 'triangle', 0.18); setTimeout(() => this.tone(990, 0.07, 'triangle', 0.15), 60); },
  hurt() { this.tone(180, 0.12, 'sawtooth', 0.12, -80); },
  click() { this.tone(300, 0.03, 'square', 0.08); },
};

// estado global de la partida (se completa en los otros módulos)
const Game = { state: 'menu', time: 0, listener: null, paused: false };
