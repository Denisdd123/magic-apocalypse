import type { Stats } from './Stats';
import type { Spell, SpellDef, AttrDef } from './spells/Spell';
import { ALL_SPELLS } from './spells/registry';
import { DataSpell, PROP_TINTS } from './spells/DataSpell';
import { COMBOS, SPELL_BY_ID, type ComboData } from '../data/spells_data';
import { ABILITY, MERGE } from '../data/orig';
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
  { id: 'p33', name: 'Живучесть', icon: 'pas_33', max: 5, text: ['Макс. здоровье +20%', 'Исцеление от крупицы жизни +10%'], apply: (s) => { const before = s.maxHp; s.hpPct += 0.2; s.lifeOrbHeal += 0.1; W.player.heal(Math.round(before * 0.2)); } },
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
  { id: 's321', name: 'Жуть', icon: 'spas_321', max: 1, text: ['Здоровье элитных врагов -10%'], apply: (s) => { s.eliteHpRatio *= 0.9; } },
  { id: 's322', name: 'Аристократ', icon: 'spas_322', max: 1, text: ['Рядом появляется сундук с сокровищами'], apply: () => { const P = W.player; W.pickups.chest(P.x + 70, P.y); } },
  { id: 's323', name: 'Наставник', icon: 'spas_323', max: 1, text: ['Уровень всех изученных пассивок +1'], apply: (s) => { for (const [id] of W.book.passives) PASSIVES.find((p) => p.id === id)?.apply(s); } },
  { id: 's324', name: 'Флорист', icon: 'spas_324', max: 1, text: ['Скидка у Торговца +7%'], apply: (s) => { s.merchantCostRatio -= 7; } },
];

export interface Choice {
  kind: 'spell' | 'passive' | 'heal' | 'enchant' | 'combo' | 'special';
  id: string;
  /** id оригинала (Dictionary_Ability; у слияния — 10000 + j) */
  oid: number;
  icon: string;
  title: string;
  level: number;          // уровень, который будет получен
  lines: string[];
  isNew: boolean;
  attr: boolean;          // этот уровень даёт выбор свойства
  combo?: ComboData;
}

/** Экран левел-апа, собранный по V_Ability_Manager.Create_Ability (levelup.md §2) */
export interface LevelScreen {
  choices: Choice[];
  /** «Вернуть N% маны»: N и доступна ли кнопка (AbilityRetrunNum ≤ ApplyManaRepayUseNum) */
  refundPct: number;
  refundOn: boolean;
  /** List_ApplyMagicComPossible — кнопка «Слияние» мигает, если не пусто */
  merges: ComboData[];
}

const SPELL_IDS = new Set(Object.keys(KEY_BY_ID).map(Number));
const DEF_BY_OID = (oid: number) => SPELLS.find((d) => d.id === KEY_BY_ID[oid]);
/** Group «каждый уровень одно и то же» / «колонка = уровень» живут в данных уровней заклинаний 2.2 (сверено с levelup.md §5) */
const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a)); // Random.Range(int): b не включается
/** Слияния 26–28 в оригинале закрыты до зоны 4 (Game_AreaMaxNum ≤ 3) — решение Дениса 2026-11-26: в 3.0 открыты всегда. 60 не делаем. */

export class SpellBook {
  spells = new Map<string, Spell>();
  passives = new Map<string, number>();
  specials = new Set<string>();
  /** изученные слияния и заклинания-доноры, ушедшие в слияние (больше не предлагаются) */
  fusions = new Set<number>();
  consumed = new Set<string>();

  // ---- состояние оригинала (Z_Database) ----
  /** List_AllyAbilityLearn: заклинания, пассивки, свойства (361+), особые (301+), слияния (10000+j) */
  learn: number[] = [];
  /** List_AllyAbilityPossible: id с повторами, одна копия = один оставшийся уровень */
  possible: number[] = [];
  private armaOn = false;
  private advOn = false;
  /** AbilityRetrunNum — возвратов подряд; AbilityRetrunRatio; AbilityReturn_ID1..4 */
  refunds = 0;
  private returnRatio = 1;
  private returnIds: number[] = [];
  /** MagicComLearnNum */
  mergeNum = 0;
  /** List_SpecialPassive_ID / _Level (C_Battle_Manager.Start) */
  private spId: number[] = [];
  private spLv: number[] = [];

  constructor() {
    // Z_Database.ResetInformation: пул = все id 1..39 с 요구레벨 0, по 최대레벨 копий
    for (let id = 1; id <= 39; id++) {
      const a = ABILITY[id];
      if (a && a.reqLevel === 0) for (let k = 0; k < a.maxLevel; k++) this.possible.push(id);
    }
    this.rollSpecialSchedule();
  }

  /** Расписание особых пассивок и «Очарования» на забег (levelup.md §4, C_Battle_Manager$$Start) */
  private rollSpecialSchedule() {
    const A = [301, 302, 303, 304], B: number[] = [], L: number[] = [], L1: number[] = [], L2: number[] = [];
    for (let i = 301; i <= 324; i++) B.push(i);
    for (let i = 5; i <= 100; i++) L.push(i);
    for (let i = 10; i <= 50; i++) L1.push(i);
    for (let i = 51; i <= 100; i++) L2.push(i);
    const take = (arr: number[]) => arr.splice(randInt(0, arr.length), 1)[0];
    const del = (arr: number[], v: number) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); };
    for (let s = 0; s < 12; s++) {
      let id: number, lv: number;
      if (s <= 2) { id = take(A); del(B, id); lv = take(L); }
      else if (s <= 4) { id = take(B); lv = take(L1); del(L, lv); }
      else if (s <= 6) { id = take(B); lv = take(L2); del(L, lv); }
      else if (s <= 8) { id = take(B); lv = take(L); }
      else if (s === 9) { id = 329; lv = take(L1); del(L, lv); }
      else if (s === 10) { id = 329; lv = take(L2); del(L, lv); }
      else { id = 329; lv = take(L); }
      this.spId.push(id); this.spLv.push(lv);
    }
  }

  /** List_AllyMagicLevel[id]: сколько раз изучено id + свойства этого заклинания */
  magicLevel(id: number) {
    let n = 0;
    for (const x of this.learn) if (x === id || (x >= 361 && x < 7000 && ABILITY[x]?.parent === id)) n++;
    return n;
  }

  add(def: SpellDef) {
    const sp = def.create();
    this.spells.set(def.id, sp);
    sp.onChange();
    return sp;
  }

  /** Стартовое заклинание забега: как изученная карточка (Learn + 1 копия из пула) */
  learnStart(oid: number) {
    this.learn.push(oid);
    this.dropCopy(oid);
    const def = DEF_BY_OID(oid);
    if (def && !this.spells.has(def.id)) this.add(def);
  }

  private dropCopy(id: number) { const i = this.possible.indexOf(id); if (i >= 0) this.possible.splice(i, 1); }

  update(dt: number) {
    for (const s of this.spells.values()) s.update(dt);
    if (this.globalCombos.size && (this.globT -= dt) <= 0) { this.globT = 0.5; this.applyGlobal(); }
  }

  /** Сверхразум: за каждый уровень заклинаний приумножение +1,5%, размер +0,5%, КД −0,3%. Врата: сила +20% за каждое слияние. */
  private applyGlobal() {
    const s = W.stats, g = this.globApplied;
    let lv = 0;
    for (const sp of this.spells.values()) lv += sp.level;
    const want = {
      amp: this.globalCombos.has(26) ? 0.015 * lv : 0,
      size: this.globalCombos.has(26) ? 0.005 * lv : 0,
      cdr: this.globalCombos.has(26) ? Math.min(0.5, 0.003 * lv) : 0,
      atk: this.globalCombos.has(28) ? 0.2 * this.fusions.size : 0,
    };
    s.amp += want.amp - g.amp; s.size += want.size - g.size; s.atkPct += want.atk - g.atk;
    if (want.cdr !== g.cdr) { s.cdr = 1 - (1 - s.cdr) / (1 - g.cdr) * (1 - want.cdr); }
    this.globApplied = want;
  }

  /** слияния, где основа — пассивка (Сверхразум 26, Врата созидания 28): общий эффект, не привязанный к заклинанию */
  globalCombos = new Set<number>();
  private globT = 0;
  private globApplied = { amp: 0, size: 0, cdr: 0, atk: 0 };

  /** Квота слияний: эффект 35 + 1 за уровни > 23, > 48, > 73 */
  comboQuota() {
    const L = W.player.level;
    return Math.round(W.stats.artFx[35] ?? 0) + (L > 23 ? 1 : 0) + (L > 48 ? 1 : 0) + (L > 73 ? 1 : 0);
  }

  /** List_ApplyMagicComPossible (Create_Ability, levelup.md §2 шаг 3) */
  availableMerges(): number[] {
    if (this.comboQuota() <= this.mergeNum) return [];
    const learned = this.learn.slice();
    const rm = (v: number) => { const i = learned.indexOf(v); if (i >= 0) learned.splice(i, 1); };
    for (const x of this.learn) {
      if (x <= 10000) continue;
      const m = MERGE[x - 10000];
      if (!m) continue;
      rm(m.traitA); rm(m.traitB);
      if (ABILITY[m.traitA]?.parent === 1 || ABILITY[m.traitB]?.parent === 1) for (let i = 362; i <= 367; i++) while (learned.includes(i)) rm(i);
    }
    const out: number[] = [];
    for (let j = 1; j <= 63; j++) {
      const m = MERGE[j];
      if (!m || !m.traitA || !m.traitB) continue;
      if (!learned.includes(m.traitA) || !learned.includes(m.traitB) || learned.includes(10000 + j)) continue;
      const a = ABILITY[m.traitA], b = ABILITY[m.traitB];
      if (this.magicLevel(a.parent) < a.maxLevel || this.magicLevel(b.parent) < b.maxLevel) continue;
      out.push(j);
    }
    return out;
  }

  /** V_Ability_Manager.Create_Ability — обычный уровень (levelup.md §2) */
  buildScreen(): LevelScreen {
    const L = W.player.level, s = W.stats;
    // 1) Армагеддон — с уровня 6;  2) «Продвинутая магия» — после 2 слияний
    if (!this.armaOn && L >= ABILITY[14].reqLevel) {
      this.armaOn = true;
      for (let k = ABILITY[14].maxLevel - this.learn.filter((x) => x === 14).length; k > 0; k--) this.possible.push(14);
    }
    if (!this.advOn && this.mergeNum >= 2) {
      this.advOn = true;
      for (let k = ABILITY[30].maxLevel - this.learn.filter((x) => x === 30).length; k > 0; k--) this.possible.push(30);
    }
    // возврат маны: AbilityRetrunRatio 1 / 0.5 / 0.2 по числу возвратов подряд (≥ 3 — не меняется)
    this.returnRatio = this.refunds === 0 ? 1 : this.refunds === 1 ? 0.5 : this.refunds === 2 ? 0.2 : this.returnRatio;
    const repay = 20 + (s.artFx[61] ?? 0);
    const repayUse = Math.round((s.artFx[121] ?? 0) + 2);
    // 3 карточки, 4-я — с шансом эффекта 58
    let n = s.extraCardChance >= randInt(1, 101) ? 4 : 3;
    const pool = [...new Set(this.possible)];
    if (pool.length >= 5) {
      if (L <= 3) for (let i = pool.length - 1; i >= 0; i--) if (pool[i] >= 31 && pool[i] <= 39) pool.splice(i, 1);
      for (const r of this.returnIds) { const i = pool.indexOf(r); if (i >= 0) pool.splice(i, 1); }
      this.returnIds = [];
      const base = pool.length;
      for (let k = 0; k < base; k++) {
        const id = pool[k];
        if (!this.learn.includes(id)) continue;
        const w = ABILITY[id].type === 'magic' ? 7 : ABILITY[id].type === 'passive' ? 5 : 0;
        for (let c = 0; c < w; c++) pool.push(id);
      }
    }
    const ids: number[] = [];
    for (let slot = 0; slot < n && pool.length; slot++) {
      const id = pool[randInt(0, pool.length)];
      for (let i = pool.length - 1; i >= 0; i--) if (pool[i] === id) pool.splice(i, 1);
      ids.push(id);
    }
    // особая пассивка / «Очарование» по расписанию — в слот 0
    const si = this.spLv.indexOf(L + 1);
    if (si >= 0 && this.refunds === 0 && ids.length) ids[0] = this.spId[si];
    const choices = ids.map((id) => this.card(id)).filter((c): c is Choice => !!c);
    // пустой пул оригинал не обрабатывает (исключение); у нас — передышка, чтобы игра не встала
    if (!choices.length) choices.push({ kind: 'heal', id: 'heal', oid: 0, icon: 'life_heart', title: 'Передышка', level: 0, lines: ['Восстановить 30% здоровья'], isNew: false, attr: false });
    const merges = this.availableMerges().map((j) => COMBOS.find((c) => c.id === j)).filter((c): c is ComboData => !!c);
    return {
      choices,
      refundPct: Math.max(0, Math.min(100, Math.floor(repay * this.returnRatio))),
      refundOn: this.refunds <= repayUse,
      merges,
    };
  }

  /** Карточка по id оригинала (X_Select_Ability.OnEnable) */
  private card(id: number): Choice | null {
    const a = ABILITY[id];
    if (!a) return null;
    if (SPELL_IDS.has(id)) {
      const def = DEF_BY_OID(id)!;
      const ml = this.magicLevel(id);
      if (ml === 0) return { kind: 'spell', id: def.id, oid: id, icon: def.icon, title: def.name, level: 1, lines: [def.desc], isNew: true, attr: false };
      const lvl = ml + 1;
      const attr = lvl === a.traitA || lvl === a.traitB || lvl === a.traitC;
      return { kind: 'spell', id: def.id, oid: id, icon: def.icon, title: def.name, level: lvl, lines: attr ? ['Можно изучить свойство!'] : def.levelText[lvl] ?? [], isNew: false, attr };
    }
    if (id >= 30 && id <= 39) {
      const p = PASSIVES.find((x) => x.id === 'p' + id)!;
      const lvl = this.magicLevel(id) + 1;
      return { kind: 'passive', id: p.id, oid: id, icon: p.icon, title: p.name, level: lvl, lines: p.text, isNew: lvl === 1, attr: false };
    }
    if (id === 329) return { kind: 'enchant', id: 'enchant', oid: 329, icon: 'enchant', title: a.name, level: 0, lines: a.lines.map((l) => l.text), isNew: false, attr: false };
    if (id >= 301 && id <= 324) {
      return { kind: 'special', id: 's' + id, oid: id, icon: 'spas_' + id, title: a.name, level: 0, lines: a.lines.map((l) => l.text.replace(/[[\]]/g, '').replace(/[〈〉]/g, '')), isNew: false, attr: false };
    }
    return null;
  }

  /**
   * Выбор карточки (X_Select_Ability.Button_SelectAbility): уровень персонажа +1, карточка в Learn, −1 копия из пула.
   * Свойство: id заклинания в Learn не идёт — вернуть 3 фиксированных свойства (Start_AbilityCh), их выбор → chooseAttr.
   */
  pick(c: Choice): { spell: Spell; options: AttrDef[] } | null {
    const P = W.player;
    P.level++;
    this.refunds = 0;
    if (c.kind === 'heal') { P.heal(W.stats.maxHp * 0.3); return null; }
    if (c.kind === 'enchant') { this.learn.push(329); return null; } // окно выбора открывает GameScene
    if (c.kind === 'special') {
      this.learn.push(c.oid);
      this.specials.add(c.id);
      SPECIALS.find((p) => p.id === c.id)?.apply(W.stats);
      return null;
    }
    this.dropCopy(c.oid);
    if (c.kind === 'passive') {
      const def = PASSIVES.find((p) => p.id === c.id)!;
      this.learn.push(c.oid);
      this.passives.set(def.id, this.magicLevel(c.oid));
      def.apply(W.stats);
      return null;
    }
    const def = DEF_BY_OID(c.oid)!;
    if (c.attr) {
      const sp = this.spells.get(def.id)!;
      const ml = this.magicLevel(c.oid) + 1;
      const a = ABILITY[c.oid];
      const ch = ml === a.traitA ? 0 : ml === a.traitB ? 1 : 2;
      // Start_AbilityCh: первое свойство этого заклинания + (0,1,2) или (3,4,5)
      let first = 0;
      for (let id = 361; id < 700; id++) if (ABILITY[id]?.parent === c.oid && ABILITY[id].type === 'trait') { first = id; break; }
      const ids = [0, 1, 2].map((k) => first + ch * 3 + k);
      const all = Object.values(def.attrs).flat();
      const options = ids.map((id, i): AttrDef => {
        const o = all.find((x) => x.id === String(id));
        return o ?? { id: String(id), name: ABILITY[id]?.name ?? '?', lines: (ABILITY[id]?.lines ?? []).map((l) => l.text), tint: PROP_TINTS[i] };
      });
      return { spell: sp, options };
    }
    this.learn.push(c.oid);
    const sp = this.spells.get(def.id);
    if (!sp) { this.add(def); return null; }
    sp.level = this.magicLevel(c.oid);
    sp.onChange();
    return null;
  }

  /** Выбрано свойство: id свойства в Learn поднимает уровень заклинания на 1 (пара −N:1) */
  chooseAttr(sp: Spell, a: AttrDef) {
    this.learn.push(Number(a.id));
    sp.attrs.add(a.id);
    const oid = Number(Object.entries(KEY_BY_ID).find(([, k]) => k === sp.def.id)?.[0]);
    sp.level = this.magicLevel(oid);
    sp.onChange();
  }

  /** «Вернуть N% маны» (V_Ability_Manager.Button_AbilityExit, levelup.md §6b). Уровень не растёт. */
  refund(scr: LevelScreen) {
    const P = W.player;
    this.refunds++;
    P.xp += P.xpNeed * Math.max(0, Math.min(1, scr.refundPct / 100));
    if (P.xp >= P.xpNeed) { P.xp -= P.xpNeed; P.pendingLevels++; } // ApplyLevelUpNum += 1 — сразу новый экран
    this.returnIds = scr.choices.slice(0, 4).map((c) => c.oid).filter((id) => id > 0 && id <= 45);
  }

  /** Button_MagicCom_Decision: уровень +1, слияние в Learn */
  learnMerge(c: ComboData) {
    W.player.level++;
    this.learn.push(10000 + c.id);
    this.mergeNum++;
    this.refunds = 0;
    this.applyCombo(c);
  }

  /** Слияние: основа получает модификаторы и механику слияния, донор исчезает (вид/механика — партия 6) */
  applyCombo(c: ComboData) {
    this.fusions.add(c.id);
    const base = this.spells.get(KEY_BY_ID[c.base.spell]) as DataSpell | undefined;
    if (base) { base.fusion = c; base.onChange(); }
    else this.globalCombos.add(c.id);
    for (const m of c.mods) if (m.stat === 'revive' && m.op === 'add') W.stats.revives += m.v;
    const dk = KEY_BY_ID[c.donor.spell];
    const donor = dk ? this.spells.get(dk) : undefined;
    if (donor) { donor.destroy(); this.spells.delete(dk); this.consumed.add(dk); }
  }

  /** Очарование выбранного заклинания */
  enchant(id: string) {
    const sp = this.spells.get(id);
    if (sp instanceof DataSpell && sp.canEnchant()) { sp.enchants++; sp.onChange(); }
  }

  /** карточка слияния для показа */
  comboChoice(c: ComboData): Choice {
    const nm = (id: number) => SPELL_BY_ID[id]?.ours ?? PASSIVES.find((p) => p.id === 'p' + id)?.name ?? '?';
    const num = String(c.id).padStart(2, '0');
    return {
      kind: 'combo', id: 'combo' + c.id, oid: 10000 + c.id, icon: 'combo_' + num + '_' + c.en.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      title: c.name, level: 0, isNew: false, attr: false, combo: c,
      lines: [`${nm(c.base.spell)} + ${nm(c.donor.spell)}`, ...c.mechanics, ...c.mods.filter((m) => m.op !== 'note').map((m) => m.text)],
    };
  }

  destroy() { for (const s of this.spells.values()) s.destroy(); this.spells.clear(); }
}
