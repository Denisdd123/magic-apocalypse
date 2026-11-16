import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #21 — ЗАГЛУШКА: механика не реализована */
class Flash extends DataSpell {
  update(_dt: number) {}
}

export const FLASH = defFromData(SPELL_BY_ID[21], (def) => new Flash(def, SPELL_BY_ID[21]));
