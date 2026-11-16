import Phaser from 'phaser';
import './ui/style.css';
import { makeTextures } from './textures';
import { SPELLS, PASSIVES } from './game/SpellBook';
import { ARTIFACTS, SYNERGIES, RARITY, artifactById } from './game/Artifacts';
import { RUNES } from './game/Pickups';
import { ENEMY_TYPES } from './game/Enemies';
import { ART } from './data/art';

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

const iconUrl = (key: string, tint?: number) => {
  const src = tm.get(key).getSourceImage() as HTMLCanvasElement;
  const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext('2d')!; ctx.drawImage(src, 0, 0);
  if (tint !== undefined && tint !== 0xffffff) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = hex(tint); ctx.fillRect(0, 0, cv.width, cv.height); }
  return cv.toDataURL();
};

function build() {
  root.innerHTML = `<h1>Галерея Magic Apocalypse</h1>
    <div class="note">Вся графика и контент игры. Анимация — как в игре. Отмечай, что нравится, а что переделать.</div>
    <div class="toc"><a href="#mage">Маг</a><a href="#mobs">Мобы</a><a href="#items">Предметы</a><a href="#fx">Эффекты</a><a href="#icons">Иконки</a><a href="#cards">Карточки</a><a href="#arts">Артефакты</a><a href="#syn">Синергии</a></div>`;

  let g = section('mage', 'Маг', 'Анимация «дыхания»: 4 кадра, 3 в секунду (в движении 5). В игре маг размером 18×29 — здесь крупнее.');
  tile(g, [0, 1, 2, 3].map((f) => 'player_' + f), 'анимация', 1.6, { fps: 3 });
  [0, 1, 2, 3].forEach((f) => tile(g, ['player_' + f], 'кадр ' + (f + 1), 1));
  tile(g, [0, 1, 2, 3].map((f) => 'player_' + f), 'в игре (размер)', 0.33, { fps: 3 });
  tile(g, [0, 1, 2, 3].map((f) => 'mirage_' + f), 'двойник (Шквал/Двойники)', 1, { fps: 3, tint: 0xc49bff, dark: true });
  // маг в игре 2.0: 4 позы (вверх-вниз / диагональ / вбок — влево зеркально), 3 кадра подола
  for (const [p, n] of [['idle', 'стоит'], ['vert', 'вверх/вниз'], ['diag', 'диагональ'], ['side', 'вбок']] as const) {
    tile(g, [0, 1, 2].map((f) => `mage_${p}_${f}`), 'поза: ' + n, 1, { fps: 9 });
  }

  g = section('mobs', 'Мобы', 'Графика 2.0 (en_*): один кадр, в игре «дышит» покачиванием. Старые процедурные кляксы — 3 кадра «дрожащей линии».');
  for (const [k, t] of Object.entries(ENEMY_TYPES)) {
    // en_* — один кадр; старые текстуры — tex_0..2
    const keys = tm.exists(t.tex + '_0') ? [0, 1, 2].map((f) => `${t.tex}_${f}`) : [t.tex];
    tile(g, keys, `${k} (HP ${t.hp})`, t.id === 'boss' ? 0.5 : 0.6, { fps: 4 });
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
  create() { makeTextures(this); tm = this.textures; build(); }
}
new Phaser.Game({ type: Phaser.CANVAS, parent: 'phaser', width: 2, height: 2, scene: [Boot], banner: false });
