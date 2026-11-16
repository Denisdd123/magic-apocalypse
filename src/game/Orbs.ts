import Phaser from 'phaser';
import { DEPTH, MAX_ORBS } from '../config';

/** Опыт со сферы, как в оригинале: от «стоимости» текущего уровня, с уровнем чуть падает */
export function orbXp(kind: OrbKind): number {
  const P = W.player, mc = P.xpNeed;
  const mul = Math.min(1, Math.max(0.01, (100 - 0.75 * P.level) / 100));
  const base = kind === 's' ? 0.008 * mc + 8 : kind === 'm' ? 0.01 * mc + 10 : 0.03 * mc + 50;
  return base * mul;
}
import { W } from './World';

export type OrbKind = 's' | 'm' | 'l' | 'life';

interface Orb {
  /** value — сколько сфер слилось в одну (при переполнении) */
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

  drop(x: number, y: number, kind: OrbKind, value = 1) {
    // слишком много сфер — добавляем ценность к случайной существующей (без потерь опыта)
    if (this.count >= MAX_ORBS && kind !== 'life') {
      const o = this.list[(Math.random() * this.list.length) | 0];
      if (o && o.alive && o.kind === kind) { o.value += value; return; }
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
    const A = W.artifacts, s = W.stats;
    if (o.kind === 'life') {
      const v = s.maxHp * 0.2 * (1 + s.lifeOrbHeal);
      if (A.orbFx) A.onLifeOrb(v); // Жизненный щит, Глаз смотрящего
      W.player.heal(v);
    } else {
      // Специфика (artFx[63]): малые сферы считаются средними; Фонарь/Ртуть (artFx[45]): опыт от сфер +N%
      const kind = o.kind === 's' && s.artFx[63] ? 'm' : o.kind;
      // мана-валюта (торговец): малая/средняя +1, большая +5; опыт — по формуле оригинала
      W.mana += (kind === 'l' ? 5 : 1) * o.value;
      W.player.gainXp(orbXp(kind) * o.value * (1 + (s.artFx[45] ?? 0) / 100));
      if (A.orbFx) A.onManaOrb(o.value); // Схема маны, Колокол смерти
    }
  }
}
