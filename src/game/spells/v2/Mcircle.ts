import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { PX, U } from './_orig';

const DEG = Math.PI / 180;
/** кольца: MagicCircle1/2 (A, 282 px, звезда) и MagicCircle4/5 (B, 391 px, руны); scale 0.85, альфа 0.706 */
const RING_A = 'mc_ringA', RING_B = 'mc_ringB';
const SCALE0 = 0.85, ALPHA0 = 0.706;

function ringTextures() {
  const tx = W.scene.textures;
  if (!tx.exists(RING_A)) {
    const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
    const c = 141, r = 139;
    g.lineStyle(2, 0xffffff, 1); g.strokeCircle(c, c, r);
    // шестиконечная звезда, вершины на окружности
    for (const off of [-90, 90]) {
      g.beginPath();
      for (let i = 0; i <= 3; i++) {
        const a = (off + i * 120) * DEG;
        if (i === 0) g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r); else g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      g.strokePath();
    }
    g.generateTexture(RING_A, 282, 282); g.destroy();
  }
  if (!tx.exists(RING_B)) {
    const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
    const c = 196;
    g.lineStyle(2, 0xffffff, 1); g.strokeCircle(c, c, 193); g.strokeCircle(c, c, 163);
    // пояс «рун»: штрихи, точки, кружки, треугольники между окружностями
    g.fillStyle(0xffffff, 1);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2, x = c + Math.cos(a) * 178, y = c + Math.sin(a) * 178;
      const kind = (i * 7) % 5;
      if (kind === 0) g.fillCircle(x, y, 3);
      else if (kind === 1) { g.strokeCircle(x, y, 5); }
      else if (kind === 2) { const t = a + Math.PI / 2; g.lineBetween(x - Math.cos(a) * 7, y - Math.sin(a) * 7, x + Math.cos(a) * 7, y + Math.sin(a) * 7); g.lineBetween(x - Math.cos(t) * 3 - Math.cos(a) * 7, y - Math.sin(t) * 3 - Math.sin(a) * 7, x - Math.cos(t) * 3 + Math.cos(a) * 7, y - Math.sin(t) * 3 + Math.sin(a) * 7); }
      else if (kind === 3) g.fillTriangle(x + Math.cos(a) * 6, y + Math.sin(a) * 6, x - Math.cos(a + 1) * 5, y - Math.sin(a + 1) * 5, x - Math.cos(a - 1) * 5, y - Math.sin(a - 1) * 5);
    }
    g.generateTexture(RING_B, 392, 392); g.destroy();
  }
}

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
      ringTextures();
      this.a = W.scene.add.image(0, 0, RING_A).setDepth(DEPTH.zone).setVisible(false);
      this.b = W.scene.add.image(0, 0, RING_B).setDepth(DEPTH.zone).setVisible(false);
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
