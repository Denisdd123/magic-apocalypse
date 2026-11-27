import Phaser from 'phaser';
import { ORIG_U } from '../config';
import type { Effects } from './Effects';

/**
 * Вид мобов 3.0 — рисуем сами по меркам оригинала (MASTER §8 «Графика»).
 * Мерки сняты по пикселям спрайтов EUnit<ID>Motion1 (research/orig_sprites/mobs, скрипт в scratchpad сессии 2026-11-26):
 * [ширина, высота холста px, кадров, внешний радиус тела, внутренний радиус тела, радиус ядра, цвет ядра,
 *  радиус ореола, цвет ореола, заполненность] — радиусы в долях полухолста.
 * Оригинал: чёрное тело из мелких рваных «мазков» (диск, кольцо или звезда), светлое ядро, у части — цветной ореол.
 * Цвет ядра у спрайтов 8/13/14/17/19/24/29/34/42–46 «запечён», остальные белые и подкрашиваются UColor
 * (SpriteRenderer.color умножает весь спрайт: чёрное остаётся чёрным — у нас setTint, то же умножение).
 */
type Metric = readonly [w: number, h: number, frames: number, out: number, inn: number, core: number, coreCol: number, glow: number, glowCol: number, fill: number];
export const MOB_METRIC: Readonly<Record<number, Metric>> = {
  1: [38, 46, 4, 0.71, 0.00, 0.000, 0x000000, 0.00, 0x000000, 0.32],
  4: [205, 205, 3, 0.92, 0.04, 0.031, 0xfefefe, 0.12, 0xb7b7b7, 0.44],
  5: [186, 191, 3, 0.92, 0.08, 0.087, 0xdcdcdc, 0.12, 0x6c6c6c, 0.51],
  6: [61, 86, 6, 0.75, 0.00, 0.000, 0x000000, 0.00, 0x000000, 0.46],
  7: [71, 75, 3, 0.92, 0.17, 0.182, 0xfefefe, 0.00, 0x5b5b5b, 0.50],
  8: [96, 100, 3, 0.54, 0.21, 0.175, 0xfe3030, 0.58, 0x450000, 0.18],
  11: [105, 108, 3, 0.88, 0.12, 0.093, 0xfcfcfc, 0.25, 0x444444, 0.49],
  12: [100, 99, 3, 0.96, 0.42, 0.293, 0xffffff, 0.00, 0x5e5e5e, 0.40],
  13: [122, 125, 3, 0.96, 0.21, 0.241, 0xfde9b1, 0.00, 0x7e7150, 0.43],
  14: [122, 123, 3, 0.88, 0.50, 0.401, 0x4cfe49, 0.50, 0x013100, 0.24],
  16: [132, 145, 3, 0.92, 0.00, 0.000, 0x000000, 0.00, 0x000000, 0.58],
  17: [152, 164, 3, 0.88, 0.00, 0.075, 0xfabc19, 0.00, 0x9f7412, 0.48],
  18: [179, 185, 3, 0.62, 0.04, 0.141, 0xfdf0d0, 0.00, 0x716b61, 0.24],
  19: [205, 205, 3, 0.92, 0.04, 0.071, 0xd33c3c, 0.12, 0xab1212, 0.44],
  21: [184, 185, 3, 0.96, 0.38, 0.409, 0xfefefe, 0.00, 0x767676, 0.49],
  22: [197, 206, 3, 0.96, 0.50, 0.270, 0xfafafa, 0.46, 0xc2c2c2, 0.37],
  23: [225, 225, 3, 0.96, 0.17, 0.198, 0xfefefe, 0.00, 0x828282, 0.55],
  24: [229, 237, 3, 0.62, 0.25, 0.174, 0xfe3c3c, 0.42, 0x460000, 0.20],
  26: [222, 236, 3, 0.92, 0.04, 0.104, 0xfdfdfd, 0.00, 0x5d5d5d, 0.63],
  27: [230, 232, 3, 0.96, 0.33, 0.345, 0xfefefe, 0.00, 0x797979, 0.54],
  28: [236, 246, 3, 0.92, 0.08, 0.216, 0xfdfdfd, 0.00, 0x747474, 0.52],
  29: [354, 364, 3, 0.96, 0.54, 0.298, 0xfe20fe, 0.38, 0x46014b, 0.32],
  31: [100, 99, 3, 0.88, 0.62, 0.234, 0xffffff, 0.33, 0x2b2b2b, 0.20],
  32: [103, 113, 3, 0.92, 0.12, 0.258, 0xfefefe, 0.00, 0x878787, 0.55],
  33: [218, 230, 3, 0.92, 0.08, 0.103, 0xfefefe, 0.00, 0x808080, 0.66],
  34: [186, 191, 3, 0.92, 0.08, 0.093, 0xe74646, 0.17, 0x9b0f0f, 0.51],
  41: [501, 511, 3, 0.96, 0.12, 0.121, 0xfbfbfb, 0.29, 0x848484, 0.63],
  42: [501, 511, 3, 0.96, 0.46, 0.340, 0xfbe571, 0.54, 0x614f02, 0.49],
  43: [501, 511, 3, 0.96, 0.46, 0.335, 0xe74240, 0.54, 0x590000, 0.49],
  44: [263, 490, 3, 0.54, 0.00, 0.075, 0xf33568, 0.00, 0xa51632, 0.24],
  45: [435, 435, 3, 0.96, 0.54, 0.278, 0xfe1414, 0.58, 0x4e0000, 0.35],
  46: [470, 483, 3, 0.71, 0.21, 0.202, 0x2dfdfd, 0.42, 0x034646, 0.23],
};
/** Звёзды (тело — лучи): 8, 18, 24, 44, 46 по листу 02_mobs_bosses */
const STAR: Readonly<Record<number, number>> = { 8: 9, 18: 8, 24: 9, 44: 4, 46: 11 };
/** Спрайт моба по ID (у 35–40 своих картинок в выгрузке нет — ближайшие по виду) */
export const MOB_SPRITE: Readonly<Record<number, number>> = { 35: 26, 36: 27, 37: 28, 38: 23, 39: 17, 40: 33 };

/** Палитра UColor (visual.md §3.2) */
export const UCOLOR: readonly number[] = [0xffffff, 0xff0000, 0xff5e00, 0xffd133, 0xfff5c7, 0xa1ff33, 0x40ff9c, 0x33ffa6, 0x00ffe0, 0x59e0ff, 0xc763ff, 0xff249c, 0x458ce0, 0xffff24];
/** UColorID по паре «моб × зона» (visual.md §3.2; нет записи — белый) */
const UCOLOR_ZONE: Readonly<Record<number, Readonly<Record<number, number>>>> = {
  7: { 2: 1, 3: 5, 5: 6, 7: 12, 9: 9, 10: 3 },
  11: { 1: 1, 2: 1, 4: 1, 8: 7, 11: 10 },
  12: { 5: 6, 7: 12, 9: 9 },
  19: { 8: 7 },
  21: { 1: 1, 2: 1, 3: 13, 5: 6, 7: 8, 8: 7, 9: 12, 10: 4 },
  22: { 6: 4, 10: 13 },
  23: { 4: 10, 5: 3, 8: 10, 11: 10, 13: 1 },
  26: { 4: 1, 6: 13, 8: 1 },
  27: { 2: 11, 5: 13, 9: 8, 13: 1 },
  28: { 3: 5, 7: 8 },
  32: { 3: 5 },
};
export function ucolor(id: number, zone: number): number { return UCOLOR[UCOLOR_ZONE[id]?.[zone] ?? 0]; }

/** Кадры оригинала: sprite_unit/EUnit<N>Motion1..K (полный холст, PPU 100). EUnit1 (холст 64 px) — сглажен ×4 (`_s`, в игре масштаб /4) */
const SMOOTH: Readonly<Record<number, number>> = { 1: 4 };
const mobFile = (sid: number, f: number) => `art/mobs/EUnit${sid}Motion${f + 1}${SMOOTH[sid] ? '_s' : ''}.png`;
/** Смерть: DUnit<ID>DeathMotion1..K — число кадров по выгрузке (у DUnit1 холст 64 px — тоже `_s` ×4) */
const DEATH_FRAMES: Readonly<Record<number, number>> = { 1: 3, 6: 3, 7: 5, 11: 3, 16: 3, 21: 4, 27: 5 };
const deathFile = (id: number, f: number) => `art/mobs/DUnit${id}DeathMotion${f + 1}${SMOOTH[id] ? '_s' : ''}.png`;
export const deathTex = (id: number, f: number) => `du_${id}_${f}`;

/** Список загрузки: [ключ текстуры, путь от public] — все EUnit (мобы зоны 1 + боссы 41–46) и все DUnit */
export const MOB_LOAD: [string, string][] = [
  ...Object.keys(MOB_METRIC).flatMap((k) => Array.from({ length: MOB_METRIC[+k][2] }, (_, f): [string, string] => [`eu_${k}_${f}`, mobFile(+k, f)])),
  ...Object.entries(DEATH_FRAMES).flatMap(([id, n]) => Array.from({ length: n }, (_, f): [string, string] => [deathTex(+id, f), deathFile(+id, f)])),
];

/** Во сколько раз текстура моба крупнее исходника (сглаженные `_s` — ×4; запасные канвас-кадры — ×2 у мелких) */
const texK = new Map<number, number>();
export function mobTexScale(id: number) {
  const sid = MOB_SPRITE[id] ?? id;
  const k = texK.get(sid);
  if (k !== undefined) return k;
  const m = MOB_METRIC[sid];
  return SMOOTH[sid] ?? (m && Math.max(m[0], m[1]) < 160 ? 2 : 1);
}
/** Видимый размер моба (px спрайта, по большей стороне) — для кольца элитки: холст оригинала шире тела */
export function mobVisible(id: number) { const m = MOB_METRIC[MOB_SPRITE[id] ?? id]; return m ? Math.max(m[0], m[1]) : 100; }
export function mobFrames(id: number) { return MOB_METRIC[MOB_SPRITE[id] ?? id]?.[2] ?? 3; }
export const mobTex = (id: number, f: number) => `eu_${MOB_SPRITE[id] ?? id}_${f}`;

/**
 * Смерть (C_Battle_EnemyUnit.Unit_DeathMotion @0x11c4xxx): на Motion_Unit по очереди кадры List_ApplyUnitMotionDeath
 * (DUnit<UnitDeathID>), паузы после кадров 0.05 / 0.06 / 0.05 / 0.04 / 0.03 с, затем Sprite_Trans (пусто).
 * UnitDeathID и «제거 모션 크기» (%) — колонки Dictionary_UnitStat; масштаб = % × 0.01 × те же множители, что у размера моба.
 */
const DEATH: Readonly<Record<number, readonly [id: number, pct: number]>> = {
  1: [1, 180], 6: [6, 185], 7: [7, 125], 8: [21, 70], 11: [11, 160], 12: [21, 70], 13: [21, 70], 14: [21, 70], 16: [16, 70], 17: [16, 80],
  18: [11, 170], 19: [21, 110], 21: [21, 75], 22: [21, 85], 23: [21, 85], 24: [11, 185], 26: [16, 90], 27: [27, 105], 28: [27, 105],
  29: [21, 200], 31: [21, 60], 32: [7, 155], 33: [16, 185], 34: [21, 115], 35: [21, 90], 36: [21, 90], 37: [21, 90], 38: [21, 90],
  39: [21, 110], 40: [21, 110],
};
/** DeathColorID, заданный в Start_Unit (нет записи = −1: цвет смерти = UColor моба) */
const DEATH_COLOR_ID: Readonly<Record<number, number>> = { 8: 1, 11: 0, 13: 4, 14: 5, 19: 1, 26: 0, 29: 11, 34: 1, 35: 1, 36: 1, 37: 1, 38: 1, 39: 1 };
/** DeathColorID → цвет (switch @0x1198228; ID 19 в зоне 8 и 34 в зоне 12 — особые: 7 / 0) */
const DEATH_RGB: Readonly<Record<number, number>> = { 0: 0xffffff, 1: 0xff0000, 4: 0xff00c7, 5: 0xa10033, 7: 0x3300a6, 11: 0xff009c };
const DEATH_ZONE: Readonly<Record<number, Readonly<Record<number, number>>>> = { 19: { 8: 7 }, 34: { 12: 0 } };
export function deathColor(uid: number, zone: number): number {
  const id = DEATH_ZONE[uid]?.[zone] ?? DEATH_COLOR_ID[uid];
  return id === undefined ? ucolor(uid, zone) : DEATH_RGB[id] ?? ucolor(uid, zone);
}
const DEATH_DELAY = [0.05, 0.06, 0.05, 0.04, 0.03];
/** Анимация смерти моба (кроме боссов 41–46: у них «제거 모션ID» = 0, как в оригинале — своей анимации нет). Вернёт false, если анимации нет */
export function mobDeath(fx: Effects, uid: number, x: number, y: number, unitSize: number, baseSizePct: number, zone: number): boolean {
  const d = DEATH[uid];
  if (!d || !baseSizePct) return false;
  const n = DEATH_FRAMES[d[0]];
  const keys = Array.from({ length: n }, (_, f) => deathTex(d[0], f));
  // UnitDeathMotionSize = «제거 모션 크기» × 0.01 × (множители размера: элитка, UVar) — берём отношение размера моба к базовому
  const sz = d[1] * 0.01 * (unitSize / (baseSizePct * 0.01));
  const sc = (ORIG_U / 100) * sz / (SMOOTH[d[0]] ?? 1);
  const tint = deathColor(uid, zone);
  const mid = DEATH_DELAY.slice(1, n - 1);
  fx.anim(x, y, keys, DEATH_DELAY[0], mid.length ? mid.reduce((a, b) => a + b, 0) / mid.length : DEATH_DELAY[1], sc, sc,
    { last: DEATH_DELAY[n - 1], hook: (img) => { img.setTint(tint); } });
  return true;
}

/** детерминированный ГПСЧ */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

/** Нарисовать все кадры моба (если ещё нет) */
export function ensureMobTextures(scene: Phaser.Scene, id: number) {
  const sid = MOB_SPRITE[id] ?? id;
  const m = MOB_METRIC[sid];
  if (texK.has(sid)) return;
  // кадры оригинала загружены в preload (MOB_LOAD) — рисовать нечего
  if (scene.textures.exists(`eu_${sid}_0`)) { texK.set(sid, SMOOTH[sid] ?? 1); return; }
  if (!m) return;
  // запасной путь (MOB_LOAD не подключён): канвас-кадры по мерке
  texK.set(sid, m && Math.max(m[0], m[1]) < 160 ? 2 : 1);
  const [w0, h0, frames, out, inn, core, coreCol, glow, glowCol] = m;
  const k = texK.get(sid) ?? 1, w = w0 * k, h = h0 * k;
  const R = Math.max(w, h) / 2, cx = w / 2, cy = h / 2;
  const star = STAR[sid] ?? 0;
  const r0 = rng(sid * 7919);
  // раскладка мазков (общая для кадров): угол, радиус, размер, вытянутость
  const dabR = Math.max(2.2 * k, R * (sid === 1 || sid === 6 ? 0.16 : 0.085));
  const dabs: [number, number, number, number, number][] = [];
  const rIn = Math.max(0, inn * 0.85) * R, rOut = out * R;
  if (star) {
    const rays = star, rot = r0() * 6.28;
    for (let j = 0; j < rays; j++) {
      const a = rot + (j / rays) * Math.PI * 2 + (r0() - 0.5) * 0.25;
      const len = rOut * (0.75 + r0() * 0.25);
      const n = Math.ceil(len / (dabR * 0.55));
      for (let q = 0; q < n; q++) {
        const t = q / n, d = rIn * 0.5 + (len - rIn * 0.5) * t;
        dabs.push([a + (r0() - 0.5) * 0.12 * (1 - t), d, dabR * (1.25 - t) * (0.7 + r0() * 0.5), 1.3, r0() * 6.28]);
      }
    }
    // плотная середина звезды
    for (let q = 0; q < 26; q++) dabs.push([r0() * 6.28, Math.sqrt(r0()) * Math.max(rIn, core * R * 1.4), dabR * (0.8 + r0() * 0.5), 1.1, r0() * 6.28]);
  } else {
    const area = Math.PI * (rOut * rOut - rIn * rIn);
    const n = Math.min(2600, Math.round((3.3 * area) / (Math.PI * dabR * dabR)));
    for (let q = 0; q < n; q++) {
      const d = Math.sqrt(rIn * rIn + r0() * (rOut * rOut - rIn * rIn));
      // к краю мазки мельче и реже — рваный край
      const edge = (d - rIn) / Math.max(1, rOut - rIn);
      if (edge > 0.85 && r0() < 0.45) continue;
      dabs.push([r0() * 6.28, d, dabR * (0.55 + r0() * 0.7) * (1 - 0.35 * edge), 1.2 + r0() * 0.8, 0]);
    }
  }
  for (let f = 0; f < frames; f++) {
    const tex = scene.textures.createCanvas(`eu_${sid}_${f}`, w, h)!;
    const g = tex.getContext();
    const rf = rng(sid * 31 + f * 977);
    // тело: чёрные рваные мазки (каждый кадр чуть сдвинут — «дрожание»)
    for (const [a, d, s, el, rot] of dabs) {
      const jj = R * 0.025;
      const x = cx + Math.cos(a) * d + (rf() - 0.5) * jj * 2, y = cy + Math.sin(a) * d + (rf() - 0.5) * jj * 2;
      const tang = star ? a : a + Math.PI / 2 + (rf() - 0.5) * 0.6; // вдоль окружности — «вихрь» кольца
      const sh = rf() < 0.06 ? 0x1c1c20 : 0x000000;
      g.fillStyle = css(sh);
      g.beginPath();
      const verts = 10;
      for (let v = 0; v < verts; v++) {
        const t = (v / verts) * Math.PI * 2, rr = s * (0.72 + rf() * 0.33);
        const px = Math.cos(t) * rr * el, py = Math.sin(t) * rr;
        const ca = Math.cos(tang + rot), sa = Math.sin(tang + rot);
        const X = x + px * ca - py * sa, Y = y + px * sa + py * ca;
        if (v === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
      }
      g.closePath(); g.fill();
    }
    // ореол
    if (glow > 0) {
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, glow * R);
      gr.addColorStop(0, css(glowCol, 0.9)); gr.addColorStop(0.5, css(glowCol, 0.45)); gr.addColorStop(1, css(glowCol, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, glow * R, 0, Math.PI * 2); g.fill();
    }
    // ядро: светлое рваное пятно с короткими лучами
    if (core > 0) {
      const cr = core * R;
      g.save();
      // мягкое свечение с яркой серединой (эталон: research/screens/2_moby/moby_zoom_red.png), не плоская заливка
      g.shadowColor = css(coreCol, 0.9); g.shadowBlur = cr * 0.9;
      const cg = g.createRadialGradient(cx, cy, 0, cx, cy, cr * 1.2);
      cg.addColorStop(0, css(0xffffff)); cg.addColorStop(0.25, css(coreCol)); cg.addColorStop(0.7, css(coreCol, 0.75)); cg.addColorStop(1, css(coreCol, 0.15));
      g.fillStyle = cg;
      g.beginPath();
      const verts = 18;
      for (let v = 0; v < verts; v++) {
        const t = (v / verts) * Math.PI * 2, spike = v % 2 === 0 && rf() < 0.45;
        const rr = cr * (spike ? 1.15 + rf() * 0.5 : 0.8 + rf() * 0.2);
        const X = cx + Math.cos(t) * rr, Y = cy + Math.sin(t) * rr;
        if (v === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
      }
      g.closePath(); g.fill();
      g.restore();
    }
    tex.refresh();
  }
}
