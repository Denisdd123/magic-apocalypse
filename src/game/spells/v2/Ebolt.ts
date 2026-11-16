import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #16 — ЗАГЛУШКА: механика не реализована */
class Ebolt extends DataSpell {
  update(_dt: number) {}
}

export const EBOLT = defFromData(SPELL_BY_ID[16], (def) => new Ebolt(def, SPELL_BY_ID[16]));
