import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #9 — ЗАГЛУШКА: механика не реализована */
class Tsunami extends DataSpell {
  update(_dt: number) {}
}

export const TSUNAMI = defFromData(SPELL_BY_ID[9], (def) => new Tsunami(def, SPELL_BY_ID[9]));
