import { RARITY, type ArtifactDef } from '../game/Artifacts';
import { W } from '../game/World';
import { artifactText } from './chest';
import { clearModals, fmtTime, icon } from './ui';

// Окна хода зоны: торговец, усиление заклинания, зона пройдена.

const root = () => document.getElementById('ui')!;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

function div(cls: string, html = '') {
  const e = document.createElement('div');
  e.className = cls; e.innerHTML = html;
  return e;
}

export interface ShopItem { a: ArtifactDef; price: number; discount: boolean; sold: boolean }

/** Торговец: 8 артефактов (2×4) за ману, на одном скидка 25%. Можно купить несколько. */
export function showShop(items: ShopItem[], onBuy: (it: ShopItem) => void, onClose: () => void) {
  clearModals();
  const m = div('modal shop', `
    <button class="close">✕</button>
    <div class="wallet"><i></i><span></span></div>
    <div class="hood"></div>
    <div class="sgrid"></div>
    <div class="sinfo"><div class="hint">Выберите товар, который хотите купить</div></div>
    <button class="take buy" disabled>Купить</button>`);
  const grid = m.querySelector('.sgrid')!;
  const info = m.querySelector('.sinfo')!;
  const buy = m.querySelector('.buy') as HTMLButtonElement;
  const wallet = m.querySelector('.wallet span')!;
  let sel: ShopItem | null = null;
  let locked = true;
  setTimeout(() => (locked = false), 300);

  const render = () => {
    wallet.textContent = String(Math.floor(W.mana));
    grid.innerHTML = '';
    for (const it of items) {
      const c = div('scard' + (it.sold ? ' sold' : '') + (it === sel ? ' sel' : ''), `
        ${it.discount && !it.sold ? '<b class="disc">-25%</b>' : ''}
        <span>${it.a.emoji}</span>
        <div class="price ${W.mana < it.price ? 'no' : ''}"><i></i>${it.sold ? 'продано' : it.price}</div>`);
      c.style.borderColor = RARITY[it.a.rarity].color;
      c.addEventListener('click', () => {
        if (locked || it.sold) return;
        sel = it; render();
        info.innerHTML = `<div class="aname">${esc(it.a.name)}</div><div class="arar" style="color:${RARITY[it.a.rarity].color}">${RARITY[it.a.rarity].name}</div><div class="atext">${artifactText(it.a)}</div>`;
      });
      grid.appendChild(c);
    }
    buy.disabled = !sel || sel.sold || W.mana < sel.price;
  };
  buy.addEventListener('click', () => {
    if (!sel || sel.sold || W.mana < sel.price) return;
    onBuy(sel); sel.sold = true; sel = null;
    info.innerHTML = '<div class="hint">Куплено!</div>';
    render();
  });
  m.querySelector('.close')!.addEventListener('click', () => { if (locked) return; clearModals(); onClose(); });
  render();
  root().appendChild(m);
}

/** Усиление заклинания: выбрать любое своё заклинание → урон +50%, перезарядка −5% */
export function showEnhance(onPick: (id: string) => void) {
  clearModals();
  const m = div('modal enhance', `
    <h1>Усиление заклинания</h1>
    <div class="sub">Выберите заклинание для усиления</div>
    <div class="egrid"></div>
    <div class="einfo"></div>
    <button class="take" disabled>Выбрать</button>`);
  const grid = m.querySelector('.egrid')!;
  const info = m.querySelector('.einfo')!;
  const take = m.querySelector('.take') as HTMLButtonElement;
  let sel = '';
  for (const sp of W.book.spells.values()) {
    const n = W.stats.enhanced[sp.def.id] ?? 0;
    const c = div('ecard', `<img src="${icon(sp.def.icon)}">${n ? `<b>+${n}</b>` : ''}`);
    c.addEventListener('click', () => {
      sel = sp.def.id; take.disabled = false;
      grid.querySelectorAll('.ecard').forEach((x) => x.classList.remove('sel'));
      c.classList.add('sel');
      info.innerHTML = `<div class="aname">${esc(sp.def.name)}</div><div class="atext"><div>Урон +50%</div><div>Перезарядка -5%</div></div>`;
    });
    grid.appendChild(c);
  }
  take.addEventListener('click', () => { if (!sel) return; clearModals(); onPick(sel); });
  root().appendChild(m);
}

/** Зона пройдена (после босса 12:00) */
export function showZoneClear(onRetry: () => void, onMenu: () => void) {
  clearModals();
  const m = div('modal dead zoneclear', `
    <h1>Зона пройдена</h1>
    <div class="sub">Все 4 босса повержены</div>
    <div class="stat time">⏱ ${fmtTime(W.time)}</div>
    <div class="stat kills">☠ ${W.kills}</div>
    <div class="stat">Уровень ${W.player.level}</div>
    <div class="btns"><button class="retry">Ещё раз</button><button class="menu">В меню</button></div>`);
  m.querySelector('.retry')!.addEventListener('click', () => { clearModals(); onRetry(); });
  m.querySelector('.menu')!.addEventListener('click', () => { clearModals(); onMenu(); });
  root().appendChild(m);
}
