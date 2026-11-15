import Phaser from 'phaser';
import { DEPTH } from '../../config';
import { W } from '../World';
import { Spell, type SpellDef } from './Spell';

/** Руна силы — магический круг на земле: пока стоишь внутри, атака усилена. */
class PowerRune extends Spell {
  private img: Phaser.GameObjects.Image | null = null;
  private active = 0;      // оставшееся время круга
  private x = 0; private y = 0; private r = 60;

  get amp() {
    let a = 0.25 + 0.05 * (Math.min(this.level, 4) - 1);
    if (this.has('great')) a *= 2;
    return a;
  }
  get dur() {
    let d = 5 * (1 + 0.2 * (Math.min(this.level, 4) - 1));
    if (this.has('great')) d *= 1.33;
    return d * W.stats.durMul;
  }
  get baseCd() {
    let c = 20;
    if (this.has('unleash')) c *= 0.85;
    if (this.has('great')) c *= 1.33;
    return c;
  }

  onChange() { if (this.has('synthesis') && !this._synth) { this._synth = true; W.stats.xpGain += 0.15; } }
  private _synth = false;

  update(dt: number) {
    const P = W.player, s = W.stats;
    if (this.active > 0) {
      this.active -= dt;
      const inside = Math.hypot(P.x - this.x, P.y - this.y) <= this.r;
      s.tempAmp = inside ? this.amp : 0;
      s.cdSpeedBonus = inside && this.has('unleash') ? 0.15 : 0;
      if (this.img) {
        this.img.rotation += dt * 0.6;
        const fade = Math.min(1, this.active / 0.4);
        this.img.setAlpha((inside ? 0.85 : 0.45) * fade);
      }
      if (this.active <= 0) { s.tempAmp = 0; s.cdSpeedBonus = 0; this.img?.setVisible(false); }
      // перезарядка начинается после окончания круга
      return;
    }
    if (this.ready(dt, this.baseCd)) this.cast();
  }

  private cast() {
    const P = W.player;
    this.x = P.x; this.y = P.y;
    this.r = 62 * W.stats.sizeMul;
    this.active = this.dur;
    if (!this.img) this.img = W.scene.add.image(0, 0, 'magic_circle').setDepth(DEPTH.zone).setBlendMode(Phaser.BlendModes.ADD);
    const tint = this.tint === 0xffffff ? 0xd9b3ff : this.tint;
    this.img.setVisible(true).setPosition(this.x, this.y).setDisplaySize(this.r * 2, this.r * 2).setTint(tint).setAlpha(0.8);
    W.fx.burst(this.x, this.y, this.r, tint, 0.5, 'ring');
    if (this.has('synthesis')) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2, d = this.r * 0.7;
        W.orbs.drop(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d, i === 0 ? 'life' : 'm', 6);
      }
    }
  }

  destroy() { this.img?.destroy(); W.stats.tempAmp = 0; W.stats.cdSpeedBonus = 0; }
}

export const POWER_RUNE: SpellDef = {
  id: 'powerrune', name: 'Руна силы', icon: 'ico_circle', kind: 'utility',
  desc: 'Рисует на земле магический круг. Пока стоишь внутри — атака усилена (база +25%).',
  maxLevel: 5, attrLevels: [5],
  levelText: {
    2: ['Усиление +5%', 'Длительность +20%'], 3: ['Усиление +5%', 'Длительность +20%'], 4: ['Усиление +5%', 'Длительность +20%'],
  },
  attrs: {
    5: [
      { id: 'unleash', name: 'Высвобождение', tint: 0x7ff7ff, lines: ['Пока стоишь в круге, все заклинания перезаряжаются на 15% быстрее.', 'Перезарядка руны -15%'] },
      { id: 'synthesis', name: 'Синтез', tint: 0x9cff7a, lines: ['При появлении круга рядом возникают 5 сфер.', 'Получение эссенции +15%'] },
      { id: 'great', name: 'Великий круг', tint: 0xffd166, lines: ['Эффект круга x2.', 'Длительность +33%, перезарядка +33%'] },
    ],
  },
  create: () => new PowerRune(POWER_RUNE),
};
