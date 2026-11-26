import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { Co, PX } from './_orig';

// ——— заглушки по меркам спрайтов (рисуем с Денисом позже) ———
const T = { star: 'ar_star', land: 'ar_land' };
/** Armageddon1..9: ширина кадра 140 → 41 px (звезда сжимается) */
const STAR_W = [140, 128, 116, 104, 92, 79, 66, 53, 41];
/** ArmageddonLandA 1010 px × scale 2.5 (рисуем 256) */
const LAND_PX = 1010, LAND_TW = 1010;
function textures() {
  const tx = W.scene.textures;
  const make = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    if (tx.exists(key)) return;
    const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g); g.generateTexture(key, w, h); g.destroy();
  };
  // белая лучистая звезда 140×94 (рисуем 70×47)
  make(T.star, 70, 47, (g) => {
    g.fillStyle(0xffffff, 0.3); g.fillEllipse(35, 23.5, 40, 30);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(0, 23.5, 35, 20, 35, 27); g.fillTriangle(70, 23.5, 35, 20, 35, 27);
    g.fillTriangle(35, 0, 32, 23.5, 38, 23.5); g.fillTriangle(35, 47, 32, 23.5, 38, 23.5);
    g.fillCircle(35, 23.5, 7);
  });
  // сеть трещин-молний (белая)
  make(T.land, LAND_TW, LAND_TW, (g) => {
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.lineStyle(2, 0xffffff, 0.9);
    for (let k = 0; k < 14; k++) {
      let a = (k / 14) * Math.PI * 2, x = 505, y = 505;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 9; s++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 55; y += Math.sin(a) * 55; g.lineTo(x, y); }
      g.strokePath();
    }
  });
}

/** 479: шаги возврата потолка HP каждую 1 с: 4 × 0.05, 2 × 0.03, далее 0.01 до 1.0 */
const APO_STEP = (t: number) => (t <= 4 ? 0.05 : t <= 6 ? 0.03 : 0.01);

/**
 * #14 Армагеддон — 1:1 по коду оригинала (docs/orig/spells/armageddon.md, карточка tasks/armageddon.md; C_Battle_Manager):
 * Play_ArmageddonAttack: DelayNum = PSpeed + 3; цикл wait 1.0 с, DelayNum −= 1; ≤ 0 → эффект, DelayNum = PSpeed, wait 5.0 (КД не тикает).
 * PSpeed 100 с, уровни 2–4 −10 % перемножаются (72.9 с).
 * Эффект: пол бледнеет к (1,1,0.9) α до 0.072 за 1.25 с → звезда у мага сжимается 9 × 0.03 с + 0.08 → удар: игрок неуязвим,
 * ВСЕ враги уровня (288 × 512 ед.) уничтожаются без маны и счёта убийств, кроме боссов 41–46 (им ничего), зона живёт ≈0.33 с;
 * белый экран α 0.75 гаснет 20 × 0.03 с; трещины α 0.6 — 0.8 с, затем гаснут 1.2 с. Тряски нет.
 * Свойства: 479 Апокалипсис (потолок HP врагов 0.6 → 1.0 за 20 с ступенями), 480 Вознесение (каждый 4-й — полное лечение;
 * реген +0.1 %/с — в данных ошибочно «cd +0.1 %»), 481 Пророчество (крупица маны: −1 % ОСТАТКА КД).
 * Для HUD: cdLeft, cdTotal.
 */
class Armageddon extends DataSpell {
  cdLeft = 0;
  private co: Co | null = null;
  private fx: Co | null = null;
  private delay = 0;
  private casts = 0;
  private regenApplied = false;
  private lastMana = 0;
  /** 479: текущий потолок HP (1 — нет) и таймер шага */
  private apoRatio = 1;
  private apoT = 0;
  private apoN = 0;
  /** зона уничтожения активна */
  private destroyOn = false;
  private ground: Phaser.GameObjects.Rectangle | null = null;
  private front: Phaser.GameObjects.Rectangle | null = null;
  private star: Phaser.GameObjects.Image | null = null;
  private land: Phaser.GameObjects.Image | null = null;

  get cdTotal() { return this.pSpeed; }
  private get pSpeed(): number { return Math.max(0.05, this.cdOrig(this.data.base.cd ?? 100) * this.cdGlobal); }

  onChange() {
    super.onChange();
    textures();
    if (!this.co) { this.delay = this.pSpeed + 3; this.co = new Co(this.loop()); }
    const rapture = this.hasProp(480);
    if (rapture !== this.regenApplied) { W.stats.regen += rapture ? 0.001 : -0.001; this.regenApplied = rapture; }
    this.lastMana = W.mana;
  }

  update(dt: number) {
    if (!this.co) this.onChange();
    // 481 ArmageddonDelay_Apply: каждая крупица маны — DelayNum −1 % (от остатка)
    if (W.mana > this.lastMana && this.hasProp(481)) this.delay *= Math.pow(0.99, W.mana - this.lastMana);
    this.lastMana = W.mana;
    this.co!.update(dt);
    this.fx?.update(dt);
    this.cdLeft = Math.max(0, Math.min(this.delay, this.pSpeed));
    if (this.destroyOn) this.destroyAll();
    if (this.apoRatio < 1) this.apocalypse(dt);
  }

  // ———— Play_ArmageddonAttack ————
  private *loop(): Generator<number, void, unknown> {
    for (;;) {
      yield 1.0;
      this.delay -= 1;
      if (this.delay > 0) continue;
      this.fx = new Co(this.effect());
      this.casts++;
      this.delay = this.pSpeed;
      if (this.hasProp(479)) { this.apoRatio = 0.6; this.apoT = 0; this.apoN = 0; }
      yield 5.0;
    }
  }

  // ———— Play_ArmageddonEffect ————
  private *effect(): Generator<number, void, unknown> {
    const sc = W.scene, P = W.player;
    if (!this.ground) {
      this.ground = sc.add.rectangle(0, 0, 4000, 4000, 0xffffe6).setScrollFactor(0).setDepth(DEPTH.zone - 1).setVisible(false);
      this.front = sc.add.rectangle(0, 0, 4000, 4000, 0xffffff).setScrollFactor(0).setDepth(DEPTH.top).setVisible(false);
      this.star = sc.add.image(0, 0, T.star).setDepth(DEPTH.top).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.land = sc.add.image(0, 0, T.land).setDepth(DEPTH.zone).setVisible(false);
    }
    // Ф1: пол бледнеет (1, 1, 0.9) α = i·0.003, 25 × 0.05 с
    this.ground!.setVisible(true);
    for (let i = 0; i < 25; i++) { this.ground!.setAlpha(i * 0.003); yield 0.05; }
    // Ф2: звезда у мага сжимается, 9 кадров × 0.03 с, затем 0.08
    const sx = P.x, sy = P.y;
    for (let k = 0; k < 9; k++) {
      this.star!.setVisible(true).setPosition(sx, sy).setScale((STAR_W[k] * PX) / 70).setAlpha(1);
      yield 0.03;
    }
    yield 0.08;
    this.star!.setVisible(false);
    // Ф3: коллайдеры игрока OFF, wait 0.05, зона уничтожения ON
    P.invulnT = Math.max(P.invulnT, 0.05 + 0.6 + 0.05);
    yield 0.05;
    this.destroyOn = true;
    this.destroyAll();
    this.land!.setVisible(true).setPosition(P.x, P.y).setScale((LAND_PX * PX * 2.5) / LAND_TW).setAlpha(0.75);
    this.fxLand = new Co(this.landAnim());
    if (this.hasProp(480) && this.casts % 4 === 0) P.heal(W.stats.maxHp);
    // Ф4: белый экран α 0.75 гаснет по 0.0375 за 0.03 с; на 11-м шаге зона OFF
    this.front!.setVisible(true).setAlpha(0.75);
    for (let i = 1; i <= 20; i++) {
      this.front!.setAlpha(Math.max(0, 0.75 - 0.0375 * i));
      this.fxLand?.update(0.03);
      if (i === 11) this.destroyOn = false;
      yield 0.03;
    }
    this.front!.setVisible(false); this.ground!.setVisible(false);
    while (this.fxLandOn) { this.fxLand?.update(0.03); yield 0.03; }
  }

  private fxLand: Co | null = null;
  private fxLandOn = false;
  /** Play_ArmageddonLand: α 0.6, wait 0.8, затем 40 × 0.03 с α − 0.015 */
  private *landAnim(): Generator<number, void, unknown> {
    this.fxLandOn = true;
    this.land!.setAlpha(0.6);
    yield 0.8;
    for (let i = 1; i <= 40; i++) { this.land!.setAlpha(Math.max(0, 0.6 - 0.015 * i)); yield 0.03; }
    this.land!.setVisible(false);
    this.fxLandOn = false;
  }

  /** C_AllDestroy_Armageddon → Unit_Destroy_Armageddon: без маны и счёта; метка 6 (боссы 41–46) — ничего */
  private destroyAll() {
    const E = W.enemies;
    for (const e of E.list) {
      if (!e.alive) continue;
      if ((e.type.uid >= 41 && e.type.uid <= 46) || e.cat >= 3) continue;
      if (e.elite) W.pickups.eliteKilled(e.x, e.y);      // тег «99» (счёт проклятой руны) работает и при IsDestroy
      W.fx.puff(e.x, e.y, e.r * 2.2, 0xffffff, 0.3);
      E.remove(e);
    }
  }

  /** 479: HP всех врагов ≤ HpMax·ratio; шаг каждую 1 с */
  private apocalypse(dt: number) {
    this.apoT += dt;
    while (this.apoT >= 1 && this.apoRatio < 1) {
      this.apoT -= 1; this.apoN++;
      this.apoRatio = Math.min(1, this.apoRatio + APO_STEP(this.apoN));
    }
    if (this.apoRatio >= 1) { this.apoRatio = 1; return; }
    for (const e of W.enemies.list) if (e.alive && e.hp > e.maxHp * this.apoRatio) e.hp = e.maxHp * this.apoRatio;
  }

  destroy() {
    if (this.regenApplied) { W.stats.regen -= 0.001; this.regenApplied = false; }
    this.ground?.destroy(); this.front?.destroy(); this.star?.destroy(); this.land?.destroy();
    this.ground = this.front = null; this.star = this.land = null;
    this.co = this.fx = this.fxLand = null;
    this.apoRatio = 1;
  }
}

export const ARMAGEDDON = defFromData(SPELL_BY_ID[14], (def) => new Armageddon(def, SPELL_BY_ID[14]));
