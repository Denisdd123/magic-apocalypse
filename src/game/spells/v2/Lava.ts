import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #20 — ЗАГЛУШКА: механика не реализована */
class Lava extends DataSpell {
  update(_dt: number) {}
}

export const LAVA = defFromData(SPELL_BY_ID[20], (def) => new Lava(def, SPELL_BY_ID[20]));
