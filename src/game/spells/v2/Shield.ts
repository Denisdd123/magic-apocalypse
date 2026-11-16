import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { areaDamage } from '../../Projectiles';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { addGuard, effCd, keepGuard, removeGuard } from './_utilGuard';

/** цвет пузыря по числу зарядов (как Shield1–5 оригинала, но приглушённо): бронза → серебро */
const CHARGE_TINT = [0xb08a5a, 0x9fb8d8, 0xd8c27a, 0x9fd0a0, 0xd8d8e4];

/**
 * #6 Щит → «Оберег». Заряды (count, база 1) поглощают удар целиком; при поломке — неуязвимость 0.2 с
 * (Барьер — 1 с). Заряд восстанавливается раз в cdSec (33 с, ур.2–4 −10%).
 * Перехват удара: страж в цепочке Player.onBeforeHurt (см. _utilGuard.ts) — срабатывает на ЛЮБОЙ удар
 * (касание моба, снаряд), ровно до того, как Player.hurt снимет HP.
 * Свойства: 407 Барьер (+2 заряда), 408 Переустановка (+1 заряд, заряжаются по 2, КД +20%),
 * 409 Поле разрушения (при поломке 4 взрыва 500%, следуют за магом).
 * Слияние 18 «Квантовый взрыв» (основа): вместо зарядки — мощный взрыв; урон и размер +33% за каждый заряд, × размер.
 * Для HUD: cdLeft, cdTotal, active (=charges>0), charges, maxCharges.
 */
class Shield extends DataSpell {
  charges = 0;
  cdLeft = 0;
  private started = false;
  private bubble: Phaser.GameObjects.Image | null = null;
  private fieldHits = 0;   // оставшиеся взрывы Поля разрушения
  private fieldT = 0;
  private animT = 0;
  private readonly guard = () => this.absorb();

  get maxCharges() { return this.count; }
  get cdTotal() { return effCd(this.cdSec, this.def.id); }
  get active() { return this.charges > 0; }

  onChange() {
    super.onChange();
    addGuard(this.guard, 0);
    const max = this.maxCharges;
    if (!this.started) { this.started = true; this.charges = this.hasCombo(18) ? 0 : max; }
    if (this.charges > max) this.charges = max;
    if (this.hasCombo(18) && this.cdLeft <= 0) this.cdLeft = this.cdTotal;
    if (!this.bubble) {
      this.bubble = W.scene.add.image(0, 0, 'fx_shield_bubble').setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    }
  }

  /** удар по магу: снять заряд вместо HP */
  private absorb(): boolean {
    if (this.charges <= 0) return false;
    this.charges--;
    const P = W.player;
    P.invulnT = Math.max(P.invulnT, this.hasProp(407) ? 1 : 0.2);
    const r = 26 * W.stats.sizeMul;
    W.fx.burst(P.x, P.y - 3, r * 1.6, CHARGE_TINT[Math.min(this.charges, 4)], 0.4, 'fx_shield_break', P);
    W.fx.sparks(P.x, P.y - 3, 8, 0xd8c8a0, 120);
    if (this.hasProp(409)) { this.fieldHits = 4; this.fieldT = 0; }
    if (this.cdLeft <= 0) this.cdLeft = this.cdTotal;
    return true;
  }

  update(dt: number) {
    keepGuard();
    const P = W.player;
    const max = this.maxCharges;
    const quantum = this.hasCombo(18);

    // перезарядка: идёт, пока зарядов меньше максимума (у Квантового взрыва — всегда)
    if (quantum || this.charges < max) {
      if (this.cdLeft <= 0) this.cdLeft = this.cdTotal;
      this.cdLeft -= dt;
      if (this.cdLeft <= 0) {
        if (quantum) this.quantumBlast();
        else this.charges = Math.min(max, this.charges + (this.hasProp(408) ? 2 : 1));
        this.cdLeft = quantum || this.charges < max ? this.cdTotal : 0;
        if (!quantum) W.fx.burst(P.x, P.y - 3, 24 * W.stats.sizeMul, CHARGE_TINT[Math.min(this.charges - 1, 4)], 0.3, 'ring', P);
      }
    } else this.cdLeft = 0;

    // Поле разрушения: 4 взрыва, следуют за магом
    if (this.fieldHits > 0) {
      this.fieldT -= dt;
      if (this.fieldT <= 0) {
        this.fieldT = 0.3;
        this.fieldHits--;
        const r = 48 * this.sizeMul;
        areaDamage(P.x, P.y, r, this.dmgOf(500), 40, this.def.id);
        W.fx.burst(P.x, P.y, r, 0x9fb8ff, 0.3, 'fx_shield_break', P);
      }
    }

    // пузырь вокруг мага: виден при зарядах, цвет — по их числу
    const b = this.bubble;
    if (b) {
      if (this.charges > 0) {
        this.animT += dt;
        const s = (34 + 3 * Math.min(this.charges - 1, 4)) * W.stats.sizeMul * (1 + 0.03 * Math.sin(this.animT * 3));
        b.setVisible(true).setPosition(P.x, P.y - 3).setDisplaySize(s, s * 1.1)
          .setTint(CHARGE_TINT[Math.min(this.charges - 1, 4)]).setAlpha(0.55 + 0.1 * Math.sin(this.animT * 2.2));
        b.rotation += dt * 0.4;
      } else b.setVisible(false);
    }
  }

  /** Квантовый взрыв: урон и размер +33% за каждый заряд (макс.), урон растёт и с размером всех заклинаний */
  private quantumBlast() {
    const P = W.player;
    const k = 1 + 0.33 * this.maxCharges;
    const r = 80 * k * this.sizeMul;
    areaDamage(P.x, P.y, r, this.dmgOf(500) * k * W.stats.sizeMul, 160, this.def.id);
    W.fx.burst(P.x, P.y, r, 0xd8e4ff, 0.5, 'fx_shield_break');
    W.fx.burst(P.x, P.y, r * 0.6, 0xffffff, 0.35, 'ring');
    W.fx.sparks(P.x, P.y, 14, 0xd8e4ff, 200);
  }

  destroy() {
    removeGuard(this.guard);
    this.bubble?.destroy(); this.bubble = null;
  }
}

export const SHIELD = defFromData(SPELL_BY_ID[6], (def) => new Shield(def, SPELL_BY_ID[6]));
