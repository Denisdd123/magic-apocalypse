import Phaser from 'phaser';
import { DEPTH } from '../config';
import type { Enemy } from './Enemies';
import { W } from './World';

export interface ProjOpts {
  x: number; y: number; vx: number; vy: number;
  dmg: number; r: number; life: number;
  tex: string; size: number;       // размер картинки в игровых единицах (по длине)
  tint?: number;
  pierce?: number;                 // сколько врагов можно пробить (Infinity — всех)
  knock?: number;
  spin?: number;                   // вращение картинки
  rotateToVel?: boolean;
  onHit?: (p: Projectile, e: Enemy) => void;
  onEnd?: (p: Projectile) => void; // по окончании жизни/пробивания
  update?: (p: Projectile, dt: number) => void;
  hitInterval?: number;
  src?: string;                    // id заклинания (для истории боя)
  data?: any;
}

export class Projectile {
  x = 0; y = 0; vx = 0; vy = 0; dmg = 0; r = 4; life = 1; t = 0;
  pierce = 0; knock = 0; alive = false;
  hit = new Map<number, number>(); // id врага -> время последнего удара
  o!: ProjOpts;
  img!: Phaser.GameObjects.Image;
  data: any;
}

/** Все снаряды заклинаний: движение, попадания, пробивание */
export class Projectiles {
  private list: Projectile[] = [];
  private free: Projectile[] = [];
  constructor(private scene: Phaser.Scene) {}

  fire(o: ProjOpts): Projectile {
    let p = this.free.pop();
    if (!p) {
      p = new Projectile();
      p.img = this.scene.add.image(0, 0, o.tex).setDepth(DEPTH.projectile);
      this.list.push(p);
    }
    p.o = o; p.x = o.x; p.y = o.y; p.vx = o.vx; p.vy = o.vy; p.dmg = o.dmg; p.r = o.r;
    p.life = o.life; p.t = 0; p.pierce = o.pierce ?? 0; p.knock = o.knock ?? 0; p.alive = true;
    p.hit.clear(); p.data = o.data;
    const img = p.img.setTexture(o.tex).setVisible(true).setPosition(o.x, o.y).setRotation(0);
    const k = o.size / img.width;
    img.setScale(k);
    if (o.tint !== undefined) img.setTint(o.tint); else img.clearTint();
    img.setBlendMode(Phaser.BlendModes.ADD);
    if (o.rotateToVel !== false) img.setRotation(Math.atan2(o.vy, o.vx));
    return p;
  }

  end(p: Projectile) {
    if (!p.alive) return;
    p.alive = false;
    p.img.setVisible(false);
    this.free.push(p);
    p.o.onEnd?.(p);
  }

  update(dt: number) {
    const en = W.enemies;
    for (const p of this.list) {
      if (!p.alive) continue;
      p.t += dt;
      p.o.update?.(p, dt);
      if (!p.alive) continue;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.img.setPosition(p.x, p.y);
      if (p.o.spin) p.img.rotation += p.o.spin * dt;
      else if (p.o.rotateToVel !== false && (p.vx || p.vy)) p.img.setRotation(Math.atan2(p.vy, p.vx));

      en.grid.query(p.x, p.y, p.r, (e) => {
        const last = p.hit.get(e.id);
        if (last !== undefined && (!p.o.hitInterval || p.t - last < p.o.hitInterval)) return;
        p.hit.set(e.id, p.t);
        let kx = 0, ky = 0;
        if (p.knock) { const sp = Math.hypot(p.vx, p.vy) || 1; kx = (p.vx / sp) * p.knock; ky = (p.vy / sp) * p.knock; }
        en.damage(e, p.dmg, kx, ky, p.o.src);
        p.o.onHit?.(p, e);
        if (!p.o.hitInterval) {
          if (p.pierce <= 0) { this.end(p); return true; }
          p.pierce--;
        }
      });
      if (p.alive && p.t >= p.life) this.end(p);
    }
  }
}

/** Урон по площади (взрывы). Возвращает число задетых врагов. */
export function areaDamage(x: number, y: number, r: number, dmg: number, knock = 0, src = ''): number {
  let n = 0;
  W.enemies.grid.query(x, y, r, (e) => {
    let kx = 0, ky = 0;
    if (knock) { const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1; kx = (dx / d) * knock; ky = (dy / d) * knock; }
    W.enemies.damage(e, dmg, kx, ky, src);
    n++;
  });
  return n;
}
