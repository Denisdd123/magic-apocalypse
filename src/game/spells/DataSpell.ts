import type { ComboData, Mod, SpellData, Stat } from '../../data/spells_data';
import { ENCHANT_MAX } from '../../data/spells_data';
import { W } from '../World';
import { Spell, type AttrDef, type SpellDef } from './Spell';


/** Цвета вариантов свойства (в оригинале иконка заклинания в 3 цветах) */
export const PROP_TINTS = [0xff8a6a, 0x7ab8ff, 0xffd25a];

/**
 * Заклинание на данных оригинала (data/spells_data.ts).
 * Все модификаторы — уровни, выбранные свойства, энчант, слияние — собираются в mods(),
 * итог любого стата считает stat(): (база + Σadd + Σsec) × (1 + Σpct/100) × Πmul.
 * Наследник реализует только механику (update), беря числа из геттеров.
 */
export abstract class DataSpell extends Spell {
  /** сколько раз зачаровано (0..3) */
  enchants = 0;
  /** разовый каст без перезарядки (Ящик Пандоры): метеор / вихрь / цунами */
  once = false;
  /** слияние, основой которого стало это заклинание */
  fusion: ComboData | null = null;
  private modCache: Mod[] | null = null;

  constructor(def: SpellDef, public data: SpellData) { super(def); }

  get key() { return this.data.key; }
  /** выбрано ли свойство с id оригинала */
  hasProp(id: number) { return this.attrs.has(String(id)); }
  /** изучено ли слияние с id оригинала (это заклинание — его основа) */
  hasCombo(id: number) { return this.fusion?.id === id; }

  onChange() { this.modCache = null; }

  mods(): Mod[] {
    if (this.modCache) return this.modCache;
    const out: Mod[] = [];
    // Дух (3) и Спутник (4): колонки уровней применяются уже при изучении (AbilityStatApply, нет проверки «первое изучение») — урон +20 %
    if (this.data.id === 3 || this.data.id === 4) out.push({ stat: 'dmg', op: 'pct', v: 20, text: '' });
    for (const l of this.data.levels) if (l.level <= this.level) out.push(...l.mods);
    for (const lvl of this.data.propLevels) for (const p of this.data.props[lvl] ?? []) if (this.hasProp(p.id)) out.push(...p.mods);
    if (this.data.enchant) for (let i = 0; i < this.enchants; i++) out.push(...this.data.enchant.mods);
    if (this.fusion) out.push(...this.fusion.mods);
    return (this.modCache = out);
  }

  /** Итог стата. base — базовое значение (по умолчанию из data.base). */
  stat(s: Stat, base = 0): number {
    let add = 0, pct = 0, mul = 1;
    for (const m of this.mods()) {
      if (m.stat !== s) continue;
      if (m.op === 'add' || m.op === 'sec') add += m.v;
      else if (m.op === 'pct') pct += m.v;
      else if (m.op === 'mul') mul *= m.v;
    }
    return (base + add) * Math.max(0, 1 + pct / 100) * mul;
  }

  /** Урон одного удара: % атаки оригинала × Attack (3.0: без DMG_SCALE, MASTER §3) */
  get dmg(): number { return this.dmgOf(this.data.base.dmgPct ?? 100); }
  /** Урон от произвольной базы в % ATK оригинала (для вторичных ударов: взрыв, осколки) */
  dmgOf(origPct: number, extraUp = 0): number {
    // оригинал: база × (Σ% урона заклинания + % всей магии + 100)% × clamp((100 − Σснижений)%) × Attack (balance.md §5)
    let add = 0, up = extraUp, down = 0, mul = 1;
    for (const m of this.mods()) {
      if (m.stat !== 'dmg') continue;
      if (m.op === 'add' || m.op === 'sec') add += m.v;
      else if (m.op === 'pct') { if (m.v >= 0) up += m.v; else down -= m.v; }
      else if (m.op === 'mul') mul *= m.v;
    }
    const s = W.stats;
    up += ((s.spellDmg[this.def.id] ?? 0) + s.magicDmg) * 100;
    const pct = (origPct + add) * Math.max(0, 1 + up / 100) * Math.max(0.01, 1 - down / 100) * mul;
    return s.spellDamage(pct, this.fusion ? 1 + s.comboDmg : 1, true);
  }
  /**
   * КД по формуле оригинала (StartInformation_B): (база + Σсек) × Π(1 + pct/100) × Πmul —
   * проценты ПЕРЕМНОЖАЮТСЯ (эффекты 158/159: RatioU *= (100 − v)%, RatioD *= (100 + v)%). Без общих сокращений.
   */
  cdOrig(base: number): number {
    let add = 0, mul = 1;
    for (const m of this.mods()) {
      if (m.stat !== 'cd') continue;
      if (m.op === 'add' || m.op === 'sec') add += m.v;
      else if (m.op === 'pct') mul *= Math.max(0, 1 + m.v / 100);
      else if (m.op === 'mul') mul *= m.v;
    }
    return (base + add) * mul;
  }
  /** Общий множитель перезарядки мага (UnitApply_MagicCooltimeRatio) для этого заклинания */
  get cdGlobal(): number { return W.stats.cdMul * (1 - (W.stats.spellCdr[this.def.id] ?? 0)); }
  /** Σ процентов стата s (для формул оригинала «(100 + U)%») */
  pctOf(s: Stat): number { let p = 0; for (const m of this.mods()) if (m.stat === s && m.op === 'pct') p += m.v; return p; }
  get cdSec(): number { return this.stat('cd', this.data.base.cd ?? 1); }
  get count(): number { return Math.max(1, Math.round(this.stat('count', this.data.base.count ?? 1) + W.stats.sc(this.def.id))); }
  /** множитель размера (свой × общий) */
  get sizeMul(): number { return this.stat('size', 1) * W.stats.sizeMul; }
  get durSec(): number { return this.stat('duration', this.data.base.duration ?? 1) * W.stats.durMul; }
  get speedMul(): number { return this.stat('speed', 1); }
  get tickSec(): number { return this.stat('interval', this.data.base.tick ?? 0.5); }

  /** перезарядка по данным (глобальные сокращения применяет Spell.ready) */
  protected readyData(dt: number) { return this.ready(dt, this.cdSec); }

  canEnchant() { return !!this.data.enchant && this.enchants < ENCHANT_MAX; }
}

/** SpellDef из данных: тексты уровней, свойства — всё из таблиц оригинала */
export function defFromData(d: SpellData, create: (def: SpellDef) => Spell): SpellDef {
  const levelText: Record<number, string[]> = {};
  for (const l of d.levels) levelText[l.level] = l.mods.map((m) => m.text);
  const attrs: Record<number, AttrDef[]> = {};
  for (const lvl of d.propLevels) {
    attrs[lvl] = (d.props[lvl] ?? []).map((p, i) => ({
      id: String(p.id), name: p.name, tint: PROP_TINTS[i % 3],
      lines: [...p.mechanics, ...p.mods.filter((m) => m.op !== 'note').map((m) => m.text)],
    }));
  }
  const def: SpellDef = {
    id: d.key, name: d.ours, icon: 'spell_' + d.key, desc: d.desc,
    kind: d.kind, maxLevel: d.maxLevel, attrLevels: d.propLevels, levelText, attrs,
    create: () => create(def),
  };
  return def;
}
