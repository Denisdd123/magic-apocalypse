import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #6 — ЗАГЛУШКА: механика не реализована */
class Shield extends DataSpell {
  update(_dt: number) {}
}

export const SHIELD = defFromData(SPELL_BY_ID[6], (def) => new Shield(def, SPELL_BY_ID[6]));
