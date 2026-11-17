import type Phaser from 'phaser';
import { W } from '../../World';

/**
 * Штриховые текстуры группы C (Падение звезды, Ледяной венец). Стиль — STYLE_GUIDE: светлые тонкие линии
 * внахлёст, рваные края, кляксы, без пикселей. Рисуются в Canvas 2D один раз на сцену (сглаженные).
 */

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** детерминированный ГСЧ (mulberry32) */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tex(key: string, w: number, h: number, draw: (c: Ctx) => void) {
  const tm = W.scene.textures;
  if (tm.exists(key)) return;
  const ct = tm.createCanvas(key, w, h);
  if (!ct) return;
  const c = ct.getContext();
  c.lineCap = 'round'; c.lineJoin = 'round';
  draw(c);
  ct.refresh();
}

// ───────────────────────────── ледяная пика ─────────────────────────────

/** Пика: основание слева (x=6), остриё справа; 160×44, центр по высоте 22. Origin для SkyFx — (0.04, 0.5). */
export const SPIKE_TEX = ['gc_spike0', 'gc_spike1'];
export const SPIKE_W = 160, SPIKE_H = 44;

function drawSpike(c: Ctx, v: number) {
  const r = rng(300 + v * 13), cy = SPIKE_H / 2, x0 = 6, x1 = SPIKE_W - 4, hw = 14 + v * 2;
  // тело: рваный треугольник, светлая заливка (прозрачность растёт к основанию)
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, 'rgba(190,228,255,0.55)'); g.addColorStop(0.7, 'rgba(235,247,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0.95)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x0, cy - hw);
  c.lineTo(x0 + (x1 - x0) * 0.3, cy - hw * 0.62 - r() * 2);
  c.lineTo(x0 + (x1 - x0) * 0.62, cy - hw * 0.28 + r() * 2);
  c.lineTo(x1, cy + (r() - 0.5) * 3);
  c.lineTo(x0 + (x1 - x0) * 0.6, cy + hw * 0.3 - r() * 2);
  c.lineTo(x0 + (x1 - x0) * 0.28, cy + hw * 0.66 + r() * 2);
  c.lineTo(x0, cy + hw);
  c.closePath(); c.fill();
  // грани: несколько тонких светлых штрихов со сдвигом (набросок мелом)
  for (let i = 0; i < 7; i++) {
    const o = (r() - 0.5) * hw * 1.2, k = 0.55 + r() * 0.4;
    c.strokeStyle = `rgba(${i < 3 ? '255,255,255' : '170,215,250'},${(0.45 + r() * 0.45).toFixed(2)})`;
    c.lineWidth = 0.8 + r() * 1.4;
    c.beginPath();
    c.moveTo(x0 + r() * 12, cy + o);
    c.lineTo(x0 + (x1 - x0) * k, cy + o * (1 - k) * 0.5 + (r() - 0.5) * 2);
    c.stroke();
  }
  // контур: два прохода, второй смещён
  for (let p = 0; p < 2; p++) {
    c.strokeStyle = p ? 'rgba(170,215,250,0.55)' : 'rgba(255,255,255,0.9)';
    c.lineWidth = p ? 1.2 : 1.6;
    const dy = p ? 1.2 : 0;
    c.beginPath();
    c.moveTo(x0, cy - hw + dy); c.lineTo(x1, cy + dy); c.lineTo(x0, cy + hw + dy);
    c.stroke();
  }
}

// ───────────────────── лёд на земле: вспышка и след ─────────────────────

/** Ледяной налёт: светлое рваное пятно со штриховкой, 256×256 */
function drawPatch(c: Ctx) {
  const r = rng(411), cx = 128, cy = 128;
  const edge = (a: number) => 104 + 14 * Math.sin(a * 5 + 1) + 8 * Math.sin(a * 11 + 2) + r() * 4;
  const g = c.createRadialGradient(cx, cy, 8, cx, cy, 118);
  g.addColorStop(0, 'rgba(235,247,255,0.75)'); g.addColorStop(0.7, 'rgba(205,234,255,0.55)'); g.addColorStop(1, 'rgba(190,228,255,0.25)');
  c.fillStyle = g;
  c.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * TAU, rr = edge(a);
    if (i) c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else c.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  c.closePath(); c.fill();
  // штриховка: короткие светлые черты вразнобой
  for (let i = 0; i < 70; i++) {
    const a = r() * TAU, d = 10 + r() * 95, l = 6 + r() * 16, b = a + (r() - 0.5) * 1.2;
    c.strokeStyle = `rgba(255,255,255,${(0.35 + r() * 0.5).toFixed(2)})`; c.lineWidth = 0.8 + r() * 1.2;
    c.beginPath(); c.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
    c.lineTo(cx + Math.cos(a) * d + Math.cos(b) * l, cy + Math.sin(a) * d + Math.sin(b) * l); c.stroke();
  }
}

/** Остаточный след: тонкое неровное кольцо и несколько трещин-лучей, 256×256 (светлые линии, без заливки) */
function drawTrace(c: Ctx) {
  const r = rng(523), cx = 128, cy = 128;
  for (let p = 0; p < 3; p++) {
    c.strokeStyle = `rgba(${p ? '190,228,255' : '255,255,255'},${p ? 0.6 : 0.85})`; c.lineWidth = p ? 1.2 : 1.8;
    const k1 = 3 + p, ph = r() * TAU;
    c.beginPath();
    for (let i = 0; i <= 90; i++) {
      const a = (i / 90) * TAU, rr = 100 + p * 2 + 5 * Math.sin(a * k1 + ph) + (r() - 0.5) * 3;
      if (i) c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else c.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    c.stroke();
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + (r() - 0.5) * 0.3, d0 = 30 + r() * 25, d1 = 70 + r() * 28;
    c.strokeStyle = `rgba(235,247,255,${(0.5 + r() * 0.35).toFixed(2)})`; c.lineWidth = 1 + r() * 1.2;
    c.beginPath(); c.moveTo(cx + Math.cos(a) * d0, cy + Math.sin(a) * d0);
    const m = (d0 + d1) / 2, ja = a + (r() - 0.5) * 0.18;
    c.lineTo(cx + Math.cos(ja) * m, cy + Math.sin(ja) * m); c.lineTo(cx + Math.cos(a) * d1, cy + Math.sin(a) * d1); c.stroke();
  }
}

// ───────────────────── Падение звезды: вспышка, осколки, след ─────────────────────

/** Светлая клякса-вспышка: рваный пятиконечно-неровный блин с лучами, 2 варианта, 192×192 */
export const SPLASH_TEX = ['gc_splash0', 'gc_splash1'];
function drawSplash(c: Ctx, v: number) {
  const r = rng(700 + v * 31), cx = 96, cy = 96;
  const n = 14 + v * 2, ph = r() * TAU;
  // лучи-лепестки: длинные и короткие по очереди — «клякса с брызгами»
  const g = c.createRadialGradient(cx, cy, 4, cx, cy, 90);
  g.addColorStop(0, 'rgba(255,255,255,0.98)'); g.addColorStop(0.45, 'rgba(255,236,205,0.8)'); g.addColorStop(1, 'rgba(255,214,160,0.25)');
  c.fillStyle = g;
  c.beginPath();
  for (let i = 0; i <= n * 2; i++) {
    const a = ph + (i / (n * 2)) * TAU, long = i % 2 === 0;
    const rr = long ? 52 + r() * 36 : 28 + r() * 12;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i) c.lineTo(x, y); else c.moveTo(x, y);
  }
  c.closePath(); c.fill();
  // тонкие штрихи-лучи поверх, разной длины
  for (let i = 0; i < 18; i++) {
    const a = r() * TAU, d0 = 14 + r() * 20, d1 = d0 + 30 + r() * 38;
    c.strokeStyle = `rgba(255,248,235,${(0.55 + r() * 0.4).toFixed(2)})`; c.lineWidth = 0.9 + r() * 1.5;
    c.beginPath(); c.moveTo(cx + Math.cos(a) * d0, cy + Math.sin(a) * d0); c.lineTo(cx + Math.cos(a) * d1, cy + Math.sin(a) * d1); c.stroke();
  }
}

/** Осколок-штрих: суженная чёрточка, остриё справа, 64×12 */
export const SHARD_TEX = 'gc_shard';
function drawShard(c: Ctx) {
  const g = c.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,225,185,0)'); g.addColorStop(0.5, 'rgba(255,236,205,0.8)'); g.addColorStop(1, 'rgba(255,255,255,1)');
  c.fillStyle = g;
  c.beginPath(); c.moveTo(2, 6); c.lineTo(52, 2.2); c.lineTo(62, 6); c.lineTo(52, 9.8); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(14, 6); c.lineTo(60, 6); c.stroke();
}

/** Короткий светлый след падающей звезды: «голова» справа, хвост рассыпается тонкими линиями. 128×24 */
export const TRAIL_TEX = 'gc_trail';
function drawTrail(c: Ctx) {
  const r = rng(911), cy = 12;
  const g = c.createLinearGradient(0, 0, 124, 0);
  g.addColorStop(0, 'rgba(255,240,215,0)'); g.addColorStop(0.6, 'rgba(255,240,215,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0.9)');
  c.fillStyle = g;
  c.beginPath(); c.moveTo(0, cy); c.lineTo(110, cy - 7); c.lineTo(126, cy); c.lineTo(110, cy + 7); c.closePath(); c.fill();
  for (let i = 0; i < 8; i++) {
    const y = cy + (r() - 0.5) * 12, x0 = 20 + r() * 50;
    c.strokeStyle = `rgba(255,250,240,${(0.4 + r() * 0.5).toFixed(2)})`; c.lineWidth = 0.8 + r() * 1.1;
    c.beginPath(); c.moveTo(x0, cy + (y - cy) * 0.3); c.lineTo(122, cy + (y - cy) * 0.5); c.stroke();
  }
}

const madeFor = new Set<Phaser.Scene>();
/** Создать все текстуры группы C (один раз на сцену; дальше — одно сравнение) */
export function ensureGroupC() {
  const s = W.scene;
  if (madeFor.has(s)) return;
  madeFor.add(s);
  SPIKE_TEX.forEach((k, i) => tex(k, SPIKE_W, SPIKE_H, (c) => drawSpike(c, i)));
  tex('gc_patch', 256, 256, drawPatch);
  tex('gc_trace', 256, 256, drawTrace);
  SPLASH_TEX.forEach((k, i) => tex(k, 192, 192, (c) => drawSplash(c, i)));
  tex(SHARD_TEX, 64, 12, drawShard);
  tex(TRAIL_TEX, 128, 24, drawTrail);
}
