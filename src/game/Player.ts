import Phaser from 'phaser';
import { DEPTH, LEVEL_MAX, ORIG_U, PLAYER } from '../config';
import { MANA_COST } from '../data/orig';
import { W } from './World';

/** 1 px спрайта (PPU 100) в наших px: 1 ед. оригинала = ORIG_U */
const PX = ORIG_U / 100;
/** Класс мага (Z.0x930): выбора класса в игре пока нет — AUnit1 */
const MAGE_CLASS = 1;
const MAGE_DIR = 'art/mage/';
/** AUnit<класс>Motion1..21 (sprite_unit, холст 128 px) + тень UnitAllyShadow01 */
export const MAGE_LOAD: [string, string][] = [
  ...Array.from({ length: 21 }, (_, i): [string, string] => [`mage_u${MAGE_CLASS}_${i + 1}`, `${MAGE_DIR}AUnit${MAGE_CLASS}Motion${i + 1}.png`]),
  ['mage_shadow', `${MAGE_DIR}UnitAllyShadow01.png`],
];
/** Sprite_UnitAlly: локальный y +0.1 ед. (сцена C_BattleField); тень: y −0.27, масштаб 0.65, цвет (0,0,0,0.196) */
const SPRITE_DY = 0.1 * ORIG_U;
const SHADOW_DY = 0.27 * ORIG_U;
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
  /** V_JoyStickController: MotionDelayNum, UnitMotionNumA (prev = поле 0x64), UnitMotionUpDown, UnitMotionProgress */
  private motDelay = 0; private motPrev = 0; private motUpDown = 1; private motProgress = 0;
  moving = false;
  dead = false;
  /** Фаза может перехватить удар: вернуть true, если урон отменён */
  onBeforeHurt: (() => boolean) | null = null;
  /** враг, чьё касание сейчас обрабатывает hurt() (null — урон не от касания) */
  hitBy: import('./Enemies').Enemy | null = null;

  img: Phaser.GameObjects.Image;
  private hpBg: Phaser.GameObjects.Rectangle;
  private shadow: Phaser.GameObjects.Image;
  private animT = 0;
  private hpBar: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    this.shadow = scene.add.image(0, 0, 'mage_shadow').setDepth(DEPTH.orb).setScale(0.65 * PX).setTint(0x000000).setAlpha(0.196);
    this.img = scene.add.image(0, 0, `mage_u${MAGE_CLASS}_1`).setDepth(DEPTH.player).setScale(PX);
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
    // V_JoyStickController.FixedUpdate: направление по MoveVector (y вверх, наш y вниз) -> UnitMotionNumA
    const mx = this.moving ? this.faceX : 0, my = this.moving ? -this.faceY : 0;
    let numA: number, flip = false;
    if (my > 0.95) { numA = 10; this.motUpDown = 4; }
    else if (my > 0.25) { numA = 13; this.motUpDown = 4; flip = mx <= 0; }
    else if (my < -0.95) { numA = 7; this.motUpDown = 1; }
    else if (my < -0.25) { numA = 16; this.motUpDown = 1; flip = mx <= 0; }
    else if (mx > 0) { numA = 19; this.motUpDown = 1; }
    else if (mx < 0) { numA = 19; this.motUpDown = 1; flip = true; }
    else numA = this.motUpDown; // стоит: 1 (лицом вниз) или 4 (вверх)
    this.motDelay += dt;
    if (this.motDelay >= 0.1 || this.motPrev !== numA) {
      this.motDelay = 0;
      if (this.motPrev === numA && this.motProgress < 2) this.motProgress++;
      else { this.motPrev = numA; this.motProgress = 0; }
      this.img.setTexture(`mage_u${MAGE_CLASS}_${numA + this.motProgress}`);
    }
    this.img.setFlipX(flip);
    this.animT += dt * 10;
    this.img.setPosition(this.x, this.y - SPRITE_DY);
    this.shadow.setPosition(this.x, this.y + SHADOW_DY);
    this.follow.x = this.x; this.follow.y = this.y;
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
