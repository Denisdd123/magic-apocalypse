import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #4 — ЗАГЛУШКА: механика не реализована */
class Satellite extends DataSpell {
  update(_dt: number) {}
}

export const SATELLITE = defFromData(SPELL_BY_ID[4], (def) => new Satellite(def, SPELL_BY_ID[4]));
