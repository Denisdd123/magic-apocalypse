import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #7 — ЗАГЛУШКА: механика не реализована */
class Thunder extends DataSpell {
  update(_dt: number) {}
}

export const THUNDER = defFromData(SPELL_BY_ID[7], (def) => new Thunder(def, SPELL_BY_ID[7]));
