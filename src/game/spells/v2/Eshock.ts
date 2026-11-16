import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #13 — ЗАГЛУШКА: механика не реализована */
class Eshock extends DataSpell {
  update(_dt: number) {}
}

export const ESHOCK = defFromData(SPELL_BY_ID[13], (def) => new Eshock(def, SPELL_BY_ID[13]));
