import type Phaser from 'phaser';

/**
 * Штриховые эффекты заклинаний (стиль «тёмное фэнтези, наполовину реалистично»):
 * эффект нарисован множеством тонких светящихся линий, наложенных слоями (широкий тусклый ореол →
 * средний цветной штрих → тонкая белая сердцевина). Магия светлая и хорошо видна на тёмной карте.
 * Все текстуры генерируются ОДИН раз (Graphics → generateTexture), в бою только переключаются кадры.
 * Рисование вынесено в чистые функции поверх интерфейса Pen (без Phaser), чтобы можно было отрендерить превью.
 */

/** Рост мага в игровых единицах — от него считаем размеры эффектов (масштаб мира подстраивается отдельно) */
export const MAGE_H = 23;

// ——— ключи текстур ———
export const LF = {
  needle: 'lf_needle',
  fire: ['lf_fire0', 'lf_fire1', 'lf_fire2'],
  fireOrb: 'lf_fireorb',
  fireBoom: 'lf_fireboom',
  spark: 'lf_spark',
  ring: 'lf_ring',
  glow: 'lf_glow',
  scorch: 'lf_scorch',
  shock: ['lf_shock0', 'lf_shock1', 'lf_shock2', 'lf_shock3'],
  sky: ['lf_sky0', 'lf_sky1', 'lf_sky2'],
};

/** Размеры текстур (px) — нужны для пропорций при показе */
export const LF_SIZE = {
  needle: [128, 32], fire: [96, 48], fireOrb: [64, 64], fireBoom: [128, 128], spark: [96, 96],
  ring: [128, 128], glow: [64, 64], scorch: [96, 96], shock: [192, 48], sky: [96, 384],
} as const;

/** Минимальный «перо»-интерфейс: в игре — поверх Phaser.Graphics, в превью — запись команд */
export interface Pen {
  line(pts: number[], w: number, color: number, alpha: number): void;
  circle(x: number, y: number, r: number, color: number, alpha: number): void;
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, color: number, alpha: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number, w: number, color: number, alpha: number): void;
}

// ——— детерминированный генератор случайных чисел (одинаковые текстуры при каждом запуске) ———
let seed = 1;
const srand = (s: number) => { seed = s % 2147483646 + 1; };
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a: number, b: number) => a + rand() * (b - a);

/** Линия со свечением: 4 слоя от широкого тусклого ореола к тонкой белой сердцевине */
function glowLine(p: Pen, pts: number[], w: number, color: number, a = 1, core = 0xffffff) {
  p.line(pts, w * 5, color, 0.06 * a);
  p.line(pts, w * 2.6, color, 0.16 * a);
  p.line(pts, w * 1.3, color, 0.6 * a);
  p.line(pts, w * 0.55, core, 0.95 * a);
}

/** Мягкое пятно света: концентрические круги с малой прозрачностью */
function softGlow(p: Pen, x: number, y: number, r: number, color: number, a = 1, steps = 7) {
  for (let i = 0; i < steps; i++) p.circle(x, y, r * (1 - i / steps), color, 0.07 * a);
}

/** Ломаная молнии методом смещения середины (depth 5 → 33 точки) */
function zigzag(x0: number, y0: number, x1: number, y1: number, disp: number, depth: number): number[] {
  let pts = [x0, y0, x1, y1];
  let d = disp;
  for (let k = 0; k < depth; k++) {
    const out: number[] = [pts[0], pts[1]];
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      const o = rr(-d, d);
      out.push((ax + bx) / 2 + (-dy / len) * o, (ay + by) / 2 + (dx / len) * o, bx, by);
    }
    pts = out; d *= 0.55;
  }
  return pts;
}

/** Кривая-штрих: от (x0,y0) к (x1,y1) с волной поперёк (n точек) */
function wavy(x0: number, y0: number, x1: number, y1: number, amp: number, ph: number, n = 7): number[] {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), o = Math.sin(ph + t * Math.PI * 1.6) * amp * t;
    pts.push(x0 + dx * t + nx * o, y0 + dy * t + ny * o);
  }
  return pts;
}

/** Часть полилинии [t0..t1] (для штрихов с нарастающей яркостью) */
function sub(pts: number[], t0: number, t1: number): number[] {
  const n = pts.length / 2 - 1, out: number[] = [];
  const i0 = Math.floor(t0 * n), i1 = Math.ceil(t1 * n);
  for (let i = i0; i <= i1 && i <= n; i++) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

// ═════════════════ отдельные эффекты ═════════════════

/** Звёздная игла: остриё вправо, хвост из тонких росчерков, на острие — 4-лучевая звезда */
export function drawNeedle(p: Pen) {
  srand(11);
  const hx = 100, cy = 16, C = 0xd6ccff;
  // хвост: длинный мягкий ореол
  p.line([30, cy, hx, cy], 10, C, 0.05);
  p.line([50, cy, hx, cy], 5, C, 0.12);
  // хвост: росчерки, ярче к голове
  for (let i = 0; i < 11; i++) {
    const pts = wavy(rr(4, 52), cy + rr(-6, 6), hx - rr(0, 6), cy + rr(-1, 1), rr(0.5, 2), rr(0, 6), 6);
    for (let k = 0; k < 4; k++) p.line(sub(pts, k / 4, (k + 1) / 4), rr(0.6, 1.2), k < 2 ? C : 0xffffff, 0.12 + 0.2 * k);
  }
  // веретено иглы
  p.tri(58, cy - 1.8, 58, cy + 1.8, 122, cy, 0xffffff, 0.85);
  glowLine(p, [62, cy, 126, cy], 1, C);
  // звезда на острие
  softGlow(p, hx, cy, 15, C, 1.4);
  glowLine(p, [hx, cy - 14, hx, cy + 14], 0.9, C);
  glowLine(p, [hx - 20, cy, hx + 22, cy], 0.9, C);
  glowLine(p, [hx - 6, cy - 6, hx + 6, cy + 6], 0.6, C, 0.8);
  glowLine(p, [hx - 6, cy + 6, hx + 6, cy - 6], 0.6, C, 0.8);
  p.circle(hx, cy, 3.2, 0xffffff, 1);
}

/** Огненная комета (кадр f): голова справа, языки-штрихи тянутся влево, от тёмно-красного к белому */
export function drawFire(p: Pen, f: number) {
  srand(101 + f * 37);
  const hx = 70, cy = 24, hr = 11;
  softGlow(p, hx, cy, 24, 0xff6a20, 1.3);
  const pal = [0xa81c10, 0xe0401a, 0xff7a22, 0xffb840, 0xffe9a8];
  for (let layer = 0; layer < pal.length; layer++) {
    const n = 7 - layer, reach = 1 - layer * 0.17;
    for (let i = 0; i < n; i++) {
      const th = rr(-1.9, 1.9);
      const sx = hx + Math.cos(th) * hr * rr(0.6, 1), sy = cy + Math.sin(th) * hr * rr(0.7, 1);
      const ex = hx - rr(30, 66) * reach, ey = cy + (sy - cy) * rr(0.2, 1.3) + rr(-3, 3);
      const pts = wavy(sx, sy, ex, ey, rr(1.5, 4.5), rr(0, 6.3), 8);
      const w = rr(1.0, 2.0) * (layer < 2 ? 1.3 : 1);
      p.line(pts, w * 3, pal[layer], 0.08);
      p.line(sub(pts, 0, 0.75), w, pal[layer], 0.75);
      p.line(sub(pts, 0.6, 1), w * 0.6, pal[layer], 0.35);
    }
  }
  // раскалённая сердцевина
  p.circle(hx, cy, hr, 0xff8a2a, 0.45);
  p.circle(hx, cy, hr * 0.75, 0xffc860, 0.8);
  p.circle(hx + 1, cy, hr * 0.5, 0xfff4d8, 1);
  for (let i = 0; i < 6; i++) {
    const a = rr(-1.2, 1.2);
    p.arc(hx, cy, hr * rr(0.85, 1.05), a - 0.5, a + 0.5, 0.9, 0xfff0c0, 0.7);
  }
}

/** Огненная сфера (для «Созвездия»): закрученные языки во все стороны */
export function drawFireOrb(p: Pen) {
  srand(303);
  const c = 32, hr = 9;
  softGlow(p, c, c, 30, 0xff6a20, 1.2);
  const pal = [0xc0281a, 0xff6a1a, 0xffb040, 0xffeeb0];
  for (let layer = 0; layer < pal.length; layer++) {
    for (let i = 0; i < 9; i++) {
      const a = rr(0, Math.PI * 2), l = rr(12, 22) * (1 - layer * 0.18);
      const sx = c + Math.cos(a) * hr * 0.8, sy = c + Math.sin(a) * hr * 0.8;
      const ex = c + Math.cos(a + 0.6) * (hr + l), ey = c + Math.sin(a + 0.6) * (hr + l);
      p.line(wavy(sx, sy, ex, ey, rr(1, 3), rr(0, 6), 6), rr(0.8, 1.6), pal[layer], 0.7);
    }
  }
  p.circle(c, c, hr, 0xff9a3a, 0.6);
  p.circle(c, c, hr * 0.7, 0xffd070, 0.9);
  p.circle(c, c, hr * 0.45, 0xffffff, 1);
}

/** Взрыв пламенного ядра: кольцо из рваных огненных штрихов + внутренняя штриховка + вспышка */
export function drawFireBoom(p: Pen) {
  srand(505);
  const c = 64, R = 54;
  softGlow(p, c, c, 60, 0xff5a1a, 0.9);
  // внутренняя штриховка лучами
  for (let i = 0; i < 26; i++) {
    const a = rr(0, Math.PI * 2), r0 = rr(4, 16), r1 = rr(30, 50);
    p.line([c + Math.cos(a) * r0, c + Math.sin(a) * r0, c + Math.cos(a + rr(-0.1, 0.1)) * r1, c + Math.sin(a + rr(-0.1, 0.1)) * r1], rr(0.6, 1.2), 0xffd27a, 0.45);
  }
  // кольцо: дуги-штрихи в несколько слоёв
  const pal = [0x9e1a10, 0xe03a18, 0xff7a24, 0xffc860];
  for (let layer = 0; layer < pal.length; layer++) {
    for (let i = 0; i < 16; i++) {
      const a = rr(0, Math.PI * 2), span = rr(0.25, 0.7), r = R * rr(0.86, 1.0) - layer * 2;
      p.arc(c, c, r, a, a + span, rr(1.2, 2.6) - layer * 0.3, pal[layer], 0.75);
    }
  }
  // языки, вырывающиеся наружу
  for (let i = 0; i < 22; i++) {
    const a = rr(0, Math.PI * 2), r0 = R * rr(0.75, 0.9), r1 = R * rr(1.0, 1.15);
    p.line(wavy(c + Math.cos(a) * r0, c + Math.sin(a) * r0, c + Math.cos(a + 0.15) * r1, c + Math.sin(a + 0.15) * r1, 1.5, rr(0, 6), 5), rr(0.8, 1.5), i % 2 ? 0xff9a3a : 0xffe0a0, 0.8);
  }
  softGlow(p, c, c, 18, 0xfff0c0, 1.5);
}

/** Звёздная вспышка-попадание: тонкие лучи разной длины с изломом (как удар молнии о землю) */
export function drawSpark(p: Pen) {
  srand(707);
  const c = 48, C = 0xd8d4ff;
  softGlow(p, c, c, 22, C, 1.3);
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rr(-0.25, 0.25), L = rr(16, 46);
    const mx = c + Math.cos(a) * L * 0.5 + rr(-3, 3), my = c + Math.sin(a) * L * 0.5 + rr(-3, 3);
    const pts = [c, c, mx, my, c + Math.cos(a + rr(-0.2, 0.2)) * L, c + Math.sin(a + rr(-0.2, 0.2)) * L];
    glowLine(p, pts, rr(0.6, 1.1), C);
    if (rand() < 0.5) {
      // короткая веточка от середины луча
      const b = a + rr(-0.8, 0.8), l2 = L * rr(0.2, 0.4);
      glowLine(p, [mx, my, mx + Math.cos(b) * l2, my + Math.sin(b) * l2], 0.5, C, 0.8);
    }
  }
  p.circle(c, c, 4, 0xffffff, 1);
}

/** Штриховое кольцо (ударная волна, телеграф): неровные дуги в три слоя */
export function drawRing(p: Pen) {
  srand(909);
  const c = 64, R = 56, C = 0xdcd6ff;
  p.arc(c, c, R, 0, Math.PI * 2, 7, C, 0.06);
  p.arc(c, c, R, 0, Math.PI * 2, 3, C, 0.14);
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < 14; i++) {
      const a = rr(0, Math.PI * 2), span = rr(0.3, 0.9);
      p.arc(c, c, R + rr(-3, 3), a, a + span, rr(0.6, 1.4), layer === 2 ? 0xffffff : C, 0.5 + layer * 0.2);
    }
  }
}

/** Мягкое пятно света (вспышка у земли) */
export function drawGlow(p: Pen) {
  for (let i = 0; i < 16; i++) p.circle(32, 32, 31 * (1 - i / 16), 0xffffff, 0.06 + (i > 12 ? 0.1 : 0));
}

/** Выжженный след: тёмные трещины-штрихи (обычное смешивание) */
export function drawScorch(p: Pen) {
  srand(1111);
  const c = 48;
  for (let i = 0; i < 5; i++) p.circle(c, c, 30 - i * 5, 0x0c0a10, 0.08);
  for (let i = 0; i < 14; i++) {
    const a = rr(0, Math.PI * 2), L = rr(14, 44);
    p.line(zigzag(c, c, c + Math.cos(a) * L, c + Math.sin(a) * L, 5, 3), rr(0.8, 1.8), 0x15110f, 0.55);
  }
}

/** Разряд (кадр f): горизонтальная ломаная молния, голова справа, 2 переплетённые жилы + веточки */
export function drawShock(p: Pen, f: number) {
  srand(1301 + f * 53);
  const W = 192, cy = 24, C = 0xc8b4ff;
  const main = zigzag(4, cy + rr(-6, 6), W - 6, cy, 16, 5);
  glowLine(p, main, 1.1, C);
  glowLine(p, zigzag(10, cy + rr(-6, 6), W - 10, cy + rr(-2, 2), 12, 5), 0.6, C, 0.8);
  for (let b = 0; b < 4; b++) {
    const i = 2 * (4 + ((rand() * 24) | 0)), x = main[i], y = main[i + 1];
    glowLine(p, zigzag(x, y, x + rr(-26, 8), y + rr(-16, 16), 6, 3), 0.5, C, 0.75);
  }
  softGlow(p, W - 10, cy, 16, C, 1.2);
  p.circle(W - 8, cy, 3, 0xffffff, 1);
}

/** Молния с неба (кадр f): сверху вниз, низ — в точке удара (центр нижнего края); жилы и ветви */
export function drawSky(p: Pen, f: number) {
  srand(1701 + f * 71);
  const W = 96, H = 384, bx = W / 2, by = H - 4, C = 0xc4ccff;
  const top = rr(30, 66);
  const main = zigzag(top, 0, bx, by, 34, 6);
  glowLine(p, main, 1.4, C);
  glowLine(p, zigzag(top + rr(-8, 8), 0, bx + rr(-2, 2), by, 24, 6), 0.7, C, 0.85);
  glowLine(p, zigzag(top + rr(-12, 12), 0, bx, by - rr(0, 30), 20, 5), 0.45, C, 0.6);
  // ветви: отходят вниз-в-стороны и истончаются
  for (let b = 0; b < 5; b++) {
    const i = 2 * (8 + ((rand() * 40) | 0)), x = main[i], y = main[i + 1];
    const ex = x + rr(-34, 34), ey = y + rr(30, 90);
    const br = zigzag(x, y, Math.max(2, Math.min(W - 2, ex)), ey, 10, 4);
    glowLine(p, br, 0.55, C, 0.8);
    if (rand() < 0.5) {
      const j = br.length - 8;
      glowLine(p, zigzag(br[j], br[j + 1], br[j] + rr(-14, 14), br[j + 1] + rr(10, 30), 5, 3), 0.4, C, 0.6);
    }
  }
  softGlow(p, bx, by - 6, 24, C, 1.3);
}

// ═════════════════ генерация текстур в Phaser ═════════════════

class GfxPen implements Pen {
  constructor(private g: Phaser.GameObjects.Graphics) {}
  line(pts: number[], w: number, color: number, alpha: number) {
    if (pts.length < 4) return;
    const g = this.g;
    g.lineStyle(w, color, alpha);
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let i = 2; i + 1 < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.strokePath();
  }
  circle(x: number, y: number, r: number, color: number, alpha: number) { this.g.fillStyle(color, alpha); this.g.fillCircle(x, y, r); }
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, color: number, alpha: number) {
    this.g.fillStyle(color, alpha); this.g.fillTriangle(x0, y0, x1, y1, x2, y2);
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, w: number, color: number, alpha: number) {
    const g = this.g;
    g.lineStyle(w, color, alpha); g.beginPath(); g.arc(x, y, r, a0, a1); g.strokePath();
  }
}

/** Создать все штриховые текстуры (один раз за запуск игры) */
export function ensureLineFx(scene: Phaser.Scene) {
  if (scene.textures.exists(LF.sky[2])) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const p = new GfxPen(g);
  const make = (key: string, w: number, h: number, draw: () => void) => {
    if (scene.textures.exists(key)) return;
    g.clear(); draw(); g.generateTexture(key, w, h);
  };
  const S = LF_SIZE;
  make(LF.needle, S.needle[0], S.needle[1], () => drawNeedle(p));
  LF.fire.forEach((k, i) => make(k, S.fire[0], S.fire[1], () => drawFire(p, i)));
  make(LF.fireOrb, S.fireOrb[0], S.fireOrb[1], () => drawFireOrb(p));
  make(LF.fireBoom, S.fireBoom[0], S.fireBoom[1], () => drawFireBoom(p));
  make(LF.spark, S.spark[0], S.spark[1], () => drawSpark(p));
  make(LF.ring, S.ring[0], S.ring[1], () => drawRing(p));
  make(LF.glow, S.glow[0], S.glow[1], () => drawGlow(p));
  make(LF.scorch, S.scorch[0], S.scorch[1], () => drawScorch(p));
  LF.shock.forEach((k, i) => make(k, S.shock[0], S.shock[1], () => drawShock(p, i)));
  LF.sky.forEach((k, i) => make(k, S.sky[0], S.sky[1], () => drawSky(p, i)));
  g.destroy();
}

// ═════════════════ покадровая анимация снарядов ═════════════════

interface AnimTarget { t: number; img: { texture: { key: string }; setTexture(k: string): unknown } }
const animCache = new Map<string, (p: AnimTarget) => void>();

/**
 * update-колбэк снаряда: перелистывает кадры keys с частотой fps (функция кэшируется — без аллокаций в кадре).
 * Сдвиг фазы — по времени жизни, так что соседние снаряды не мигают синхронно не обязательно; этого достаточно.
 */
export function animFrames(keys: string[], fps: number): (p: AnimTarget) => void {
  const id = keys[0] + fps;
  let f = animCache.get(id);
  if (!f) {
    const n = keys.length;
    f = (p: AnimTarget) => {
      const k = keys[((p.t * fps) | 0) % n];
      if (p.img.texture.key !== k) p.img.setTexture(k);
    };
    animCache.set(id, f);
  }
  return f;
}

/** Осветлить цвет к белому на долю k (0 — без изменений, 1 — белый): магия остаётся светлой при цветных свойствах */
export function lighten(c: number, k: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const f = (v: number) => Math.round(v + (255 - v) * k);
  return (f(r) << 16) | (f(g) << 8) | f(b);
}
