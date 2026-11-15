import type Phaser from 'phaser';
import type { Choice } from '../game/SpellBook';
import { PASSIVES, SPELLS } from '../game/SpellBook';
import type { AttrDef, Spell } from '../game/spells/Spell';

// Интерфейс поверх игры — обычный HTML: чёткий текст на любом экране и простая вёрстка.

const root = () => document.getElementById('ui')!;
let textures: Phaser.Textures.TextureManager | null = null;
const iconCache = new Map<string, string>();

export function initUi(tm: Phaser.Textures.TextureManager) { textures = tm; }

export function icon(key: string, tint?: number): string {
  const ck = key + ':' + (tint ?? '');
  const c = iconCache.get(ck);
  if (c) return c;
  if (!textures || !textures.exists(key)) return '';
  const src = textures.get(key).getSourceImage() as HTMLCanvasElement | HTMLImageElement;
  const cv = document.createElement('canvas');
  cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  if (tint !== undefined && tint !== 0xffffff) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#' + tint.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
  const url = cv.toDataURL();
  iconCache.set(ck, url);
  return url;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

export function clearModals() { root().querySelectorAll('.modal').forEach((m) => m.remove()); }

// ---------------- Меню ----------------
export function showMenu(onPlay: () => void) {
  clearModals();
  const m = el('div', 'modal menu');
  m.innerHTML = `
    <div class="logo">Magic<br>Apocalypse<small>ВЫЖИВИ В РАЗЛОМЕ</small></div>
    <button class="play">Играть</button>
    <div class="hint">Веди пальцем в любом месте экрана, чтобы ходить. Маг атакует сам. Собирай голубые сферы и выбирай заклинания.</div>`;
  m.querySelector('.play')!.addEventListener('click', () => { m.remove(); onPlay(); });
  root().appendChild(m);
}

// ---------------- HUD ----------------
export class Hud {
  private wrap = el('div', 'hud');
  private xp = el('div');
  private lvl = el('div', 'lvl');
  private timer = el('div', 'timer');
  private kills = el('div', 'kills');
  private cds = el('div', 'cdicons');
  private cdMap = new Map<string, HTMLElement>();

  constructor(onPause: () => void) {
    const bar = el('div', 'xpbar'); bar.appendChild(this.xp);
    const top = el('div', 'topline');
    const right = el('div', 'right');
    const pb = el('button', 'pausebtn', '❚❚');
    pb.addEventListener('click', onPause);
    right.append(this.kills, pb);
    top.append(this.lvl, this.timer, right);
    this.wrap.append(bar, top, this.cds);
    root().appendChild(this.wrap);
  }

  set(level: number, xpFrac: number, time: number, kills: number) {
    this.xp.style.width = Math.min(100, xpFrac * 100).toFixed(1) + '%';
    this.lvl.textContent = 'Ур. ' + level;
    const m = Math.floor(time / 60), s = Math.floor(time % 60);
    this.timer.textContent = `${m.toString().padStart(2, '0')} : ${s.toString().padStart(2, '0')}`;
    this.kills.textContent = '☠ ' + kills;
  }

  /** Иконка перезарядки (Фаза и др.): frac 0 = готово, 1 = только что использовано */
  cd(id: string, iconKey: string, frac: number) {
    let e = this.cdMap.get(id);
    if (!e) {
      e = el('div', 'cdicon', `<img src="${icon(iconKey)}"><div class="shade"></div>`);
      this.cds.appendChild(e); this.cdMap.set(id, e);
    }
    (e.querySelector('.shade') as HTMLElement).style.height = (Math.max(0, Math.min(1, frac)) * 100).toFixed(0) + '%';
  }

  destroy() { this.wrap.remove(); }
}

// ---------------- Джойстик ----------------
export class Joystick {
  x = 0; y = 0;
  private base = el('div', 'joy');
  private knob = el('div', 'knob');
  private id: number | null = null;
  private ox = 0; private oy = 0;
  private keys = new Set<string>();
  private R = 50;

  constructor(private target: HTMLElement) {
    this.base.appendChild(this.knob);
    root().appendChild(this.base);
    target.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
  }

  private down = (e: PointerEvent) => {
    if (this.id !== null) return;
    this.id = e.pointerId; this.ox = e.clientX; this.oy = e.clientY;
    this.base.style.display = 'block';
    this.base.style.left = this.ox + 'px'; this.base.style.top = this.oy + 'px';
    this.knob.style.transform = 'translate(0px,0px)';
    this.x = this.y = 0;
  };
  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.id) return;
    let dx = e.clientX - this.ox, dy = e.clientY - this.oy;
    const d = Math.hypot(dx, dy);
    if (d > this.R) { dx = (dx / d) * this.R; dy = (dy / d) * this.R; }
    this.knob.style.transform = `translate(${dx}px,${dy}px)`;
    const k = d < 6 ? 0 : 1;
    this.x = (dx / this.R) * k; this.y = (dy / this.R) * k;
    // полный ход уже при половине радиуса — удобнее на телефоне
    const len = Math.hypot(this.x, this.y);
    if (len > 0) { const f = Math.min(1, len * 1.6) / len; this.x *= f; this.y *= f; }
  };
  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.id) return;
    this.id = null; this.x = this.y = 0;
    this.base.style.display = 'none';
  };
  private kd = (e: KeyboardEvent) => this.keys.add(e.code);
  private ku = (e: KeyboardEvent) => this.keys.delete(e.code);

  release() { this.id = null; this.x = this.y = 0; this.base.style.display = 'none'; }

  get vector() {
    let kx = 0, ky = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ky -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ky += 1;
    if (kx || ky) { const l = Math.hypot(kx, ky); return { x: kx / l, y: ky / l }; }
    return { x: this.x, y: this.y };
  }

  destroy() {
    this.target.removeEventListener('pointerdown', this.down);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.up);
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    this.base.remove();
  }
}

// ---------------- Выбор заклинания ----------------
export function showLevelUp(level: number, choices: Choice[], refundPct: number, onPick: (c: Choice) => void, onRefund: () => void) {
  clearModals();
  const m = el('div', 'modal');
  m.appendChild(el('div', 'sub', 'Текущий уровень: ' + level));
  m.appendChild(el('h1', '', 'Выбор заклинания'));
  const cards = el('div', 'cards');
  let locked = true;
  setTimeout(() => (locked = false), 250); // защита от случайного тапа
  for (const c of choices) {
    const card = el('div', 'card');
    const cls = c.attr ? 'attr' : c.isNew ? '' : 'up';
    const tag = c.isNew && c.kind !== 'heal' ? '<span class="tag">новое</span>' : '';
    card.innerHTML = `
      <img src="${icon(c.icon)}">
      <div class="body">
        <div class="title">${esc(c.title)}${tag}</div>
        ${c.lines.map((l) => `<div class="line ${cls}">${esc(l)}</div>`).join('')}
      </div>
      ${c.level ? `<div class="lv">Lv ${c.level}</div>` : ''}`;
    card.addEventListener('click', () => { if (locked) return; m.remove(); onPick(c); });
    cards.appendChild(card);
  }
  m.appendChild(cards);
  const rb = el('button', 'refund', `Вернуть ${Math.round(refundPct * 100)}% маны`);
  rb.addEventListener('click', () => { if (locked) return; m.remove(); onRefund(); });
  m.appendChild(rb);
  root().appendChild(m);
}

// ---------------- Выбор свойства (преображения) ----------------
export function showAttrPick(sp: Spell, options: AttrDef[], onPick: (a: AttrDef) => void) {
  clearModals();
  const m = el('div', 'modal');
  m.style.background = 'rgba(0,0,0,0.88)';
  m.appendChild(el('h1', '', 'Выбор свойства'));
  m.appendChild(el('div', 'sub', esc(sp.def.name)));
  const list = el('div', 'attrs');
  let sel: AttrDef | null = null;
  const learn = el('button', 'learn', 'Изучить') as HTMLButtonElement;
  learn.disabled = true;
  for (const a of options) {
    const row = el('div', 'attr');
    row.innerHTML = `<img src="${icon(sp.def.icon, a.tint)}"><div><div class="title">${esc(a.name)}</div>${a.lines.map((l) => `<div class="line">${esc(l)}</div>`).join('')}</div>`;
    row.addEventListener('click', () => {
      list.querySelectorAll('.attr').forEach((r) => r.classList.remove('sel'));
      row.classList.add('sel'); sel = a; learn.disabled = false;
    });
    list.appendChild(row);
  }
  learn.addEventListener('click', () => { if (!sel) return; m.remove(); onPick(sel); });
  m.append(list, learn);
  root().appendChild(m);
}

// ---------------- Пауза ----------------
export function showPause(spells: Map<string, Spell>, passives: Map<string, number>, onResume: () => void, onQuit: () => void) {
  clearModals();
  const m = el('div', 'modal');
  m.appendChild(el('h1', '', 'Пауза'));
  const p = el('div', 'panel');
  let html = '<h3>Заклинания</h3>';
  for (const def of SPELLS) {
    const sp = spells.get(def.id);
    if (!sp) continue;
    const attrs = [...sp.attrs].map((id) => Object.values(def.attrs).flat().find((a) => a.id === id)?.name).filter(Boolean).join(', ');
    html += `<div class="row"><img src="${icon(def.icon, sp.tint)}"><div>${esc(def.name)}${attrs ? `<div class="attrname" style="color:#${sp.tint.toString(16).padStart(6, '0')}">${esc(attrs)}</div>` : ''}</div><span class="lvl">Lv ${sp.level}</span></div>`;
  }
  if (passives.size) {
    html += '<h3>Пассивные</h3>';
    for (const def of PASSIVES) {
      const lv = passives.get(def.id);
      if (lv) html += `<div class="row"><img src="${icon(def.icon)}"><div>${esc(def.name)}</div><span class="lvl">Lv ${lv}</span></div>`;
    }
  }
  p.innerHTML = html;
  m.appendChild(p);
  const b = el('div', 'btns');
  const r = el('button', '', 'Продолжить'); r.addEventListener('click', () => { m.remove(); onResume(); });
  const q = el('button', '', 'Сдаться'); q.addEventListener('click', () => { m.remove(); onQuit(); });
  b.append(r, q);
  m.appendChild(b);
  root().appendChild(m);
}

// ---------------- Смерть ----------------
export function showDeath(time: number, kills: number, level: number, onRetry: () => void, onMenu: () => void) {
  clearModals();
  const m = el('div', 'modal dead');
  const mm = Math.floor(time / 60), ss = Math.floor(time % 60);
  m.innerHTML = `
    <h1>Хранитель пал</h1>
    <div class="sub">Разлом · первая зона</div>
    <div class="stat time">⏱ ${mm.toString().padStart(2, '0')} : ${ss.toString().padStart(2, '0')}</div>
    <div class="stat kills">☠ ${kills}</div>
    <div class="stat">Уровень ${level}</div>`;
  const b = el('div', 'btns');
  const r = el('button', '', 'Ещё раз'); r.addEventListener('click', () => { m.remove(); onRetry(); });
  const q = el('button', '', 'В меню'); q.addEventListener('click', () => { m.remove(); onMenu(); });
  b.append(r, q);
  m.appendChild(b);
  root().appendChild(m);
}
