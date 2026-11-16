import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #5 — ЗАГЛУШКА: механика не реализована */
class Frostnova extends DataSpell {
  update(_dt: number) {}
}

export const FROSTNOVA = defFromData(SPELL_BY_ID[5], (def) => new Frostnova(def, SPELL_BY_ID[5]));
