import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #15 — ЗАГЛУШКА: механика не реализована */
class Incinerate extends DataSpell {
  update(_dt: number) {}
}

export const INCINERATE = defFromData(SPELL_BY_ID[15], (def) => new Incinerate(def, SPELL_BY_ID[15]));
