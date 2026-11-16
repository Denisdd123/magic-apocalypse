import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #8 — ЗАГЛУШКА: механика не реализована */
class Ezone extends DataSpell {
  update(_dt: number) {}
}

export const EZONE = defFromData(SPELL_BY_ID[8], (def) => new Ezone(def, SPELL_BY_ID[8]));
