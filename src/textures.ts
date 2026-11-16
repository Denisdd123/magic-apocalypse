import Phaser from 'phaser';

// Процедурная графика (рисуется кодом при запуске) + подготовка картинок 2.0 для мира (makeWorldV2).
// Стиль: оливковая земля с «каракулями», чёрные силуэты-враги, белые светящиеся заклинания.

type G = Phaser.GameObjects.Graphics;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function glow(g: G, x: number, y: number, r: number, color: number, steps = 8, maxA = 0.5) {
  for (let i = steps; i >= 1; i--) {
    g.fillStyle(color, (maxA / steps) * (steps - i + 1) * 0.5);
    g.fillCircle(x, y, (r * i) / steps);
  }
}

/** Чернильный клубок: плотное ядро + много коротких штрихов наружу */
function inkBlob(g: G, cx: number, cy: number, R: number) {
  g.fillStyle(0x0e0e10, 1);
  g.fillCircle(cx, cy, R * 0.6);
  for (let k = 0; k < 26; k++) {
    const a = rnd(0, Math.PI * 2), d = rnd(R * 0.35, R * 0.62);
    g.fillCircle(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rnd(R * 0.12, R * 0.24));
  }
  for (let k = 0; k < 110; k++) {
    const a = rnd(0, Math.PI * 2);
    const r0 = R * rnd(0.3, 0.55), r1 = R * rnd(0.7, 1.0);
    const da = rnd(-0.25, 0.25);
    g.lineStyle(rnd(1.2, 2.6), 0x0e0e10, 1);
    g.lineBetween(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a + da) * r1, cy + Math.sin(a + da) * r1);
  }
}

/**
 * Маг: высокая шляпа, плащ с рваным подолом, цветная окантовка и светящийся камень.
 * f — кадр «дыхания» (0..3): подол и плащ слегка колышутся, как в рисованной анимации.
 * Базовый размер 32x44, s — масштаб.
 */
function witch(g: G, s: number, color: number, f = 0, accent = -1) {
  const sw = Math.sin((f / 4) * Math.PI * 2);        // покачивание
  const sw2 = Math.cos((f / 4) * Math.PI * 2);
  const P = (x: number, y: number) => new Phaser.Math.Vector2(x * s, y * s);
  g.fillStyle(color, 1);
  // шляпа с загнутым концом
  g.fillPoints([P(11.5, 17), P(20.5, 17), P(18.5, 7), P(20 + sw * 0.5, 2.5), P(23.5 + sw * 0.8, 3.5), P(17.5, 1.5), P(15, 7)], true);
  g.fillEllipse(16 * s, 17.5 * s, 15 * s, 2.6 * s);
  // плащ: колышущийся рваный подол
  const hem = [P(9 + sw2 * 0.6, 41), P(11, 39 + sw * 0.7), P(12.8, 42.5), P(14.5, 40 - sw * 0.7), P(16, 43), P(17.5, 40 + sw * 0.7), P(19.2, 42.5), P(21, 39 - sw * 0.7), P(23 - sw2 * 0.6, 41)];
  g.fillPoints([P(16, 15), P(18.8, 19), P(20.8, 26), P(22.3 + sw * 0.4, 33), ...hem.reverse(), P(9.7 - sw * 0.4, 33), P(11.2, 26), P(13.2, 19)], true);
  if (accent >= 0) {
    // цветная полоса по центру плаща и светящийся камень на шляпе
    g.fillStyle(accent, 0.9);
    g.fillPoints([P(15.6, 20), P(16.4, 20), P(16.8, 40), P(15.2, 40)], true);
    g.fillStyle(accent, 0.3); g.fillCircle(16 * s, 14.5 * s, 2.2 * s);
    g.fillStyle(0xffffff, 1); g.fillCircle(16 * s, 14.5 * s, 0.9 * s);
    // глаза
    g.fillStyle(accent, 1); g.fillCircle(15 * s, 20.4 * s, 0.55 * s); g.fillCircle(17 * s, 20.4 * s, 0.55 * s);
  }
}

const v = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

/**
 * Позы мага по направлению движения — замер спрайтов оригинала (AUnit1Motion1..21, research/orig_videos/mage_motion.md):
 * наклон оси / вытянутость: стоит 2°/2.2, вверх-вниз 1°/3.2, диагональ ~22°/2.3, вбок ~40°/2.4 (короче и шире, не «огурец»).
 */
export const POSES = {
  idle: { rot: 0,    nx: 1.35, trail: 0,    ny: 0.9  },   // широкий треугольник
  vert: { rot: 0,    nx: 1.0,  trail: 0,    ny: 0.95 },   // узкий, плащ поджат
  diag: { rot: 0.25, nx: 1.15, trail: 0.12, ny: 0.88 },   // ~22°
  side: { rot: 0.42, nx: 1.25, trail: 0.28, ny: 0.85 },   // ~39°, короче и шире (не «огурец»)
};
export type Pose = keyof typeof POSES;

/**
 * Маг в позе (холст 96x96, фигура 32x44 ед. ×2, центр фигуры в (48,52)). Смотрит вправо (влево — flipX).
 * Чёрный силуэт как в оригинале: остроконечная шляпа с широкими полями (кончик заламывается назад на бегу),
 * мантия с рваным подолом, рукав и посох с бледным кристаллом. f — кадр дрожания подола (0..2).
 * Посох наклоняется вдвое меньше корпуса — так бег вбок читается, а фигура не «падает».
 */
function witchPose(g: G, f: number, pose: Pose, color = 0x0b0b0d) {
  const { rot, nx, trail, ny } = POSES[pose];
  const sw = Math.sin((f / 3) * Math.PI * 2), sw2 = Math.cos((f / 3) * Math.PI * 2);
  const c = Math.cos(rot), si = Math.sin(rot);
  const c2 = Math.cos(rot * 0.45), s2 = Math.sin(rot * 0.45);
  // корпус: ниже плеч фигура шире (nx), подол уносит назад (trail)
  const P = (x: number, y: number) => {
    let dx = (x - 16) * (y > 18 ? nx : 1);
    if (y > 28) dx -= (y - 28) * trail * 1.6;
    const dy = (y - 26) * ny;
    return v(48 + (dx * c - dy * si) * 2, 52 + (dx * si + dy * c) * 2);
  };
  // посох и кисть: свой (меньший) наклон, без расширения
  const Q = (x: number, y: number) => {
    const dx = x - 16, dy = (y - 26) * ny;
    return v(48 + (dx * c2 - dy * s2) * 2, 52 + (dx * s2 + dy * c2) * 2);
  };
  const sx = 16 + 7.6 * nx; // x посоха
  // посох (позади рукава)
  g.lineStyle(3, color, 1);
  g.lineBetween(Q(sx + 0.4, 6.5).x, Q(sx + 0.4, 6.5).y, Q(sx - 0.6, 44).x, Q(sx - 0.6, 44).y);
  g.fillStyle(0xaee3ff, 1); // бледный кристалл навершия
  g.fillPoints([Q(sx + 0.4, 4.2), Q(sx + 1.5, 6.6), Q(sx + 0.4, 9), Q(sx - 0.7, 6.6)], true);
  g.fillStyle(color, 1);
  // мантия
  const k = 1 + trail;
  const hem = [P(8.6 + sw2 * 0.7 * k, 41), P(10.6, 39 + sw * 0.9 * k), P(12.6, 42.6 + sw2 * 0.5 * k), P(14.4, 40 - sw * 0.9 * k), P(16, 43.2), P(17.6, 40 + sw * 0.9 * k), P(19.4, 42.6 - sw2 * 0.5 * k), P(21.4, 39 - sw * 0.9 * k), P(23.4 - sw2 * 0.7 * k, 41)];
  g.fillPoints([P(16, 17), P(18.4, 19.2), P(19.8, 21.4), P(21.2, 27), P(22.8 + sw * 0.4, 34), ...hem.reverse(), P(9.2 - sw * 0.4, 34), P(10.8, 27), P(12.2, 21.4), P(13.6, 19.2)], true);
  // рукав к посоху
  g.fillPoints([P(18.4, 20.2), P(20.2, 21.2), Q(sx + 0.6, 24.7), Q(sx + 0.2, 27.1), P(19.6, 25)], true);
  // шляпа: поля + конус
  g.fillPoints([P(8, 18.1), P(11, 16.7), P(16, 16.1), P(21, 16.7), P(24, 18.1), P(21, 19.3), P(16, 19.7), P(11, 19.3)], true);
  const tip = 18.6 - trail * 5 + sw * 0.4;
  g.fillPoints([P(11.9, 17), P(20.1, 17), P(18.6, 11.5), P(17.6, 7), P(tip, 0.8 + trail * 2), P(15.8, 6.6), P(14.4, 11.5)], true);
}

// ---------------- Графика 2.0 для мира (public/v2/world) ----------------

type Core = [number, number, number, number]; // x, y (в координатах исходника 256), радиус, цвет

/**
 * Мобы 2.0 — чёрные силуэты (альфа по инверсии, поэтому светлое «ядро» стало дыркой).
 * Подкладываем под картинку мягкое свечение — сквозь дырку снова светится ядро, как в оригинале.
 * Картинка обрезается по содержимому в квадрат — size в ENEMY_TYPES = видимый размер.
 * Ключ результата: 'en_<имя>'. Если исходника нет — процедурная клякса.
 */
const MOBS_V2: Record<string, { src: string; core?: Core[] }> = {
  swarm_s: { src: 'mob_swarm_s', core: [[138, 135, 9, 0xff8a3a], [108, 135, 9, 0xff8a3a]] },
  swarm_m: { src: 'mob_swarm_m', core: [[111, 124, 22, 0xff4a1a]] },
  swarm_l: { src: 'mob_swarm_l', core: [[127, 157, 22, 0xffb04a]] },
  minion: { src: 'mob_minion', core: [[134, 133, 22, 0xfff0c0], [152, 106, 11, 0xfff0c0], [112, 106, 11, 0xfff0c0]] },
  stinger: { src: 'mob_stinger', core: [[128, 128, 30, 0xff2a3a]] },
  interceptor: { src: 'mob_interceptor', core: [[129, 116, 16, 0xffb02a]] },
  hive: { src: 'mob_hive', core: [[127, 103, 16, 0xe8e2c8], [74, 93, 10, 0xe8e2c8]] },
  scarab: { src: 'mob_scarab', core: [[126, 137, 28, 0xe8f0ff]] },
  mine: { src: 'mob_mine', core: [[128, 130, 30, 0xfff4d6]] },
  oculus: { src: 'mob_oculus', core: [[128, 128, 34, 0xff3040]] },
  seraph: { src: 'mob_seraph', core: [[130, 120, 24, 0xffffff]] },
  assault: { src: 'mob_assault', core: [[129, 125, 36, 0xff2a3a]] },
  citadel: { src: 'boss_citadel', core: [[184, 149, 13, 0xff2a3a]] },
  nemesis: { src: 'boss_nemesis', core: [[141, 134, 30, 0xd040ff], [107, 145, 8, 0xd040ff], [157, 51, 8, 0xd040ff]] },
  apostle: { src: 'boss_apostle', core: [[132, 136, 30, 0xffe8a0]] },
  apostle_red: { src: 'boss_apostle', core: [[132, 136, 30, 0xff2a3a]] },
};

/** Холст с картинкой из загруженной текстуры (null — нет такой) */
type Src = HTMLImageElement | HTMLCanvasElement;
function srcImage(scene: Phaser.Scene, key: string): Src | null {
  if (!scene.textures.exists(key)) return null;
  return scene.textures.get(key).getSourceImage() as Src;
}

/** Рамка содержимого по альфе */
function alphaBox(img: Src) {
  const w = img.width, h = img.height;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? { x0: 0, y0: 0, x1: w, y1: h } : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

function addCanvasTex(scene: Phaser.Scene, key: string, cv: HTMLCanvasElement) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, cv);
}

function bakeMob(scene: Phaser.Scene, key: string, src: string, core: Core[] = []) {
  const img = srcImage(scene, src);
  if (!img) { make(scene, key, 72, 72, (g) => inkBlob(g, 36, 36, 30)); return; }
  const b = alphaBox(img);
  const side = Math.max(b.x1 - b.x0, b.y1 - b.y0) + 6;
  const ox = (b.x0 + b.x1) / 2 - side / 2, oy = (b.y0 + b.y1) / 2 - side / 2;
  const cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(side);
  const ctx = cv.getContext('2d')!;
  for (const [x, y, r, col] of core) {
    const hexc = '#' + col.toString(16).padStart(6, '0');
    const gr = ctx.createRadialGradient(x - ox, y - oy, 0, x - ox, y - oy, r);
    gr.addColorStop(0, hexc); gr.addColorStop(0.55, hexc + 'cc'); gr.addColorStop(1, hexc + '00');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(x - ox, y - oy, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.drawImage(img, -ox, -oy);
  addCanvasTex(scene, key, cv);
}

/**
 * Предмет мира 2.0 под старый ключ: квадратная картинка обрезается по центру до пропорции w:h,
 * в которой её рисует код (сундук 26×23, обелиск 30×46, торговец 34×46) — без сплющивания.
 */
function refit(scene: Phaser.Scene, key: string, src: string, aspect: number, glowCol = -1) {
  const img = srcImage(scene, src);
  if (!img) return false;
  const b = alphaBox(img);
  const cw = b.x1 - b.x0, ch = b.y1 - b.y0;
  // минимальный прямоугольник нужной пропорции, вмещающий содержимое
  let w = Math.max(cw, ch * aspect) + 8, h = w / aspect;
  if (h < ch + 8) { h = ch + 8; w = h * aspect; }
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const cv = document.createElement('canvas'); cv.width = Math.ceil(w); cv.height = Math.ceil(h);
  const ctx = cv.getContext('2d')!;
  if (glowCol >= 0) {
    const hexc = '#' + glowCol.toString(16).padStart(6, '0');
    const gr = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
    gr.addColorStop(0, hexc + '66'); gr.addColorStop(1, hexc + '00');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, w / 2 - cx, h / 2 - cy);
  addCanvasTex(scene, key, cv);
  return true;
}

/** Мобы, боссы и предметы мира из графики 2.0 (вызывается после загрузки картинок) */
function makeWorldV2(scene: Phaser.Scene) {
  for (const [k, m] of Object.entries(MOBS_V2)) bakeMob(scene, 'en_' + k, m.src, m.core);
  // сундук: деревянный 2.0 с тёплым свечением; обелиск и торговец — в пропорции, как их рисует Pickups
  refit(scene, 'chest', 'chest_wood', 26 / 23, 0xffd36b);
  refit(scene, 'obelisk', 'obelisk', 30 / 46);
  refit(scene, 'merchant', 'merchant', 34 / 46);
  // сфера жизни — сердце 2.0 с мягким зелёно-красным ореолом
  const heart = srcImage(scene, 'life_heart');
  if (heart) {
    const b = alphaBox(heart);
    const s = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 1.9;
    const cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(s);
    const ctx = cv.getContext('2d')!;
    const gr = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,90,90,0.55)'); gr.addColorStop(0.6, 'rgba(120,255,140,0.18)'); gr.addColorStop(1, 'rgba(120,255,140,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, s, s);
    ctx.drawImage(heart, s / 2 - (b.x0 + b.x1) / 2, s / 2 - (b.y0 + b.y1) / 2);
    addCanvasTex(scene, 'orb_life', cv);
  }
}

/** Череп: купол, челюсть, тёмные глазницы */
function skull(g: G, cx: number, cy: number, r: number, color: number) {
  g.fillStyle(color, 1);
  g.fillCircle(cx, cy, r);
  g.fillRect(cx - r * 0.55, cy + r * 0.5, r * 1.1, r * 0.7);
  g.fillStyle(0x0e0e10, 1);
  g.fillEllipse(cx - r * 0.4, cy + r * 0.05, r * 0.55, r * 0.65);
  g.fillEllipse(cx + r * 0.4, cy + r * 0.05, r * 0.55, r * 0.65);
  g.fillTriangle(cx, cy + r * 0.35, cx - r * 0.12, cy + r * 0.6, cx + r * 0.12, cy + r * 0.6);
  for (let i = -2; i <= 2; i++) g.fillRect(cx + i * r * 0.22 - r * 0.03, cy + r * 0.82, r * 0.06, r * 0.38);
}

/** Колючая горизонтальная «ветка» сквозь босса */
function thornBranch(g: G, cx: number, cy: number, half: number) {
  g.lineStyle(5, 0x0e0e10, 1); g.lineBetween(cx - half, cy, cx + half, cy);
  for (let x = cx - half; x < cx + half; x += 9) {
    const up = Math.random() < 0.5 ? -1 : 1, l = rnd(6, 14);
    g.lineStyle(2, 0x0e0e10, 1); g.lineBetween(x, cy, x + rnd(-4, 4), cy + up * l);
  }
}

function star4(g: G, cx: number, cy: number, r: number, w: number) {
  g.fillTriangle(cx - w, cy, cx + w, cy, cx, cy - r);
  g.fillTriangle(cx - w, cy, cx + w, cy, cx, cy + r);
  g.fillTriangle(cx, cy - w, cx, cy + w, cx - r, cy);
  g.fillTriangle(cx, cy - w, cx, cy + w, cx + r, cy);
}

export function makeTextures(scene: Phaser.Scene) {
  // --- Земля (бесшовная плитка 512x512) ---
  make(scene, 'ground', 512, 512, (g) => {
    g.fillStyle(0x7a8c55, 1);
    g.fillRect(0, 0, 512, 512);
    const patch = (x: number, y: number, color: number, alpha: number, size: number) => {
      for (let i = 0; i < 26; i++) {
        const px = x + rnd(-size, size), py = y + rnd(-size * 0.6, size * 0.6);
        const a = rnd(0, Math.PI);
        const l = rnd(4, 11);
        g.lineStyle(rnd(1.5, 3), color, alpha);
        for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
          g.lineBetween(px + ox, py + oy, px + ox + Math.cos(a) * l, py + oy + Math.sin(a) * l);
        }
      }
    };
    for (let i = 0; i < 34; i++) patch(rnd(0, 512), rnd(0, 512), 0x667846, 0.55, rnd(14, 30));
    for (let i = 0; i < 14; i++) patch(rnd(0, 512), rnd(0, 512), 0x8a9c64, 0.45, rnd(10, 22));
  });

  // --- Маг ---
  for (let f = 0; f < 4; f++) {
    make(scene, 'player_' + f, 64, 88, (g) => witch(g, 2, 0x0d0d10, f, 0x7fe3ff));
    if (f < 3) for (const p of Object.keys(POSES) as Pose[]) make(scene, `mage_${p}_${f}`, 96, 96, (g) => witchPose(g, f, p));
    make(scene, 'mirage_' + f, 64, 88, (g) => witch(g, 2, 0xffffff, f));
  }
  make(scene, 'shadow', 64, 24, (g) => { g.fillStyle(0x000000, 0.28); g.fillEllipse(32, 12, 60, 20); g.fillStyle(0x000000, 0.25); g.fillEllipse(32, 12, 40, 12); });
  make(scene, 'aura', 96, 96, (g) => glow(g, 48, 48, 48, 0x7fe3ff, 10, 0.35));

  // --- Враги: по 3 кадра «дрожащей линии», чтобы клубки шевелились ---
  for (let f = 0; f < 3; f++) {
  make(scene, 'enemy_basic_' + f, 72, 72, (g) => inkBlob(g, 36, 36, 30));
  make(scene, 'enemy_red_' + f, 80, 80, (g) => {
    inkBlob(g, 40, 40, 34);
    glow(g, 40, 40, 13, 0xff1a2a, 8, 1);
    g.fillStyle(0xff3040, 1); g.fillCircle(40, 40, 4);
  });
  make(scene, 'enemy_white_' + f, 80, 80, (g) => {
    inkBlob(g, 40, 40, 34);
    glow(g, 40, 40, 14, 0xfff4d6, 8, 1.2);
    g.fillStyle(0xffffff, 1); g.fillCircle(40, 40, 5);
  });
  make(scene, 'enemy_small_' + f, 44, 44, (g) => inkBlob(g, 22, 22, 18));
  make(scene, 'enemy_big_' + f, 128, 128, (g) => {
    inkBlob(g, 64, 64, 56);
    glow(g, 64, 64, 18, 0xb04cff, 8, 0.9);
  });
  }
  // --- Боссы зоны (3:00 / 6:00 / 9:00 / 12:00): большие чернильные клубки со своим знаком ---
  for (let f = 0; f < 3; f++) {
    make(scene, 'boss_0_' + f, 192, 192, (g) => { thornBranch(g, 96, 96, 92); inkBlob(g, 96, 96, 62); skull(g, 96, 92, 22, 0xff2a3a); });
    make(scene, 'boss_1_' + f, 192, 192, (g) => {
      inkBlob(g, 96, 96, 70);
      glow(g, 96, 104, 30, 0xff1a2a, 8, 0.8);
      g.fillStyle(0xff2a3a, 1); g.fillEllipse(96, 106, 46, 22);
      g.fillStyle(0x0e0e10, 1);
      for (let i = 0; i < 6; i++) { const x = 76 + i * 8; g.fillTriangle(x, 95, x + 6, 95, x + 3, 104); g.fillTriangle(x, 117, x + 6, 117, x + 3, 108); }
      g.fillStyle(0xff3040, 1); g.fillCircle(84, 78, 4); g.fillCircle(108, 78, 4);
    });
    make(scene, 'boss_2_' + f, 192, 192, (g) => {
      for (let i = 0; i < 18; i++) { const a = rnd(0, Math.PI * 2); g.lineStyle(rnd(2, 4), 0x0e0e10, 1); g.lineBetween(96, 96, 96 + Math.cos(a) * 94, 96 + Math.sin(a) * 94); }
      inkBlob(g, 96, 96, 64);
      glow(g, 96, 96, 26, 0xb04cff, 8, 1);
      g.fillStyle(0xf2dcff, 1); g.fillCircle(96, 96, 6);
    });
    make(scene, 'boss_3_' + f, 192, 192, (g) => { thornBranch(g, 96, 96, 94); glow(g, 96, 96, 80, 0xff1a2a, 8, 0.5); inkBlob(g, 96, 96, 70); skull(g, 96, 92, 28, 0xff2a3a); });
  }
  // череп — полоска здоровья босса в HUD
  make(scene, 'skull_red', 64, 64, (g) => skull(g, 32, 30, 26, 0xff2a3a));
  make(scene, 'skull_dark', 64, 64, (g) => skull(g, 32, 30, 26, 0x3a3a40));

  // --- Обелиск (после босса) и Торговец ---
  make(scene, 'obelisk', 60, 92, (g) => {
    g.fillStyle(0x000000, 0.3); g.fillEllipse(30, 86, 46, 10);
    g.fillStyle(0x6d6f73, 1); g.fillPoints([v(30, 2), v(42, 26), v(46, 84), v(14, 84), v(18, 26)], true);
    g.fillStyle(0x8a8c90, 1); g.fillPoints([v(30, 2), v(42, 26), v(46, 84), v(30, 84)], true);
    glow(g, 30, 50, 16, 0xff2a3a, 6, 0.8);
    g.lineStyle(2.5, 0xff3a3a, 1);
    g.strokePoints([v(28, 18), v(33, 30), v(27, 42), v(34, 55), v(29, 70)], false);
  });
  make(scene, 'merchant', 68, 92, (g) => {
    g.fillStyle(0x000000, 0.3); g.fillEllipse(34, 86, 50, 10);
    g.fillStyle(0x7a0d16, 1);
    g.fillPoints([v(34, 4), v(48, 16), v(52, 34), v(62, 84), v(6, 84), v(16, 34), v(20, 16)], true);
    g.fillStyle(0xb3141f, 1); g.fillPoints([v(34, 4), v(48, 16), v(52, 34), v(62, 84), v(40, 84), v(38, 34)], true);
    g.fillStyle(0x0a0a0c, 1); g.fillEllipse(34, 26, 18, 20);
    g.fillStyle(0xff4a4a, 1); g.fillCircle(30, 26, 1.8); g.fillCircle(38, 26, 1.8);
  });

  make(scene, 'elite_ring', 128, 128, (g) => {
    g.lineStyle(5, 0xff2d8a, 0.9); g.strokeCircle(64, 64, 58);
    g.lineStyle(10, 0xff2d8a, 0.25); g.strokeCircle(64, 64, 56);
  });

  // --- Предметы ---
  make(scene, 'orb_s', 16, 16, (g) => { glow(g, 8, 8, 8, 0x46d6ff, 6, 0.9); g.fillStyle(0xb8f2ff, 1); g.fillCircle(8, 8, 2.6); });
  make(scene, 'orb_m', 22, 22, (g) => { glow(g, 11, 11, 11, 0x3f9dff, 6, 1); g.fillStyle(0xd0eaff, 1); g.fillCircle(11, 11, 3.6); });
  make(scene, 'orb_l', 28, 28, (g) => { glow(g, 14, 14, 14, 0xff5ad2, 6, 1); g.fillStyle(0xffd6f4, 1); g.fillCircle(14, 14, 4.6); });
  make(scene, 'orb_life', 28, 28, (g) => {
    glow(g, 14, 14, 14, 0x55ff77, 6, 0.9);
    g.fillStyle(0xe8ffe8, 1); g.fillRect(12, 7, 4, 14); g.fillRect(7, 12, 14, 4);
  });

  // --- Сундук и руны ---
  make(scene, 'chest', 64, 56, (g) => {
    glow(g, 32, 30, 30, 0xffd36b, 8, 0.6);
    g.fillStyle(0x5a3416, 1); g.fillRoundedRect(10, 20, 44, 28, 4);
    g.fillStyle(0x7a4a22, 1); g.fillRoundedRect(10, 12, 44, 14, { tl: 10, tr: 10, bl: 0, br: 0 });
    g.fillStyle(0xf2c94c, 1);
    g.fillRect(10, 24, 44, 3); g.fillRect(29, 12, 6, 36);
    g.fillStyle(0x2b1a0b, 1); g.fillRect(30, 27, 4, 6);
  });
  make(scene, 'rune', 64, 64, (g) => {
    glow(g, 32, 32, 32, 0xffffff, 8, 0.7);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(32, 6, 50, 32, 14, 32); g.fillTriangle(32, 58, 50, 32, 14, 32);
    g.fillStyle(0x000000, 0.55);
    g.fillTriangle(32, 16, 42, 32, 22, 32); g.fillTriangle(32, 48, 42, 32, 22, 32);
  });
  make(scene, 'arrow', 32, 32, (g) => {
    g.fillStyle(0xffffff, 1); g.fillTriangle(30, 16, 8, 4, 8, 28);
  });

  // --- Снаряды и эффекты ---
  make(scene, 'bolt', 40, 12, (g) => {
    g.fillStyle(0xffffff, 0.25); g.fillEllipse(20, 6, 40, 12);
    g.fillStyle(0xffffff, 1); g.fillEllipse(24, 6, 30, 4);
  });
  make(scene, 'blade', 64, 14, (g) => {
    g.fillStyle(0xffffff, 0.25); g.fillEllipse(32, 7, 64, 14);
    g.fillStyle(0xffffff, 1); g.fillTriangle(2, 7, 62, 4, 62, 10);
  });
  make(scene, 'dot', 16, 16, (g) => { glow(g, 8, 8, 8, 0xffffff, 6, 1); g.fillStyle(0xffffff, 1); g.fillCircle(8, 8, 3); });
  make(scene, 'fireball', 32, 32, (g) => {
    glow(g, 16, 16, 16, 0xff7a1a, 8, 1);
    g.fillStyle(0xffe2a8, 1); g.fillCircle(16, 16, 5);
  });
  make(scene, 'spirit', 24, 24, (g) => {
    glow(g, 12, 12, 12, 0xffffff, 6, 0.6);
    g.fillStyle(0xffffff, 1); star4(g, 12, 12, 10, 2);
  });
  make(scene, 'satellite', 40, 40, (g) => {
    glow(g, 20, 20, 20, 0xbfe8ff, 8, 0.9);
    g.fillStyle(0xffffff, 1); g.fillCircle(20, 20, 7);
    g.lineStyle(2, 0xffffff, 0.8); g.strokeCircle(20, 20, 11);
  });
  make(scene, 'ring', 128, 128, (g) => {
    g.lineStyle(3, 0xffffff, 1); g.strokeCircle(64, 64, 60);
    g.lineStyle(1.5, 0xffffff, 0.5); g.strokeCircle(64, 64, 52);
    for (let i = 0; i < 40; i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(30, 60);
      g.fillStyle(0xffffff, rnd(0.3, 0.9)); g.fillCircle(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, rnd(0.8, 1.8));
    }
  });
  make(scene, 'blast', 128, 128, (g) => {
    glow(g, 64, 64, 64, 0xffffff, 10, 0.8);
    g.lineStyle(3, 0xffffff, 0.9); g.strokeCircle(64, 64, 58);
  });
  make(scene, 'spark', 32, 32, (g) => { g.fillStyle(0xffffff, 1); star4(g, 16, 16, 15, 1.6); });
  make(scene, 'magic_circle', 256, 256, (g) => {
    const c = 128;
    g.lineStyle(4, 0xffffff, 0.9); g.strokeCircle(c, c, 122);
    g.lineStyle(2, 0xffffff, 0.7); g.strokeCircle(c, c, 104);
    g.lineStyle(2, 0xffffff, 0.6); g.strokeCircle(c, c, 60);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      g.lineBetween(c + Math.cos(a) * 106, c + Math.sin(a) * 106, c + Math.cos(a) * (i % 3 ? 114 : 120), c + Math.sin(a) * (i % 3 ? 114 : 120));
    }
    // семиконечная звезда
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i * 3 * Math.PI * 2) / 7;
      pts.push(new Phaser.Math.Vector2(c + Math.cos(a) * 100, c + Math.sin(a) * 100));
    }
    g.lineStyle(2.5, 0xffffff, 0.85);
    g.strokePoints(pts, true);
  });

  makeWorldV2(scene);
  makeIcons(scene);
}

// --- Иконки для карточек (белые линии, 96x96) ---
function makeIcons(scene: Phaser.Scene) {
  const W = 0xffffff;
  make(scene, 'ico_bolt', 96, 96, (g) => {
    for (let i = 0; i < 3; i++) {
      g.fillStyle(W, 1);
      g.fillTriangle(22 + i * 18, 82, 30 + i * 18, 80, 64 + i * 14, 12 + i * 6);
    }
  });
  make(scene, 'ico_fireball', 96, 96, (g) => {
    g.lineStyle(5, W, 1); g.strokeCircle(48, 54, 24);
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9;
      g.lineBetween(48 + Math.cos(a) * 26, 54 + Math.sin(a) * 26, 48 + Math.cos(a) * rnd(36, 44), 54 + Math.sin(a) * rnd(36, 44));
    }
    g.fillStyle(W, 1); g.fillCircle(48, 54, 9);
  });
  make(scene, 'ico_spirit', 96, 96, (g) => {
    g.lineStyle(7, W, 1); g.strokeCircle(48, 48, 30);
    g.lineStyle(2, W, 0.8); g.strokeCircle(48, 48, 38);
    for (let i = 0; i < 18; i++) {
      const a = rnd(0, Math.PI * 2);
      g.fillStyle(W, 1); g.fillCircle(48 + Math.cos(a) * rnd(24, 40), 48 + Math.sin(a) * rnd(24, 40), rnd(1, 2.5));
    }
  });
  make(scene, 'ico_satellite', 96, 96, (g) => {
    g.lineStyle(3, W, 0.9); g.strokeEllipse(48, 48, 84, 40);
    g.fillStyle(W, 1); g.fillCircle(48, 48, 12); g.fillCircle(84, 54, 8); g.fillCircle(14, 42, 6);
  });
  make(scene, 'ico_circle', 96, 96, (g) => {
    g.lineStyle(3, W, 1); g.strokeCircle(48, 48, 40); g.strokeCircle(48, 48, 32);
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i * 3 * Math.PI * 2) / 7;
      pts.push(new Phaser.Math.Vector2(48 + Math.cos(a) * 30, 48 + Math.sin(a) * 30));
    }
    g.strokePoints(pts, true);
  });
  make(scene, 'ico_phase', 96, 96, (g) => {
    g.fillStyle(W, 0.35); witchAt(g, 18, 14);
    g.fillStyle(W, 1); witchAt(g, 34, 14);
  });
  make(scene, 'ico_atk', 96, 96, (g) => { g.fillStyle(W, 1); g.fillTriangle(48, 8, 60, 60, 36, 60); g.fillRect(30, 60, 36, 6); g.fillRect(44, 66, 8, 22); });
  make(scene, 'ico_cd', 96, 96, (g) => {
    g.lineStyle(5, W, 1); g.strokeCircle(48, 48, 34); g.lineBetween(48, 48, 48, 24); g.lineBetween(48, 48, 66, 56);
  });
  make(scene, 'ico_hp', 96, 96, (g) => { g.fillStyle(W, 1); g.fillCircle(34, 38, 18); g.fillCircle(62, 38, 18); g.fillTriangle(17, 44, 79, 44, 48, 82); });
  make(scene, 'ico_speed', 96, 96, (g) => {
    g.lineStyle(6, W, 1);
    for (let i = 0; i < 3; i++) { g.lineBetween(20 + i * 18, 24, 42 + i * 18, 48); g.lineBetween(42 + i * 18, 48, 20 + i * 18, 72); }
  });
  make(scene, 'ico_size', 96, 96, (g) => {
    g.lineStyle(4, W, 1); g.strokeCircle(48, 48, 14); g.strokeCircle(48, 48, 26); g.strokeCircle(48, 48, 38);
  });
  make(scene, 'ico_duration', 96, 96, (g) => {
    g.fillStyle(W, 1); g.fillTriangle(26, 16, 70, 16, 48, 48); g.fillTriangle(26, 80, 70, 80, 48, 48);
  });
  make(scene, 'ico_crit', 96, 96, (g) => {
    g.lineStyle(5, W, 1); g.strokeCircle(48, 48, 28);
    g.lineBetween(48, 8, 48, 34); g.lineBetween(48, 62, 48, 88); g.lineBetween(8, 48, 34, 48); g.lineBetween(62, 48, 88, 48);
  });
  make(scene, 'ico_pickup', 96, 96, (g) => {
    g.lineStyle(5, W, 1); g.strokeCircle(40, 40, 24); g.lineBetween(57, 57, 82, 82);
  });
  make(scene, 'ico_grail', 96, 96, (g) => {
    g.fillStyle(W, 1);
    g.fillRect(16, 18, 64, 6);
    g.fillTriangle(18, 24, 78, 24, 48, 56);
    g.fillRect(44, 54, 8, 22); g.fillRect(30, 76, 36, 6);
  });
  make(scene, 'ico_synergy', 96, 96, (g) => {
    g.lineStyle(5, W, 1);
    g.strokeCircle(48, 34, 20); g.strokeCircle(34, 58, 20); g.strokeCircle(62, 58, 20);
  });
  make(scene, 'ico_magic', 96, 96, (g) => {
    g.fillStyle(W, 1);
    g.fillTriangle(48, 6, 58, 40, 38, 40);
    g.fillTriangle(38, 40, 58, 40, 48, 90);
    g.lineStyle(4, W, 1); g.strokeCircle(48, 48, 34);
  });
  make(scene, 'ico_critmult', 96, 96, (g) => {
    g.fillStyle(W, 1); g.fillCircle(48, 44, 26); g.fillRect(34, 62, 28, 18);
    g.fillStyle(0x000000, 1); g.fillCircle(38, 42, 7); g.fillCircle(58, 42, 7);
  });
}

function witchAt(g: G, x: number, y: number) {
  g.fillTriangle(x + 5, y + 26, x + 38, y + 26, x + 30, y);
  g.fillTriangle(x + 6, y + 70, x + 40, y + 70, x + 23, y + 22);
}
