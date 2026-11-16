import { SPELL_BY_ID } from '../../../data/spells_data';
import { DataSpell, defFromData } from '../DataSpell';

/** #18 — ЗАГЛУШКА: механика не реализована */
class Ray extends DataSpell {
  update(_dt: number) {}
}

export const RAY = defFromData(SPELL_BY_ID[18], (def) => new Ray(def, SPELL_BY_ID[18]));
