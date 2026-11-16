import Phaser from 'phaser';

// Мобы 2.0 — плоские тёмные пиксельные силуэты без ног и глаз (в духе оригинала: чёрные «рваные» кляксы,
// звёзды, вихри со светящимся ядром). Рисуются кодом при запуске.
//
// Для каждого типа создаются кадры 'en_<имя>_0', '_1', '_2' (3 кадра «кипящей» кромки / дыхания ядра)
// и 'en_<имя>' (= кадр 0, на всякий случай). Enemies.ts сам видит '_0' и крутит кадры ~4 в секунду,
// обычным мобам даёт случайный поворот — поэтому силуэты рядовых мобов почти круглые/лучевые.
// Боссов не поворачивают — их формы могут быть вытянуты по вертикали.
//
// Техника: поле на сетке g×g клеток (x,y ∈ [-1,1]) → индекс палитры, затем увеличение ×s без сглаживания
// (чёткие пиксели), обводка-кромка по границе (видно на тёмной карте) и мягкий отсвет ядра поверх тела.

/** Индексы палитры поля */
const EMPTY = 0, BODY = 1, FLECK = 2, CORE = 3, HOT = 4;

type Field = (x: number, y: number, f: number, i: number, j: number) => number;

interface MobDef {
  g: number;            // клеток по стороне
  s: number;            // пикселей на клетку
  core: number;         // цвет ядра
  glow: [number, number, number][]; // отсветы: x, y (в [-1,1]), радиус (доля полустороны)
  field: Field;
}

const BODY_COL = 0x0d0b12;   // почти чёрный с фиолетом
const FLECK_COL = 0x26212e;  // тёмно-серые «прожилки» внутри тела
const RIM_BASE = 0x3a3444;   // основа кромки, подмешивается цвет ядра

// ---------- шум ----------

/** Детерминированный хэш → [0,1) */
function hash(n: number, seed: number) {
  const v = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** Гладкий периодический шум по углу: lobes опорных точек на окружности */
function anoise(a: number, lobes: number, seed: number) {
  const t = ((a / (Math.PI * 2)) % 1 + 1) % 1 * lobes;
  const i = Math.floor(t), fr = t - i;
  const v0 = hash(i % lobes, seed), v1 = hash((i + 1) % lobes, seed);
  const k = (1 - Math.cos(fr * Math.PI)) / 2;
  return v0 + (v1 - v0) * k;
}

/** Рваный радиус: общая форма + «кипящая» по кадрам добавка */
function rag(a: number, base: number, amp: number, lobes: number, seed: number, f: number) {
  const n = 0.65 * anoise(a, lobes, seed) + 0.35 * anoise(a, lobes * 2, seed + 17 + f * 31);
  return base * (1 + amp * (n - 0.5));
}

/** Профиль луча звезды: 1 на оси луча, 0 между лучами; p — острота */
function spike(a: number, n: number, rot: number, p: number) {
  return Math.pow(Math.abs(Math.cos(((a - rot) * n) / 2)), p);
}

/** Угловое расстояние (0..π) */
function adist(a: number, b: number) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

/** Светящееся ядро: горячий центр, ядро, точечный (дизеринг) ореол */
function core(d: number, cr: number, f: number, i: number, j: number) {
  const r = cr * (1 + 0.1 * Math.sin(f * 2.1));
  if (d < r * 0.45) return HOT;
  if (d < r) return CORE;
  if (d < r * 1.35 && (i + j) % 2 === 0) return CORE;
  return EMPTY;
}

/** Пиксельная «рвань» кромки: мелкий шум радиуса по клеткам, свой на каждый кадр */
function jit(i: number, j: number, f: number) {
  return 0.07 * (hash(i * 19 + j * 113 + f * 7, 21) - 0.5);
}

/** Тело с редкими прожилками */
function body(i: number, j: number, f: number, p = 0.07) {
  return hash(i * 53 + j * 7 + f * 3, 9) < p ? FLECK : BODY;
}

// ---------- силуэты ----------

const DEFS: Record<string, MobDef> = {
  // Миньон: рваная чёрная клякса с тусклым тёплым ядром
  minion: {
    g: 40, s: 3, core: 0xfff0c0, glow: [[0, 0, 0.45]],
    field: (x, y, f, i, j) => {
      const d = Math.hypot(x, y), a = Math.atan2(y, x);
      const c = core(d, 0.17, f, i, j); if (c) return c;
      return d < rag(a, 0.86, 0.34, 11, 1, f) + jit(i, j, f) ? body(i, j, f) : EMPTY;
    },
  },
  // Стингер: восьмилучевая колючая звезда, красное ядро
  stinger: {
    g: 40, s: 3, core: 0xff2a3a, glow: [[0, 0, 0.5]],
    field: (x, y, f, i, j) => {
      const d = Math.hypot(x, y), a = Math.atan2(y, x);
      const c = core(d, 0.2, f, i, j); if (c) return c;
      const R = rag(a, 0.44, 0.25, 11, 2, f) + 0.52 * (1 + 0.06 * Math.sin(f * 2.09)) * spike(a, 8, f * 0.06, 6);
      return d < R ? body(i, j, f) : EMPTY;
    },
  },
  // Рой (мелочь): три сросшихся комочка с оранжевыми искрами
  swarm_s: {
    g: 28, s: 3, core: 0xff8a3a, glow: [[0, 0, 0.5]],
    field: (x, y, f, i, j) => {
      for (let k = 0; k < 3; k++) {
        const ang = k * 2.094 + f * 0.15;
        const bx = x - Math.cos(ang) * 0.42, by = y - Math.sin(ang) * 0.42;
        const d = Math.hypot(bx, by), a = Math.atan2(by, bx);
        const c = core(d, 0.1, f + k, i, j); if (c) return c;
        if (d < rag(a, 0.52, 0.35, 7, 3 + k, f) + jit(i, j, f)) return BODY;
      }
      return EMPTY;
    },
  },
  // Рой (средний): вихрь из трёх рукавов вокруг огненного ядра
  swarm_m: {
    g: 40, s: 3, core: 0xff4a1a, glow: [[0, 0, 0.5]],
    field: (x, y, f, i, j) => {
      const d = Math.hypot(x, y), a = Math.atan2(y, x);
      const c = core(d, 0.17, f, i, j); if (c) return c;
      if (d < rag(a, 0.6, 0.3, 8, 4, f)) return body(i, j, f);
      if (d > 0.98) return EMPTY;
      for (let k = 0; k < 3; k++) {
        const arm = k * 2.094 + d * 3.2 + f * 0.25;
        if (adist(a, arm) < 0.9 * (1.05 - d) + 0.05) return BODY;
      }
      return EMPTY;
    },
  },
  // Рой (большой): плотный пятирукавный вихрь с янтарными искрами внутри
  swarm_l: {
    g: 44, s: 3, core: 0xffb04a, glow: [[0, 0, 0.55]],
    field: (x, y, f, i, j) => {
      const d = Math.hypot(x, y), a = Math.atan2(y, x);
      const c = core(d, 0.22, f, i, j); if (c) return c;
      let on = d < rag(a, 0.66, 0.25, 10, 5, f);
      if (!on && d < 0.98) {
        for (let k = 0; k < 5; k++) {
          const arm = k * 1.2566 + d * 2.6 + f * 0.2;
          if (adist(a, arm) < 0.7 * (1.05 - d) + 0.05) { on = true; break; }
        }
      }
      if (!on) return EMPTY;
      return hash(i * 31 + j * 17 + f, 5) < 0.04 ? CORE : body(i, j, f);
    },
  },
  // Серафим: венец из двенадцати перьев-лезвий вокруг белого ядра
  seraph: {
    g: 44, s: 3, core: 0xffffff, glow: [[0, 0, 0.6]],
    field: (x, y, f, i, j) => {
      const d = Math.hypot(x, y), a = Math.atan2(y, x);
      const c = core(d, 0.24, f, i, j); if (c) return c;
      if (d < rag(a, 0.5, 0.2, 9, 6, f)) return body(i, j, f);
      if (d > 0.97) return EMPTY;
      for (let k = 0; k < 12; k++) {
        const bl = k * 0.5236 + 0.12 * d + f * 0.04;
        if (adist(a, bl) < 0.15 * (1 - d) + 0.04) return BODY;
      }
      return EMPTY;
    },
  },
  // Штурмовик: тяжёлая многослойная туша с разорванными кольцами и большим красным ядром
  assault: {
    g: 56, s: 3, core: 0xff2a3a, glow: [[0, 0, 0.6]],
    field: (x, y, f, i, j) => {
      const d = Math.hypot(x, y), a = Math.atan2(y, x);
      const c = core(d, 0.27, f, i, j); if (c) return c;
      if (d > rag(a, 0.93, 0.2, 14, 7, f) + jit(i, j, f)) return EMPTY;
      // разорванные «швы» между слоями
      if (Math.abs(d - 0.66) < 0.035 && anoise(a, 9, 8 + f) > 0.4) return FLECK;
      if (Math.abs(d - 0.44) < 0.03 && anoise(a, 7, 9 + f) > 0.45) return FLECK;
      return body(i, j, f, 0.05);
    },
  },
  // Перехватчик: острый четырёхлучевой крест (наконечник) с короткими лучами между
  interceptor: {
    g: 40, s: 3, core: 0xffb02a, glow: [[0, 0, 0.5]],
    field: (x, y, f, i, j) => {
      const d = Math.hypot(x, y), a = Math.atan2(y, x);
      const c = core(d, 0.16, f, i, j); if (c) return c;
      const pulse = 1 + 0.05 * Math.sin(f * 2.09);
      const R = rag(a, 0.36, 0.2, 8, 10, f) + 0.6 * pulse * spike(a, 4, 0, 12) + 0.24 * spike(a, 4, Math.PI / 4, 14);
      return d < R ? body(i, j, f) : EMPTY;
    },
  },
  // Улей: бугристая масса с бледными сотами, соты по очереди тлеют
  hive: {
    g: 44, s: 3, core: 0xe8e2c8, glow: [[0, 0, 0.35]],
    field: (x, y, f, i, j) => {
      const d = Math.hypot(x, y), a = Math.atan2(y, x);
      if (d > rag(a, 0.88, 0.22, 7, 11, f) + jit(i, j, f)) return EMPTY;
      if (d < 0.11) return f === 1 ? HOT : CORE;
      for (let k = 0; k < 6; k++) {
        const ca = k * 1.0472 + 0.3;
        const cd = Math.hypot(x - Math.cos(ca) * 0.5, y - Math.sin(ca) * 0.5);
        if (cd < 0.1) return k % 3 === f ? CORE : FLECK;
      }
      return body(i, j, f, 0.04);
    },
  },
  // Скарабей: овальный панцирь со швом посередине и короткими жвалами; холодное ядро
  scarab: {
    g: 36, s: 3, core: 0xe8f0ff, glow: [[0, 0.1, 0.4]],
    field: (x, y, f, i, j) => {
      const br = 1 + 0.04 * Math.sin(f * 2.09);
      const ex = x / (0.66 * br), ey = (y - 0.08) / 0.84;
      const d = Math.hypot(ex, ey), a = Math.atan2(ey, ex);
      const dc = Math.hypot(x, y - 0.12);
      const c = core(dc, 0.15, f, i, j); if (c) return c;
      if (d < rag(a, 1, 0.12, 10, 12, f)) return Math.abs(x) < 0.05 && y > -0.5 ? FLECK : body(i, j, f, 0.05);
      // рог впереди панциря (узкий клин)
      if (y < -0.6 && y > -0.97 && Math.abs(x) < (y + 0.97) * 0.35) return BODY;
      return EMPTY;
    },
  },
  // Мина: шар с короткими шипами, ядро вспыхивает на третьем кадре
  mine: {
    g: 40, s: 3, core: 0xfff4d6, glow: [[0, 0, 0.5]],
    field: (x, y, f, i, j) => {
      const d = Math.hypot(x, y), a = Math.atan2(y, x);
      const c = core(d, f === 2 ? 0.24 : 0.17, f, i, j); if (c) return c;
      if (d < rag(a, 0.64, 0.12, 12, 13, f)) return body(i, j, f);
      const len = f === 2 ? 0.96 : 0.9;
      if (d < len) for (let k = 0; k < 10; k++) {
        if (adist(a, k * 0.6283) < 0.11 * (len - d) / 0.3 + 0.02) return BODY;
      }
      return EMPTY;
    },
  },
  // Вой: толстое рваное кольцо, из багрового ядра расходятся трещины
  oculus: {
    g: 44, s: 3, core: 0xff3040, glow: [[0, 0, 0.55]],
    field: (x, y, f, i, j) => {
      const d = Math.hypot(x, y), a = Math.atan2(y, x);
      const c = core(d, 0.22, f, i, j); if (c) return c;
      if (d > rag(a, 0.94, 0.2, 13, 14, f) + jit(i, j, f)) return EMPTY;
      for (let k = 0; k < 7; k++) {
        const ca = k * 0.8976 + f * 0.05 + 0.3 * hash(k, 15);
        if (d < 0.35 + 0.35 * hash(k, 16) && adist(a, ca) * d < 0.025) return CORE;
      }
      return body(i, j, f);
    },
  },

  // ---------- боссы (не поворачиваются, крупнее, сложнее) ----------

  // Цитадель: вертикальный шпиль-кристалл с поперечной перекладиной и багровым ядром
  citadel: {
    g: 72, s: 4, core: 0xff2a3a, glow: [[0, -0.12, 0.45]],
    field: (x, y, f, i, j) => {
      const dc = Math.hypot(x, y + 0.12), a = Math.atan2(y + 0.12, x);
      const c = core(dc, 0.13, f, i, j); if (c) return c;
      // тонкие багровые лучи-трещины от ядра
      if (dc < 0.5 && (Math.abs(x) < 0.015 || Math.abs(y + 0.12) < 0.015)) return CORE;
      const n = 0.06 * (anoise(a, 16, 20 + f) - 0.5);
      const spire = Math.abs(x) / (0.36 + n) + Math.abs(y + 0.02) / 0.97 < 1;
      const bar = Math.abs(x) / (0.78 + n) + Math.abs(y + 0.2) / 0.2 < 1;
      const mass = dc < rag(a, 0.55, 0.35, 12, 21, f) + jit(i, j, f);
      if (!(spire || bar || mass)) {
        // осколки, парящие у основания шпиля
        for (let k = 0; k < 4; k++) {
          const sx = (k < 2 ? -1 : 1) * (0.42 + (k % 2) * 0.16), sy = 0.42 + (k % 2) * 0.22 + 0.03 * Math.sin(f * 2.09 + k);
          if (Math.abs(x - sx) / 0.06 + Math.abs(y - sy) / 0.16 < 1) return BODY;
        }
        return EMPTY;
      }
      return body(i, j, f, 0.05);
    },
  },
  // Немезида: огромный шестирукавный вихрь, по орбите кружат шипы-осколки; фиолетовые ядра
  nemesis: {
    g: 72, s: 4, core: 0xd040ff, glow: [[0, 0, 0.5], [-0.42, 0.3, 0.18], [0.36, -0.44, 0.18]],
    field: (x, y, f, i, j) => {
      const d = Math.hypot(x, y), a = Math.atan2(y, x);
      const c = core(d, 0.22, f, i, j); if (c) return c;
      const c1 = core(Math.hypot(x + 0.42, y - 0.3), 0.06, f, i, j); if (c1) return c1;
      const c2 = core(Math.hypot(x - 0.36, y + 0.44), 0.06, f, i, j); if (c2) return c2;
      if (d < rag(a, 0.6, 0.24, 12, 30, f) + jit(i, j, f)) return body(i, j, f);
      if (d < 0.86) for (let k = 0; k < 6; k++) {
        if (adist(a, k * 1.0472 + d * 2.8 + f * 0.18) < 0.7 * (0.92 - d) + 0.04) return BODY;
      }
      // орбитальные шипы
      for (let k = 0; k < 8; k++) {
        const oa = k * 0.7854 + f * 0.13;
        const ox = x - Math.cos(oa) * 0.88, oy = y - Math.sin(oa) * 0.88;
        const t = ox * Math.cos(oa) + oy * Math.sin(oa), nn = -ox * Math.sin(oa) + oy * Math.cos(oa);
        if (Math.abs(t) / 0.1 + Math.abs(nn) / 0.035 < 1) return BODY;
      }
      return EMPTY;
    },
  },
  // Апостол: многолучевая звезда в разорванном нимбе, золотые лучи от ядра
  apostle: { g: 72, s: 4, core: 0xffe8a0, glow: [[0, 0, 0.55]], field: apostleField(12, 40, false) },
  // Апостол багровый (финал): больше лучей, двойной нимб
  apostle_red: { g: 72, s: 4, core: 0xff2a3a, glow: [[0, 0, 0.6]], field: apostleField(14, 50, true) },
};

function apostleField(n: number, seed: number, dbl: boolean): Field {
  return (x, y, f, i, j) => {
    const d = Math.hypot(x, y), a = Math.atan2(y, x);
    const c = core(d, 0.2, f, i, j); if (c) return c;
    // лучи света от ядра
    if (d < 0.55) for (let k = 0; k < n / 2; k++) if (adist(a, (k * Math.PI * 4) / n + 0.13) * d < 0.012) return CORE;
    // нимб из штрихов, медленно вращается по кадрам
    const halo = (r0: number, w: number, dash: number, rot: number) =>
      Math.abs(d - r0) < w && ((((a + rot) / (Math.PI * 2)) * dash) % 1 + 1) % 1 < 0.7;
    if (halo(0.9, 0.04, 16, f * 0.06) || (dbl && halo(0.74, 0.025, 10, -f * 0.08))) return BODY;
    const R = rag(a, 0.34, 0.25, 14, seed, f) + 0.38 * (1 + 0.05 * Math.sin(f * 2.09)) * spike(a, n, -Math.PI / 2, 5);
    return d < R ? body(i, j, f, 0.05) : EMPTY;
  };
}

// ---------- запекание ----------

const hexA = (c: number, a: number) =>
  `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function mix(a: number, b: number, t: number) {
  const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t;
  const g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t;
  const bl = (a & 255) * (1 - t) + (b & 255) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** Один кадр: поле → пиксели → увеличение без сглаживания → отсвет ядра */
function bakeFrame(def: MobDef, f: number): HTMLCanvasElement {
  const G = def.g;
  const idx = new Uint8Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const x = ((i + 0.5) / G) * 2 - 1, y = ((j + 0.5) / G) * 2 - 1;
    idx[j * G + i] = def.field(x, y, f, i, j);
  }
  const rim = mix(RIM_BASE, def.core, 0.3);
  const hot = mix(def.core, 0xffffff, 0.6);
  const pal = [0, BODY_COL, FLECK_COL, def.core, hot];
  const small = document.createElement('canvas'); small.width = small.height = G;
  const sctx = small.getContext('2d')!;
  const img = sctx.createImageData(G, G);
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= G || j >= G ? EMPTY : idx[j * G + i]);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const v = idx[j * G + i];
    if (v === EMPTY) continue;
    let col = pal[v];
    // кромка: тёмные клетки на границе с пустотой подсвечены — силуэт читается на тёмной земле
    if ((v === BODY || v === FLECK) && (!at(i - 1, j) || !at(i + 1, j) || !at(i, j - 1) || !at(i, j + 1))) col = rim;
    const o = (j * G + i) * 4;
    img.data[o] = (col >> 16) & 255; img.data[o + 1] = (col >> 8) & 255; img.data[o + 2] = col & 255; img.data[o + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);

  const S = G * def.s;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, S, S);
  // мягкий отсвет ядра только по телу (source-atop) — тёмная масса вокруг ядра чуть окрашена
  ctx.globalCompositeOperation = 'source-atop';
  const pulse = 1 + 0.08 * Math.sin(f * 2.1);
  for (const [gx, gy, gr] of def.glow) {
    const cx = ((gx + 1) / 2) * S, cy = ((gy + 1) / 2) * S, r = (gr * S) / 2 * pulse;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, hexA(def.core, 0.45)); grd.addColorStop(0.5, hexA(def.core, 0.14)); grd.addColorStop(1, hexA(def.core, 0));
    ctx.fillStyle = grd; ctx.fillRect(0, 0, S, S);
  }
  ctx.globalCompositeOperation = 'source-over';
  return cv;
}

function putTex(scene: Phaser.Scene, key: string, cv: HTMLCanvasElement) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, cv);
}

/** Создаёт текстуры мобов en_<имя>, en_<имя>_0.._2 (заменяет старые с теми же ключами) */
export function makeMobArt(scene: Phaser.Scene) {
  for (const [name, def] of Object.entries(DEFS)) {
    for (let f = 0; f < 3; f++) {
      const cv = bakeFrame(def, f);
      putTex(scene, `en_${name}_${f}`, cv);
      if (f === 0) {
        // отдельная копия под базовый ключ (одна канва на две текстуры Phaser не делится)
        const c0 = document.createElement('canvas'); c0.width = cv.width; c0.height = cv.height;
        c0.getContext('2d')!.drawImage(cv, 0, 0);
        putTex(scene, 'en_' + name, c0);
      }
    }
  }
}
