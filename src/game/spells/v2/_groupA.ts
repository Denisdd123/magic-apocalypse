import type Phaser from 'phaser';
import { W } from '../../World';

/**
 * Хелпер группы A (Сгустки силы, Кипящая земля, Разряд, Гнев туч): штриховые текстуры в нашем стиле —
 * светлые тонкие линии внахлёст, рваные края, кляксы. Рисуются кодом в Canvas 2D один раз на сцену.
 */

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

export const GA = {
  orb: ['ga_orb0', 'ga_orb1', 'ga_orb2'],        // сгусток силы 64×64
  lava: ['ga_lava0', 'ga_lava1'],                // лужа магмы 256×256
  shock: ['ga_shock0', 'ga_shock1', 'ga_shock2', 'ga_shock3'], // горизонтальная молния 256×64, голова справа
  sky: ['ga_sky0', 'ga_sky1', 'ga_sky2'],        // молния сверху вниз 128×512, остриё внизу по центру
  splat: ['ga_splat0', 'ga_splat1'],             // вспышка-клякса на земле 128×128
};
/** видимый диаметр лужи в текстуре, px */
export const LAVA_DIAM = 236;

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

const madeFor = new Map<string, Phaser.Scene>();
function once(group: string, make: () => void) {
  const s = W.scene;
  if (madeFor.get(group) === s) return;
  madeFor.set(group, s);
  make();
}

function poly(c: Ctx, pts: number[]) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.stroke();
}

/** Ломаная от (x0,y0) к (x1,y1) со смещением поперёк: n звеньев, амплитуда amp */
function zig(r: () => number, x0: number, y0: number, x1: number, y1: number, n: number, amp: number): number[] {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  const pts = [x0, y0];
  for (let i = 1; i < n; i++) {
    const t = i / n, o = (r() * 2 - 1) * amp;
    pts.push(x0 + dx * t + nx * o, y0 + dy * t + ny * o);
  }
  pts.push(x1, y1);
  return pts;
}

/** Три прохода молнии: голубоватое свечение, средний штрих, тонкая белая сердцевина */
function bolt3(c: Ctx, pts: number[], k: number) {
  c.strokeStyle = 'rgba(150,185,255,0.20)'; c.lineWidth = 11 * k; poly(c, pts);
  c.strokeStyle = 'rgba(205,224,255,0.75)'; c.lineWidth = 4.6 * k; poly(c, pts);
  c.strokeStyle = 'rgba(255,255,255,1)'; c.lineWidth = 2.2 * k; poly(c, pts);
}

// ───────────────────────── Сгусток силы ─────────────────────────
function drawOrb(c: Ctx, f: number) {
  const r = rng(700 + f * 13), C = 32;
  const g = c.createRadialGradient(C, C, 2, C, C, 30);
  g.addColorStop(0, 'rgba(235,240,255,0.55)'); g.addColorStop(1, 'rgba(200,210,255,0)');
  c.fillStyle = g; c.beginPath(); c.arc(C, C, 30, 0, TAU); c.fill();
  // штрихи внахлёст: несколько неровных колец разного радиуса
  const rings: [number, number, number][] = [[24, 0.5, 1.4], [19, 0.7, 1.8], [14, 0.85, 2.2]];
  for (const [R, a, lw] of rings) {
    const p1 = r() * TAU, p2 = r() * TAU;
    c.strokeStyle = `rgba(232,238,255,${a})`; c.lineWidth = lw;
    c.beginPath();
    const a0 = r() * TAU, span = TAU * (0.7 + r() * 0.3);
    for (let i = 0; i <= 40; i++) {
      const t = a0 + (span * i) / 40, rr = R + 2.2 * Math.sin(3 * t + p1) + 1.4 * Math.sin(7 * t + p2);
      if (i) c.lineTo(C + Math.cos(t) * rr, C + Math.sin(t) * rr); else c.moveTo(C + Math.cos(t) * rr, C + Math.sin(t) * rr);
    }
    c.stroke();
  }
  // рваные лучики
  c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1.5;
  for (let i = 0; i < 7; i++) {
    const a = r() * TAU, r0 = 17 + r() * 4, r1 = r0 + 5 + r() * 6;
    c.beginPath(); c.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0); c.lineTo(C + Math.cos(a + 0.12) * r1, C + Math.sin(a + 0.12) * r1); c.stroke();
  }
  // сердцевина
  const g2 = c.createRadialGradient(C, C, 0, C, C, 11);
  g2.addColorStop(0, 'rgba(255,255,255,1)'); g2.addColorStop(0.7, 'rgba(240,244,255,0.95)'); g2.addColorStop(1, 'rgba(210,222,255,0)');
  c.fillStyle = g2; c.beginPath(); c.arc(C, C, 11, 0, TAU); c.fill();
}

// ───────────────────────── Лужа магмы ─────────────────────────
function drawLava(c: Ctx, f: number) {
  const r = rng(800), rf = rng(820 + f * 7), C = 128;
  const p1 = r() * TAU, p2 = r() * TAU, p3 = r() * TAU;
  const R = (t: number) => 108 + 9 * Math.sin(3 * t + p1) + 6 * Math.sin(5 * t + p2) + 4 * Math.sin(8 * t + p3);
  const blob = (d = 0) => {
    c.beginPath();
    for (let i = 0; i <= 90; i++) {
      const t = (i / 90) * TAU, rr = R(t) + d;
      if (i) c.lineTo(C + Math.cos(t) * rr, C + Math.sin(t) * rr); else c.moveTo(C + Math.cos(t) * rr, C + Math.sin(t) * rr);
    }
    c.closePath();
  };
  // тёмно-рыжая заливка
  const g = c.createRadialGradient(C, C, 6, C, C, 120);
  g.addColorStop(0, 'rgb(170,66,20)'); g.addColorStop(0.55, 'rgb(128,46,14)'); g.addColorStop(1, 'rgb(74,25,10)');
  c.fillStyle = g; blob(); c.fill();
  c.save(); blob(); c.clip();
  // светлые мазки-штрихи по поверхности
  for (let i = 0; i < 16; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 90, x = C + Math.cos(a) * d, y = C + Math.sin(a) * d, ang = r() * Math.PI, l = 8 + r() * 12;
    c.strokeStyle = `rgba(214,104,34,${0.35 + r() * 0.3})`; c.lineWidth = 1.6 + r() * 1.4;
    c.beginPath(); c.moveTo(x - Math.cos(ang) * l, y - Math.sin(ang) * l); c.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); c.stroke();
  }
  // светлые трещины: 5 ломаных от центра к краю
  const nc = 5;
  for (let i = 0; i < nc; i++) {
    const a = (i / nc) * TAU + r() * 0.7, d0 = 10 + r() * 20, L = 50 + r() * 40;
    const pts = zig(r, C + Math.cos(a) * d0, C + Math.sin(a) * d0, C + Math.cos(a) * (d0 + L), C + Math.sin(a) * (d0 + L), 6, 9);
    const heat = 0.55 + 0.45 * rf();
    c.strokeStyle = `rgba(255,140,50,${0.3 * heat})`; c.lineWidth = 8; poly(c, pts);
    c.strokeStyle = `rgba(255,190,100,${0.85 * heat})`; c.lineWidth = 3.4; poly(c, pts);
    c.strokeStyle = `rgba(255,236,190,${0.95 * heat})`; c.lineWidth = 1.5; poly(c, pts);
  }
  // редкие пузыри (положение зависит от кадра)
  for (let b = 0; b < 3; b++) {
    const a = rf() * TAU, d = 20 + rf() * 70, x = C + Math.cos(a) * d, y = C + Math.sin(a) * d, br = 6 + rf() * 7;
    c.fillStyle = 'rgba(190,80,26,0.7)'; c.beginPath(); c.arc(x, y, br, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,205,130,0.9)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, br, 0, TAU); c.stroke();
    c.strokeStyle = 'rgba(255,240,200,0.9)'; c.lineWidth = 1.6; c.beginPath(); c.arc(x, y, br * 0.55, 3.6, 4.7); c.stroke();
  }
  c.restore();
  // кромка: светло-рыжий внутренний штрих и тёмный рваный контур
  c.strokeStyle = 'rgba(226,110,36,0.6)'; c.lineWidth = 3; blob(-6); c.stroke();
  for (let p = 0; p < 3; p++) {
    c.strokeStyle = p ? 'rgba(40,14,8,0.55)' : 'rgba(24,8,5,0.9)'; c.lineWidth = p ? 1.4 : 4.5; blob((r() - 0.5) * 3); c.stroke();
  }
}

// ───────────────────────── Разряд (горизонтальная молния) ─────────────────────────
function drawShock(c: Ctx, f: number) {
  const r = rng(900 + f * 31), cy = 32, x0 = 6, x1 = 248, N = 16;
  const main = zig(r, x0, cy, x1, cy, N, 13);
  // к хвосту затухает: четыре куска с растущей яркостью
  c.save();
  for (let s = 0; s < 4; s++) {
    c.globalAlpha = 0.3 + 0.23 * s;
    const a = (s * N) / 4, b = Math.min(N, (s + 1) * (N / 4) + 1);
    bolt3(c, main.slice(a * 2, b * 2 + 2), 1);
  }
  c.globalAlpha = 1;
  // вторая линия внахлёст (тоньше, со сдвигом)
  const alt = zig(r, 60, cy + 2, x1 - 6, cy - 2, 12, 11);
  c.strokeStyle = 'rgba(215,230,255,0.7)'; c.lineWidth = 2; poly(c, alt);
  // боковые ветки от случайных узлов
  for (let i = 0; i < 3; i++) {
    const k = 3 + ((r() * 11) | 0), bx = main[k * 2], by = main[k * 2 + 1], dir = r() < 0.5 ? -1 : 1;
    const br = zig(r, bx, by, bx + 28 + r() * 26, by + dir * (12 + r() * 12), 4, 5);
    c.strokeStyle = 'rgba(190,215,255,0.6)'; c.lineWidth = 3.2; poly(c, br);
    c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 1.4; poly(c, br);
  }
  // яркая голова
  const g = c.createRadialGradient(x1, cy, 0, x1, cy, 13);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(170,200,255,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x1, cy, 13, 0, TAU); c.fill();
  c.restore();
}

// ───────────────────────── Молния с неба ─────────────────────────
function drawSky(c: Ctx, f: number) {
  const r = rng(1000 + f * 41), H = 512, bx = 64;
  const main = zig(r, bx + (r() - 0.5) * 30, 0, bx, H - 8, 18, 22);
  bolt3(c, main, 1.15);
  // вторая линия внахлёст
  const alt = zig(r, bx + (r() - 0.5) * 20, 40, bx + (r() - 0.5) * 8, H - 8, 13, 16);
  c.strokeStyle = 'rgba(220,234,255,0.7)'; c.lineWidth = 2.4; poly(c, alt);
  // две ветки
  for (let i = 0; i < 2; i++) {
    const k = 5 + ((r() * 9) | 0), sx = main[k * 2], sy = main[k * 2 + 1], dir = i ? 1 : -1;
    const br = zig(r, sx, sy, sx + dir * (22 + r() * 22), sy + 50 + r() * 60, 4, 7);
    c.strokeStyle = 'rgba(190,215,255,0.5)'; c.lineWidth = 4; poly(c, br);
    c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 1.8; poly(c, br);
  }
}

// ───────────────────────── Вспышка-клякса на земле ─────────────────────────
function drawSplat(c: Ctx, f: number) {
  const r = rng(1100 + f * 17), C = 64;
  const g = c.createRadialGradient(C, C, 4, C, C, 56);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.55, 'rgba(220,232,255,0.6)'); g.addColorStop(1, 'rgba(180,205,255,0)');
  c.fillStyle = g; c.beginPath(); c.arc(C, C, 56, 0, TAU); c.fill();
  // рваная белая клякса
  c.fillStyle = 'rgba(255,255,255,0.95)';
  c.beginPath();
  const n = 14;
  for (let i = 0; i < n * 2; i++) {
    const t = (i / (n * 2)) * TAU, rr = i % 2 ? 14 + r() * 6 : 26 + r() * 14;
    if (i) c.lineTo(C + Math.cos(t) * rr, C + Math.sin(t) * rr); else c.moveTo(C + Math.cos(t) * rr, C + Math.sin(t) * rr);
  }
  c.closePath(); c.fill();
  // короткие штрихи-брызги
  c.strokeStyle = 'rgba(230,238,255,0.9)'; c.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = r() * TAU, r0 = 34 + r() * 6, r1 = r0 + 8 + r() * 10;
    c.beginPath(); c.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0); c.lineTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1); c.stroke();
  }
}

/** Создать все текстуры группы (один раз на сцену) */
export function ensureGroupA() {
  once('groupA', () => {
    for (let f = 0; f < 3; f++) tex(GA.orb[f], 64, 64, (c) => drawOrb(c, f));
    for (let f = 0; f < 2; f++) tex(GA.lava[f], 256, 256, (c) => drawLava(c, f));
    for (let f = 0; f < 4; f++) tex(GA.shock[f], 256, 64, (c) => drawShock(c, f));
    for (let f = 0; f < 3; f++) tex(GA.sky[f], 128, 512, (c) => drawSky(c, f));
    for (let f = 0; f < 2; f++) tex(GA.splat[f], 128, 128, (c) => drawSplat(c, f));
  });
}
