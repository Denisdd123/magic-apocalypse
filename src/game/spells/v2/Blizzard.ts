import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #17 — ЗАГЛУШКА: механика не реализована */
class Blizzard extends DataSpell {
  update(_dt: number) {}
}

export const BLIZZARD = defFromData(SPELL_BY_ID[17], (def) => new Blizzard(def, SPELL_BY_ID[17]));
