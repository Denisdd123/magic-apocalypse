import type { Stats } from './Stats';
import type { Spell, SpellDef, AttrDef } from './spells/Spell';
import { STAR_NEEDLE } from './spells/StarNeedle';
import { FLAME_CORE } from './spells/FlameCore';
import { GUARDIANS } from './spells/Guardians';
import { ORB_RING } from './spells/OrbRing';
import { POWER_RUNE } from './spells/PowerRune';
import { PHASE } from './spells/Phase';
import { W } from './World';

export const SPELLS: SpellDef[] = [STAR_NEEDLE, FLAME_CORE, GUARDIANS, ORB_RING, POWER_RUNE, PHASE];

export interface PassiveDef {
  id: string; name: string; icon: string; max: number;
  text: string[];
  apply(s: Stats): void;
}

export const PASSIVES: PassiveDef[] = [
  { id: 'wisdom', name: 'Мудрость', icon: 'ico_atk', max: 5, text: ['Сила +10%'], apply: (s) => { s.atkPct += 0.1; } },
  { id: 'quick', name: 'Быстрое чтение', icon: 'ico_cd', max: 3, text: ['Перезарядка всех заклинаний -5%'], apply: (s) => s.addCdr(0.05) },
  { id: 'vital', name: 'Живучесть', icon: 'ico_hp', max: 5, text: ['Макс. здоровье +20%', 'Лечение от сфер жизни +10%'], apply: (s) => { const before = s.maxHp; s.hpPct += 0.2; s.lifeOrbHeal += 0.1; W.player.heal(s.maxHp - before); } },
  { id: 'haste', name: 'Ускорение', icon: 'ico_speed', max: 2, text: ['Скорость передвижения +10%'], apply: (s) => { s.speed += 0.1; } },
  { id: 'spread', name: 'Рассеивание', icon: 'ico_size', max: 3, text: ['Размер всех заклинаний +5%'], apply: (s) => { s.size += 0.05; } },
  { id: 'focus', name: 'Концентрация', icon: 'ico_duration', max: 3, text: ['Длительность всех заклинаний +10%'], apply: (s) => { s.duration += 0.1; } },
  { id: 'aim', name: 'Меткость', icon: 'ico_crit', max: 3, text: ['Шанс критического удара +5%'], apply: (s) => { s.crit += 0.05; } },
  { id: 'seek', name: 'Поиск', icon: 'ico_pickup', max: 3, text: ['Радиус сбора предметов +33%'], apply: (s) => { s.pickup += 0.33; } },
  { id: 'rupture', name: 'Разрыв', icon: 'ico_critmult', max: 3, text: ['Множитель критического удара +15%'], apply: (s) => { s.critMult += 0.15; } },
];

export interface Choice {
  kind: 'spell' | 'passive' | 'heal';
  id: string;
  icon: string;
  title: string;
  level: number;          // уровень, который будет получен
  lines: string[];
  isNew: boolean;
  attr: boolean;          // этот уровень даёт выбор преображения
}

export class SpellBook {
  spells = new Map<string, Spell>();
  passives = new Map<string, number>();
  refunds = 0;

  add(def: SpellDef) {
    const sp = def.create();
    this.spells.set(def.id, sp);
    sp.onChange();
    return sp;
  }

  update(dt: number) { for (const s of this.spells.values()) s.update(dt); }

  buildChoices(n = 3): Choice[] {
    const pool: { c: Choice; w: number }[] = [];
    for (const def of SPELLS) {
      const sp = this.spells.get(def.id);
      if (!sp) {
        pool.push({ w: 1, c: { kind: 'spell', id: def.id, icon: def.icon, title: def.name, level: 1, lines: [def.desc], isNew: true, attr: false } });
      } else if (sp.level < def.maxLevel) {
        const lvl = sp.level + 1;
        const attr = def.attrLevels.includes(lvl);
        pool.push({ w: attr ? 3 : 2.2, c: { kind: 'spell', id: def.id, icon: def.icon, title: def.name, level: lvl, lines: attr ? ['Можно изучить свойство!'] : def.levelText[lvl] ?? [], isNew: false, attr } });
      }
    }
    for (const p of PASSIVES) {
      const lvl = (this.passives.get(p.id) ?? 0) + 1;
      if (lvl <= p.max) pool.push({ w: 0.9, c: { kind: 'passive', id: p.id, icon: p.icon, title: p.name, level: lvl, lines: p.text, isNew: lvl === 1, attr: false } });
    }
    const out: Choice[] = [];
    while (out.length < n && pool.length) {
      const total = pool.reduce((a, b) => a + b.w, 0);
      let r = Math.random() * total, i = 0;
      for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r <= 0) break; }
      out.push(pool[i].c);
      pool.splice(i, 1);
    }
    if (!out.length) out.push({ kind: 'heal', id: 'heal', icon: 'ico_hp', title: 'Передышка', level: 0, lines: ['Восстановить 30% здоровья'], isNew: false, attr: false });
    return out;
  }

  /** Применить выбор. Если уровень даёт преображение — вернуть варианты для второго экрана. */
  apply(c: Choice): { spell: Spell; options: AttrDef[] } | null {
    if (c.kind === 'heal') { W.player.heal(W.stats.maxHp * 0.3); return null; }
    if (c.kind === 'passive') {
      const def = PASSIVES.find((p) => p.id === c.id)!;
      this.passives.set(def.id, c.level);
      def.apply(W.stats);
      return null;
    }
    const def = SPELLS.find((s) => s.id === c.id)!;
    let sp = this.spells.get(def.id);
    if (!sp) { this.add(def); return null; }
    sp.level = c.level;
    if (c.attr) return { spell: sp, options: def.attrs[c.level] ?? [] };
    sp.onChange();
    return null;
  }

  chooseAttr(sp: Spell, a: AttrDef) {
    sp.attrs.add(a.id);
    sp.onChange();
  }

  /** «Вернуть ману»: отказ от выбора, возврат части опыта уровня */
  refundPct() { return this.refunds < 3 ? 0.2 : 0.1; }
  refund() {
    const pct = this.refundPct();
    this.refunds++;
    W.player.gainXp(W.player.xpNeed * pct / (1 + W.stats.xpGain));
  }

  destroy() { for (const s of this.spells.values()) s.destroy(); this.spells.clear(); }
}
