import { RARITY, SYNERGIES, artifactById, synergiesOf, type ArtifactDef, type SynergyDef } from '../game/Artifacts';
import { W } from '../game/World';
import { clearModals, icon } from './ui';

// Окно сундука, описание синергий, всплывающие уведомления.

const root = () => document.getElementById('ui')!;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

/**
 * Картинка артефакта/синергии: если у записи есть поле icon (ключ картинки 2.0) и такая текстура
 * загружена — <img>, иначе emoji. cls — класс обёртки.
 */
export function artIcon(a: { emoji: string }, cls = 'aic') {
  const key = (a as any).icon as string | undefined;
  const src = key ? icon(key) : '';
  return src ? `<span class="${cls} img"><img src="${src}" alt=""></span>` : `<span class="${cls}">${a.emoji}</span>`;
}

function div(cls: string, html = '') {
  const e = document.createElement('div');
  e.className = cls; e.innerHTML = html;
  return e;
}

/** Описание синергии: эффект и список частей (имеющиеся — подсвечены) */
export function synergyHtml(syn: SynergyDef, highlight: string[] = []) {
  const parts = syn.parts.map((p) => {
    const a = artifactById(p);
    const cls = W.artifacts.has(p) ? 'own' : highlight.includes(p) ? 'here' : '';
    return `<div class="part ${cls}">${artIcon(a, 'pi')}${esc(a.name)}</div>`;
  }).join('');
  const done = W.artifacts.synergies.has(syn.id);
  return `<div class="syn ${done ? 'done' : ''}"><div class="sh">${artIcon(syn, 'se')}<b>${esc(syn.name)}</b>${done ? '<i>активна</i>' : ''}</div>
    <div class="stext">${syn.text.map(esc).join('<br>')}</div><div class="parts">${parts}</div></div>`;
}

function synergyPopup(syn: SynergyDef, highlight: string[]) {
  const p = div('modal synpop', `<button class="close">✕</button>${synergyHtml(syn, highlight)}`);
  p.querySelector('.close')!.addEventListener('click', () => p.remove());
  p.addEventListener('click', (e) => { if (e.target === p) p.remove(); });
  root().appendChild(p);
}

export function artifactText(a: ArtifactDef) {
  return a.text.map((t) => `<div>${esc(t)}</div>`).join('');
}

// ---------------- Сундук ----------------
/** Названия и цвета заголовка по типу сундука (ui.md §5) */
const CHEST: Record<number, [string, string]> = {
  5: ['Сундук с сокровищами', '#fff096'], 6: ['Чёрный ящик', '#ffe7cb'], 7: ['Хранилище реликвий', '#fff0f4'],
  10: ['Обелиск', '#f0e6d6'], 11: ['Сломанный обелиск', '#a0a0a0'],
};

export interface ChestOpts { type: number; title?: string; keys: number; onReroll?: () => void; onDiscard: () => void }

export function showChest(choices: ArtifactDef[], onPick: (a: ArtifactDef) => void, opts: ChestOpts) {
  clearModals();
  const [title, color] = CHEST[opts.type];
  const m = div(opts.type >= 10 ? 'modal chest obelisk' : 'modal chest', `
    <button class="close" aria-label="Оставить">✕</button>
    <h1 class="ctitle" style="color:${color}">${opts.title ?? title}</h1>
    <div class="cline"></div>
    <div class="ccards"></div>
    <div class="cinfo"><div class="hint">Выберите желаемый артефакт</div></div>
    <button class="take get" disabled>Получить</button>${opts.onReroll ? `<button class="take reroll">Обновить <span>(Доступно: ${opts.keys})</span></button>` : ''}`);
  const cards = m.querySelector('.ccards')!;
  const info = m.querySelector('.cinfo')!;
  const take = m.querySelector('.take') as HTMLButtonElement;
  let sel: ArtifactDef | null = null;
  let locked = true;
  setTimeout(() => (locked = false), 300);
  const ids = choices.map((c) => c.id);

  /** x слотов по числу (ui.md §5, таблица 0x654009), y = 180 */
  const XS: number[][] = [[], [0], [-90, 90], [-180, 0, 180], [-234, -78, 78, 234]];
  const xs = XS[Math.min(choices.length, 4)];
  choices.forEach((a, i) => {
    const c = div('ccard r-' + a.rarity, artIcon(a));
    c.style.setProperty('--cx', String(xs[i] ?? 0));
    c.style.setProperty('--rc', RARITY[a.rarity].frame);
    c.style.setProperty('--rbg', RARITY[a.rarity].bg);
    c.addEventListener('click', () => {
      if (locked) return;
      sel = a; take.disabled = false;
      cards.querySelectorAll('.ccard').forEach((x) => x.classList.remove('sel'));
      c.classList.add('sel');
      const syns = synergiesOf(a.id);
      info.innerHTML = `<div class="aname">${esc(a.name)}</div><div class="arar" style="color:${RARITY[a.rarity].color}">${RARITY[a.rarity].name}</div>
        <div class="atext">${artifactText(a)}</div>
        <div class="synchips">${syns.map((s) => `<button class="chip" data-s="${s.id}" title="${esc(s.name)}">${artIcon(s, 'ci')}</button>`).join('')}</div>`;
      info.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) => b.addEventListener('click', () => {
        synergyPopup(SYNERGIES.find((s) => s.id === b.dataset.s)!, ids);
      }));
    });
    cards.appendChild(c);
  });
  take.addEventListener('click', () => { if (!sel) return; clearModals(); onPick(sel); });
  m.querySelector('.reroll')?.addEventListener('click', () => { if (!locked) opts.onReroll!(); });
  m.querySelector('.close')!.addEventListener('click', () => { if (locked) return; clearModals(); opts.onDiscard(); });
  root().appendChild(m);
}

// ---------------- Уведомление ----------------
export function toast(html: string, ms = 2600) {
  const t = div('toast', html);
  root().appendChild(t);
  setTimeout(() => t.classList.add('out'), ms - 400);
  setTimeout(() => t.remove(), ms);
}

// ---------------- Связь (артефакт 202) ----------------
/** Выбор изученного атакующего заклинания; закрыть без выбора нельзя */
export function showBond(list: { id: string; name: string; icon: string }[], onPick: (id: string) => void) {
  clearModals();
  const m = div('modal chest', `
    <h1 class="ctitle" style="color:#fff096">Связь</h1>
    <div class="cline"></div>
    <div class="bondhint">Выберите заклинание: его урон +240%</div>
    <div class="bondlist"></div>`);
  let locked = true;
  setTimeout(() => (locked = false), 300);
  for (const sp of list) {
    const b = document.createElement('button');
    b.className = 'bonditem';
    b.innerHTML = `<img src="${icon(sp.icon)}" alt=""><span>${esc(sp.name)}</span>`;
    b.addEventListener('click', () => { if (locked) return; clearModals(); onPick(sp.id); });
    m.querySelector('.bondlist')!.appendChild(b);
  }
  root().appendChild(m);
}
