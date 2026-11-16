import type Phaser from 'phaser';
import type { Choice } from '../game/SpellBook';
import type { AttrDef, Spell } from '../game/spells/Spell';
import { W } from '../game/World';
import { ART } from '../data/art';

// Интерфейс поверх игры — обычный HTML: чёткий текст на любом экране и простая вёрстка.
// Стиль 2.0 — Dark Fantasy: почти чёрные плашки с рваным краем, кистевые иконки, тусклое золото и багрянец.

const root = () => document.getElementById('ui')!;
let textures: Phaser.Textures.TextureManager | null = null;
const iconCache = new Map<string, string>();

export function initUi(tm: Phaser.Textures.TextureManager) { textures = tm; }

export function icon(key: string, tint?: number): string {
  const ck = key + ':' + (tint ?? '');
  const c = iconCache.get(ck);
  if (c) return c;
  if (textures && !textures.exists(key)) {
    // ключ без суффикса имени: 'pas_31' → 'pas_31_intelligence'
    const full = textures.getTextureKeys().find((k) => k.startsWith(key + '_'));
    if (full) key = full;
  }
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

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
/** Числа в описаниях подсвечиваются цветом (как в оригинале) */
const numHl = (s: string) => esc(s).replace(/([+\-−]?\d+(?:[.,]\d+)?\s?%?)/g, '<b>$1</b>');

export function clearModals() { root().querySelectorAll('.modal').forEach((m) => m.remove()); }

// ---------------- Индикатор загрузки ----------------
// Пока Phaser грузит картинки 2.0 (~3 МБ), в index.html висит #boot. Прогресс считаем по Resource Timing
// (каждая загруженная картинка из public/v2 — одна запись), а убираем экран, когда появится меню.
(function bootProgress() {
  const boot = document.getElementById('boot');
  if (!boot || typeof PerformanceObserver === 'undefined') return;
  // до меню грузятся только картинки для боя (см. CRITICAL в GameScene)
  const total = Object.values(ART).filter((p) => /^v2\/(spell_fx|world|spell_icons|passives)\//.test(p)).length || 1;
  const seen = new Set<string>();
  const bar = boot.querySelector<HTMLElement>('.boot-bar i');
  const pctEl = boot.querySelector<HTMLElement>('.boot-pct');
  const count = (list: PerformanceEntryList) => {
    for (const e of list) if (e.name.includes('/v2/')) seen.add(e.name);
    const p = Math.min(1, seen.size / total);
    if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
    if (pctEl) pctEl.textContent = Math.round(p * 100) + '%';
  };
  try {
    const po = new PerformanceObserver((l) => count(l.getEntries()));
    po.observe({ type: 'resource', buffered: true });
    count(performance.getEntriesByType('resource'));
    // на всякий случай: экран загрузки исчезнет, как только в DOM появится кнопка «Играть»
    const mo = new MutationObserver(() => { if (document.querySelector('#ui .play')) { hideBoot(); mo.disconnect(); po.disconnect(); } });
    mo.observe(document.getElementById('ui') ?? document.body, { childList: true, subtree: true });
  } catch { /* старые браузеры — без процентов */ }
})();

function hideBoot() {
  const b = document.getElementById('boot');
  if (!b || b.classList.contains('out')) return;
  b.classList.add('out');
  setTimeout(() => b.remove(), 450);
}

// ---------------- Меню ----------------
export function showMenu(onPlay: () => void) {
  clearModals();
  const m = el('div', 'modal mainmenu');
  const mobs = ['en_hive', 'en_swarm_l', 'en_nemesis', 'en_mine', 'en_scarab'].map((k) => icon(k)).filter(Boolean);
  m.innerHTML = `
    <div class="mm-fog"></div>
    <div class="mm-mobs">${mobs.map((s, i) => `<img src="${s}" style="--i:${i}">`).join('')}</div>
    <div class="mm-center">
      <img class="emblem" src="${icon('mage_idle_0', 0xd9c9a0)}" alt="">
      <div class="logo">Magic<br>Apocalypse<span class="v2">2.0</span><small>Выживи в Разломе</small></div>
      <button class="play">Играть</button>
      <div class="hint">Веди пальцем в любом месте экрана, чтобы ходить. Маг атакует сам. Собирай голубые сферы и выбирай заклинания.</div>
    </div>
    <div class="ver">версия 2.0 · Dark Fantasy</div>`;
  m.querySelector('.play')!.addEventListener('click', () => { m.remove(); onPlay(); });
  root().appendChild(m);
  hideBoot();
}

// ---------------- HUD ----------------
export class Hud {
  private wrap = el('div', 'hud');
  private xp = el('div');
  private mana = el('div', 'mana');
  private timer = el('div', 'timer');
  private lvl = el('div', 'hlvl');
  private cds = el('div', 'cdicons');
  private cdMap = new Map<string, HTMLElement>();
  private bossEl: HTMLElement | null = null;
  private lastLvl = -1;
  private lastMana = -1;

  constructor(onPause: () => void) {
    const shade = el('div', 'hudshade');
    const bar = el('div', 'xpbar'); bar.appendChild(this.xp);
    const top = el('div', 'topline');
    const left = el('div', 'left');
    left.append(this.mana);
    const right = el('div', 'right');
    const pb = el('button', 'pausebtn', '<span></span><span></span>');
    pb.setAttribute('aria-label', 'Пауза');
    pb.addEventListener('click', onPause);
    right.append(this.lvl, pb);
    top.append(left, this.timer, right);
    this.wrap.append(shade, bar, top, this.cds);
    root().appendChild(this.wrap);
  }

  /** Сверху: полоса опыта, кристаллы (собранная мана) слева, таймер по центру, уровень справа */
  set(xpFrac: number, time: number, mana: number) {
    this.xp.style.width = Math.min(100, xpFrac * 100).toFixed(1) + '%';
    const mn = Math.floor(mana);
    if (mn !== this.lastMana) { this.lastMana = mn; this.mana.innerHTML = `<i></i>${mn}`; }
    this.timer.textContent = fmtTime(time);
    const lv = W.player?.level ?? 1;
    if (lv !== this.lastLvl) { this.lastLvl = lv; this.lvl.innerHTML = `<small>ур.</small>${lv}`; }
  }

  /** Здоровье босса — череп сверху по центру: красное «сливается» сверху вниз по мере урона. null — убрать. */
  boss(frac: number | null) {
    if (frac === null) { this.bossEl?.remove(); this.bossEl = null; this.timer.classList.remove('red'); return; }
    if (!this.bossEl) {
      this.bossEl = el('div', 'bossbar', `<img class="bg" src="${icon('skull_dark')}"><img class="fg" src="${icon('skull_red')}">`);
      this.wrap.appendChild(this.bossEl);
      this.timer.classList.add('red');
    }
    (this.bossEl.querySelector('.fg') as HTMLElement).style.clipPath = `inset(${((1 - Math.max(0, frac)) * 100).toFixed(1)}% 0 0 0)`;
  }

  /** Иконка перезарядки (Фаза и др.): frac 0 = готово, 1 = только что использовано */
  cd(id: string, iconKey: string, frac: number, tint?: number) {
    let e = this.cdMap.get(id);
    if (!e) {
      e = el('div', 'cdicon', `<img src="${icon(iconKey, tint)}"><div class="shade"></div>`);
      if (tint !== undefined) e.style.borderColor = hex(tint);
      this.cds.appendChild(e); this.cdMap.set(id, e);
    }
    (e.querySelector('.shade') as HTMLElement).style.height = (Math.max(0, Math.min(1, frac)) * 100).toFixed(0) + '%';
  }

  clearCd(id: string) {
    const e = this.cdMap.get(id);
    if (e) { e.remove(); this.cdMap.delete(id); }
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
/** Плашка выбора: обычная (заклинание/пассивка), слияние, особая (красная), очарование, передышка */
function cardHtml(c: Choice) {
  const img = icon(c.icon);
  const pic = img ? `<img src="${img}" alt="">` : '';
  if (c.kind === 'combo') {
    const [pair, ...rest] = c.lines;
    return `
      <div class="ic sq">${pic}</div>
      <div class="body">
        <div class="badge">Слияние</div>
        <div class="title">${esc(c.title)}</div>
        ${pair ? `<div class="pair">${esc(pair)}</div>` : ''}
        ${rest.slice(0, 3).map((l) => `<div class="line">${numHl(l)}</div>`).join('')}
      </div>`;
  }
  let corner = '';
  if (c.kind === 'special') corner = '<div class="lv star">★</div>';
  else if (c.kind === 'enchant') corner = '<div class="lv star">✦</div>';
  else if (c.isNew && c.kind !== 'heal') corner = '<div class="lv new">NEW</div>';
  else if (c.level) corner = `<div class="lv">Lv ${c.level}</div>`;
  const lineCls = c.attr ? 'attr' : '';
  return `
    <div class="ic">${pic}</div>
    <div class="body">
      <div class="title">${esc(c.title)}</div>
      ${c.lines.map((l) => `<div class="line ${lineCls}">${numHl(l)}</div>`).join('')}
    </div>
    ${corner}`;
}

export function showLevelUp(level: number, choices: Choice[], refundPct: number, onPick: (c: Choice) => void, onRefund: () => void) {
  clearModals();
  const combo = choices[0]?.kind === 'combo';
  const m = el('div', 'modal levelup' + (combo ? ' combos' : ''));
  m.appendChild(el('div', 'sub', 'Текущий уровень: ' + level));
  m.appendChild(el('h1', '', combo ? 'Слияние заклинаний' : 'Выбор заклинания'));
  const cards = el('div', 'cards');
  let locked = true;
  setTimeout(() => (locked = false), 250); // защита от случайного тапа
  choices.forEach((c, i) => {
    const card = el('div', `card k-${c.kind}`);
    card.style.animationDelay = (i * 0.05).toFixed(2) + 's';
    card.innerHTML = cardHtml(c);
    card.addEventListener('click', () => { if (locked) return; m.remove(); onPick(c); });
    cards.appendChild(card);
  });
  m.appendChild(cards);
  // на экране слияний кнопка внизу — «Не изучать» (GameScene вызывает skipCombo)
  const rb = el('button', 'refund', combo ? 'Не изучать' : `Вернуть ${Math.round(refundPct * 100)}% маны`);
  rb.addEventListener('click', () => { if (locked) return; m.remove(); onRefund(); });
  m.appendChild(rb);
  root().appendChild(m);
}

// ---------------- Выбор свойства (преображения) ----------------
/** Как в оригинале: иконка заклинания в 3 цветах треугольником, выбранная ярче; ниже описание и «Изучить» */
export function showAttrPick(sp: Spell, options: AttrDef[], onPick: (a: AttrDef) => void) {
  clearModals();
  const m = el('div', 'modal attrpick');
  m.appendChild(el('h1', '', 'Выбор свойства'));
  m.appendChild(el('div', 'sub', esc(sp.def.name)));
  const tri = el('div', 'tri n' + options.length);
  const desc = el('div', 'adesc', '<div class="hint">Выберите одно из свойств</div>');
  let sel: AttrDef | null = null;
  const learn = el('button', 'learn', 'Изучить') as HTMLButtonElement;
  learn.disabled = true;
  options.forEach((a, i) => {
    const col = hex(a.tint);
    const opt = el('button', 'opt o' + i, `<img src="${icon(sp.def.icon, a.tint)}" alt=""><span>${esc(a.name)}</span>`);
    opt.style.setProperty('--c', col);
    opt.addEventListener('click', () => {
      tri.querySelectorAll('.opt').forEach((r) => r.classList.remove('sel'));
      tri.classList.add('has');
      opt.classList.add('sel'); sel = a; learn.disabled = false;
      desc.style.setProperty('--c', col);
      desc.innerHTML = `<div class="title">${esc(a.name)}</div>${a.lines.map((l) => `<div class="line">${numHl(l)}</div>`).join('')}`;
    });
    tri.appendChild(opt);
  });
  learn.addEventListener('click', () => { if (!sel) return; m.remove(); onPick(sel); });
  m.append(tri, desc, learn);
  root().appendChild(m);
}


export function fmtTime(t: number) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m.toString().padStart(2, '0')} : ${s.toString().padStart(2, '0')}`;
}
