import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { areaDamage } from '../../Projectiles';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { addGuard, effCd, keepGuard, removeGuard } from './_utilGuard';

const SMOKE_N = 6;

/**
 * #11 Маскировка → «Тень». Когда враг вот-вот ударит (страж в цепочке Player.onBeforeHurt, после Щита),
 * маг растворяется в дым на durSec (2 с, ур.2–4 +30%): неуязвим (invulnT), скорость +15%.
 * Мобы и так не толкают мага — «проход сквозь врагов» = неуязвимость. КД 45 с, начинается при активации.
 * Свойства: 452 Мираж (длительность +80%, мод), 453 Искажение пространства (в конце мощный взрыв 10000%),
 * 454 Жатва душ (0.1% HP за убийство в маскировке, мана +33% постоянно).
 * Слияние 40 «Телепорт» (основа): маскировка срабатывает 7 раз подряд — прыжки в случайные точки со взрывом,
 * в конце возврат на исходную точку; урон ×3 (мод), растёт с длительностью.
 * Для HUD: cdLeft, cdTotal, active (сек. оставшейся маскировки).
 */
class Cloak extends DataSpell {
  active = 0;
  cdLeft = 0;
  private dur = 0;
  private killsAt = 0;
  private xpApplied = false;
  private smoke: Phaser.GameObjects.Image[] = [];
  private smokeT = 0;
  private smokeI = 0;
  // Телепорт
  private hops = 0;
  private hopT = 0;
  private hopGap = 0;
  private homeX = 0;
  private homeY = 0;
  private readonly guard = () => this.trigger();

  get cdTotal() { return effCd(this.cdSec, this.def.id); }

  onChange() {
    super.onChange();
    addGuard(this.guard, 10);
    const harvest = this.hasProp(454);
    if (harvest !== this.xpApplied) { W.stats.xpGain += harvest ? 0.33 : -0.33; this.xpApplied = harvest; }
    if (!this.smoke.length) {
      for (let i = 0; i < SMOKE_N; i++) {
        this.smoke.push(W.scene.add.image(0, 0, 'fx_cloak_smoke').setDepth(DEPTH.orb).setVisible(false));
      }
    }
  }

  private trigger(): boolean {
    if (this.active > 0 || this.cdLeft > 0) return false;
    const P = W.player;
    this.dur = this.durSec;
    this.active = this.dur;
    this.cdLeft = this.cdTotal;
    P.invulnT = Math.max(P.invulnT, this.active);
    P.speedBuff = 0.15;
    this.killsAt = W.kills;
    W.fx.burst(P.x, P.y - 3, 36, 0x6a5a80, 0.45, 'fx_cloak_smoke');
    if (this.hasCombo(40)) {
      // 7 прыжков (больше при росте длительности), равномерно за время маскировки
      this.hops = Math.max(7, Math.round(7 * this.stat('duration', 1)));
      this.hopGap = this.dur / (this.hops + 1);
      this.hopT = this.hopGap;
      this.homeX = P.x; this.homeY = P.y;
    }
    return true;
  }

  update(dt: number) {
    keepGuard();
    const P = W.player;
    if (this.active > 0) {
      this.active -= dt;
      P.invulnT = Math.max(P.invulnT, Math.max(0.05, this.active));
      if (this.hasProp(454)) {
        const k = W.kills - this.killsAt;
        if (k > 0) { this.killsAt = W.kills; P.heal(W.stats.maxHp * 0.001 * k); }
      }
      if (this.hops > 0) {
        this.hopT -= dt;
        if (this.hopT <= 0) {
          this.hopT += this.hopGap;
          this.hops--;
          const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 90;
          P.x = this.homeX + Math.cos(a) * d; P.y = this.homeY + Math.sin(a) * d;
          this.warp(0.5);
        }
      }
      this.trail(dt, true);
      if (this.active <= 0) this.finish();
    } else {
      if (this.cdLeft > 0) this.cdLeft -= dt;
      this.trail(dt, false);
    }
  }

  private finish() {
    const P = W.player;
    this.active = 0;
    P.speedBuff = 0;
    if (this.hasCombo(40)) {
      this.hops = 0;
      P.x = this.homeX; P.y = this.homeY; // возврат на исходную точку
      this.warp(1);
    } else if (this.hasProp(453)) this.warp(1);
    W.fx.burst(P.x, P.y - 3, 30, 0x6a5a80, 0.35, 'fx_cloak_smoke');
  }

  /** взрыв Искажения пространства (10000% ATK); у Телепорта урон растёт с длительностью */
  private warp(scale: number) {
    const P = W.player;
    const r = 110 * this.sizeMul * (0.7 + 0.3 * scale);
    let dmg = this.dmgOf(10000) * scale;
    if (this.hasCombo(40)) dmg *= this.stat('duration', 1);
    areaDamage(P.x, P.y, r, dmg, 200, this.def.id);
    W.fx.burst(P.x, P.y, r, 0x9a7ad0, 0.55, 'fx_cloak_smoke');
    W.fx.burst(P.x, P.y, r * 0.7, 0xd8c0ff, 0.4, 'ring');
    W.fx.sparks(P.x, P.y, 12, 0xd8c0ff, 160);
  }

  /** дымный шлейф: маг полупрозрачен (мигание invulnT в Player), за ним клубы дыма */
  private trail(dt: number, on: boolean) {
    const P = W.player;
    if (on) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.09;
        const s = this.smoke[this.smokeI++ % SMOKE_N];
        s.setVisible(true).setPosition(P.x + (Math.random() - 0.5) * 6, P.y + 2).setDisplaySize(26, 26)
          .setAlpha(0.7).setRotation(Math.random() * 6.28).setTint(0x8a7aa0);
      }
    }
    for (const s of this.smoke) {
      if (!s.visible) continue;
      const a = s.alpha - dt * 1.4;
      if (a <= 0) { s.setVisible(false); continue; }
      s.setAlpha(a).setDisplaySize(s.displayWidth + dt * 18, s.displayHeight + dt * 18);
    }
  }

  destroy() {
    removeGuard(this.guard);
    if (this.active > 0) W.player.speedBuff = 0;
    if (this.xpApplied) { W.stats.xpGain -= 0.33; this.xpApplied = false; }
    this.smoke.forEach((s) => s.destroy()); this.smoke = [];
  }
}

export const CLOAK = defFromData(SPELL_BY_ID[11], (def) => new Cloak(def, SPELL_BY_ID[11]));
