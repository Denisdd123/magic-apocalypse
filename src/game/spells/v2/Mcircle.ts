import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #19 — ЗАГЛУШКА: механика не реализована */
class Mcircle extends DataSpell {
  update(_dt: number) {}
}

export const MCIRCLE = defFromData(SPELL_BY_ID[19], (def) => new Mcircle(def, SPELL_BY_ID[19]));
