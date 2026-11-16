import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #10 — ЗАГЛУШКА: механика не реализована */
class Meteor extends DataSpell {
  update(_dt: number) {}
}

export const METEOR = defFromData(SPELL_BY_ID[10], (def) => new Meteor(def, SPELL_BY_ID[10]));
