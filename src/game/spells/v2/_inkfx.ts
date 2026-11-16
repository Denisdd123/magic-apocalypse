import type Phaser from 'phaser';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';

/**
 * Штриховая графика заклинаний «spells-b» (Чёрный прилив, Смерч, Ледяной венец, Поле разрядов,
 * Кипящая земля, Ледяная буря). Тёмное фэнтези «наполовину реалистичное»: каждый эффект нарисован
 * множеством тонких полупрозрачных линий, наложенных друг на друга (струи, штриховка, росчерки),
 * светлая магия хорошо видна на тёмной карте.
 * Текстуры рисуются кодом в Canvas 2D (сглаженные линии) ОДИН раз на сцену, по нескольку кадров;
 * в бою только переключение ключа текстуры — без аллокаций.
 */

type Ctx = CanvasRenderingContext2D;
type RGB = readonly [number, number, number];
const TAU = Math.PI * 2;

/** детерминированный ГСЧ (mulberry32) — одинаковый рисунок при каждом запуске */
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

const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

/** Создать canvas-текстуру key и нарисовать её (если ещё нет) */
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

/** Группа текстур создаётся один раз на сцену; дальше ensure* — одно сравнение */
const madeFor = new Map<string, Phaser.Scene>();
function once(group: string, make: () => void) {
  const s = W.scene;
  if (madeFor.get(group) === s) return;
  madeFor.set(group, s);
  make();
}

/** Неровная окружность: несколько полупрозрачных проходов с дрожанием радиуса (линия «от руки») */
function inkCircle(c: Ctx, r: () => number, cx: number, cy: number, R: number, jit: number, col: RGB, a: number, lw: number) {
  const n = 72, p1 = r() * TAU, p2 = r() * TAU, k1 = 2 + ((r() * 3) | 0), k2 = 5 + ((r() * 4) | 0);
  c.strokeStyle = rgba(col, a); c.lineWidth = lw;
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * TAU;
    const rr = R + jit * (0.6 * Math.sin(k1 * t + p1) + 0.4 * Math.sin(k2 * t + p2));
    const x = cx + Math.cos(t) * rr, y = cy + Math.sin(t) * rr;
    if (i) c.lineTo(x, y); else c.moveTo(x, y);
  }
  c.stroke();
}

/** Ломаная молния между углами a0..a1 на радиусе R (центр cx,cy), с дрожанием dr */
function jagArc(c: Ctx, r: () => number, cx: number, cy: number, R: number, a0: number, a1: number, dr: number, pts: number[]) {
  pts.length = 0;
  const n = Math.max(3, Math.ceil(Math.abs(a1 - a0) / 0.07));
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const rr = R + (i === 0 || i === n ? 0 : (r() * 2 - 1) * dr);
    pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  strokePts(c, pts);
}

function strokePts(c: Ctx, pts: number[]) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.stroke();
}

// ───────────────────────────── Чёрный прилив: волна ─────────────────────────────

interface WavePal { deep: RGB; mid: RGB; light: RGB; foam: RGB }
const WATER: WavePal = { deep: [12, 34, 54], mid: [52, 112, 150], light: [150, 205, 235], foam: [236, 248, 255] };
const MAGMA: WavePal = { deep: [60, 14, 8], mid: [160, 54, 18], light: [240, 138, 52], foam: [255, 232, 176] };

/** Размеры волны: длина по +x (движется вправо), ширина поперёк; WAVE_ACROSS — видимая ширина гребня */
export const WAVE_LEN = 256, WAVE_H = 160, WAVE_ACROSS = 150;
/** точка «центра удара» на картинке (доля длины): гребень впереди неё */
export const WAVE_OX = 0.6;
export const WAVE_TEX = ['ink_wave0', 'ink_wave1', 'ink_wave2'];
export const WAVE_TEX_LAVA = ['ink_lwave0', 'ink_lwave1', 'ink_lwave2'];

/**
 * Кадр волны: тело — десятки длинных волнистых струй (тёмная вода, светлые блики), сходящихся к гребню;
 * гребень — пучок белых линий пены с завитками, впереди — брызги, за гребнем — штриховка белой воды.
 */
function drawWave(c: Ctx, f: number, P: WavePal) {
  const r = rng(101 + f * 17);
  const cy = WAVE_H / 2, half = 70, xf = 214;
  const front = (y: number) => xf - 50 * Math.pow(Math.min(1, Math.abs(y - cy) / half), 2.2);
  // 1) тело: длинные струи от хвоста к гребню
  for (let i = 0; i < 110; i++) {
    const v = r() * 2 - 1, y0 = cy + v * half * 0.96;
    const fx = front(y0) - 3 - r() * 12;
    const L = 60 + r() * 130 * (1 - Math.abs(v) * 0.45);
    const x0 = fx - L;
    const layer = r();
    const col = layer < 0.42 ? P.deep : layer < 0.82 ? P.mid : P.light;
    const lw = layer < 0.42 ? 3 + r() * 4 : layer < 0.82 ? 1.1 + r() * 1.2 : 0.6 + r() * 0.7;
    const a = layer < 0.42 ? 0.35 : layer < 0.82 ? 0.5 : 0.75;
    const g = c.createLinearGradient(x0, 0, fx, 0);
    g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.55, rgba(col, a * 0.55)); g.addColorStop(1, rgba(col, a));
    c.strokeStyle = g; c.lineWidth = lw;
    const amp = 1.5 + r() * 3, ph = r() * TAU + f * 2.1, k = 0.035 + r() * 0.03;
    c.beginPath();
    for (let s = 0; s <= 14; s++) {
      const t = s / 14, x = x0 + L * t;
      const yy = y0 + Math.sin(ph + x * k) * amp * (1 - t * 0.6) - (y0 - cy) * (1 - t) * 0.15;
      if (s) c.lineTo(x, yy); else c.moveTo(x, yy);
    }
    c.stroke();
  }
  // 2) белая вода за гребнем: короткие штрихи пены
  for (let i = 0; i < 70; i++) {
    const y = cy + (r() * 2 - 1) * half * 0.9, x = front(y) - 4 - r() * 34;
    const l = 4 + r() * 10, dy = (r() - 0.5) * 2;
    c.strokeStyle = rgba(r() < 0.5 ? P.foam : P.light, 0.25 + r() * 0.45); c.lineWidth = 0.6 + r() * 0.9;
    c.beginPath(); c.moveTo(x - l, y - dy); c.lineTo(x, y + dy); c.stroke();
  }
  // 3) гребень: мягкое свечение + пучок линий пены
  c.shadowColor = rgba(P.light, 0.9); c.shadowBlur = 8;
  for (let p = 0; p < 8; p++) {
    const glow = p < 2;
    c.strokeStyle = rgba(glow ? P.light : P.foam, glow ? 0.22 : 0.5 + r() * 0.45);
    c.lineWidth = glow ? 8 - p * 3 : 0.7 + r() * 1.5;
    const off = glow ? -2 : -p * 1.6 - r() * 4;
    c.beginPath();
    for (let s = 0; s <= 26; s++) {
      const y = cy - half * 0.98 + (half * 1.96 * s) / 26;
      const x = front(y) + off + (r() - 0.5) * 2.4;
      if (s) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.stroke();
    if (p === 1) c.shadowBlur = 0;
  }
  c.shadowBlur = 0;
  // 4) завитки гребня (росчерки, загибающиеся вперёд и вбок)
  for (let i = 0; i < 18; i++) {
    const y = cy + (r() * 2 - 1) * half * 0.85, x = front(y);
    const s = 5 + r() * 9, side = r() < 0.5 ? -1 : 1;
    c.strokeStyle = rgba(P.foam, 0.55 + r() * 0.45); c.lineWidth = 0.7 + r() * 1.2;
    c.beginPath();
    c.moveTo(x - s * 1.6, y + (r() - 0.5) * 3);
    c.quadraticCurveTo(x + s * 1.1, y + side * s * 0.2, x + s * 0.1, y + side * s * 0.85);
    c.stroke();
  }
  // 5) брызги впереди гребня: короткие штрихи и точки
  for (let i = 0; i < 46; i++) {
    const y = cy + (r() * 2 - 1) * half * 0.95, x = front(y) + 2 + r() * 20;
    const l = 1.5 + r() * 5, ang = (r() - 0.5) * 0.8;
    c.strokeStyle = rgba(P.foam, 0.35 + r() * 0.55); c.lineWidth = 0.6 + r() * 1.0;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); c.stroke();
  }
}

export function ensureInkWave() {
  once('wave', () => { for (let f = 0; f < 3; f++) {
    tex(WAVE_TEX[f], WAVE_LEN, WAVE_H, (c) => drawWave(c, f, WATER));
    tex(WAVE_TEX_LAVA[f], WAVE_LEN, WAVE_H, (c) => drawWave(c, f, MAGMA));
  } });
}

// ───────────────────────────── Смерч: вихрь ─────────────────────────────

interface SwirlPal { deep: RGB; mid: RGB; light: RGB; core: RGB }
const WIND: SwirlPal = { deep: [110, 130, 160], mid: [180, 200, 222], light: [232, 240, 250], core: [255, 255, 255] };
const VOID: SwirlPal = { deep: [34, 14, 54], mid: [110, 70, 170], light: [214, 192, 255], core: [245, 236, 255] };

/** вихрь: размер картинки 192, видимый диаметр ≈ 176 */
export const CYC_D = 176;
export const CYC_TEX = ['ink_cyc0', 'ink_cyc1', 'ink_cyc2'];
export const CYC_TEX_VOID = ['ink_vcyc0', 'ink_vcyc1', 'ink_vcyc2'];

/**
 * Кадр вихря: ~170 закрученных росчерков разной длины и толщины, каждый сужается к концам и втягивается
 * к центру; плотнее и ярче к середине, снаружи — редкая «пыль». Кадры — разное дрожание (оживляет вращение).
 */
function drawCyclone(c: Ctx, f: number, P: SwirlPal, dark: boolean) {
  const r = rng(200 + f * 31 + (dark ? 7 : 0)), C = 96, RMAX = 86;
  if (dark) {
    // тёмное тело пустоты
    const g = c.createRadialGradient(C, C, 4, C, C, RMAX);
    g.addColorStop(0, rgba(P.deep, 0.75)); g.addColorStop(0.6, rgba(P.deep, 0.35)); g.addColorStop(1, rgba(P.deep, 0));
    c.fillStyle = g; c.beginPath(); c.arc(C, C, RMAX, 0, TAU); c.fill();
  } else {
    const g = c.createRadialGradient(C, C, 0, C, C, 34);
    g.addColorStop(0, rgba(P.core, 0.55)); g.addColorStop(1, rgba(P.core, 0));
    c.fillStyle = g; c.beginPath(); c.arc(C, C, 34, 0, TAU); c.fill();
  }
  const SEG = 10;
  for (let i = 0; i < 170; i++) {
    const kOut = Math.pow(r(), 0.85), rho = 6 + kOut * (RMAX - 8);
    const th0 = r() * TAU, span = 0.45 + r() * 1.4 * (0.5 + kOut);
    const pull = 6 + r() * 6; // втягивание к центру, px на радиан
    const lr = r();
    const col = lr < 0.3 ? P.deep : lr < 0.72 ? P.mid : P.light;
    const a = (0.3 + 0.6 * r()) * (1 - kOut * 0.5);
    const lw = (0.6 + r() * 2.2) * (0.55 + kOut * 0.8);
    c.strokeStyle = rgba(col, a);
    let px = 0, py = 0;
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG, th = th0 + span * t, rr = Math.max(2, rho - pull * span * t);
      const x = C + Math.cos(th) * rr, y = C + Math.sin(th) * rr;
      if (s) {
        c.lineWidth = lw * (0.25 + Math.sin(Math.PI * t) * 0.9); // росчерк сужается к концам
        c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke();
      }
      px = x; py = y;
    }
  }
  // яркое закрученное ядро
  c.shadowColor = rgba(P.light, 0.9); c.shadowBlur = 6;
  for (let i = 0; i < 9; i++) {
    const th0 = r() * TAU, rho = 6 + r() * 12;
    c.strokeStyle = rgba(P.core, 0.55 + r() * 0.4); c.lineWidth = 0.8 + r();
    c.beginPath();
    for (let s = 0; s <= 8; s++) {
      const th = th0 + s * 0.3, rr = Math.max(1, rho - s * 1.2);
      const x = C + Math.cos(th) * rr, y = C + Math.sin(th) * rr;
      if (s) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.stroke();
  }
  c.shadowBlur = 0;
  // внешняя пыль: короткие касательные штрихи
  for (let i = 0; i < 40; i++) {
    const th = r() * TAU, rr = RMAX - 6 + r() * 8, l = 0.08 + r() * 0.15;
    c.strokeStyle = rgba(P.mid, 0.2 + r() * 0.3); c.lineWidth = 0.6 + r() * 0.6;
    c.beginPath(); c.arc(C, C, rr, th, th + l); c.stroke();
  }
}

export function ensureInkCyclone() {
  once('cyc', () => { for (let f = 0; f < 3; f++) {
    tex(CYC_TEX[f], 192, 192, (c) => drawCyclone(c, f, WIND, false));
    tex(CYC_TEX_VOID[f], 192, 192, (c) => drawCyclone(c, f, VOID, true));
  } });
}

// ───────────────────────────── Общие: кольцо, иней ─────────────────────────────

/** ink_ring: светлое «рукописное» кольцо (красится tint-ом). 128×128, радиус 56 */
export const RING_K = 128 / 56;

function drawRing(c: Ctx) {
  const r = rng(77);
  inkCircle(c, r, 64, 64, 56, 1.2, [255, 255, 255], 0.12, 6);
  for (let p = 0; p < 7; p++) inkCircle(c, r, 64, 64, 56 + (r() - 0.5) * 3, 1.6, [255, 255, 255], 0.25 + r() * 0.4, 0.6 + r() * 1.1);
}

/** ink_frost0/1: ледяной венец — кольцо штриховых осколков. 256×256; кончики на ≈0.92 полуширины */
const ICE_DEEP: RGB = [70, 120, 170], ICE_MID: RGB = [150, 200, 235], ICE_LIGHT: RGB = [220, 242, 255], WHITE: RGB = [255, 255, 255];

function drawFrost(c: Ctx, f: number) {
  const r = rng(300 + f * 13), C = 128, N = 18, baseR = 56;
  // холодная вспышка изнутри: тонкие радиальные линии
  for (let i = 0; i < 60; i++) {
    const a = r() * TAU, r0 = 6 + r() * 20, r1 = baseR - 4 - r() * 14;
    c.strokeStyle = rgba(ICE_MID, 0.1 + r() * 0.18); c.lineWidth = 0.6 + r() * 0.6;
    c.beginPath(); c.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0); c.lineTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1); c.stroke();
  }
  // кольца инея у основания
  for (let p = 0; p < 5; p++) inkCircle(c, r, C, C, baseR + (r() - 0.5) * 6, 2, p < 2 ? ICE_MID : ICE_LIGHT, 0.25 + r() * 0.3, 0.6 + r() * 0.9);
  // осколки
  for (let k = 0; k < N; k++) {
    const big = (k + f) % 2 === 0;
    const a = (k / N) * TAU + (r() - 0.5) * 0.14;
    const L = big ? 98 + r() * 20 : 74 + r() * 16, hw = big ? 10 + r() * 3 : 6 + r() * 3, rb = baseR - 6;
    const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
    const bx = C + ux * rb, by = C + uy * rb, tx = C + ux * L, ty = C + uy * L;
    // лёгкая заливка тела
    c.fillStyle = rgba(ICE_DEEP, 0.22);
    c.beginPath(); c.moveTo(bx - nx * hw, by - ny * hw); c.lineTo(tx, ty); c.lineTo(bx + nx * hw, by + ny * hw); c.closePath(); c.fill();
    // штриховка вдоль осколка: линии от основания к острию
    for (let j = 0; j <= 6; j++) {
      const t = (j / 6) * 2 - 1;
      const sx = bx + nx * hw * t * 0.9, sy = by + ny * hw * t * 0.9;
      const e = 0.55 + r() * 0.4; // не все штрихи доходят до острия
      c.strokeStyle = rgba(j % 3 === 0 ? ICE_LIGHT : ICE_MID, 0.3 + r() * 0.35); c.lineWidth = 0.5 + r() * 0.6;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + (tx - sx) * e, sy + (ty - sy) * e); c.stroke();
    }
    // кромки — светлые, с мягким свечением
    c.shadowColor = rgba(ICE_LIGHT, 0.9); c.shadowBlur = 5;
    c.strokeStyle = rgba(ICE_LIGHT, 0.85); c.lineWidth = 1 + r() * 0.5;
    c.beginPath(); c.moveTo(bx - nx * hw, by - ny * hw); c.lineTo(tx, ty); c.lineTo(bx + nx * hw, by + ny * hw); c.stroke();
    // осевой блик к острию
    c.strokeStyle = rgba(WHITE, 0.95); c.lineWidth = 0.9;
    c.beginPath(); c.moveTo(C + ux * (rb + (L - rb) * 0.35), C + uy * (rb + (L - rb) * 0.35)); c.lineTo(tx, ty); c.stroke();
    c.shadowBlur = 0;
    // боковые отростки-иней на больших осколках
    if (big) {
      for (const sd of [-1, 1]) {
        const m = 0.35 + r() * 0.3, px = bx + (tx - bx) * m + nx * sd * hw * (1 - m) * 0.9, py = by + (ty - by) * m + ny * sd * hw * (1 - m) * 0.9;
        const l = 7 + r() * 7;
        c.strokeStyle = rgba(ICE_LIGHT, 0.6); c.lineWidth = 0.7;
        c.beginPath(); c.moveTo(px, py); c.lineTo(px + (ux * 0.7 + nx * sd * 0.7) * l, py + (uy * 0.7 + ny * sd * 0.7) * l); c.stroke();
      }
    }
  }
  // мелкие кристаллы между осколками
  for (let i = 0; i < 30; i++) {
    const a = r() * TAU, rr = baseR + 6 + r() * 26, l = 3 + r() * 6;
    const x = C + Math.cos(a) * rr, y = C + Math.sin(a) * rr;
    c.strokeStyle = rgba(ICE_LIGHT, 0.35 + r() * 0.4); c.lineWidth = 0.6;
    c.beginPath(); c.moveTo(x - Math.cos(a) * l * 0.5, y - Math.sin(a) * l * 0.5); c.lineTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5); c.stroke();
  }
}

/** Ледяной венец и разрыв льдинки */
export function ensureInkFrost() {
  once('frost', () => {
    tex('ink_ring', 128, 128, drawRing);
    tex('ink_frost0', 256, 256, (c) => drawFrost(c, 0));
    tex('ink_frost1', 256, 256, (c) => drawFrost(c, 1));
  });
}

// ───────────────────────────── Поле разрядов ─────────────────────────────

/** ink_ering: кольцо поля, 256×256, радиус 112 */
export const ERING_K = 256 / 112;
/** ink_eball: шар-заряд, 64×64, радиус 26 */
export const EBALL_K = 64 / 26;
export const EARC_TEX = ['ink_earc0', 'ink_earc1', 'ink_earc2'];
const VIOLET: RGB = [196, 184, 255], PALE_V: RGB = [236, 230, 255];

function drawERing(c: Ctx) {
  const r = rng(410);
  inkCircle(c, r, 128, 128, 112, 1.5, VIOLET, 0.1, 7);
  for (let p = 0; p < 9; p++) inkCircle(c, r, 128, 128, 112 + (r() - 0.5) * 3, 2, p % 3 ? VIOLET : PALE_V, 0.18 + r() * 0.3, 0.5 + r() * 1.0);
  // треск: короткие касательные штрихи по кольцу
  for (let i = 0; i < 60; i++) {
    const a = r() * TAU, l = 0.03 + r() * 0.06, rr = 112 + (r() - 0.5) * 6;
    c.strokeStyle = rgba(PALE_V, 0.35 + r() * 0.5); c.lineWidth = 0.6 + r() * 0.7;
    c.beginPath(); c.arc(128, 128, rr, a, a + l); c.stroke();
  }
}

const tmpPts: number[] = [];

/** Пара бегущих разрядов на кольце (ломаные молнии с ответвлениями) */
function drawEArc(c: Ctx, f: number) {
  const r = rng(420 + f * 9);
  const arcs = [0, 0.7, Math.PI + 0.2, Math.PI + 0.75];
  for (let k = 0; k < 4; k += 2) {
    const a0 = arcs[k] + (r() - 0.5) * 0.1, a1 = arcs[k + 1] + (r() - 0.5) * 0.1;
    const seed = r() * 1e6;
    // три прохода по одной и той же ломаной: свечение, цветной, белая сердцевина
    const passes: [RGB, number, number][] = [[VIOLET, 0.18, 6], [VIOLET, 0.7, 2], [WHITE, 1, 0.9]];
    for (const [col, a, lw] of passes) {
      const rr = rng(seed);
      c.strokeStyle = rgba(col, a); c.lineWidth = lw;
      jagArc(c, rr, 128, 128, 112, a0, a1, 5, tmpPts);
    }
    // ответвления
    for (let b = 0; b < 3; b++) {
      const a = a0 + (a1 - a0) * r(), dir = r() < 0.5 ? -1 : 1;
      let x = 128 + Math.cos(a) * 112, y = 128 + Math.sin(a) * 112;
      c.strokeStyle = rgba(PALE_V, 0.6 + r() * 0.3); c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(x, y);
      for (let s = 0; s < 3; s++) {
        const d = 4 + r() * 5;
        x += Math.cos(a) * d * dir + (r() - 0.5) * 6; y += Math.sin(a) * d * dir + (r() - 0.5) * 6;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  }
}

function drawEBall(c: Ctx) {
  const r = rng(430), C = 32;
  const g = c.createRadialGradient(C, C, 0, C, C, 14);
  g.addColorStop(0, rgba(WHITE, 0.9)); g.addColorStop(1, rgba(VIOLET, 0));
  c.fillStyle = g; c.beginPath(); c.arc(C, C, 14, 0, TAU); c.fill();
  for (let p = 0; p < 5; p++) inkCircle(c, r, C, C, 26 + (r() - 0.5) * 2, 1.5, p < 2 ? VIOLET : PALE_V, 0.3 + r() * 0.4, 0.6 + r() * 0.8);
  for (let i = 0; i < 7; i++) {
    const a = r() * TAU;
    let x = C + Math.cos(a) * 5, y = C + Math.sin(a) * 5;
    c.strokeStyle = rgba(PALE_V, 0.7 + r() * 0.3); c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(x, y);
    for (let s = 0; s < 4; s++) { x += Math.cos(a) * 5 + (r() - 0.5) * 5; y += Math.sin(a) * 5 + (r() - 0.5) * 5; c.lineTo(x, y); }
    c.stroke();
  }
}

export function ensureInkEzone() {
  once('ezone', () => {
    tex('ink_ering', 256, 256, drawERing);
    for (let f = 0; f < 3; f++) tex(EARC_TEX[f], 256, 256, (c) => drawEArc(c, f));
    tex('ink_eball', 64, 64, drawEBall);
  });
}

// ───────────────────────────── Кипящая земля ─────────────────────────────

/** ink_lava0/1: магмовая лужа 192×192, видимый диаметр ≈ 172 */
export const LAVA_D = 172;
export const LAVA_TEX = ['ink_lava0', 'ink_lava1'];

/**
 * Лужа: тёмная корка (заливка + штриховка плит + рваная кромка из многих линий),
 * по ней — ветвящиеся тлеющие трещины в три прохода (багровое свечение, оранжевый, жёлто-белая нить).
 * Геометрия у кадров общая, отличается накал трещин и пузыри — лужа «дышит».
 */
function drawLava(c: Ctx, f: number) {
  const r = rng(500), rf = rng(510 + f * 5), C = 96;
  const p1 = r() * TAU, p2 = r() * TAU, p3 = r() * TAU;
  const R = (t: number) => 76 + 5 * Math.sin(3 * t + p1) + 4 * Math.sin(5 * t + p2) + 2.5 * Math.sin(9 * t + p3);
  const blob = () => {
    c.beginPath();
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * TAU, rr = R(t);
      if (i) c.lineTo(C + Math.cos(t) * rr, C + Math.sin(t) * rr); else c.moveTo(C + Math.cos(t) * rr, C + Math.sin(t) * rr);
    }
    c.closePath();
  };
  const g = c.createRadialGradient(C, C, 4, C, C, 86);
  g.addColorStop(0, 'rgba(58,18,10,0.96)'); g.addColorStop(0.7, 'rgba(32,11,8,0.94)'); g.addColorStop(1, 'rgba(18,7,6,0.9)');
  c.fillStyle = g; blob(); c.fill();
  c.save(); blob(); c.clip();
  // штриховка плит корки
  for (let p = 0; p < 18; p++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 62, px = C + Math.cos(a) * d, py = C + Math.sin(a) * d;
    const ang = r() * Math.PI, ca = Math.cos(ang), sa = Math.sin(ang), n = 5 + ((r() * 5) | 0);
    c.strokeStyle = rgba([78, 30, 18], 0.35 + r() * 0.25); c.lineWidth = 0.7;
    for (let j = 0; j < n; j++) {
      const o = (j - n / 2) * 2.4, l = 6 + r() * 8;
      const x = px - sa * o, y = py + ca * o;
      c.beginPath(); c.moveTo(x - ca * l, y - sa * l); c.lineTo(x + ca * l, y + sa * l); c.stroke();
    }
  }
  // трещины: ветвящиеся ломаные из центра наружу
  const cracks: number[][] = [];
  const grow = (x: number, y: number, a: number, len: number, depth: number) => {
    const pts = [x, y];
    for (let s = 0; s < len; s++) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a) * (6 + r() * 5); y += Math.sin(a) * (6 + r() * 5);
      pts.push(x, y);
      if (depth < 2 && r() < 0.22) grow(x, y, a + (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.6), (len - s) >> 1, depth + 1);
    }
    cracks.push(pts);
  };
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + r() * 0.6, d = 6 + r() * 14;
    grow(C + Math.cos(a) * d, C + Math.sin(a) * d, a, 7 + ((r() * 4) | 0), 0);
  }
  for (const pts of cracks) {
    const heat = 0.35 + 0.65 * rf(); // накал трещины зависит от кадра
    c.strokeStyle = rgba([170, 40, 14], 0.3 * heat); c.lineWidth = 6; strokePts(c, pts);
    c.strokeStyle = rgba([235, 100, 30], 0.75 * heat + 0.15); c.lineWidth = 1.8; strokePts(c, pts);
    c.strokeStyle = rgba([255, 222, 150], 0.9 * heat); c.lineWidth = 0.7; strokePts(c, pts);
  }
  // пузыри и угольки
  for (let b = 0; b < 4; b++) {
    const a = rf() * TAU, d = rf() * 55, x = C + Math.cos(a) * d, y = C + Math.sin(a) * d, br = 2 + rf() * 3;
    c.strokeStyle = rgba([255, 150, 60], 0.75); c.lineWidth = 0.9;
    c.beginPath(); c.arc(x, y, br, 0, TAU); c.stroke();
    c.strokeStyle = rgba([255, 230, 170], 0.6); c.lineWidth = 0.6;
    c.beginPath(); c.arc(x - br * 0.3, y - br * 0.3, br * 0.4, 0, TAU); c.stroke();
  }
  c.restore();
  // рваная кромка: несколько проходов тёмно-багровых линий по контуру
  for (let p = 0; p < 6; p++) {
    const jit = (r() - 0.5) * 3;
    c.strokeStyle = rgba(p < 3 ? [20, 8, 6] : [110, 32, 16], 0.45 + r() * 0.3); c.lineWidth = 0.7 + r() * 1.5;
    c.beginPath();
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * TAU, rr = R(t) + jit + (r() - 0.5) * 1.6;
      if (i) c.lineTo(C + Math.cos(t) * rr, C + Math.sin(t) * rr); else c.moveTo(C + Math.cos(t) * rr, C + Math.sin(t) * rr);
    }
    c.stroke();
  }
}

export function ensureInkLava() {
  once('lava', () => { for (let f = 0; f < 2; f++) tex(LAVA_TEX[f], 192, 192, (c) => drawLava(c, f)); });
}

// ───────────────────────────── Ледяная буря ─────────────────────────────

/** ink_needle: тёмная ледяная игла вдоль +x, остриё справа. 96×16 */
function drawNeedle(c: Ctx) {
  const r = rng(600), cy = 8, tip = 94, x0 = 44, xm = 60, hw = 3.6;
  // след движения
  for (let i = 0; i < 6; i++) {
    const y = cy + (r() - 0.5) * 7, xs = r() * 20, xe = 52 + r() * 10;
    const g = c.createLinearGradient(xs, 0, xe, 0);
    g.addColorStop(0, rgba(ICE_MID, 0)); g.addColorStop(1, rgba(ICE_MID, 0.45));
    c.strokeStyle = g; c.lineWidth = 0.6 + r() * 0.5;
    c.beginPath(); c.moveTo(xs, y); c.lineTo(xe, y); c.stroke();
  }
  // тёмное тело
  c.fillStyle = 'rgba(34,58,84,0.9)';
  c.beginPath(); c.moveTo(x0, cy); c.lineTo(xm, cy - hw); c.lineTo(tip, cy); c.lineTo(xm, cy + hw); c.closePath(); c.fill();
  // штриховка граней
  for (let j = 1; j < 5; j++) {
    const o = (j / 5 - 0.5) * hw * 1.6;
    c.strokeStyle = rgba(ICE_MID, 0.45); c.lineWidth = 0.5;
    c.beginPath(); c.moveTo(xm - 6, cy + o); c.lineTo(tip - 4, cy + o * 0.2); c.stroke();
  }
  // светлые кромки и осевой блик
  c.shadowColor = rgba(ICE_LIGHT, 0.9); c.shadowBlur = 3;
  c.strokeStyle = rgba(ICE_LIGHT, 0.9); c.lineWidth = 0.8;
  c.beginPath(); c.moveTo(x0, cy); c.lineTo(xm, cy - hw); c.lineTo(tip, cy); c.lineTo(xm, cy + hw); c.closePath(); c.stroke();
  c.strokeStyle = rgba(WHITE, 1); c.lineWidth = 0.7;
  c.beginPath(); c.moveTo(xm - 2, cy); c.lineTo(tip, cy); c.stroke();
  c.shadowBlur = 0;
}

/** ink_icestar: шестилучевая снежинка штрихами (507). 64×64 */
function drawIceStar(c: Ctx) {
  const r = rng(610), C = 32, L = 28;
  const g = c.createRadialGradient(C, C, 0, C, C, 12);
  g.addColorStop(0, rgba(WHITE, 0.85)); g.addColorStop(1, rgba(ICE_LIGHT, 0));
  c.fillStyle = g; c.beginPath(); c.arc(C, C, 12, 0, TAU); c.fill();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU, ux = Math.cos(a), uy = Math.sin(a);
    const passes: [RGB, number, number][] = [[ICE_MID, 0.25, 4], [ICE_LIGHT, 0.85, 1.6], [WHITE, 1, 0.7]];
    for (const [col, al, lw] of passes) {
      c.strokeStyle = rgba(col, al); c.lineWidth = lw;
      c.beginPath(); c.moveTo(C + ux * 3, C + uy * 3); c.lineTo(C + ux * L, C + uy * L); c.stroke();
    }
    for (const m of [0.45, 0.7]) {
      const px = C + ux * L * m, py = C + uy * L * m, l = (1 - m) * 14 + r() * 2;
      for (const sd of [-1, 1]) {
        const b = a + sd * 0.8;
        c.strokeStyle = rgba(ICE_LIGHT, 0.8); c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(b) * l, py + Math.sin(b) * l); c.stroke();
      }
    }
  }
}

export function ensureInkBlizzard() {
  ensureInkFrost();
  once('bliz', () => {
    tex('ink_needle', 96, 16, drawNeedle);
    tex('ink_icestar', 64, 64, drawIceStar);
  });
}

/** Только заморозка, без корки на мобе (подсветку делает Enemies.freeze) */
export function freezeOnly(e: Enemy, sec: number) { W.enemies.freeze(e, sec); }
