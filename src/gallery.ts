import Phaser from 'phaser';
import './ui/style.css';
import { makeTextures } from './textures';
import { SPELLS, PASSIVES } from './game/SpellBook';
import { ARTIFACTS, SYNERGIES, RARITY, artifactById } from './game/Artifacts';
import { RUNES } from './game/Pickups';
import { ENEMY_TYPES } from './game/Enemies';
import { ensureMobTextures, mobFrames, mobTex } from './game/mobLook';
import { ART } from './data/art';
import { textures as fireballTextures } from './game/spells/v2/Fireball';

// Галерея разработчика: вся графика и контент игры на одной странице — смотреть и оценивать без игры.

const css = `
  html, body { overflow: auto !important; touch-action: auto !important; height: auto !important; background: #0b0d12 !important; -webkit-user-select: text; user-select: text; }
  #gallery { padding: calc(env(safe-area-inset-top) + 16px) 14px 40px; max-width: 900px; margin: 0 auto; }
  #gallery h1 { color: #6ff2d8; font-weight: normal; margin: 0 0 4px; }
  #gallery h2 { color: #f2c94c; font-weight: normal; font-size: 19px; margin: 30px 0 4px; border-bottom: 1px solid #222a3a; padding-bottom: 6px; }
  #gallery .note { color: #9aa3b5; font-size: 13px; margin-bottom: 10px; line-height: 1.5; }
  .grid { display: flex; flex-wrap: wrap; gap: 10px; }
  .tile { background: #7a8c55 url() repeat; border-radius: 10px; padding: 8px; text-align: center; font-size: 11px; color: #e9ecf2; min-width: 84px; }
  .tile.dark { background: #06080f; border: 1px solid #1c2232; }
  .tile canvas { display: block; margin: 0 auto 4px; image-rendering: auto; }
  .tile .n { opacity: 0.85; text-shadow: 0 1px 2px #000; }
  .cards-demo { display: flex; flex-direction: column; gap: 10px; max-width: 420px; }
  .art { display: flex; gap: 10px; align-items: flex-start; background: #0c0f17; border: 1px solid #1c2232; border-radius: 10px; padding: 8px 10px; width: 100%; max-width: 420px; }
  .art .ae { font-size: 26px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border: 2px solid; flex: none; background: #11131a; }
  .art .t { font-size: 12.5px; color: #ffe07a; line-height: 1.45; }
  .art .r { font-size: 11px; margin-bottom: 3px; }
  .cols { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; }
  .toc a { color: #7cc7ff; margin-right: 12px; font-size: 14px; line-height: 2; }
`;
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }));

const root = document.getElementById('gallery')!;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function section(id: string, title: string, note = '') {
  const h = document.createElement('h2'); h.id = id; h.textContent = title;
  root.appendChild(h);
  if (note) root.appendChild(Object.assign(document.createElement('div'), { className: 'note', innerHTML: note }));
  const g = document.createElement('div'); g.className = 'grid';
  root.appendChild(g);
  return g;
}

let tm: Phaser.Textures.TextureManager;

/** Плитка с картинкой; frames > 1 — анимация по кадрам key_0..key_N */
function tile(parent: HTMLElement, keys: string[], name: string, scale = 1, opts: { dark?: boolean; tint?: number; fps?: number } = {}) {
  const t = document.createElement('div'); t.className = 'tile' + (opts.dark ? ' dark' : '');
  const src0 = tm.get(keys[0]).getSourceImage() as HTMLCanvasElement;
  const c = document.createElement('canvas');
  c.width = src0.width; c.height = src0.height;
  c.style.width = src0.width * scale + 'px'; c.style.height = src0.height * scale + 'px';
  const ctx = c.getContext('2d')!;
  let i = 0;
  const draw = () => {
    const src = tm.get(keys[i % keys.length]).getSourceImage() as HTMLCanvasElement;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0);
    if (opts.tint !== undefined) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = hex(opts.tint); ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'source-over';
    }
  };
  draw();
  if (keys.length > 1) setInterval(() => { i++; draw(); }, 1000 / (opts.fps ?? 4));
  t.appendChild(c);
  t.appendChild(Object.assign(document.createElement('div'), { className: 'n', textContent: name }));
  parent.appendChild(t);
}

/** Плитка-анимация из готовых PNG-кадров (эффекты из Effekseer); pause — пауза между повторами, мс */
function imgTile(parent: HTMLElement, urls: string[], name: string, size: number, frameMs: number, pause = 0) {
  const t = document.createElement('div'); t.className = 'tile';
  const img = document.createElement('img');
  img.style.cssText = `width:${size}px;height:auto;display:block;margin:0 auto 4px`;
  urls.forEach((u) => { new Image().src = u; });
  let i = 0;
  const step = () => {
    img.src = urls[i];
    const last = i === urls.length - 1;
    i = (i + 1) % urls.length;
    setTimeout(step, frameMs + (last ? pause : 0));
  };
  step();
  t.appendChild(img);
  t.appendChild(Object.assign(document.createElement('div'), { className: 'n', textContent: name }));
  parent.appendChild(t);
}

const iconUrl = (key: string, tint?: number) => {
  const src = tm.get(key).getSourceImage() as HTMLCanvasElement;
  const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext('2d')!; ctx.drawImage(src, 0, 0);
  if (tint !== undefined && tint !== 0xffffff) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = hex(tint); ctx.fillRect(0, 0, cv.width, cv.height); }
  return cv.toDataURL();
};

/** Кадры одной анимации, по кругу (у шара оригинала — 3 кадра по 0.06 с) */
function loopFrames(urls: string[], frameMs: number, onFrame: (img: HTMLImageElement) => void) {
  const imgs = urls.map((u) => Object.assign(new Image(), { src: u }));
  let i = 0;
  setInterval(() => { i = (i + 1) % imgs.length; onFrame(imgs[i]); }, frameMs);
  return imgs;
}

/** Огненный шар — выбор стиля (2026-11-26). Масштаб в игре: кадр оригинала × 0.568 (1 px = 0.568 наших)
 *  × localScale (0.5 по ширине, 0.45 по высоте). Скорость 0.6 × 8 ед./с × 56.8 = 273 px/с. Пол — Land31 (зона 1). */
function fireballChoice() {
  const g = section('fb-style', 'Огненный шар — выбираем вид',
    'По порядку: <b>оригинал</b>; <b>сейчас в игре</b>; <b>1 — гладкий</b> (те же формы и цвета, убраны ступеньки); ' +
    '<b>2 — темнее</b> (как 1, но бордовая кайма, меньше белого); <b>3 — нейросеть</b> (прорисованнее: тёмный контур, тонкие закрученные языки). ' +
    'Верхний ряд — крупно, ниже — полёт по полу в размере телефона. Скажите, что нравится и что нет — переспрошу, если непонятно.');
  const v = 'vfx/fireball/v3/';
  const sets: [string, string][] = [['orig', 'оригинал'], ['now', 'сейчас в игре'], ['smooth', '1 — гладкий'], ['dark', '2 — темнее'], ['flux', '3 — нейросеть']];
  const FW = 340, FH = 224;                          // холст кадров variants.py
  const gw = FW * 0.568 * 0.5, gh = FH * 0.568 * 0.45; // размер в игре, px
  // «сейчас в игре» — заглушка из Fireball.ts (130×75 = кадр 520×300 / 4)
  fireballTextures(bootScene);
  const nowUrl = iconUrl('fb_ball');
  const urlsOf = (k: string) => (k === 'now' ? [nowUrl] : [1, 2, 3].map((i) => `${v}${k}_0${i}.png`));

  for (const [k, name] of sets) {
    const t = document.createElement('div'); t.className = 'tile dark';
    const img = document.createElement('img');
    img.style.cssText = `width:${k === 'now' ? 120 : 155}px;display:block;margin:0 auto 4px`;
    const urls = urlsOf(k); img.src = urls[0];
    if (urls.length > 1) loopFrames(urls, 60, (im) => { img.src = im.src; });
    t.appendChild(img);
    t.appendChild(Object.assign(document.createElement('div'), { className: 'n', textContent: name + ' (крупно)' }));
    g.appendChild(t);
  }
  // полёт по полу: ширина экрана телефона 390 px
  for (const [k, name] of sets) {
    const t = document.createElement('div'); t.className = 'tile';
    t.style.cssText = 'padding:0;overflow:hidden;width:min(390px,100%);background:url(vfx/land31.png) 0 0/calc(291 / 466 * 100%) auto';
    // холст = ширина экрана в игре (8.2 ед. × 56.8 = 466 px мира), растянут на ширину плитки — пропорция как на телефоне
    const cv = document.createElement('canvas'); cv.width = 466; cv.height = 150; cv.style.cssText = 'display:block;width:100%';
    const ctx = cv.getContext('2d')!;
    const urls = urlsOf(k);
    const imgs = urls.map((u) => Object.assign(new Image(), { src: u }));
    // заглушка нарисована как спрайт 520×300 / 4: в игре ширина 520 × 0.568 × 0.5
    const w = k === 'now' ? 520 * 0.568 * 0.5 : gw, h = k === 'now' ? 300 * 0.568 * 0.45 : gh;
    const t0 = performance.now();
    const draw = (now: number) => {
      const s = Math.max(0, now - t0) / 1000;   // время кадра rAF бывает чуть раньше t0
      const x = ((s * 273) % (466 + w * 2)) - w, fr = Math.floor(s / 0.06) % imgs.length;
      ctx.clearRect(0, 0, 466, 150);
      if (imgs[fr]?.complete) ctx.drawImage(imgs[fr], x - w / 2, 75 - h / 2, w, h);
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
    t.appendChild(cv);
    t.appendChild(Object.assign(document.createElement('div'), { className: 'n', textContent: name + ' — в игре', style: 'padding:4px' }));
    g.appendChild(t);
  }
}

let bootScene!: Phaser.Scene;
function build() {
  root.innerHTML = `<h1>Галерея Magic Apocalypse</h1>
    <div class="note">Вся графика и контент игры. Анимация — как в игре. Отмечай, что нравится, а что переделать.</div>
    <div class="toc"><a href="#fb-style">Огненный шар — выбор</a><a href="#mage">Маг</a><a href="#mobs">Мобы</a><a href="#items">Предметы</a><a href="#fx">Эффекты</a><a href="#vfx">Effekseer</a><a href="#icons">Иконки</a><a href="#cards">Карточки</a><a href="#arts">Артефакты</a><a href="#syn">Синергии</a></div>`;

  let g = section('mage', 'Маг', 'Анимация «дыхания»: 4 кадра, 3 в секунду (в движении 5). В игре маг размером 18×29 — здесь крупнее.');
  tile(g, [0, 1, 2, 3].map((f) => 'player_' + f), 'анимация', 1.6, { fps: 3 });
  [0, 1, 2, 3].forEach((f) => tile(g, ['player_' + f], 'кадр ' + (f + 1), 1));
  tile(g, [0, 1, 2, 3].map((f) => 'player_' + f), 'в игре (размер)', 0.33, { fps: 3 });
  tile(g, [0, 1, 2, 3].map((f) => 'mirage_' + f), 'двойник (Шквал/Двойники)', 1, { fps: 3, tint: 0xc49bff, dark: true });
  // маг в игре 2.0: 4 позы (вверх-вниз / диагональ / вбок — влево зеркально), 3 кадра подола
  for (const [p, n] of [['idle', 'стоит'], ['vert', 'вверх/вниз'], ['diag', 'диагональ'], ['side', 'вбок']] as const) {
    tile(g, [0, 1, 2].map((f) => `mage_${p}_${f}`), 'поза: ' + n, 1, { fps: 9 });
  }

  g = section('mobs', 'Мобы', '3.0: рисуются по меркам спрайтов оригинала (src/game/mobLook.ts), кадр меняется на каждом шаге.');
  for (const [k, t] of Object.entries(ENEMY_TYPES)) {
    ensureMobTextures(bootScene, t.uid);
    const keys = Array.from({ length: mobFrames(t.uid) }, (_, f) => mobTex(t.uid, f));
    tile(g, keys, `${k} · ${t.uid} (HP ${t.hp})`, t.id === 'boss' ? 0.5 : 1, { fps: 12 });
  }
  tile(g, ['elite_ring'], 'кольцо элитки', 0.6);

  g = section('items', 'Предметы на земле');
  tile(g, ['orb_s'], 'мана малая', 2); tile(g, ['orb_m'], 'мана средняя', 2); tile(g, ['orb_l'], 'мана большая', 2); tile(g, ['orb_life'], 'сфера жизни', 2);
  tile(g, ['chest'], 'сундук', 1.4); tile(g, ['arrow'], 'стрелка к сундуку', 1.4, { tint: 0xffd36b });
  for (const r of Object.values(RUNES)) tile(g, ['rune'], r.name, 1, { tint: r.tint, dark: true });

  g = section('fx', 'Эффекты заклинаний');
  for (const [k, n] of [['bolt', 'игла'], ['blade', 'клинок'], ['dot', 'снаряд духа'], ['fireball', 'пламенное ядро'], ['spirit', 'дух'], ['satellite', 'сфера кольца'], ['ring', 'кольцо взрыва'], ['blast', 'вспышка'], ['spark', 'искра'], ['magic_circle', 'руна силы']] as const) {
    tile(g, [k], n, k === 'magic_circle' ? 0.7 : 1.5, { dark: true });
  }

  fireballChoice();

  g = section('fb-game', 'Огненный шар — сейчас в игре',
    'Шар «гладкий» (выбран), взрыв шара и Пандемониум — кадры оригинала (они уже гладкие). Тайминги из кода оригинала.');
  const fo = (pre: string, n: number) => Array.from({ length: n }, (_, i) => `vfx/fireball/orig/${pre}_${String(i + 1).padStart(2, '0')}.png`);
  imgTile(g, [1, 2, 3].map((i) => `vfx/fireball/v3/smooth_0${i}.png`), 'шар', 155, 60);
  imgTile(g, fo('Explosion6', 9), 'взрыв шара, 9 × 0.06 с', 218, 60, 400);
  imgTile(g, fo('Bullet27', 3), 'Пандемониум: шар', 155, 60);
  imgTile(g, fo('Explosion27', 8), 'Пандемониум: взрыв, 8 кадров', 289, 35, 400);
  const fs = (pre: string, n: number) => fo(pre, n).map((u) => u.replace('.png', '_s.png'));
  imgTile(g, fs('Bullet52', 1), 'Газ: снаряд (сглажен)', 64, 60);
  imgTile(g, fs('BulletSmoke52', 3), 'Газ: дымок (сглажен)', 64, 50, 200);
  imgTile(g, fo('Explosion52', 14), 'Газ: облако (в игре зеленеет и растёт)', 200, 60, 400);
  imgTile(g, fs('Bullet75', 3), 'Созвездие: снаряд (сглажен)', 90, 60);
  imgTile(g, fs('BulletSmoke75', 3), 'Созвездие: дымок (сглажен)', 40, 50, 200);
  for (const n of [75, 76, 77]) imgTile(g, fo(`Explosion${n}`, 8), `Созвездие: взрыв ${n}`, 273, 60, 400);

  g = section('bolt-game', 'Магическая пуля — сейчас в игре',
    'Кадры оригинала (полный холст Unity), мелкие сглажены ×4. Тайминги из кода оригинала. Цвет в игре задаётся кодом (здесь белые).');
  const bo = (pre: string, a: number, n: number, s = '') => Array.from({ length: n }, (_, i) => `vfx/bolt/orig/${pre}_${String(a + i).padStart(2, '0')}${s}.png`);
  imgTile(g, bo('Bullet1', 1, 1, '_s'), 'пуля (сглажена)', 45, 60);
  imgTile(g, bo('Bullet1Hit', 1, 6), 'попадание, 6 × 0.06 с', 114, 60, 300);
  imgTile(g, bo('BulletSmoke1', 1, 3, '_s'), 'дымок, 3 × 0.05 с', 40, 50, 200);
  imgTile(g, bo('Incinerate3', 1, 3), 'Стрела: рост, 3 × 0.03 с', 130, 30, 300);
  imgTile(g, bo('Bullet8', 1, 1), 'Петарда: пуля', 84, 60);
  imgTile(g, bo('BulletSmoke8', 1, 3), 'Петарда: дымок', 60, 50, 200);
  imgTile(g, bo('Explosion8', 1, 8), 'Петарда: взрыв, 8 кадров', 213, 40, 400);
  imgTile(g, bo('Bullet10', 1, 1), 'Раскол: пуля', 84, 60);
  imgTile(g, bo('BulletSmoke10', 1, 3), 'Раскол: дымок', 60, 50, 200);
  imgTile(g, bo('Bullet10Hit', 1, 6), 'Раскол: попадание, 6 × 0.06 с', 160, 60, 300);
  imgTile(g, bo('Explosion98', 1, 11), 'Фейерверк: взрыв, 11 × 0.039 с', 200, 39, 400);
  imgTile(g, bo('Incinerate20', 1, 10), 'Бластер: луч, 10 × 0.05 с', 300, 50, 400);

  g = section('spirit-game', 'Дух — сейчас в игре',
    'Кадры оригинала: духи 64 px сглажены ×4, снаряды и клинок как есть. A→B→C по 0.2 с, D — кадр выстрела.');
  const so = 'vfx/spirit/orig/';
  for (const [n, name] of [[1, 'база'], [2, 'Ракета'], [8, 'Клинок'], [3, 'Фамильяр']] as const)
    imgTile(g, ['A', 'B', 'C', 'D'].map((l) => `${so}UnitSpirit${n}Motion${l}_s.png`), `дух: ${name}`, 70, 200);
  imgTile(g, [`${so}Incinerate5_00.png`], 'снаряд (база, Ракета ×1.35)', 114, 60);
  imgTile(g, [1, 2, 3, 4].map((i) => `${so}BulletSmoke19_0${i}.png`), 'дымок снаряда', 60, 50, 200);
  imgTile(g, [`${so}Incinerate10_00.png`], 'Фамильяр / Сверхновая: снаряд', 114, 60);
  imgTile(g, Array.from({ length: 8 }, (_, i) => `${so}Incinerate18_0${i + 1}.png`), 'Клинок, 8 кадров ≈0.03 с', 281, 35, 300);
  imgTile(g, Array.from({ length: 10 }, (_, i) => `vfx/bolt/orig/Incinerate20_${String(i + 1).padStart(2, '0')}.png`), 'Магическое копьё (сл. 43), 10 × 0.042 с', 300, 42, 400);

  g = section('mcircle-game', 'Магический круг — сейчас в игре',
    'Кольца оригинала (холст 520 px): A и B меняют кадр каждые 0.08 с и вращаются в разные стороны; цвет свойства задаётся кодом.');
  const mo = (n: number) => `vfx/mcircle/orig/MagicCircle${n}.png`;
  imgTile(g, [mo(1), mo(2)], 'кольцо A (≈68 px радиус)', 136, 80);
  imgTile(g, [mo(4), mo(5)], 'кольцо B (≈94 px радиус)', 188, 80);
  imgTile(g, [mo(7), mo(8)], 'слияние 27: кольца A/B', 194, 80);

  g = section('shield-game', 'Щит — сейчас в игре',
    'Набор кадров = текущее число зарядов (1–5), 4 кадра по 0.3 с. Поле разрушения и Квантовый взрыв — кадры оригинала (в игре Квантовый перекрашивается белый → оранжевый).');
  const sho = (pre: string, n: number) => Array.from({ length: n }, (_, i) => `vfx/shield/orig/${pre}_${String(i + 1).padStart(2, '0')}.png`);
  for (let n = 1; n <= 5; n++) imgTile(g, sho(`Shield${n}`, 4), `щит: ${n} заряд(а)`, 73, 300);
  imgTile(g, sho('Explosion53', 9), 'Поле разрушения (409), ≈0.84 с', 230, 60, 300);
  imgTile(g, sho('Explosion83', 12), 'Квантовый взрыв (сл. 18)', 260, 60, 400);

  g = section('sat-game', 'Спутник — сейчас в игре',
    'Кадры оригинала A→B→C; вид зависит от свойства. 64 px сглажены ×4. Слияния 32/45 в бету не входят.');
  const sa = (n: number, s = '') => ['A', 'B', 'C'].map((l) => `vfx/satellite/orig/UnitSpirit${n}Motion${l}${s}.png`);
  imgTile(g, sa(4, '_s'), 'база, 3 × 0.1 с', 60, 100);
  imgTile(g, sa(6, '_s'), 'Блуждающие огоньки (390)', 60, 100);
  imgTile(g, sa(7), 'Термоядерная реакция (391), 3 × 0.08 с', 200, 80);
  imgTile(g, sa(18), 'Соул Блейд (сл. 62)', 100, 100);
  imgTile(g, ['vfx/satellite/orig/Afterimage_Spirit18.png'], 'Соул Блейд: след (гаснет за 0.12 с)', 100, 100);
  imgTile(g, sa(5), 'ID 5 (взрывы спутника — пока не включается)', 100, 100);

  g = section('cloak-game', 'Маскировка — сейчас в игре',
    'Маг и щит полупрозрачные (α 0.3), бледная подложка экрана. При выходе — взрыв 18; у Телепорта (сл. 40) — взрыв 96, голубой.');
  const co = (pre: string, n: number) => Array.from({ length: n }, (_, i) => `vfx/cloak/orig/${pre}_${String(i + 1).padStart(2, '0')}.png`);
  imgTile(g, co('Explosion18', 8), 'взрыв выхода, 8 × 0.06 с', 230, 60, 400);
  imgTile(g, co('Explosion96', 11), 'Телепорт (сл. 40), 11 × 0.035 с', 200, 35, 400);

  g = section('incin-game', 'Испепеление — сейчас в игре',
    'Облачко: 10 кадров (6 × 0.05 с, 4 × 0.03 с), растёт ×1.115 за тик и краснеет. Пироман (489): язык пламени, кадры 50 (выгружено 14 из 15).');
  const ic = (pre: string, n: number) => Array.from({ length: n }, (_, i) => `vfx/incinerate/orig/${pre}_${String(i + 1).padStart(2, '0')}.png`);
  imgTile(g, ic('Incinerate1', 10), 'облачко пламени (база, 488, 490)', 160, 50, 300);
  imgTile(g, ic('Explosion50', 14), 'язык пламени (489 Пироман), 30/30/60 мс', 200, 60, 300);

  g = section('ray-game', 'Магический луч — сейчас в игре',
    'Старт 36_03 на 0.06 с, дальше 13_03/13_04 через 0.06 с; кружок у мага 13_01/02. Цвет: база фиолет → светлее, 515 золотой, 516 красный → оранжевый. 517: кадры 14, мерцание 0.125 с.');
  const ry = (n: string[]) => n.map((x) => `vfx/ray/orig/Incinerate${x}.png`);
  imgTile(g, ry(['36_03', '13_03', '13_04', '13_03', '13_04']), 'луч (база/515/516)', 300, 60);
  imgTile(g, ry(['13_01', '13_02']), 'кружок у мага', 60, 60);
  imgTile(g, ry(['14_04', '14_05', '14_06']), '517 Электромагнитное: луч', 300, 95);
  imgTile(g, ry(['14_01', '14_02', '14_03']), '517: кружок', 60, 95);

  g = section('flash-game', 'Вспышка — сейчас в игре',
    'Стоит на месте, по кадрам 1–7 бежит хитбокс. База/542: кадры 12, 10 × 0.055 с. 543 Рагнарок: кадры 20, тёплый. 544 Когти: кадры 12, 0.04 с, красный, случайный угол.');
  const fl = (n: number) => Array.from({ length: 10 }, (_, i) => `vfx/flash/orig/Incinerate${n}_${String(i + 1).padStart(2, '0')}.png`);
  imgTile(g, fl(12), 'база и 542 Уничтожение', 320, 55, 300);
  imgTile(g, fl(20), '543 Рагнарок', 320, 55, 300);

  g = section('vfx', 'Огненный шар (старая проба)',
    'Шар нарисован слоями по меркам оригинала: красная кайма → золото → бледный → крем, языки-капсулы назад (research/vfx/fireball/ball_draw.py), 6 кадров по 0.06 с. ' +
    'Взрыв — из редактора Effekseer, 9 кадров по 0.06 с; «плавно» — 18 кадров. Размер «в игре»: шар 148×77, взрыв 218 px.');
  const seq = (pre: string, n: number) => Array.from({ length: n }, (_, i) => `vfx/fireball/${pre}_${String(i + 1).padStart(2, '0')}.png`);
  imgTile(g, seq('ball2', 6), 'шар крупно', 328, 60);
  imgTile(g, seq('ball2', 6), 'шар в игре', 93, 60);   // кадр 328 px = часть спрайта 520 px, в игре ×0.285
  imgTile(g, seq('hit', 9), 'взрыв, 9 кадров', 256, 60, 400);
  imgTile(g, seq('hit18', 18), 'взрыв плавно, 18 кадров', 256, 30, 400);
  imgTile(g, seq('hit', 9), 'взрыв в игре', 218, 60, 400);

  g = section('icons', 'Иконки заклинаний и пассивок', 'Цвет — вариант преображения (свойства).');
  for (const def of SPELLS) {
    tile(g, [def.icon], def.name, 0.8, { dark: true });
    for (const lvl of def.attrLevels) for (const a of def.attrs[lvl]) tile(g, [def.icon], a.name, 0.8, { dark: true, tint: a.tint });
  }
  for (const p of PASSIVES) tile(g, [p.icon], p.name, 0.8, { dark: true });

  // карточки выбора
  const h = section('cards', 'Карточки выбора заклинания', 'Так выглядит экран выбора при повышении уровня.');
  const wrap = document.createElement('div'); wrap.className = 'cards-demo';
  for (const def of SPELLS) {
    const c = document.createElement('div'); c.className = 'card';
    c.innerHTML = `<img src="${iconUrl(def.icon)}"><div class="body"><div class="title">${esc(def.name)}<span class="tag">новое</span></div><div class="line">${esc(def.desc)}</div></div><div class="lv">Lv 1</div>`;
    wrap.appendChild(c);
  }
  h.appendChild(wrap);

  // артефакты
  const ag = section('arts', `Артефакты (${ARTIFACTS.length} из ~180 в плане)`, 'Пока значки-смайлики — заменим на нарисованные иконки.');
  ag.className = 'cols';
  for (const a of ARTIFACTS) {
    const d = document.createElement('div'); d.className = 'art';
    d.innerHTML = `<span class="ae" style="border-color:${RARITY[a.rarity].color}">${a.emoji}</span><div><b>${esc(a.name)}</b><div class="r" style="color:${RARITY[a.rarity].color}">${RARITY[a.rarity].name}</div><div class="t">${a.text.map(esc).join('<br>')}</div></div>`;
    ag.appendChild(d);
  }

  const sg = section('syn', `Синергии (${SYNERGIES.length} из ~52)`);
  sg.className = 'cols';
  for (const s of SYNERGIES) {
    const d = document.createElement('div'); d.className = 'art';
    d.innerHTML = `<span class="ae" style="border-color:#3fa86b">${s.emoji}</span><div><b>${esc(s.name)}</b><div class="t" style="color:#9fd8ff">${s.text.map(esc).join('<br>')}</div><div class="r" style="color:#9aa3b5;margin-top:4px">${s.parts.map((p) => artifactById(p).emoji + ' ' + esc(artifactById(p).name)).join(' · ')}</div></div>`;
    sg.appendChild(d);
  }
}

class Boot extends Phaser.Scene {
  // картинки мира 2.0 нужны для мобов en_*, сундука, обелиска и торговца
  preload() { for (const [k, p] of Object.entries(ART)) if (p.includes('/world/')) this.load.image(k, p); }
  create() { makeTextures(this); tm = this.textures; bootScene = this; build(); }
}
new Phaser.Game({ type: Phaser.CANVAS, parent: 'phaser', width: 2, height: 2, scene: [Boot], banner: false });
