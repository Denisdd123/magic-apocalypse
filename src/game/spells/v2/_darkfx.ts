import Phaser from 'phaser';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';

/**
 * Мрачная пиксельная графика заклинаний «spells-b» (Падение звезды, Поле разрядов, Ледяной венец,
 * Кипящая земля, Ледяная буря). Текстуры рисуются кодом по пикселю на маленькой сетке один раз
 * и масштабируются с фильтром NEAREST — крупный «пиксель», без сглаживания, без неона.
 * Повороты лучше брать кратными 90° (quarterRot), чтобы сетка пикселей не «плыла».
 */

/** детерминированный шум 0..1 по целым координатам и зерну */
function hash(x: number, y: number, s: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** -1 — пусто; иначе 0xRRGGBB, непрозрачность задаётся отдельно через A() */
const EMPTY = -1;
/** цвет с прозрачностью a (0..1) */
const A = (col: number, a: number) => col + Math.round(a * 254 + 1) * 0x1000000;

function make(scene: Phaser.Scene, key: string, w: number, h: number, paint: (x: number, y: number) => number) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = paint(x, y);
      if (c < 0) continue;
      const a = c > 0xffffff ? (Math.floor(c / 0x1000000) - 1) / 254 : 1;
      g.fillStyle(c % 0x1000000, a);
      g.fillRect(x, y, 1, 1);
    }
  }
  g.generateTexture(key, w, h);
  g.destroy();
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

const TAU = Math.PI * 2;
const pick = (arr: number[], r: number) => arr[Math.min(arr.length - 1, (r * arr.length) | 0)];

/** Тонкое пиксельное кольцо (серое — красится tint-ом), 32×32, радиус 14 */
function ring(x: number, y: number) {
  const d = Math.hypot(x - 15.5, y - 15.5);
  return Math.abs(d - 14) < 0.62 ? 0xd8d8d8 : EMPTY;
}

/** Кольцо поля разрядов: 48×48, радиус 21, местами с разрывами */
function eRing(x: number, y: number) {
  const d = Math.hypot(x - 23.5, y - 23.5);
  if (Math.abs(d - 21) >= 0.65) return EMPTY;
  return hash(x, y, 3) < 0.14 ? EMPTY : 0xc4c0d4;
}

/** Два коротких рваных штриха на том же радиусе (крутятся рывками поверх кольца) */
function eArc(x: number, y: number) {
  const dx = x - 23.5, dy = y - 23.5, d = Math.hypot(dx, dy);
  let a = Math.atan2(dy, dx); if (a < 0) a += TAU;
  const inA = a < 0.5 || (a > Math.PI + 0.2 && a < Math.PI + 0.62);
  if (!inA) return EMPTY;
  const seg = Math.floor(a * 14);
  const r = 21 + (hash(seg, 0, 5) < 0.5 ? 1 : -1) * 0.9;
  return Math.abs(d - r) < 0.7 ? 0xffffff : EMPTY;
}

/** Голова «звезды»: тёмный рваный камень, тусклая багровая кромка и бледное холодное ядро. 12×12 */
function star(x: number, y: number) {
  const dx = x - 5.5, dy = y - 5.5, d = Math.hypot(dx, dy);
  const a = Math.atan2(dy, dx);
  const rr = 3.9 + hash(Math.floor((a + Math.PI) * 1.6), 1, 7) * 1.6;
  if (d > rr) return EMPTY;
  if (d < 1.2) return 0xd6ccb4;
  if (d < 2.1) return 0x8a7a70;
  if (d > rr - 1.1) return hash(x, y, 8) < 0.6 ? 0x6e2418 : 0x2a1e22;
  return hash(x, y, 9) < 0.5 ? 0x2c2228 : 0x3c3036;
}

/** Хвост падения: узкий пиксельный след вдоль +x (голова справа), от тусклого багрового к пеплу. 28×5 */
function streak(x: number, y: number) {
  const k = x / 27; // 0 — хвост, 1 — голова
  const hw = 0.4 + k * 2.1;
  if (Math.abs(y - 2) > hw) return EMPTY;
  if (k < 0.45 && hash(x, y, 11) > k * 2) return EMPTY; // хвост рассыпается
  const edge = Math.abs(y - 2) > hw - 1;
  if (k > 0.7) return edge ? 0x5a1e16 : 0x8a3420;
  if (k > 0.4) return edge ? A(0x3a2220, 0.85) : 0x5a2a20;
  return A(0x2a2226, 0.7);
}

/** Разлёт обломков: кольцо чанков пепла/камня с редкими тусклыми углями. 32×32 */
function burst(x: number, y: number) {
  const d = Math.hypot(x - 15.5, y - 15.5), h = hash(x, y, 13);
  if (d >= 9 && d <= 15) return h < 0.36 ? pick([0x241a18, 0x3e2620, 0x5e2c1a, 0x8a3e1c], hash(x, y, 14)) : EMPTY;
  if (d < 9) return h < 0.16 ? A(0x3a2a24, 0.7) : EMPTY;
  return EMPTY;
}

/** Кратер: выжженное пятно с рваным краем и тлеющими радиальными трещинами. 32×32 */
function crater(x: number, y: number) {
  const dx = x - 15.5, dy = y - 15.5, d = Math.hypot(dx, dy);
  const a = Math.atan2(dy, dx);
  const rr = 12.5 + hash(Math.floor((a + Math.PI) * 2.2), 2, 15) * 2.5;
  if (d > rr) return EMPTY;
  const k = (a + Math.PI) / TAU * 7, off = Math.abs(k - Math.round(k)) * TAU / 7 * d;
  if (d > 2.5 && d < rr - 1.5 && off < 0.7 + (d < 6 ? 0.3 : 0)) return d < 7 ? 0x8a3a16 : 0x5e2412;
  if (d > rr - 1.2) return A(0x2e221e, 0.8);
  if (d < 3) return 0x3a1a12;
  return hash(x, y, 16) < 0.5 ? A(0x1a1312, 0.92) : A(0x221816, 0.92);
}

/** Ледяной венец: кольцо рваных пиксельных шипов, тёмная сталь с бледными остриями. 48×48 */
function frost(x: number, y: number) {
  const dx = x - 23.5, dy = y - 23.5, d = Math.hypot(dx, dy);
  let a = Math.atan2(dy, dx); if (a < 0) a += TAU;
  const N = 14, sec = TAU / N;
  const kk = Math.round(a / sec), ki = ((kk % N) + N) % N;
  const delta = Math.abs(a - kk * sec);
  // чередование: большие и малые шипы, длина с шумом
  const L = ki % 2 === 0 ? 18 + hash(ki, 0, 21) * 5 : 14.5 + hash(ki, 0, 22) * 2;
  const base = 10;
  if (d >= base && d <= L) {
    const half = (L - d) * 0.3 + 0.45;
    const off = delta * d;
    if (off < half) {
      if (d > L - 2.2) return 0xb4c6d4;
      if (off < 0.75) return 0x6e88a2;
      return 0x34485e;
    }
  }
  if (d > base - 1.6 && d < base + 0.4) return hash(x, y, 23) < 0.25 ? EMPTY : 0x283a4e;
  if (d < base - 1.6 && hash(x, y, 24) < 0.05) return A(0x4a6078, 0.6);
  return EMPTY;
}

/** Ледяная игла вдоль +x (остриё справа). 18×5 */
function icicle(x: number, y: number) {
  const hw = x < 3 ? x / 3 : x < 13 ? 1.25 : (17 - x) * 0.32;
  const o = Math.abs(y - 2);
  if (o > hw + 0.01) return EMPTY;
  if (x >= 14) return 0xa6b8c8;
  if (x < 3) return 0x222c3a;
  return o < 0.5 ? 0x6a86a0 : 0x2c3c52;
}

/** Ледяная звезда (507): четырёхлучевой пиксельный крест. 15×15 */
function iceStar(x: number, y: number) {
  const dx = Math.abs(x - 7), dy = Math.abs(y - 7);
  if (dx <= 1 && dy <= 1) return dx + dy === 0 ? 0xc8d4dc : 0x8aa2b8;
  if ((dx === 0 && dy <= 7) || (dy === 0 && dx <= 7)) return Math.max(dx, dy) > 5 ? 0x34465c : 0x6a84a0;
  if ((dx === 1 && dy <= 4) || (dy === 1 && dx <= 4)) return 0x2c3c50;
  if (dx === 2 && dy === 2) return 0x3c5068;
  return EMPTY;
}

/**
 * Магмовая лужа, кадр f (0/1): рваный край, тёмная корка, трещины по сетке Вороного тлеют,
 * пара пузырей. Кадры отличаются тем, какие трещины тлеют ярче и где пузыри. 36×36
 */
function lava(f: number) {
  const C = 7; // размер ячейки корки
  return (x: number, y: number) => {
    const dx = x - 17.5, dy = y - 17.5, d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const rr = 14.6 + hash(Math.floor((a + Math.PI) * 2.6), 4, 31) * 2.6;
    if (d > rr) return EMPTY;
    if (d > rr - 1.1) return 0x140a08; // тёмная кромка
    // пузыри
    for (let b = 0; b < 3; b++) {
      const bx = 9 + hash(b, f, 41) * 18, by = 9 + hash(b, f, 42) * 18;
      const bd = Math.max(Math.abs(x - bx), Math.abs(y - by));
      if (bd < 0.6) return 0xb85a1e;
      if (bd < 1.6) return 0x5a2410;
    }
    // Вороной: расстояния до двух ближайших точек
    const cx = Math.floor(x / C), cy = Math.floor(y / C);
    let d1 = 1e9, d2 = 1e9, i1 = 0, i2 = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const gx = cx + i, gy = cy + j;
        const px = (gx + 0.15 + hash(gx, gy, 33) * 0.7) * C, py = (gy + 0.15 + hash(gx, gy, 34) * 0.7) * C;
        const dd = Math.hypot(x - px, y - py), id = gx * 31 + gy;
        if (dd < d1) { d2 = d1; i2 = i1; d1 = dd; i1 = id; } else if (dd < d2) { d2 = dd; i2 = id; }
      }
    }
    if (d2 - d1 < 1.1) {
      const hot = hash(Math.min(i1, i2), Math.max(i1, i2), 35 + f) > 0.55;
      return d < 7 ? (hot ? 0xa8461a : 0x7a2c12) : hot ? 0x8a3614 : 0x4e1c10;
    }
    if (d < 5) return hash(x, y, 36) < 0.5 ? 0x3a1810 : 0x44200f;
    return hash(x, y, 37) < 0.55 ? 0x241210 : 0x2e1612;
  };
}

let madeFor: Phaser.Scene | null = null;

/** Создать все текстуры (один раз на сцену; дальше — дешёвая проверка) */
export function ensureDarkTex() {
  const s = W.scene;
  if (madeFor === s) return;
  madeFor = s;
  make(s, 'dk_ring', 32, 32, ring);
  make(s, 'dk_ering', 48, 48, eRing);
  make(s, 'dk_earc', 48, 48, eArc);
  make(s, 'dk_star', 12, 12, star);
  make(s, 'dk_streak', 28, 5, streak);
  make(s, 'dk_burst', 32, 32, burst);
  make(s, 'dk_crater', 32, 32, crater);
  make(s, 'dk_frost', 48, 48, frost);
  make(s, 'dk_icicle', 18, 5, icicle);
  make(s, 'dk_icestar', 15, 15, iceStar);
  make(s, 'dk_lava0', 36, 36, lava(0));
  make(s, 'dk_lava1', 36, 36, lava(1));
}

/** dk_ring / dk_ering: отношение размера картинки к радиусу кольца (displaySize = R * K) */
export const RING_K = 32 / 14;
export const ERING_K = 48 / 21;
/** dk_lava*: видимый диаметр лужи в пикселях текстуры (из 36) */
export const LAVA_D = 32;

/** Случайный поворот, кратный 90° (пиксельная сетка не плывёт) */
export function quarterRot() { return ((Math.random() * 4) | 0) * (Math.PI / 2); }

/** Только заморозка, без корки на мобе (подсветку делает Enemies.freeze) */
export function freezeOnly(e: Enemy, sec: number) { W.enemies.freeze(e, sec); }
