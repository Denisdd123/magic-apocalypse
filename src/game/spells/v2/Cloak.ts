import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #11 — ЗАГЛУШКА: механика не реализована */
class Cloak extends DataSpell {
  update(_dt: number) {}
}

export const CLOAK = defFromData(SPELL_BY_ID[11], (def) => new Cloak(def, SPELL_BY_ID[11]));
