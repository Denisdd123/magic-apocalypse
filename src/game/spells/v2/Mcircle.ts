import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { PX, U } from './_orig';

const DEG = Math.PI / 180;
/** кольца оригинала: A = MagicCircle1↔2, B = MagicCircle4↔5 (смена 0.08 с), при слиянии 27 (ComID 1) A/B = 7↔8; холст 520², PPU 100, scale 0.85, альфа 0.706 */
const MC = (n: number) => `mc_${n}`;
export const MCIRCLE_LOAD: [string, string][] = [1, 2, 4, 5, 7, 8].map((n) => [MC(n), `vfx/mcircle/orig/MagicCircle${n}.png`]);
const SCALE0 = 0.85, ALPHA0 = 0.706, FRAME_DT = 0.08;

/**
 * #19 Магический круг — 1:1 по коду оригинала (docs/orig/spells/mcircle.md, Play_MagicCircle d__1106):
 * первый круг — ЧЕРЕЗ PSpeed (20 с) после изучения; затем цикл «круг Time (5 с) → пауза PSpeed».
 * Пока круг активен: power += EffectNum·0.01 (база 25 — код, текст «20%»), ур. 2–4 +5 эффекта и +20 % времени.
 * Вид: кольца A (звезда, −1.5°/тик) и B (руны, +1.2°/тик), тик 0.03 с; C невидимо (альфа 0).
 * Свойства: 524 — PSpeed всех заклинаний × 0.85 пока круг активен (цвет колец голубой);
 * 525 — 5 предметов вокруг мага при каждой активации (CreateItem_Character_MagicCircle; мана +15 %), тёмно-фиолетовый;
 * 526 — EffectNum ×2, кольца A/B ×1.2, красно-оранжевый.
 * Слияние 27 «Безграничная энергия» — круг постоянный, +1 эффекта за каждые 3 % времени и 3 % сокращения КД (§9.1).
 */
class Mcircle extends DataSpell {
  /** осталось действия круга, с (для HUD) */
  active = 0;
  /** осталось паузы до круга, с (для HUD) */
  cdLeft = 0;
  private a: Phaser.GameObjects.Image | null = null;
  private b: Phaser.GameObjects.Image | null = null;
  private rotA = 0;
  private rotB = 0;
  private ft = 0;
  private xpApplied = false;
  private learned = false;

  /** UnitApply_MagicCirclePSpeed: 20 с × свои проценты (перемножаются) × общий множитель перезарядки */
  get cdTotal() { return Math.max(0.05, this.cdOrig(this.data.base.cd ?? 20) * this.cdGlobal); }

  /** UnitApply_MagicCircleEffectNum (п.п. приумножения) */
  private get effectNum(): number {
    let pts = (this.data.base.effectPct ?? 25) + (this.stat('effect', 100) - 100);
    if (this.hasCombo(27)) {
      const tMul = this.durSec / (this.data.base.duration ?? 5);
      const cdMul = this.cdTotal / (this.data.base.cd ?? 20);
      pts += Math.max(0, tMul - 1) * 33 + Math.max(0, Math.min(1 - cdMul, 5)) * 33;
    }
    pts = Math.round(pts);
    if (this.hasProp(526)) pts *= 2;
    return pts;
  }
  /** для HUD/артефактов: приумножение долей */
  get amp() { return this.effectNum / 100; }

  onChange() {
    super.onChange();
    const synth = this.hasProp(525);
    if (synth !== this.xpApplied) { W.stats.xpGain += synth ? 0.15 : -0.15; this.xpApplied = synth; }
    if (!this.a) {
      this.a = W.scene.add.image(0, 0, MC(1)).setDepth(DEPTH.zone).setVisible(false);
      this.b = W.scene.add.image(0, 0, MC(4)).setDepth(DEPTH.zone).setVisible(false);
    }
    // yield Wait(PSpeed) перед первым кругом
    if (!this.learned) { this.learned = true; this.cdLeft = this.cdTotal; }
  }

  update(dt: number) {
    const P = W.player, s = W.stats;
    const perpetual = this.hasCombo(27);
    if (perpetual && this.active <= 0) this.start();
    if (this.active > 0) {
      if (!perpetual) this.active -= dt;
      s.tempAmp = this.amp;
      s.cdSpeedBonus = this.hasProp(524) ? 0.15 : 0;
      // Play_MagicCircleEffectA: A −1.5°, B +1.2° за 0.03 с (Unity, против часовой — «+»; на экране y вниз знак меняется)
      this.rotA += (1.5 / 0.03) * dt;
      this.rotB -= (1.2 / 0.03) * dt;
      // Play_MagicCircleEffectB: кадры меняются каждые 0.08 с
      this.ft += dt;
      const f = Math.floor(this.ft / FRAME_DT) & 1;
      if (perpetual) { this.a!.setTexture(MC(7 + f)); this.b!.setTexture(MC(7 + f)); }
      else { this.a!.setTexture(MC(1 + f)); this.b!.setTexture(MC(4 + f)); }
      this.place(P.x, P.y);
      if (this.active <= 0) this.end();
      return;
    }
    this.cdLeft -= dt;
    if (this.cdLeft <= 0) this.start();
  }

  private place(x: number, y: number) {
    const big = this.hasProp(526) ? 1.2 : 1;
    const k27 = this.hasCombo(27) ? 1 + (this.effectNum - (this.data.base.effectPct ?? 25) - (this.stat('effect', 100) - 100)) * 0.01 : 1;
    const sc = SCALE0 * big * k27 * PX;
    this.a!.setPosition(x, y).setScale(sc).setRotation(this.rotA * DEG);
    this.b!.setPosition(x, y).setScale(sc).setRotation(this.rotB * DEG);
  }

  private start() {
    const P = W.player;
    this.active = this.durSec;
    this.cdLeft = 0;
    // цвета колец по свойству (SpriteRenderer.color), альфа префаба 0.706; 27 — (0.85, 0.85, 0.95, 0.6)
    let tint = 0xffffff, alpha = ALPHA0;
    if (this.hasCombo(27)) { tint = 0xd9d9f2; alpha = 0.6; }
    else if (this.hasProp(524)) tint = 0x7de1ff;
    else if (this.hasProp(525)) tint = 0x281428;
    else if (this.hasProp(526)) tint = 0xff280a;
    for (const img of [this.a!, this.b!]) img.setVisible(true).setTint(tint).setAlpha(alpha);
    this.place(P.x, P.y);
    // 525: CreateItem_Character_MagicCircle(5), кроме обелиска и OnlyBossON
    if (this.hasProp(525) && !W.waves.onlyBoss) for (let i = 0; i < 5; i++) this.item();
  }

  private end() {
    W.stats.tempAmp = 0; W.stats.cdSpeedBonus = 0;
    this.a?.setVisible(false); this.b?.setVisible(false);
    this.cdLeft = this.cdTotal; // пауза — после окончания круга
  }

  /** один предмет CreateItem_Character_MagicCircle: угол случайный, по осям Random(2, 3) ед.; Random(1, 501) */
  private item() {
    const P = W.player, a = Math.random() * Math.PI * 2;
    const x = P.x + Math.cos(a) * (2 + Math.random()) * U, y = P.y + Math.sin(a) * (2 + Math.random()) * U;
    const r = 1 + ((Math.random() * 500) | 0);
    if (r < 426) W.orbs.drop(x, y, 's');            // 1 — малая сфера (85 %)
    else if (r < 477) W.orbs.drop(x, y, 'm');       // 2 — средняя
    else if (r < 483) W.orbs.drop(x, y, 'l');       // 3 — большая
    else if (r < 496) W.orbs.drop(x, y, 'life', 0); // 15 — сердце
    else if (r === 496) return;                     // 17 — предмет не опознан (1/500), не выдаём
    else W.pickups.rune(r === 497 ? 'fury' : r === 498 ? 'invuln' : r === 499 ? 'greed' : 'cleanse', x, y); // 31–34
  }

  destroy() {
    if (this.active > 0) { W.stats.tempAmp = 0; W.stats.cdSpeedBonus = 0; }
    if (this.xpApplied) { W.stats.xpGain -= 0.15; this.xpApplied = false; }
    this.a?.destroy(); this.b?.destroy(); this.a = this.b = null;
  }
}

export const MCIRCLE = defFromData(SPELL_BY_ID[19], (def) => new Mcircle(def, SPELL_BY_ID[19]));
