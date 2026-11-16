import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #12 — ЗАГЛУШКА: механика не реализована */
class Cyclone extends DataSpell {
  update(_dt: number) {}
}

export const CYCLONE = defFromData(SPELL_BY_ID[12], (def) => new Cyclone(def, SPELL_BY_ID[12]));
