import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #3 — ЗАГЛУШКА: механика не реализована */
class Spirit extends DataSpell {
  update(_dt: number) {}
}

export const SPIRIT = defFromData(SPELL_BY_ID[3], (def) => new Spirit(def, SPELL_BY_ID[3]));
