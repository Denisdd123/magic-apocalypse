import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { effCd } from './_utilGuard';
import { MAGE_H } from './_linefx';

/**
 * Радиус печати: по спрайту оригинала MagicCircle (≈400 px в конце раскрытия, 100 px/ед.) и камере
 * (6.69 ед. на 540 px видео, маг ≈47 px) → ≈3.5 роста мага (было 62 ед. ≈ 2.7 роста). Вид не меняем — только размер.
 */
const SEAL_R = 3.5 * MAGE_H;

/**
 * #19 Магический круг → «Руна силы». Раз в cdSec (20 с, отсчёт после окончания круга) под магом
 * появляется печать на durSec (5 с, ур.2–4 +20%): приумножение атаки (W.stats.tempAmp) 25% + 5 п.п. за ур.2–4.
 * Свойства: 524 Высвобождение (пока круг активен — все КД −15% через W.stats.cdSpeedBonus; свой КД −15% мод),
 * 525 Пластичность материи (при появлении круга — 5 предметов вокруг; мана +15% — применяем сами в xpGain),
 * 526 Большой круг (эффект ×2; длительность +33%, КД +33% — моды).
 * Слияние 27 «Безграничная энергия» (основа): круг постоянный; эффект +1 п.п. за каждые 3% прироста
 * длительности и за каждые 3% сокращения КД круга.
 * Для HUD: cdLeft, cdTotal, active (сек. оставшегося круга).
 */
class Mcircle extends DataSpell {
  active = 0;
  cdLeft = 0;
  private img: Phaser.GameObjects.Image | null = null;
  private r = 60;
  private dur = 1;
  private xpApplied = false;
  private first = true;

  get cdTotal() { return effCd(this.cdSec, this.def.id); }

  /** приумножение атаки (доля) */
  get amp() {
    // уровни дают «+5%» к эффекту — это проценты-пункты к базе 25 (stat с базой 100 = 100 + Σpct)
    let pts = (this.data.base.effectPct ?? 25) + (this.stat('effect', 100) - 100);
    if (this.hasCombo(27)) {
      const durInc = (this.durSec / (this.data.base.duration ?? 5) - 1) * 100;
      const cdRed = (1 - this.cdTotal / (this.data.base.cd ?? 20)) * 100;
      pts += Math.max(0, durInc) / 3 + Math.max(0, cdRed) / 3;
    }
    if (this.hasProp(526)) pts *= 2;
    return pts / 100;
  }

  onChange() {
    super.onChange();
    const synth = this.hasProp(525);
    if (synth !== this.xpApplied) { W.stats.xpGain += synth ? 0.15 : -0.15; this.xpApplied = synth; }
    if (!this.img) this.img = W.scene.add.image(0, 0, 'fx_mcircle_seal').setDepth(DEPTH.zone).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    // первый круг — сразу после изучения
    if (this.first) { this.first = false; this.cast(); }
  }

  update(dt: number) {
    const P = W.player, s = W.stats;
    const perpetual = this.hasCombo(27);
    if (perpetual && this.active <= 0) this.cast();
    if (this.active > 0) {
      if (!perpetual) this.active -= dt;
      s.tempAmp = this.amp;
      s.cdSpeedBonus = this.hasProp(524) ? 0.15 : 0;
      const img = this.img!;
      this.r = SEAL_R * W.stats.sizeMul * (this.hasProp(526) ? 1.3 : 1);
      img.setPosition(P.x, P.y + 4).setDisplaySize(this.r * 2, this.r * 2);
      img.rotation += dt * 0.5;
      const fade = perpetual ? 1 : Math.min(1, this.active / 0.4, (this.dur - this.active) / 0.25 + 0.2);
      img.setAlpha(0.75 * fade);
      if (this.active <= 0) {
        s.tempAmp = 0; s.cdSpeedBonus = 0; img.setVisible(false);
        this.cdLeft = this.cdTotal; // КД — после окончания круга
      }
      return;
    }
    this.cdLeft -= dt;
    if (this.cdLeft <= 0) this.cast();
  }

  private cast() {
    const P = W.player;
    this.dur = this.durSec;
    this.active = this.dur;
    this.cdLeft = 0;
    this.r = SEAL_R * W.stats.sizeMul * (this.hasProp(526) ? 1.3 : 1);
    const tint = this.hasProp(524) ? 0x8fd8ff : this.hasProp(525) ? 0xc89bff : this.hasProp(526) ? 0xff8a6a : 0xe0c070;
    this.img?.setVisible(true).setPosition(P.x, P.y + 4).setDisplaySize(this.r * 2, this.r * 2).setTint(tint).setAlpha(0.2);
    W.fx.burst(P.x, P.y, this.r, tint, 0.5, 'ring');
    if (this.hasProp(525)) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2, d = this.r * 0.7;
        W.orbs.drop(P.x + Math.cos(a) * d, P.y + Math.sin(a) * d, i === 0 ? 'life' : 'm');
      }
    }
  }

  destroy() {
    if (this.active > 0) { W.stats.tempAmp = 0; W.stats.cdSpeedBonus = 0; }
    if (this.xpApplied) { W.stats.xpGain -= 0.15; this.xpApplied = false; }
    this.img?.destroy(); this.img = null;
  }
}

export const MCIRCLE = defFromData(SPELL_BY_ID[19], (def) => new Mcircle(def, SPELL_BY_ID[19]));
