import { RARITY, SYNERGIES, artifactById, synergiesOf, type ArtifactDef, type SynergyDef } from '../game/Artifacts';
import { W } from '../game/World';
import { clearModals } from './ui';

// Окно сундука, описание синергий, всплывающие уведомления.

const root = () => document.getElementById('ui')!;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

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
    return `<div class="part ${cls}"><span>${a.emoji}</span>${esc(a.name)}</div>`;
  }).join('');
  const done = W.artifacts.synergies.has(syn.id);
  return `<div class="syn ${done ? 'done' : ''}"><div class="sh"><span class="se">${syn.emoji}</span><b>${esc(syn.name)}</b>${done ? '<i>активна</i>' : ''}</div>
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
export interface ChestOpts { title?: string; cls?: string; onReroll?: () => void }

export function showChest(choices: ArtifactDef[], onPick: (a: ArtifactDef) => void, opts: ChestOpts = {}) {
  clearModals();
  const m = div('modal chest ' + (opts.cls ?? ''), `
    <h1 class="ctitle">${opts.title ?? 'Сундук с сокровищами'}</h1>
    <div class="cline"></div>
    <div class="ccards"></div>
    <div class="cinfo"><div class="hint">Выберите желаемый артефакт</div></div>
    <button class="take" disabled>Получить</button>${opts.onReroll ? '<button class="take reroll">Обновить</button>' : ''}`);
  const cards = m.querySelector('.ccards')!;
  const info = m.querySelector('.cinfo')!;
  const take = m.querySelector('.take') as HTMLButtonElement;
  let sel: ArtifactDef | null = null;
  let locked = true;
  setTimeout(() => (locked = false), 300);
  const ids = choices.map((c) => c.id);

  choices.forEach((a) => {
    const c = div('ccard', `<span>${a.emoji}</span>`);
    c.style.borderColor = RARITY[a.rarity].color;
    c.addEventListener('click', () => {
      if (locked) return;
      sel = a; take.disabled = false;
      cards.querySelectorAll('.ccard').forEach((x) => x.classList.remove('sel'));
      c.classList.add('sel');
      const syns = synergiesOf(a.id);
      info.innerHTML = `<div class="aname">${esc(a.name)}</div><div class="arar" style="color:${RARITY[a.rarity].color}">${RARITY[a.rarity].name}</div>
        <div class="atext">${artifactText(a)}</div>
        <div class="synchips">${syns.map((s) => `<button class="chip" data-s="${s.id}" title="${esc(s.name)}">${s.emoji}</button>`).join('')}</div>`;
      info.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) => b.addEventListener('click', () => {
        synergyPopup(SYNERGIES.find((s) => s.id === b.dataset.s)!, ids);
      }));
    });
    cards.appendChild(c);
  });
  take.addEventListener('click', () => { if (!sel) return; clearModals(); onPick(sel); });
  m.querySelector('.reroll')?.addEventListener('click', () => { if (!locked) opts.onReroll!(); });
  root().appendChild(m);
}

// ---------------- Уведомление ----------------
export function toast(html: string, ms = 2600) {
  const t = div('toast', html);
  root().appendChild(t);
  setTimeout(() => t.classList.add('out'), ms - 400);
  setTimeout(() => t.remove(), ms);
}
