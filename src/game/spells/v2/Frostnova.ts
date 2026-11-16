import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { Later, SkyFx, freezeCrust, ringDamage } from './_skyfx';

/** базовый радиус взрыва вокруг мага */
const R0 = 70;

/**
 * #5 Ледяные иглы → «Ледяной венец». Раз в КД вокруг мага раскрывается кольцо ледяных игл:
 * урон всем в радиусе и заморозка на durSec (элиток/боссов не морозит — W.enemies.freeze).
 * Свойства: 398 Абсолютный ноль (морозит и врагов рядом с местом взрыва, заморозка +25%),
 * 399 Ледниковый период (3 взрыва подряд, урон и размер ×1.5 за каждый), 400 Землетрясение (оглушение вместо заморозки).
 * Слияния (основа): 24 Снежное цветение, 31 Большой разлом.
 */
class Frostnova extends DataSpell {
  private fx = new SkyFx();
  private later = new Later();
  private freezeCb = (e: Enemy) => freezeCrust(this.fx, e, this.durSec);
  private stunCb = (e: Enemy) => W.enemies.stun(e, this.durSec);

  destroy() { this.fx.destroy(); this.later.clear(); }

  update(dt: number) {
    this.fx.update(dt);
    this.later.update(dt);
    if (this.readyData(dt)) this.cast();
  }

  private cast() {
    const P = W.player;
    let dmg = this.dmg;
    const R = R0 * this.sizeMul;
    if (this.hasCombo(31)) dmg *= this.sizeMul; // 31 Большой разлом: урон растёт с размером

    if (this.hasCombo(24)) {
      // 24 Снежное цветение: 24 взрыва подряд рядом с врагами, каждый на 2% слабее и меньше
      const targets = W.enemies.nearestN(P.x, P.y, 24, 260);
      for (let k = 0; k < 24; k++) {
        const s = 0.98 ** k;
        this.later.add(k * 0.07, () => {
          const t = targets.length ? targets[(Math.random() * targets.length) | 0] : null;
          const x = t && t.alive ? t.x : P.x + (Math.random() - 0.5) * 160;
          const y = t && t.alive ? t.y : P.y + (Math.random() - 0.5) * 160;
          this.nova(x, y, R * 0.6 * s, dmg * s, false);
        });
      }
      return;
    }

    if (this.hasProp(399)) {
      // Ледниковый период: 3 взрыва, урон и размер ×1.5 за каждый
      for (let k = 0; k < 3; k++) {
        const m = 1.5 ** k;
        this.later.add(k * 0.4, () => this.nova(W.player.x, W.player.y, R * m, dmg * m, true));
      }
      return;
    }
    this.nova(P.x, P.y, R, dmg, true);
  }

  private nova(x: number, y: number, R: number, dmg: number, onPlayer: boolean) {
    const quake = this.hasProp(400);
    const tint = quake ? 0xc0a080 : 0xd8ecff;
    const follow = onPlayer ? W.player : undefined;
    this.fx.spawn('fx_frostnova_ring', { x, y, w: R * 0.6, w1: R * 2.3, life: 0.4, a0: 1, a1: 0, tint, follow, rot: Math.random() * 6.28 });
    this.fx.spawn('blast', { x, y, w: R * 0.5, w1: R * 1.8, life: 0.25, a0: 0.5, a1: 0, tint, follow });

    if (quake) {
      // Землетрясение: трещины в земле, оглушение вместо заморозки; 31 — ещё и отбрасывание
      this.fx.spawn('fx_thunder_scorch', { x, y, w: R * 2, life: 1.2, a0: 0.8, a1: 0, hold: true, add: false, depth: DEPTH.zone, tint: 0x5a4632, rot: Math.random() * 6.28 });
      W.scene.cameras.main.shake(110, 0.003);
      ringDamage(x, y, 0, R, dmg, this.hasCombo(31) ? 260 : 30, this.def.id, this.stunCb);
      return;
    }
    ringDamage(x, y, 0, R, dmg, 20, this.def.id, this.freezeCb);
    // 398 Абсолютный ноль: враги рядом с местом взрыва тоже замерзают
    if (this.hasProp(398)) {
      const ri = R;
      W.enemies.grid.query(x, y, R * 1.5, (e) => {
        const dx = e.x - x, dy = e.y - y;
        if (dx * dx + dy * dy > ri * ri) freezeCrust(this.fx, e, this.durSec);
      });
      this.fx.spawn('ring', { x, y, w: R * 2, w1: R * 3.2, life: 0.45, a0: 0.5, a1: 0, tint: 0x9fd0ff, follow });
    }
  }
}

export const FROSTNOVA = defFromData(SPELL_BY_ID[5], (def) => new Frostnova(def, SPELL_BY_ID[5]));
