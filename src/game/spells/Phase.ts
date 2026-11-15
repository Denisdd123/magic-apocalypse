import { areaDamage } from '../Projectiles';
import { W } from '../World';
import { Spell, type SpellDef } from './Spell';

/** Фаза — когда враг вот-вот ударит, маг уходит в фазу: неуязвим, проходит сквозь врагов, бежит быстрее. */
class Phase extends Spell {
  active = 0;
  private killsAtStart = 0;
  private harvested = 0;
  private _xp = false;

  get dur() {
    let d = 2 * (1 + 0.3 * (Math.min(this.level, 4) - 1));
    if (this.has('mirage')) d *= 1.8;
    return d * W.stats.durMul;
  }
  get readyNow() { return this.cd <= 0 && this.active <= 0; }
  get cdLeft() { return Math.max(0, this.cd); }

  onChange() {
    W.player.onBeforeHurt = () => {
      if (!this.readyNow) return false;
      this.activate();
      return true;
    };
    if (this.has('harvest') && !this._xp) { this._xp = true; W.stats.xpGain += 0.33; }
  }

  private activate() {
    const P = W.player;
    this.active = this.dur;
    this.cd = 45 * W.stats.cdMul;
    P.invulnT = this.active;
    P.speedBuff = 0.3;
    this.killsAtStart = W.kills;
    this.harvested = 0;
    W.fx.burst(P.x, P.y, 40, 0xb48cff, 0.4, 'ring');
  }

  update(dt: number) {
    if (!W.player.onBeforeHurt) this.onChange();
    if (this.active > 0) {
      this.active -= dt;
      const P = W.player;
      if (this.has('harvest')) {
        const k = W.kills - this.killsAtStart - this.harvested;
        if (k > 0) { this.harvested += k; P.heal(W.stats.maxHp * 0.003 * k); }
      }
      if (this.active <= 0) {
        P.speedBuff = 0;
        if (this.has('warp')) {
          const r = 120 * W.stats.sizeMul;
          areaDamage(P.x, P.y, r, W.stats.spellDamage(5000), 200);
          W.fx.burst(P.x, P.y, r, 0xb48cff, 0.6);
          W.fx.sparks(P.x, P.y, 16, 0xd8c0ff, 160);
        }
      }
      return;
    }
    if (this.cd > 0) this.cd -= dt;
  }

  destroy() { W.player.onBeforeHurt = null; }
}

export const PHASE: SpellDef = {
  id: 'phase', name: 'Фаза', icon: 'ico_phase', kind: 'utility',
  desc: 'Перед ударом врага ты уходишь в фазу: 2 сек. неуязвимости, проход сквозь врагов и ускорение. Перезарядка 45 сек.',
  maxLevel: 5, attrLevels: [5],
  levelText: { 2: ['Длительность +30%'], 3: ['Длительность +30%'], 4: ['Длительность +30%'] },
  attrs: {
    5: [
      { id: 'mirage', name: 'Мираж', tint: 0xc9b3ff, lines: ['Длительность фазы +80%'] },
      { id: 'warp', name: 'Искривление', tint: 0xff8ad8, lines: ['В конце фазы вокруг тебя происходит мощнейший взрыв.'] },
      { id: 'harvest', name: 'Жатва', tint: 0x9cff7a, lines: ['Каждое убийство в фазе лечит 0.3% здоровья.', 'Получение эссенции +33%'] },
    ],
  },
  create: () => new Phase(PHASE),
};
