import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { Later, SkyFx, ringDamage } from './_skyfx';
import { RING_K, ensureInkFrost, freezeOnly } from './_inkfx';
import { SPIKE_TEX, ensureGroupC } from './_groupC';

/** базовый радиус взрыва вокруг мага */
const R0 = 70;
/** число ледяных пик венца (по отзыву 2.1: 9–10 вместо множества) */
const SPIKES = 10;

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
  // заморозка без корки на мобе: подсветку даёт Enemies.freeze
  private freezeCb = (e: Enemy) => freezeOnly(e, this.durSec);
  private stunCb = (e: Enemy) => W.enemies.stun(e, this.durSec);

  destroy() { this.fx.destroy(); this.later.clear(); }

  update(dt: number) {
    ensureInkFrost();
    ensureGroupC();
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
    // землетрясение — тот же венец, но грязно-бурый
    const tint = quake ? 0xd0a878 : 0xffffff;
    const follow = onPlayer ? W.player : undefined;
    // «чик»: зона на миг покрывается льдом (светлый налёт), из центра выстреливают ледяные пики и тут же оседают,
    // на земле остаётся короткий светлый след. Всё быстрое: пики 0.06 с, налёт гаснет за 0.4 с, след — за 1.1 с
    const rot = Math.random() * Math.PI * 2;
    const spikes = R < R0 * 0.8 ? 6 : SPIKES; // мелкие вспышки (Снежное цветение) — пик меньше
    this.fx.spawn('gc_patch', { x, y, w: R * 2.0, w1: R * 2.5, life: 0.4, a0: 0.9, a1: 0, hold: true, tint, follow, rot, depth: DEPTH.zone + 0.3 });
    for (let i = 0; i < spikes; i++) {
      const a = rot + (i / spikes) * Math.PI * 2 + (Math.random() - 0.5) * 0.16;
      const L = R * (0.82 + Math.random() * 0.2);
      this.fx.spawn(SPIKE_TEX[i & 1], {
        x, y, w: L * 0.3, h: L * 0.2, w1: L, h1: L * 0.27, life: 0.3, a0: 1, a1: 0, hold: true, tint,
        follow, rot: a, ox: 0.04, oy: 0.5, depth: DEPTH.zone + 0.5,
      });
    }
    this.fx.spawn('gc_trace', { x, y, w: R * 2.56, life: 1.1, delay: 0.1, a0: 0.7, a1: 0, hold: true, tint, rot: rot + 0.3, add: false, depth: DEPTH.zone });
    this.fx.spawn('ink_ring', { x, y, w: R * 0.5 * RING_K, w1: R * 1.05 * RING_K, life: 0.16, a0: 0.8, a1: 0, tint: quake ? 0xd0a878 : 0xcfeaff, follow });

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
        if (dx * dx + dy * dy > ri * ri) freezeOnly(e, this.durSec);
      });
      // внешнее кольцо холода расходится до 1.5R и гаснет
      this.fx.spawn('ink_ring', { x, y, w: R * 1.05 * RING_K, w1: R * 1.5 * RING_K, life: 0.4, delay: 0.1, a0: 0.85, a1: 0, hold: true, tint: 0xbfe4ff, follow });
    }
  }
}

export const FROSTNOVA = defFromData(SPELL_BY_ID[5], (def) => new Frostnova(def, SPELL_BY_ID[5]));
