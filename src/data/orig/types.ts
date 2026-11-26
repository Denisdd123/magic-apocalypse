// АВТОГЕНЕРАЦИЯ — не править руками. Генератор: docs/orig/tools/gen_orig_ts.py
// Общие типы таблиц оригинала.

/** Пара (эффект-ID, значение) — таблица переходов AbilityStatApply (balance.md §3). */
export type Effect = readonly [id: number, value: number];
/** n — номер колонки 설명줄0n; у заклинаний колонка 6 — тексты уровней через «^». */
export interface Line { n: number; color: string; text: string }
export type AbilityType = 'magic' | 'passive' | 'artifact' | 'trait' | 'special' | 'research' | 'enchant';
export interface Ability {
  id: number; name: string; type: AbilityType;
  reqLevel: number;
  /** 특성ID: у свойства — иконка/номер, у артефакта 'a' */
  traitId: string;
  traitA: number; traitB: number; traitC: number;
  maxLevel: number;
  /** 파생기술ID: заклинание, к которому относится свойство */
  parent: number;
  special: readonly number[];
  learn: readonly number[];
  /** индекс 0 = колонка 효과ID_01 */
  effects: readonly (Effect | null)[];
  lines: readonly Line[];
}
export interface Merge {
  id: number; name: string;
  /** два нужных свойства (특성A레벨, 특성B레벨) */
  traitA: number; traitB: number;
  effects: readonly (Effect | null)[];
  lines: readonly Line[];
  /** 궁극기 조건: в 3.0 ультимейты не делаем (MASTER §14) */
  ultimateClass: number;
}
export interface Synergy {
  id: number; name: string;
  count: number; artifacts: readonly number[];
  special: number;
  effects: readonly (Effect | null)[];
  lines: readonly Line[];
}
export interface ClassRow {
  id: number; name: string; kind: 'class' | 'subject';
  reqLevel: number; special: readonly number[];
  effects: readonly (Effect | null)[];
  lines: readonly Line[];
}
export interface UnitStat {
  id: number; nameKr: string;
  mana: number; attack: number; hp: number;
  debuffResist: number; deathResist: number;
  moveSpeed: number;
  /** %, balance.md §1 */
  size: number;
  abilities: readonly number[];
  deathMotion: number; deathMotionSize: number;
}
