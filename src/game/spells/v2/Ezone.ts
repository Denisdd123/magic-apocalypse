import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { SkyFx } from './_skyfx';
import { EARC_TEX, EBALL_K, ERING_K, ensureInkEzone, freezeOnly } from './_inkfx';

/** базовый радиус поля вокруг мага: по видео оригинала (08_electric_zone_lv1) кольцо ≈255 px из 540 = 3.16 ед. в диаметре → R ≈ 1.58 ед. ≈ 90 px (было 55) */
const R0 = 88;
/** картинка огненной волны (427): внешний край ≈ 0.85 ширины → множитель диаметра */
const RING_K = 2.35;
/** штрихи поля прыгают по кругу рывками: шаг, с и угол шага */
const ARC_STEP = 0.07, ARC_ANG = 0.62;
/** число зарядов в слиянии 20 «Отладка молний» */
const CHARGES = 6;

/**
 * #8 Область электротока → «Поле разрядов». Постоянное поле вокруг мага: каждые tickSec (0.25 с)
 * урон 125% ATK всем внутри.
 * Свойства: 425 Эмиссия заряда (чистые моды), 426 ЭМИ (каждый 4-й удар по врагу оглушает),
 * 427 Огненная аура (не тикает: огненное кольцо расширяется и гаснет, бьёт каждого раз за цикл; цикл = 4 интервала).
 * Слияния (основа): 20 Отладка молний (заряды вокруг мага), 36 Ледяное сердце, 37 Эффект Мейснера, 57 Разрушитель.
 */
class Ezone extends DataSpell {
  private fx = new SkyFx();
  private ring: Phaser.GameObjects.Image | null = null;
  /** пара коротких штрихов-разрядов поверх кольца */
  private arc: Phaser.GameObjects.Image | null = null;
  private arcT = 0;
  private arcRot = 0;
  /** кадр разряда (3 разных рисунка молний) */
  private arcFr = 0;
  private wave: Phaser.GameObjects.Image | null = null;
  private charges: Phaser.GameObjects.Image[] = [];
  private t = 0;
  private tickT = 0;
  private spin = 0;
  /** ЭМИ: сколько раз враг получил урон (id → счётчик); заряды: id → время последнего удара */
  private hits = new Map<number, number>();
  /** огненная аура: кого уже ударил текущий цикл */
  private hitSet = new Set<number>();
  private cycleT = 0;
  private stack = 1;
  /** 57 Разрушитель: активна / перезарядка */
  private on = true;
  private phaseT = 3;
  // параметры текущего тика для колбэков (без замыканий в горячем цикле)
  private curDmg = 0;
  private curR = 0;
  private sparksLeft = 0;

  destroy() {
    this.fx.destroy();
    this.ring?.destroy(); this.arc?.destroy(); this.wave?.destroy();
    this.charges.forEach((c) => c.destroy());
    this.ring = this.arc = this.wave = null; this.charges = [];
  }

  /** светлые холодные цвета (светящаяся магия на тёмной карте); текстуры уже бледно-фиолетовые */
  private get color() { return this.hasProp(426) ? 0xc0fff0 : this.hasProp(425) ? 0xfff0ff : 0xffffff; }

  private ensure() {
    ensureInkEzone();
    // поле: кольцо из многих тонких линий + пара бегущих молний поверх
    if (!this.ring) this.ring = W.scene.add.image(0, 0, 'ink_ering').setDepth(DEPTH.zone + 0.2).setBlendMode(Phaser.BlendModes.ADD);
    if (!this.arc) this.arc = W.scene.add.image(0, 0, EARC_TEX[0]).setDepth(DEPTH.zone + 0.21).setBlendMode(Phaser.BlendModes.ADD);
    if (!this.wave) this.wave = W.scene.add.image(0, 0, 'fx_ezone_firewave').setDepth(DEPTH.zone + 0.2).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  }

  private hideAll() {
    this.ring?.setVisible(false); this.arc?.setVisible(false); this.wave?.setVisible(false);
    for (const c of this.charges) c.setVisible(false);
  }

  update(dt: number) {
    this.fx.update(dt);
    this.ensure();
    this.t += dt;
    if (this.hits.size > 600) this.hits.clear();

    if (this.hasCombo(57)) {
      // 57 Разрушитель: поле действует 3 с, затем перезарядка 5 с
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        this.on = !this.on;
        this.phaseT = this.on ? 3 * W.stats.durMul : 5 * W.stats.cdMul;
        if (this.on) W.fx.burst(W.player.x, W.player.y, R0 * this.sizeMul, this.color, 0.4, 'ring');
      }
      if (!this.on) { this.hideAll(); return; }
    } else this.on = true;

    if (this.hasCombo(20)) { this.ring!.setVisible(false); this.arc!.setVisible(false); this.wave!.setVisible(false); this.updateCharges(dt); return; }
    for (const c of this.charges) c.setVisible(false);
    if (this.hasProp(427)) { this.ring!.setVisible(false); this.arc!.setVisible(false); this.updateFire(dt); return; }
    this.wave!.setVisible(false);
    this.updateField(dt);
  }

  /** Обычное поле: тик урона по всем внутри */
  private updateField(dt: number) {
    const P = W.player, R = R0 * this.sizeMul;
    const col = this.color, D = R * ERING_K;
    // кольцо стоит на месте (тусклое); штрихи прыгают по кругу рывками — кажется, что ток бежит
    this.arcT -= dt;
    if (this.arcT <= 0) {
      this.arcT += ARC_STEP;
      if (this.arcT < 0) this.arcT = ARC_STEP;
      this.arcRot += ARC_ANG + Math.random() * 0.5;
      this.arcFr = (this.arcFr + 1) % EARC_TEX.length;
      this.arc!.setTexture(EARC_TEX[this.arcFr]).setAlpha(Math.random() < 0.2 ? 0.55 : 1);
      this.ring!.setAlpha(Math.random() < 0.15 ? 0.45 : 0.7);
    }
    this.ring!.setVisible(true).setPosition(P.x, P.y).setDisplaySize(D, D).setTint(col);
    this.arc!.setVisible(true).setPosition(P.x, P.y).setDisplaySize(D, D).setRotation(this.arcRot).setTint(col);

    this.tickT -= dt;
    if (this.tickT > 0) return;
    this.tickT += Math.max(0.05, this.tickSec);
    if (this.tickT < 0) this.tickT = 0;
    this.curDmg = this.dmg; this.curR = R; this.sparksLeft = 3;
    W.enemies.grid.query(P.x, P.y, R, this.onTick);
  }

  private onTick = (e: Enemy) => {
    W.enemies.damage(e, this.curDmg, 0, 0, this.def.id);
    if (this.sparksLeft > 0 && Math.random() < 0.3) { this.sparksLeft--; W.fx.sparks(e.x, e.y, 2, this.color, 60); }
    if (!this.hasProp(426)) return;
    // ЭМИ: каждый 4-й удар оглушает
    const n = (this.hits.get(e.id) ?? 0) + 1;
    if (n < 4) { this.hits.set(e.id, n); return; }
    this.hits.set(e.id, 0);
    W.enemies.stun(e, 1);
    W.fx.burst(e.x, e.y, e.r * 2, 0x7ad6c8, 0.3, 'ring');
    if (this.hasCombo(37)) {
      // 37 Эффект Мейснера: оглушённого отбрасывает и бьёт 10-кратным уроном
      const P = W.player, dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1;
      W.enemies.damage(e, this.curDmg * 10, (dx / d) * 260, (dy / d) * 260, this.def.id);
    }
  };

  /** 427 Огненная аура: кольцо огня расширяется от мага и гаснет; каждого бьёт раз за цикл */
  private updateFire(dt: number) {
    const P = W.player;
    const period = Math.max(0.3, this.tickSec * 4);
    const heart = this.hasCombo(36);
    this.cycleT += dt;
    if (this.cycleT >= period) {
      this.cycleT -= period;
      this.hitSet.clear();
      // 36 Ледяное сердце: урон и размер растут с каждым срабатыванием, сброс после 4-го
      this.stack = heart ? (this.stack % 4) + 1 : 1;
    }
    const k = this.cycleT / period;
    const sz = heart ? 0.7 + 0.3 * this.stack : 1;
    const R = R0 * this.sizeMul * sz * k;
    const a = k < 0.75 ? 0.95 : (1 - k) / 0.25;
    this.wave!.setVisible(true).setPosition(P.x, P.y).setDisplaySize(Math.max(4, R * RING_K), Math.max(4, R * RING_K))
      .setAlpha(a).setTint(heart ? 0x9fd8ff : 0xffffff).setRotation(this.t * 0.6);
    if (R < 2) return;
    this.curDmg = this.dmg * (heart ? this.stack : 1);
    this.curR = R;
    W.enemies.grid.query(P.x, P.y, R, this.onFire);
  }

  private onFire = (e: Enemy) => {
    if (this.hitSet.has(e.id)) return;
    this.hitSet.add(e.id);
    const P = W.player, dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1;
    W.enemies.damage(e, this.curDmg, (dx / d) * 50, (dy / d) * 50, this.def.id);
    if (this.hasCombo(36)) freezeOnly(e, 0.5);
  };

  /** 20 Отладка молний: поле в виде зарядов, кружащих вокруг мага; бьют касанием без интервала тика */
  private updateCharges(dt: number) {
    const P = W.player, R = R0 * this.sizeMul;
    while (this.charges.length < CHARGES) {
      this.charges.push(W.scene.add.image(0, 0, 'ink_eball').setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD));
    }
    this.spin += dt * 5 * this.speedMul;
    const cr = R * 0.3, orbit = R * 0.8;
    this.curDmg = this.dmg;
    for (let i = 0; i < this.charges.length; i++) {
      const a = this.spin + (i * Math.PI * 2) / this.charges.length;
      const x = P.x + Math.cos(a) * orbit, y = P.y + Math.sin(a) * orbit;
      // заряд — штриховой шар с искрами; поворот рывками — искры «перескакивают»
      this.charges[i].setVisible(true).setPosition(x, y).setDisplaySize(cr * EBALL_K, cr * EBALL_K)
        .setRotation((((this.t * 14) | 0) + i) * 1.9).setAlpha(0.95).setTint(this.color);
      W.enemies.grid.query(x, y, cr, this.onCharge);
    }
  }

  private onCharge = (e: Enemy) => {
    const last = this.hits.get(e.id);
    if (last !== undefined && this.t - last < 0.12) return;
    this.hits.set(e.id, this.t);
    W.enemies.damage(e, this.curDmg, 0, 0, this.def.id);
  };
}

export const EZONE = defFromData(SPELL_BY_ID[8], (def) => new Ezone(def, SPELL_BY_ID[8]));
