import Phaser from 'phaser';
import { W } from '../../World';

/**
 * Пиксельная графика «Падения звезды» (Meteor). Пользователю этот вид понравился — оставлен как есть.
 * Остальные заклинания зоны перешли на штриховой стиль (_inkfx.ts).
 * Текстуры рисуются кодом по пикселю на маленькой сетке один раз и масштабируются с фильтром NEAREST.
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

let madeFor: Phaser.Scene | null = null;

/** Создать текстуры звезды (один раз на сцену; дальше — дешёвая проверка) */
export function ensureDarkTex() {
  const s = W.scene;
  if (madeFor === s) return;
  madeFor = s;
  make(s, 'dk_ring', 32, 32, ring);
  make(s, 'dk_star', 12, 12, star);
  make(s, 'dk_streak', 28, 5, streak);
  make(s, 'dk_burst', 32, 32, burst);
  make(s, 'dk_crater', 32, 32, crater);
}

/** dk_ring: отношение размера картинки к радиусу кольца (displaySize = R * K) */
export const RING_K = 32 / 14;

/** Случайный поворот, кратный 90° (пиксельная сетка не плывёт) */
export function quarterRot() { return ((Math.random() * 4) | 0) * (Math.PI / 2); }
