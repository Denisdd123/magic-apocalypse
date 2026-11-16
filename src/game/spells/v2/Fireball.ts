import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #2 — ЗАГЛУШКА: механика не реализована */
class Fireball extends DataSpell {
  update(_dt: number) {}
}

export const FIREBALL = defFromData(SPELL_BY_ID[2], (def) => new Fireball(def, SPELL_BY_ID[2]));
