import Phaser from 'phaser';
import { W } from '../../World';

/**
 * Хелпер группы B (Flash, Shield, Spirit, Ray, Incinerate): процедурные «чернильные» текстуры и рисование штрихов.
 * Стиль — docs/STYLE_GUIDE.md: светлые тонкие линии внахлёст, рваные края, без ореолов и без пикселей.
 */

export const GB_STAR = 'gb_star';       // маленькая острая звёздочка-штрих (вспышка выстрела), 32×32
export const GB_NEEDLE = 'gb_needle';   // игла со следом, остриё вправо, 64×12
export const GB_FLAME = ['gb_flame0', 'gb_flame1', 'gb_flame2']; // мультяшный язык пламени, остриё вправо, 96×64
export const GB_FLAME_W = 96;

/** детерминированный генератор — чтобы кадры дрожания были одинаковы между запусками */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

type Pt = { x: number; y: number };

export function ensureGroupBTextures() {
  const tx = W.scene.textures;

  if (!tx.exists(GB_STAR)) {
    const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
    // четыре тонких острых луча: длинные по осям, короткие по диагонали
    const c = 16;
    const spike = (a: number, len: number, w: number, col: number, al: number) => {
      const ux = Math.cos(a), uy = Math.sin(a), nx = -uy * w, ny = ux * w;
      g.fillStyle(col, al);
      g.fillPoints([{ x: c + nx, y: c + ny }, { x: c + ux * len, y: c + uy * len }, { x: c - nx, y: c - ny }, { x: c - ux * len * 0.25, y: c - uy * len * 0.25 }] as Pt[], true);
    };
    for (let i = 0; i < 4; i++) spike(i * Math.PI / 2, 15, 1.4, 0xfff6e6, 1);
    for (let i = 0; i < 4; i++) spike(Math.PI / 4 + i * Math.PI / 2, 8, 0.9, 0xfff6e6, 0.8);
    g.fillStyle(0xffffff, 1); g.fillCircle(c, c, 2);
    g.generateTexture(GB_STAR, 32, 32);
    g.destroy();
  }

  if (!tx.exists(GB_NEEDLE)) {
    const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
    const cy = 6;
    // тонкий след: затухающие штрихи позади
    g.lineStyle(1.2, 0xf3efe7, 0.35); g.lineBetween(2, cy - 1.2, 34, cy - 0.4);
    g.lineStyle(1, 0xf3efe7, 0.3); g.lineBetween(10, cy + 1.4, 40, cy + 0.5);
    // сама игла: тонкий клин с острым носом
    g.fillStyle(0xfff6e6, 1);
    g.fillPoints([{ x: 22, y: cy - 1.6 }, { x: 62, y: cy }, { x: 22, y: cy + 1.6 }] as Pt[], true);
    g.fillStyle(0xffffff, 1); g.fillCircle(50, cy, 1.3);
    g.generateTexture(GB_NEEDLE, 64, 12);
    g.destroy();
  }

  for (let v = 0; v < GB_FLAME.length; v++) {
    if (tx.exists(GB_FLAME[v])) continue;
    const r = rng(77 + v * 31), ph = v * 2.1;
    const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
    const cy = 32;
    // контур языка: круглый хвост слева, волнистое остриё справа
    const outline = (hMul: number, shift: number, jit: number): Pt[] => {
      const top: Pt[] = [], bot: Pt[] = [];
      const N = 14;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const x = 6 + t * 86;
        const h = 21 * hMul * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.85) * (1 - 0.35 * t);
        const yc = cy + shift + Math.sin(t * 5 + ph) * 6 * t;
        top.push({ x: x + (r() - 0.5) * jit, y: yc - h + (r() - 0.5) * jit });
        bot.push({ x: x + (r() - 0.5) * jit, y: yc + h + (r() - 0.5) * jit });
      }
      return top.concat(bot.reverse());
    };
    // заливка: кремовая, внутри — тёпло-оранжевая
    g.fillStyle(0xffeccb, 0.92); g.fillPoints(outline(1, 0, 0), true);
    g.fillStyle(0xffc27a, 0.85); g.fillPoints(outline(0.5, 1, 0), true);
    // клякса-брызги у хвоста и пара искр
    g.fillStyle(0xffe0b0, 0.9);
    for (let i = 0; i < 3; i++) g.fillCircle(6 + r() * 22, cy + (r() - 0.5) * 34, 2 + r() * 3);
    g.fillStyle(0xffb468, 0.9); g.fillCircle(20 + r() * 20, cy + (r() - 0.5) * 20, 3 + r() * 2);
    // чернильные штрихи-контуры внахлёст (двойная линия со сдвигом)
    g.lineStyle(2, 0xf08a3c, 0.95);
    for (let k = 0; k < 2; k++) g.strokePoints(outline(1.02 + k * 0.05, (k - 0.5) * 2.5, 2.4), true);
    g.lineStyle(1.6, 0xfff4e0, 0.9);
    g.strokePoints(outline(0.55, 0, 1.5).slice(0, 15), false);
    g.generateTexture(GB_FLAME[v], 96, 64);
    g.destroy();
  }
}

/** Тонкая ломаная штриховая окружность-кокон (эллипс с шумом радиуса), незамкнутая с нахлёстом концов */
export function scribbleLoop(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rx: number, ry: number,
  phase: number, amp: number, start: number, sweep: number, tmp: Pt[], steps = 22) {
  tmp.length = 0;
  for (let i = 0; i <= steps; i++) {
    const a = start + (i / steps) * sweep;
    const n = 1 + amp * Math.sin(a * 3 + phase) + amp * 0.6 * Math.sin(a * 5 - phase * 1.7);
    tmp.push({ x: cx + Math.cos(a) * rx * n, y: cy + Math.sin(a) * ry * n });
  }
  g.strokePoints(tmp as Phaser.Types.Math.Vector2Like[], false);
}
