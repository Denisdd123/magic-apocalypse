import Phaser from 'phaser';
import { DEPTH, MAX_ORBS } from '../config';
import { W } from './World';

export type OrbKind = 's' | 'm' | 'l' | 'life';

interface Orb {
  x: number; y: number; kind: OrbKind; value: number;
  alive: boolean; magnet: boolean; v: number;
  img: Phaser.GameObjects.Image;
}

const TEX: Record<OrbKind, string> = { s: 'orb_s', m: 'orb_m', l: 'orb_l', life: 'orb_life' };
/** Кристаллы на поле: держим около keep штук в квадрате ±far вокруг мага, новый — раз в every сек */
const FIELD = { keep: 12, far: 420, min: 190, every: 1.6 };
const SIZE: Record<OrbKind, number> = { s: 8, m: 11, l: 14, life: 14 };

/** Сферы эссенции (опыт) и сферы жизни */
export class Orbs {
  private list: Orb[] = [];
  private free: Orb[] = [];
  private count = 0;
  private fieldT = 0;
  constructor(private scene: Phaser.Scene) {}

  drop(x: number, y: number, kind: OrbKind, value: number) {
    // слишком много сфер — добавляем ценность к случайной существующей (без потерь опыта)
    if (this.count >= MAX_ORBS && kind !== 'life') {
      const o = this.list[(Math.random() * this.list.length) | 0];
      if (o && o.alive && o.kind !== 'life') { o.value += value; return; }
    }
    let o = this.free.pop();
    if (!o) {
      o = { x, y, kind, value, alive: true, magnet: false, v: 0, img: this.scene.add.image(x, y, TEX[kind]).setDepth(DEPTH.orb) };
      this.list.push(o);
    }
    o.x = x; o.y = y; o.kind = kind; o.value = value; o.alive = true; o.magnet = false; o.v = 0;
    o.img.setTexture(TEX[kind]).setPosition(x, y).setVisible(true).setDisplaySize(SIZE[kind] * 2, SIZE[kind] * 2);
    this.count++;
  }

  /** Притянуть все сферы (руна Жадности и т.п.) */
  magnetAll() { for (const o of this.list) if (o.alive && o.kind !== 'life') o.magnet = true; }

  /** Как в оригинале: мелкие кристаллы сами появляются на поле вокруг мага */
  private spawnField(dt: number) {
    this.fieldT -= dt;
    if (this.fieldT > 0) return;
    this.fieldT = FIELD.every;
    const P = W.player;
    let near = 0;
    for (const o of this.list) if (o.alive && o.kind === 's' && Math.abs(o.x - P.x) < FIELD.far && Math.abs(o.y - P.y) < FIELD.far) near++;
    if (near >= FIELD.keep) return;
    const a = Math.random() * Math.PI * 2, d = FIELD.min + Math.random() * (FIELD.far - FIELD.min);
    this.drop(P.x + Math.cos(a) * d, P.y + Math.sin(a) * d, 's', 1);
  }

  update(dt: number) {
    this.spawnField(dt);
    const P = W.player;
    const pr = W.stats.pickupRadius;
    for (const o of this.list) {
      if (!o.alive) continue;
      const dx = P.x - o.x, dy = P.y - o.y;
      const d = Math.hypot(dx, dy);
      if (!o.magnet && d < pr) o.magnet = true;
      if (o.magnet) {
        o.v = Math.min(o.v + 900 * dt, 520);
        const step = Math.min(d, o.v * dt);
        o.x += (dx / (d || 1)) * step; o.y += (dy / (d || 1)) * step;
        o.img.setPosition(o.x, o.y);
        if (d < P.r + 4) this.collect(o);
      }
    }
  }

  private collect(o: Orb) {
    o.alive = false;
    o.img.setVisible(false);
    this.free.push(o);
    this.count--;
    if (o.kind === 'life') W.player.heal(W.stats.maxHp * 0.2 * (1 + W.stats.lifeOrbHeal));
    else { W.mana += o.value; W.player.gainXp(o.value); }
  }
}
