import Phaser from 'phaser';
import { DEPTH, PLAYER, xpForLevel } from '../config';
import { W } from './World';

export class Player {
  x = 0; y = 0; r = PLAYER.radius;
  hp = PLAYER.hp;
  level = 1; xp = 0;
  pendingLevels = 0;
  hurtT = 0;
  invulnT = 0;            // неуязвимость (Фаза, руны)
  speedBuff = 0;
  faceX = 0; faceY = -1;  // направление последнего движения
  moving = false;
  dead = false;
  /** Фаза может перехватить удар: вернуть true, если урон отменён */
  onBeforeHurt: (() => boolean) | null = null;

  img: Phaser.GameObjects.Image;
  private hpBg: Phaser.GameObjects.Rectangle;
  private hpBar: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    this.img = scene.add.image(0, 0, 'player').setDepth(DEPTH.player).setDisplaySize(18, 24);
    this.hpBg = scene.add.rectangle(0, 0, 18, 2.6, 0x1a1a1a).setDepth(DEPTH.player);
    this.hpBar = scene.add.rectangle(0, 0, 18, 2.6, 0x46e05a).setDepth(DEPTH.player).setOrigin(0, 0.5);
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
      this.img.setFlipX(dx < -0.05 ? true : dx > 0.05 ? false : this.img.flipX);
    }
  }

  update(dt: number) {
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.invulnT > 0) this.invulnT -= dt;
    const s = W.stats;
    if (s.regen > 0) this.heal(s.maxHp * s.regen * dt);
    this.img.setPosition(this.x, this.y - 4);
    this.img.setAlpha(this.invulnT > 0 ? 0.45 + 0.25 * Math.sin(W.time * 30) : 1);
    if (this.hurtT > PLAYER.hurtCooldown - 0.12) this.img.setTint(0xff5050); else this.img.clearTint();
    this.hpBg.setPosition(this.x, this.y + 11);
    this.hpBar.setPosition(this.x - 9, this.y + 11).setSize(18 * Math.max(0, this.hp / s.maxHp), 2.6);
  }

  hurt(amount: number) {
    if (this.dead || this.hurtT > 0 || this.invulnT > 0) return;
    if (this.onBeforeHurt && this.onBeforeHurt()) return;
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
