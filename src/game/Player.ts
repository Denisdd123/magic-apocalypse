import Phaser from 'phaser';
import { DEPTH, PLAYER, xpForLevel } from '../config';
import { W } from './World';
import type { Pose } from '../textures';

/** Высота фигуры мага в игровых единицах (крупнее замера оригинала — на телефоне был слишком мелким) */
const MAGE_H = 31;
const MAGE_K = MAGE_H / 88; // холст позы 96px, фигура 88px

export class Player {
  x = 0; y = 0; r = PLAYER.radius;
  hp = PLAYER.hp;
  level = 1; xp = 0;
  pendingLevels = 0;
  hurtT = 0;
  invulnT = 0;            // неуязвимость (Фаза, руны)
  speedBuff = 0;
  faceX = 0; faceY = -1;  // направление последнего движения
  /** Точка, за которой следит камера (без покачивания — иначе мир «дёргается») */
  follow = { x: 0, y: 0 };
  private pose: Pose = 'idle';
  moving = false;
  dead = false;
  /** Фаза может перехватить удар: вернуть true, если урон отменён */
  onBeforeHurt: (() => boolean) | null = null;

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
    this.hpBg = scene.add.rectangle(0, 0, 20, 2.6, 0x1a1a1a).setDepth(DEPTH.player);
    this.hpBar = scene.add.rectangle(0, 0, 20, 2.6, 0x46e05a).setDepth(DEPTH.player).setOrigin(0, 0.5);
  }

  get xpNeed() { return xpForLevel(this.level); }

  move(dx: number, dy: number, dt: number) {
    const len = Math.hypot(dx, dy);
    this.moving = len > 0.05;
    if (this.moving) {
      const k = Math.min(1, len);
      const sp = W.stats.moveSpeed * (1 + this.speedBuff);
      this.x += (dx / len) * sp * k * dt;
      this.y += (dy / len) * sp * k * dt;
      this.faceX = dx / len; this.faceY = dy / len;
    }
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
    // дрожание подола: на бегу ~0.11 с на кадр (как в оригинале), стоя — медленнее
    this.animT += dt * (this.moving ? 9 : 4);
    const fr = Math.floor(this.animT) % 3;
    if (fr !== this.frame || pose !== this.pose) { this.frame = fr; this.pose = pose; this.img.setTexture(`mage_${pose}_${fr}`); }
    this.img.setPosition(this.x, this.y - 5.4);
    this.shadow.setPosition(this.x, this.y + 8.5);
    this.follow.x = this.x; this.follow.y = this.y;
    this.aura.setPosition(this.x, this.y - 3).setAlpha(0.55 + 0.15 * Math.sin(this.animT * 0.6));
    // руна неуязвимости: маг становится белым (как в оригинале); иначе мигание при неуязвимости
    const white = W.pickups?.active.has('invuln');
    this.img.setAlpha(this.invulnT > 0 && !white ? 0.45 + 0.25 * Math.sin(this.animT * 8) : 1);
    if (this.hurtT > PLAYER.hurtCooldown - 0.1) this.img.setTintFill(0xffffff); // удар — белая вспышка, как в оригинале
    else if (white) this.img.setTintFill(0xffffff);
    else this.img.clearTint();
    this.hpBg.setPosition(this.x, this.y + 12.5);
    this.hpBar.setPosition(this.x - 10, this.y + 12.5).setSize(20 * Math.max(0, this.hp / s.maxHp), 2.6);
  }

  hurt(amount: number) {
    if (this.dead || this.hurtT > 0 || this.invulnT > 0) return;
    if (this.onBeforeHurt && this.onBeforeHurt()) return;
    if (Math.random() < W.stats.evasion) { this.hurtT = PLAYER.hurtCooldown; return; }
    this.hp -= amount * (1 - W.stats.dmgTaken);
    this.hurtT = PLAYER.hurtCooldown;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  }

  heal(v: number) { this.hp = Math.min(W.stats.maxHp, this.hp + v); }

  gainXp(v: number) {
    this.xp += v * (1 + W.stats.xpGain);
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.pendingLevels++;
    }
  }
}
