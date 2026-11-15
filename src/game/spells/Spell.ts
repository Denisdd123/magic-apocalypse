import { W } from '../World';

export interface AttrDef {
  id: string;
  name: string;
  lines: string[];   // описание и бонусы
  tint: number;      // цвет преображённого заклинания
}

export interface SpellDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  kind: 'attack' | 'utility';
  maxLevel: number;
  /** На каких уровнях выбирается преображение (свойство) */
  attrLevels: number[];
  /** Текст бонуса для каждого уровня (кроме уровней преображений) */
  levelText: Record<number, string[]>;
  attrs: Record<number, AttrDef[]>;
  create(): Spell;
}

export abstract class Spell {
  level = 1;
  attrs = new Set<string>();
  protected cd = 0;
  constructor(public def: SpellDef) {}

  has(id: string) { return this.attrs.has(id); }
  /** Вызывается после повышения уровня или выбора свойства */
  onChange() {}
  abstract update(dt: number): void;
  destroy() {}

  /** Тикает перезарядку; возвращает true, когда пора кастовать, и ставит новую перезарядку */
  protected ready(dt: number, baseCd: number) {
    this.cd -= dt;
    if (this.cd <= 0) { this.cd += Math.max(0.05, baseCd * W.stats.cdMul * (1 - (W.stats.spellCdr[this.def.id] ?? 0))); return true; }
    return false;
  }

  /** Цвет текущего преображения (или белый) */
  get tint(): number {
    for (const lvl of this.def.attrLevels.slice().reverse()) {
      for (const a of this.def.attrs[lvl] ?? []) if (this.attrs.has(a.id)) return a.tint;
    }
    return 0xffffff;
  }
}
