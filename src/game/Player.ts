import Phaser from 'phaser';
import { DEPTH, LEVEL_MAX, ORIG_U, PLAYER } from '../config';
import { MANA_COST } from '../data/orig';
import { W } from './World';
import type { Pose } from '../textures';

/**
 * Высота фигуры мага — как в оригинале: спрайт AUnit1Motion (100 px/ед., объект мага масштаб 1)
 * видимая фигура 23×59 px → 0.59 ед. → ≈33.5 наших.
 */
const MAGE_H = 0.59 * ORIG_U;
const MAGE_K = MAGE_H / 88; // холст позы 96px, фигура 88px
/** смещения тени/полоски здоровья были подобраны под фигуру 31 ед. — масштабируем вместе с ней */
const OFF = MAGE_H / 31;
/** 1 px опорного Canvas 720×1280 в наших px (камера 14.5 ед. по высоте) */
const UIPX = (14.5 * ORIG_U) / 1280;
/** Obj_HpBar: pos (0, −38.2), 30×5 (ui.md §1); Back (.078,.078,.157); Front = (1 − f, f, 0) */
const HPBAR = { y: 38.2 * UIPX, w: 30 * UIPX, h: 5 * UIPX, back: 0x141428 };

export class Player {
  x = 0; y = 0; r = PLAYER.radius;
  /** Твёрдое тело мага для толкания с мобами (оригинал: BoxCollider 0.21×0.5 ед. → средняя полуширина ≈0.18 ед.) */
  bodyR = 0.18 * ORIG_U;
  /** Толчок от мобов, накопленный за кадр (Enemies.update); применяется в move() с ограничением */
  pushX = 0; pushY = 0;
  hp = PLAYER.hp;
  /** AllyUnitGlobal_Level; xp = ManaStock (мана копится, остаток переносится) */
  level = 1; xp = 0;
  /** экраны левел-апа в очереди (порог маны + ApplyLevelUpNum) */
  pendingLevels = 0;
  hurtT = 0;
  invulnT = 0;            // неуязвимость (Фаза, руны)
  speedBuff = 0;
  /** Маскировка (IsGhostProgress): коллайдер тела в z 8 — мобы и снаряды проходят сквозь, маг α 0.3 */
  ghost = false;
  faceX = 0; faceY = -1;  // направление последнего движения
  /** Точка, за которой следит камера (без покачивания — иначе мир «дёргается») */
  follow = { x: 0, y: 0 };
  private pose: Pose = 'idle';
  moving = false;
  dead = false;
  /** Фаза может перехватить удар: вернуть true, если урон отменён */
  onBeforeHurt: (() => boolean) | null = null;
  /** враг, чьё касание сейчас обрабатывает hurt() (null — урон не от касания) */
  hitBy: import('./Enemies').Enemy | null = null;

  img: Phaser.GameObjects.Image;
  private hpBg: Phaser.GameObjects.Rectangle;
  private shadow: Phaser.GameObjects.Image;
  private aura: Phaser.GameObjects.Image;
  private animT = 0;
  private frame = 0;
  private hpBar: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    this.aura = scene.add.image(0, 0, 'aura').setDepth(DEPTH.orb).setDisplaySize(34, 34).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    this.shadow = scene.add.image(0, 0, 'shadow').setDepth(DEPTH.orb).setDisplaySize(20, 6.5);
    this.img = scene.add.image(0, 0, 'mage_idle_0').setDepth(DEPTH.player).setScale(MAGE_K);
    this.hpBg = scene.add.rectangle(0, 0, HPBAR.w, HPBAR.h, HPBAR.back).setDepth(DEPTH.player);
    this.hpBar = scene.add.rectangle(0, 0, HPBAR.w, HPBAR.h, 0x00ff00).setDepth(DEPTH.player).setOrigin(0, 0.5);
  }

  /** ManaCost = Dictionary_AllStat[clamp(Level, 1, 100)]["마나 요구량"] */
  get xpNeed() { return MANA_COST[Math.max(1, Math.min(LEVEL_MAX, this.level))]; }

  move(dx: number, dy: number, dt: number) {
    // толчки толпы: мобы и маг одной массы (оригинал: Rigidbody mass 1), поэтому маг, влезая в толпу,
    // упирается и замедляется. Толчок за кадр не больше скорости мага — толпа не «выстреливает» им.
    if (this.pushX || this.pushY) {
      const pl = Math.hypot(this.pushX, this.pushY), lim = W.stats.moveSpeed * 1.1 * dt;
      const k = pl > lim ? lim / pl : 1;
      this.x += this.pushX * k; this.y += this.pushY * k;
      this.pushX = this.pushY = 0;
    }
    const len = Math.hypot(dx, dy);
    this.moving = len > 0.05;
    if (this.moving) {
      const k = 1; // оригинал (V_JoyStickController): нормализованный вектор, градации силы стика нет
      const sp = W.stats.moveSpeed * (1 + this.speedBuff);
      this.x += (dx / len) * sp * k * dt;
      this.y += (dy / len) * sp * k * dt;
      this.faceX = dx / len; this.faceY = dy / len;
    }
    W.zone.arenaClamp(this, dt);
  }

  update(dt: number) {
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.invulnT > 0) this.invulnT -= dt;
    const s = W.stats;
    if (s.regen > 0) this.heal(s.maxHp * s.regen * dt);
    // 8 направлений: вверх/вниз — узкая поза, диагонали — наклон ~22°, вбок — ~39° (влево = зеркало вправо),
    // в каждой позе 3 кадра дрожания подола (textures.ts → witchPose: шляпа, мантия, посох)
    let pose: Pose = 'idle';
    if (this.moving) {
      const ax = Math.abs(this.faceX), ay = Math.abs(this.faceY);
      pose = ay > 0.92 ? 'vert' : ax > 0.92 ? 'side' : 'diag';
      if (ax > 0.38) this.img.setFlipX(this.faceX < 0);
    }
    // кадры мага — таймер 0.1 с (V_JoyStickController.FixedUpdate), цикл из 3 кадров и стоя, и на ходу
    this.animT += dt * 10;
    const fr = Math.floor(this.animT) % 3;
    if (fr !== this.frame || pose !== this.pose) { this.frame = fr; this.pose = pose; this.img.setTexture(`mage_${pose}_${fr}`); }
    this.img.setPosition(this.x, this.y - 5.4 * OFF);
    this.shadow.setPosition(this.x, this.y + 8.5 * OFF);
    this.follow.x = this.x; this.follow.y = this.y;
    this.aura.setPosition(this.x, this.y - 3).setAlpha(0.55 + 0.15 * Math.sin(this.animT * 0.6));
    // руна неуязвимости: маг становится белым (как в оригинале); иначе мигание при неуязвимости
    const white = W.pickups?.active.has('invuln');
    this.img.setAlpha(this.ghost ? 0.3 : this.invulnT > 0 && !white ? 0.45 + 0.25 * Math.sin(this.animT * 8) : 1);
    if (this.hurtT > 0) this.img.setTintFill(0xffffff); // удар — белая вспышка, как в оригинале
    else if (white) this.img.setTintFill(0xffffff);
    else this.img.clearTint();
    const f = Math.max(0, Math.min(1, this.hp / s.maxHp));
    this.hpBg.setPosition(this.x, this.y + HPBAR.y);
    this.hpBar.setPosition(this.x - HPBAR.w / 2, this.y + HPBAR.y).setSize(HPBAR.w * f, HPBAR.h)
      .setFillStyle((Math.round((1 - f) * 255) << 16) | (Math.round(f * 255) << 8));
  }

  hurt(amount: number) {
    // общей неуязвимости после удара в оригинале нет (C_Battle_AllyUnit.Unit_Damage): откат 0.15 с — у каждого моба свой
    if (this.dead || this.ghost || this.invulnT > 0) return;
    if (this.onBeforeHurt && this.onBeforeHurt()) return;
    if (Math.random() < W.stats.evasion) return;
    let d = amount * (1 - W.stats.dmgTaken);
    const A = W.artifacts;
    // артефакты: Силовое поле, Барьер, доп. здоровье Жизненного щита
    if (A.hurtFx) { d = A.onHurt(d); if (d <= 0) return; }
    this.hp -= d;
    this.hurtT = 0.08; // белая вспышка мага: C_Battle_AllyUnit.Unit_HitEffect — шейдер GUI/Text на 0.08 с
    if (this.hp <= 0) {
      this.hp = 0;
      if (!(A.hurtFx && A.saveFromDeath())) this.dead = true; // Гомункул
    }
  }

  heal(v: number) { this.hp = Math.min(W.stats.maxHp, this.hp + v); }

  /**
   * V_Ability_Manager.ManaGain: мана копится; при ManaStock ≥ ManaCost — минус стоимость (остаток переносится),
   * лечение LevelHpNum % (эффект 60), экран левел-апа. Один вызов — не больше одного экрана; уровень растёт при выборе карточки.
   */
  manaGain(v: number) {
    if (this.dead || this.level >= LEVEL_MAX) return;
    this.xp += v;
    if (this.xp >= this.xpNeed && this.pendingLevels === 0) {
      this.xp -= this.xpNeed;
      const lh = W.stats.artFx[60] ?? 0;
      if (lh) this.heal(Math.round(W.stats.maxHp * lh * 0.01));
      this.pendingLevels = 1;
    }
  }

  /** Мана со сфер и прочих источников: × (1 + получение маны), без потолка (C_Battle_Item.Obtain_Item) */
  gainXp(v: number) { this.manaGain(v * (1 + W.stats.xpGain)); }

  /** Мана за убийство (Play_Unit_Death): 마나량 моба × (1 + получение маны), потолок ManaObtainLimit = 0.0035 × ManaCost */
  killMana(m: number) { this.manaGain(Math.max(0, Math.min(m * (1 + W.stats.xpGain), 0.0035 * this.xpNeed))); }
}
