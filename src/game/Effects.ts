import Phaser from 'phaser';
import { DEPTH } from '../config';

interface Fx {
  img: Phaser.GameObjects.Image;
  t: number; life: number;
  s0: number; s1: number; a0: number; a1: number;
  vx: number; vy: number; spin: number;
  follow?: { x: number; y: number };
  ox: number; oy: number;
}

/** Лёгкие визуальные эффекты (кольца взрывов, искры) с собственным пулом — без tween-ов. */
export class Effects {
  private list: Fx[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  constructor(private scene: Phaser.Scene) {}

  private get(tex: string) {
    let img = this.pool.pop();
    if (!img) img = this.scene.add.image(0, 0, tex).setDepth(DEPTH.fx);
    img.setTexture(tex).setVisible(true).setAlpha(1).setRotation(0).clearTint().setBlendMode(Phaser.BlendModes.ADD);
    return img;
  }

  /** Расширяющееся кольцо/вспышка радиусом r (в игровых единицах) */
  burst(x: number, y: number, r: number, tint = 0xffffff, life = 0.35, tex = 'blast', follow?: { x: number; y: number }) {
    const img = this.get(tex).setPosition(x, y).setTint(tint);
    const base = img.width / 2;
    this.list.push({ img, t: 0, life, s0: (r * 0.35) / base, s1: r / base, a0: 0.9, a1: 0, vx: 0, vy: 0, spin: 0, follow, ox: follow ? x - follow.x : 0, oy: follow ? y - follow.y : 0 });
  }

  sparks(x: number, y: number, n: number, tint = 0xffffff, speed = 90) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random());
      const img = this.get('spark').setPosition(x, y).setTint(tint);
      this.list.push({ img, t: 0, life: 0.25 + Math.random() * 0.2, s0: 0.35, s1: 0.05, a0: 1, a1: 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, spin: 6, ox: 0, oy: 0 });
    }
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.life);
      const e = 1 - (1 - k) * (1 - k);
      if (f.follow) f.img.setPosition(f.follow.x + f.ox, f.follow.y + f.oy);
      else if (f.vx || f.vy) f.img.setPosition(f.img.x + f.vx * dt, f.img.y + f.vy * dt);
      f.img.setScale(f.s0 + (f.s1 - f.s0) * e).setAlpha(f.a0 + (f.a1 - f.a0) * k);
      if (f.spin) f.img.rotation += f.spin * dt;
      if (k >= 1) {
        f.img.setVisible(false);
        this.pool.push(f.img);
        this.list[i] = this.list[this.list.length - 1];
        this.list.pop();
      }
    }
  }
}
