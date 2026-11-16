import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #14 — ЗАГЛУШКА: механика не реализована */
class Armageddon extends DataSpell {
  update(_dt: number) {}
}

export const ARMAGEDDON = defFromData(SPELL_BY_ID[14], (def) => new Armageddon(def, SPELL_BY_ID[14]));
