import type { Stats } from './Stats';
import type { Spell, SpellDef, AttrDef } from './spells/Spell';
import { ALL_SPELLS } from './spells/registry';
import { DataSpell } from './spells/DataSpell';
import { COMBOS, COMBO_SLOT_LEVELS, SPELL_BY_ID, type ComboData } from '../data/spells_data';
import { W } from './World';

export const SPELLS: SpellDef[] = ALL_SPELLS;
const KEY_BY_ID: Record<number, string> = Object.fromEntries(Object.values(SPELL_BY_ID).map((d) => [d.id, d.key]));

export interface PassiveDef {
  id: string; name: string; icon: string; max: number;
  text: string[];
  apply(s: Stats): void;
}

/** Обычные пассивки оригинала (id 30–39) */
export const PASSIVES: PassiveDef[] = [
  { id: 'p30', name: 'Продвинутая магия', icon: 'pas_30', max: 3, text: ['Урон слияний заклинаний +15%'], apply: (s) => { s.comboDmg += 0.15; } },
  { id: 'p31', name: 'Интеллект', icon: 'pas_31', max: 5, text: ['Сила +10%'], apply: (s) => { s.atkPct += 0.1; } },
  { id: 'p32', name: 'Быстрый запуск', icon: 'pas_32', max: 3, text: ['Перезарядка всех заклинаний -5%'], apply: (s) => s.addCdr(0.05) },
  { id: 'p33', name: 'Живучесть', icon: 'pas_33', max: 5, text: ['Макс. здоровье +20%'], apply: (s) => { const before = s.maxHp; s.hpPct += 0.2; W.player.heal(s.maxHp - before); } },
  { id: 'p34', name: 'Ускорение', icon: 'pas_34', max: 2, text: ['Скорость передвижения +10%'], apply: (s) => { s.speed += 0.1; } },
  { id: 'p35', name: 'Рассеивание', icon: 'pas_35', max: 3, text: ['Размер всех заклинаний +5%'], apply: (s) => { s.size += 0.05; } },
  { id: 'p36', name: 'Концентрация', icon: 'pas_36', max: 3, text: ['Длительность всех заклинаний +10%'], apply: (s) => { s.duration += 0.1; } },
  { id: 'p37', name: 'Меткость', icon: 'pas_37', max: 3, text: ['Шанс критического удара +5%'], apply: (s) => { s.crit += 0.05; } },
  { id: 'p38', name: 'Поиск', icon: 'pas_38', max: 3, text: ['Радиус сбора предметов +33%'], apply: (s) => { s.pickup += 0.33; } },
  { id: 'p39', name: 'Разрыв', icon: 'pas_39', max: 3, text: ['Множитель критического урона +15%'], apply: (s) => { s.critMult += 0.15; } },
];

const group = (s: Stats, keys: string[], v: number) => keys.forEach((k) => s.addSpellDmg(k, v));

/** Особые («красные») пассивки оригинала 301–324: 1 уровень, редкая карточка */
export const SPECIALS: PassiveDef[] = [
  { id: 's301', name: 'Повелитель огня', icon: 'spas_301', max: 1, text: ['Урон Пламенного ядра, Падения звезды, Пламени пасти, Кипящей земли +25%'], apply: (s) => group(s, ['fireball', 'meteor', 'incinerate', 'lava'], 0.25) },
  { id: 's302', name: 'Туча', icon: 'spas_302', max: 1, text: ['Урон Гнева туч, Разряда, Поля разрядов, Разреза света +25%'], apply: (s) => group(s, ['thunder', 'eshock', 'ezone', 'flash'], 0.25) },
  { id: 's303', name: 'Гнев природы', icon: 'spas_303', max: 1, text: ['Урон Смерча, Ледяной бури, Чёрного прилива, Ледяного венца +25%'], apply: (s) => group(s, ['cyclone', 'blizzard', 'tsunami', 'frostnova'], 0.25) },
  { id: 's304', name: 'Энергетика', icon: 'spas_304', max: 1, text: ['Урон Сгустков силы, Луча бездны, Духов-стражей, Кольца сфер +25%'], apply: (s) => group(s, ['ebolt', 'ray', 'spirit', 'satellite'], 0.25) },
  { id: 's305', name: 'Аркана', icon: 'spas_305', max: 1, text: ['Сила +15%'], apply: (s) => { s.atkPct += 0.15; } },
  { id: 's306', name: 'Ангел-хранитель', icon: 'spas_306', max: 1, text: ['Воскрешений +1', 'Макс. здоровье +30%'], apply: (s) => { s.revives++; s.hpPct += 0.3; } },
  { id: 's307', name: 'Тихое пение', icon: 'spas_307', max: 1, text: ['Перезарядка всех заклинаний -7%'], apply: (s) => s.addCdr(0.07) },
  { id: 's308', name: 'Военная магия', icon: 'spas_308', max: 1, text: ['Сила +8%', 'Размер всех заклинаний +8%'], apply: (s) => { s.atkPct += 0.08; s.size += 0.08; } },
  { id: 's309', name: 'Хранитель времени', icon: 'spas_309', max: 1, text: ['Время действия рун +12%', 'Длительность всех заклинаний +12%'], apply: (s) => { s.runeDur += 0.12; s.duration += 0.12; } },
  { id: 's310', name: 'Первооткрыватель', icon: 'spas_310', max: 1, text: ['Скорость передвижения +3%', 'Радиус сбора +50%'], apply: (s) => { s.speed += 0.03; s.pickup += 0.5; } },
  { id: 's311', name: 'Мощный удар', icon: 'spas_311', max: 1, text: ['Множитель критического урона +30%'], apply: (s) => { s.critMult += 0.3; } },
  { id: 's312', name: 'Печать', icon: 'spas_312', max: 1, text: ['Скорость всех врагов -8%'], apply: (s) => { s.enemySlow += 0.08; } },
  { id: 's313', name: 'Проклятие', icon: 'spas_313', max: 1, text: ['Макс. здоровье всех врагов -6%'], apply: (s) => { s.enemyHpRed += 0.06; } },
  { id: 's314', name: 'Чакра', icon: 'spas_314', max: 1, text: ['Урон всех заклинаний +20%'], apply: (s) => { s.magicDmg += 0.2; } },
  { id: 's315', name: 'Завод маны', icon: 'spas_315', max: 1, text: ['Сферы маны появляются на 20% чаще'], apply: (s) => { s.orbRate += 0.2; } },
  { id: 's316', name: 'Доктор', icon: 'spas_316', max: 1, text: ['Макс. уровень заклинаний-пассивок +3 (рост)'], apply: (s) => { s.atkPct += 0.05; } },
  { id: 's317', name: 'Магия крови', icon: 'spas_317', max: 1, text: ['Приумножение атаки +10%', 'Восстановление здоровья -0,25%/с'], apply: (s) => { s.amp += 0.1; s.regen -= 0.0025; } },
  { id: 's318', name: 'Адреналин', icon: 'spas_318', max: 1, text: ['Сила, шанс крита и скорость +5%'], apply: (s) => { s.atkPct += 0.05; s.crit += 0.05; s.speed += 0.05; } },
  { id: 's319', name: 'Джаггернаут', icon: 'spas_319', max: 1, text: ['Сила +10%', 'Получаемый урон -15%'], apply: (s) => { s.atkPct += 0.1; s.addArmor(0.15); } },
  { id: 's320', name: 'Священник', icon: 'spas_320', max: 1, text: ['Макс. здоровье врагов -3%', 'Восстановление здоровья +0,3%/с'], apply: (s) => { s.enemyHpRed += 0.03; s.regen += 0.003; } },
  { id: 's321', name: 'Жуть', icon: 'spas_321', max: 1, text: ['Здоровье элитных врагов -10%'], apply: (s) => { s.eliteHpRed += 0.1; } },
  { id: 's322', name: 'Аристократ', icon: 'spas_322', max: 1, text: ['Рядом появляется сундук с сокровищами'], apply: () => { const P = W.player; W.pickups.chest(P.x + 70, P.y); } },
  { id: 's323', name: 'Наставник', icon: 'spas_323', max: 1, text: ['Уровень всех изученных пассивок +1'], apply: (s) => { for (const [id] of W.book.passives) PASSIVES.find((p) => p.id === id)?.apply(s); } },
  { id: 's324', name: 'Флорист', icon: 'spas_324', max: 1, text: ['Скидка у Торговца +7%'], apply: (s) => { s.shopDiscount += 0.07; } },
];

export interface Choice {
  kind: 'spell' | 'passive' | 'heal' | 'enchant' | 'combo' | 'special';
  id: string;
  icon: string;
  title: string;
  level: number;          // уровень, который будет получен
  lines: string[];
  isNew: boolean;
  attr: boolean;          // этот уровень даёт выбор свойства
  combo?: ComboData;
}

export class SpellBook {
  spells = new Map<string, Spell>();
  passives = new Map<string, number>();
  specials = new Set<string>();
  /** изученные слияния и заклинания-доноры, ушедшие в слияние (больше не предлагаются) */
  fusions = new Set<number>();
  consumed = new Set<string>();
  /** сколько ячеек слияния открыто уровнями 25/50/75 и ещё не потрачено */
  private comboSlotsUsed = 0;
  refunds = 0;
  /** Сколько экранов выбора прошло без особой карточки (гарантия) */
  private noSpecial = 0;
  private specialOrder = SPECIALS.map((s) => s.id).sort(() => Math.random() - 0.5);

  add(def: SpellDef) {
    const sp = def.create();
    this.spells.set(def.id, sp);
    sp.onChange();
    return sp;
  }

  update(dt: number) { for (const s of this.spells.values()) s.update(dt); }

  /** Все выбранные свойства (id оригинала) по всем заклинаниям */
  private hasProp(spellId: number, prop: number) {
    const sp = this.spells.get(KEY_BY_ID[spellId]);
    return !!sp && sp.attrs.has(String(prop));
  }

  /** Слияния, доступные сейчас: оба свойства выбраны, оба заклинания на руках, основа ещё без слияния */
  availableCombos(): ComboData[] {
    return COMBOS.filter((c) => {
      if (this.fusions.has(c.id)) return false;
      const base = this.spells.get(KEY_BY_ID[c.base.spell]) as DataSpell | undefined;
      if (!base || base.fusion) return false;
      return this.hasProp(c.base.spell, c.base.prop) && this.hasProp(c.donor.spell, c.donor.prop);
    });
  }

  comboSlots() { return COMBO_SLOT_LEVELS.filter((l) => W.player.level >= l).length - this.comboSlotsUsed; }

  buildChoices(n = 3): Choice[] {
    // ячейка слияния (ур. 25/50/75): если есть что сливать — экран слияний вместо обычных карт
    if (this.comboSlots() > 0) {
      const av = this.availableCombos();
      if (av.length) return av.slice(0, 3).map((c) => this.comboChoice(c));
    }
    const s = W.stats;
    if (Math.random() * 100 < s.extraCardChance) n++;
    const pool: { c: Choice; w: number }[] = [];
    for (const def of SPELLS) {
      if (this.consumed.has(def.id)) continue;
      const sp = this.spells.get(def.id);
      if (!sp) {
        if (def.id === 'armageddon' && W.player.level < 6) continue;
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
    // особая карточка (красная пассивка или Очарование): ~5% + гарантия раз в 17 экранов
    this.noSpecial++;
    if (W.player.level >= 8 && out.length >= 2 && (Math.random() < 0.05 || this.noSpecial >= 17)) {
      const sp = this.specialChoice();
      if (sp) { this.noSpecial = 0; out[out.length - 1] = sp; }
    }
    if (!out.length) out.push({ kind: 'heal', id: 'heal', icon: 'life_heart', title: 'Передышка', level: 0, lines: ['Восстановить 30% здоровья'], isNew: false, attr: false });
    return out;
  }

  private specialChoice(): Choice | null {
    const canEnchant = [...this.spells.values()].some((s) => s instanceof DataSpell && s.canEnchant());
    const sid = this.specialOrder.find((id) => !this.specials.has(id));
    // Очарование — примерно в трети особых карточек
    if (canEnchant && (!sid || Math.random() < 0.33)) {
      return { kind: 'enchant', id: 'enchant', icon: 'enchant', title: 'Очарование', level: 0, lines: ['Выберите атакующее заклинание и усильте его (до 3 раз)'], isNew: false, attr: false };
    }
    if (!sid) return null;
    const d = SPECIALS.find((x) => x.id === sid)!;
    return { kind: 'special', id: d.id, icon: d.icon, title: d.name, level: 0, lines: d.text, isNew: false, attr: false };
  }

  /** Гарантированный экран из красных карточек (артефакт «Единорог») */
  buildSpecialChoices(n = 3): Choice[] {
    return this.specialOrder.filter((id) => !this.specials.has(id)).slice(0, n).map((id) => {
      const d = SPECIALS.find((x) => x.id === id)!;
      return { kind: 'special' as const, id: d.id, icon: d.icon, title: d.name, level: 0, lines: d.text, isNew: false, attr: false };
    });
  }

  private comboChoice(c: ComboData): Choice {
    const b = SPELL_BY_ID[c.base.spell], d = SPELL_BY_ID[c.donor.spell];
    const num = String(c.id).padStart(2, '0');
    return {
      kind: 'combo', id: 'combo' + c.id, icon: 'combo_' + num + '_' + c.en.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      title: c.name, level: 0, isNew: false, attr: false, combo: c,
      lines: [`${b.ours} + ${d.ours}`, ...c.mechanics, ...c.mods.filter((m) => m.op !== 'note').map((m) => m.text)],
    };
  }

  /** Применить выбор. Если уровень даёт свойство — вернуть варианты для второго экрана. */
  apply(c: Choice): { spell: Spell; options: AttrDef[] } | null {
    if (c.kind === 'heal') { W.player.heal(W.stats.maxHp * 0.3); return null; }
    if (c.kind === 'enchant') return null; // окно выбора открывает GameScene
    if (c.kind === 'combo') { this.applyCombo(c.combo!); return null; }
    if (c.kind === 'special') {
      this.specials.add(c.id);
      SPECIALS.find((p) => p.id === c.id)!.apply(W.stats);
      return null;
    }
    if (c.kind === 'passive') {
      const def = PASSIVES.find((p) => p.id === c.id)!;
      this.passives.set(def.id, c.level);
      def.apply(W.stats);
      return null;
    }
    const def = SPELLS.find((s) => s.id === c.id)!;
    const sp = this.spells.get(def.id);
    if (!sp) { this.add(def); return null; }
    sp.level = c.level;
    if (c.attr) return { spell: sp, options: def.attrs[c.level] ?? [] };
    sp.onChange();
    return null;
  }

  /** Слияние: основа получает модификаторы и механику слияния, донор исчезает */
  applyCombo(c: ComboData) {
    this.comboSlotsUsed++;
    this.fusions.add(c.id);
    const base = this.spells.get(KEY_BY_ID[c.base.spell]) as DataSpell;
    base.fusion = c;
    base.onChange();
    const dk = KEY_BY_ID[c.donor.spell];
    const donor = this.spells.get(dk);
    if (donor) { donor.destroy(); this.spells.delete(dk); this.consumed.add(dk); }
  }

  /** Очарование выбранного заклинания */
  enchant(id: string) {
    const sp = this.spells.get(id);
    if (sp instanceof DataSpell && sp.canEnchant()) { sp.enchants++; sp.onChange(); }
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

  /** Отказ от слияния тоже тратит ячейку */
  skipCombo() { this.comboSlotsUsed++; }

  destroy() { for (const s of this.spells.values()) s.destroy(); this.spells.clear(); }
}
