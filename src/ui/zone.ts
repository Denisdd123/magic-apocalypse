import { DataSpell } from '../game/spells/DataSpell';
import { RARITY, type ArtifactDef } from '../game/Artifacts';
import { W } from '../game/World';
import { artIcon, artifactText } from './chest';
import { clearModals, fmtTime, icon } from './ui';

// Окна хода зоны: торговец, усиление заклинания, зона пройдена.

const root = () => document.getElementById('ui')!;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

function div(cls: string, html = '') {
  const e = document.createElement('div');
  e.className = cls; e.innerHTML = html;
  return e;
}

export interface ShopItem { a: ArtifactDef; price: number; sold: boolean }

/** Торговец: до 8 артефактов (4×2) за ману; купленный слот исчезает, можно купить несколько; выход — крестик */
export function showShop(items: ShopItem[], onBuy: (it: ShopItem) => void, onClose: () => void) {
  clearModals();
  const m = div('modal shop', `
    <button class="close">✕</button>
    <div class="wallet"><i></i><span></span></div>
    <div class="hood">${icon('merchant') ? `<img src="${icon('merchant')}" alt="">` : ''}<div class="say">Товары за ману</div></div>
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
        ${artIcon(it.a)}
        <div class="price"><i></i>${it.price}</div>`);
      c.style.setProperty('--rc', RARITY[it.a.rarity].frame);
      c.style.setProperty('--rbg', RARITY[it.a.rarity].bg);
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
    <img class="enpic" src="${icon('enchant')}" alt="">
    <h1>Очарование</h1>
    <div class="sub">Выберите заклинание (до 3 раз на каждое)</div>
    <div class="egrid"></div>
    <div class="einfo"></div>
    <button class="take" disabled>Выбрать</button>`);
  const grid = m.querySelector('.egrid')!;
  const info = m.querySelector('.einfo')!;
  const take = m.querySelector('.take') as HTMLButtonElement;
  let sel = '';
  for (const sp of W.book.spells.values()) {
    if (!(sp instanceof DataSpell) || !sp.canEnchant()) continue;
    const n = sp.enchants;
    const c = div('ecard', `<img src="${icon(sp.def.icon)}">${n ? `<b>+${n}</b>` : ''}`);
    c.addEventListener('click', () => {
      sel = sp.def.id; take.disabled = false;
      grid.querySelectorAll('.ecard').forEach((x) => x.classList.remove('sel'));
      c.classList.add('sel');
      info.innerHTML = `<div class="aname">${esc(sp.def.name)}</div><div class="atext">${(sp.data.enchant?.mods ?? []).map((x) => `<div>${esc(x.text)}</div>`).join('')}</div>`;
    });
    grid.appendChild(c);
  }
  take.addEventListener('click', () => { if (!sel) return; clearModals(); onPick(sel); });
  root().appendChild(m);
}

/** Зона пройдена (после босса 12:00) */
export function showZoneClear(onRetry: () => void, onMenu: () => void, onContinue?: () => void) {
  clearModals();
  const m = div('modal dead zoneclear', `
    <div class="brand">Magic Apocalypse <span>2.0</span></div>
    <h1>Зона пройдена</h1>
    <div class="sub">Вы продержались до 12:00</div>
    <div class="dstats">
      <div class="ds"><i>⏱</i><b>${fmtTime(W.time)}</b><span>время</span></div>
      <div class="ds"><i>☠</i><b>${W.kills}</b><span>убито</span></div>
      <div class="ds"><i class="orbi"></i><b>${Math.floor(W.mana)}</b><span>мана</span></div>
      <div class="ds"><i>✦</i><b>${W.player.level}</b><span>уровень</span></div>
    </div>
    <div class="btns">${onContinue ? '<button class="cont">Бесконечный режим</button>' : ''}<button class="retry">Ещё раз</button><button class="menu">В меню</button></div>`);
  m.querySelector('.cont')?.addEventListener('click', () => { clearModals(); onContinue?.(); });
  m.querySelector('.retry')!.addEventListener('click', () => { clearModals(); onRetry(); });
  m.querySelector('.menu')!.addEventListener('click', () => { clearModals(); onMenu(); });
  root().appendChild(m);
}
