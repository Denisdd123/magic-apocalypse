import { PASSIVES, SPELLS } from '../game/SpellBook';
import { W } from '../game/World';
import { clearModals, fmtTime, icon } from './ui';

// Экраны паузы, истории боя и смерти.

const root = () => document.getElementById('ui')!;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
const pct = (v: number, sign = true) => `${sign && v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function div(cls: string, html = '') {
  const e = document.createElement('div');
  e.className = cls; e.innerHTML = html;
  return e;
}

/** Окно поверх паузы (магия / артефакты / синергии / история) с крестиком */
function subPanel(title: string, sub: string, body: string) {
  const s = div('modal subpanel', `<button class="close">✕</button><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}<div class="panel">${body}</div>`);
  s.querySelector('.close')!.addEventListener('click', () => s.remove());
  root().appendChild(s);
}

function spellsHtml() {
  let html = '';
  for (const def of SPELLS) {
    const sp = W.book.spells.get(def.id);
    if (!sp) continue;
    const attrs = [...sp.attrs].map((id) => Object.values(def.attrs).flat().find((a) => a.id === id)?.name).filter(Boolean).join(', ');
    html += `<div class="row"><img src="${icon(def.icon, sp.tint)}"><div>${esc(def.name)}${attrs ? `<div class="attrname" style="color:${hex(sp.tint)}">${esc(attrs)}</div>` : ''}</div><span class="lvl">Lv ${sp.level}</span></div>`;
  }
  const passives = PASSIVES.filter((p) => W.book.passives.get(p.id));
  if (passives.length) {
    html += '<h3>Пассивные</h3>';
    for (const def of passives) html += `<div class="row"><img src="${icon(def.icon)}"><div>${esc(def.name)}</div><span class="lvl">Lv ${W.book.passives.get(def.id)}</span></div>`;
  }
  return html || '<div class="empty">Пока ничего не изучено</div>';
}

/** История боя: урон каждого заклинания за забег */
export function showHistory() {
  const rows = [...W.dmgBy.entries()].sort((a, b) => b[1] - a[1]);
  const max = rows.length ? rows[0][1] : 1;
  let html = '';
  for (const [id, v] of rows) {
    const def = SPELLS.find((s) => s.id === id);
    if (!def) continue;
    const sp = W.book.spells.get(id);
    html += `<div class="hist"><img src="${icon(def.icon, sp?.tint)}"><div class="hb"><div class="hn"><span>${esc(def.name)}</span><b${v === max ? ' class="top"' : ''}>${Math.round(v).toLocaleString('ru-RU')}</b></div><div class="bar"><div style="width:${((v / max) * 100).toFixed(1)}%"></div></div></div></div>`;
  }
  subPanel('История боя', 'Разлом : первая зона', html || '<div class="empty">Урона пока нет</div>');
}

function statsHtml() {
  const s = W.stats, P = W.player;
  type Row = [string, string, string, string];
  const L: Row[] = [
    ['♥', '#ff4d5e', 'Здоровье', `${Math.ceil(P.hp)} / ${Math.round(s.maxHp)}`],
    ['✚', '#5dff6a', 'Исцеление в сек', pct(s.regen, false)],
    ['❤', '#ff6b6b', 'Исцеление от сферы', String(Math.round(s.maxHp * 0.2 * (1 + s.lifeOrbHeal)))],
    ['◈', '#8fd3ff', 'Получаемый урон', pct(-s.dmgTaken)],
    ['➶', '#9fb6ff', 'Уклонение', pct(s.evasion, false)],
    ['➤', '#e9ecf2', 'Скорость движения', String(Math.round(100 * (1 + s.speed)))],
    ['⊕', '#ff7ad9', 'Шанс крит. удара', pct(s.crit, false)],
    ['✷', '#ff9a5a', 'Усиление крит. удара', pct(s.critMult, false)],
  ];
  const R: Row[] = [
    ['⚗', '#6ff2d8', 'Сила атаки', String(Math.round(s.atk * 10))],
    ['⚗', '#ff7ad9', 'Приумножение атаки', pct(s.amp + s.tempAmp)],
    ['⚗', '#8cf28c', 'Весь магический урон', pct(s.magicDmg)],
    ['✺', '#ffb05a', 'Размер заклинаний', pct(s.size)],
    ['◎', '#8cf28c', 'Длительность заклинаний', pct(s.duration)],
    ['⧗', '#e9ecf2', 'Перезарядка заклинаний', pct(-s.cdr)],
    ['☠', '#c06bff', 'Макс. HP врагов', '+0%'],
    ['●', '#46d6ff', 'Получение маны', pct(s.xpGain)],
    ['⌕', '#e9ecf2', 'Радиус сбора', pct(s.pickup)],
  ];
  const col = (rows: Row[]) => rows.map(([ic, c, n, v]) => {
    const dim = v === '+0%' || v === '0%' ? 'dim' : '';
    return `<div class="st"><i style="color:${c}">${ic}</i><span>${n}</span><b class="${dim}">${v}</b></div>`;
  }).join('');
  return `<div class="stgrid"><div>${col(L)}</div><div>${col(R)}</div></div>`;
}

// ---------------- Пауза ----------------
export function showPause(onResume: () => void, onQuit: () => void) {
  clearModals();
  const m = div('modal pause', `
    <button class="histbtn" aria-label="История боя"><span></span><span></span><span></span></button>
    <h1 class="ptitle">Пауза</h1>
    <div class="pinfo"><div class="g">Текущий уровень : ${W.player.level}</div><div class="o">Время жизни ${fmtTime(W.time)}</div><div class="o">Уничтожено врагов : ${W.kills}</div></div>
    ${statsHtml()}
    <button class="resume">Продолжить игру</button>
    <div class="roundbtns">
      <button class="rb" data-k="magic"><img src="${icon('ico_magic')}"></button>
      <button class="rb" data-k="art"><img src="${icon('ico_grail')}"></button>
      <button class="rb" data-k="syn"><img src="${icon('ico_synergy')}"></button>
      <button class="rb quit" data-k="quit">✕</button>
    </div>`);
  m.querySelector('.histbtn')!.addEventListener('click', showHistory);
  m.querySelector('.resume')!.addEventListener('click', () => { clearModals(); onResume(); });
  m.querySelectorAll<HTMLButtonElement>('.rb').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.k;
    if (k === 'magic') subPanel('Магия', '', spellsHtml());
    if (k === 'art') subPanel('Артефакты', '', '<div class="empty">Артефактов пока нет.<br>Сундуки с артефактами появятся в следующем обновлении.</div>');
    if (k === 'syn') subPanel('Синергии', '', '<div class="empty">Синергии появятся вместе с артефактами.</div>');
    if (k === 'quit') {
      const c = div('modal confirm', '<h1>Завершить забег?</h1><div class="btns"><button class="y">Да</button><button class="n">Нет</button></div>');
      c.querySelector('.y')!.addEventListener('click', () => { clearModals(); onQuit(); });
      c.querySelector('.n')!.addEventListener('click', () => c.remove());
      root().appendChild(c);
    }
  }));
  root().appendChild(m);
}

// ---------------- Смерть ----------------
export function showDeath(onRetry: () => void, onMenu: () => void) {
  clearModals();
  const m = div('modal dead', `
    <h1>Хранитель пал</h1>
    <div class="sub">Разлом · первая зона</div>
    <div class="stat time">⏱ ${fmtTime(W.time)}</div>
    <div class="stat kills">☠ ${W.kills}</div>
    <div class="stat manastat"><i></i>${Math.floor(W.mana)}</div>
    <div class="stat">Уровень ${W.player.level}</div>
    <button class="histopen">История боя</button>
    <div class="btns"><button class="retry">Ещё раз</button><button class="menu">В меню</button></div>`);
  m.querySelector('.histopen')!.addEventListener('click', showHistory);
  m.querySelector('.retry')!.addEventListener('click', () => { clearModals(); onRetry(); });
  m.querySelector('.menu')!.addEventListener('click', () => { clearModals(); onMenu(); });
  root().appendChild(m);
}
