import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { areaDamage } from '../../Projectiles';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { HitGate, ImgPool, faceAngle } from './_zoneKit';

/** fx_incinerate_flame: язык головой вправо, ширина ≈167 px; fx_incinerate_blue: вертикальный, остриё вверх (+π/2) */
const RED = 'fx_incinerate_flame', RED_W = 167;
const BLUE = 'fx_incinerate_blue', BLUE_H = 200;

interface Tongue {
  x: number; y: number; vx: number; vy: number; t: number; life: number; delay: number;
  r: number; blue: boolean; img: Phaser.GameObjects.Image | null;
}
interface Spot { x: number; y: number; delay: number; left: number }

/**
 * #15 Испепеление → «Пламя пасти». Конус огня вперёд по движению мага: count языков вылетают потоком за ~0.45 с.
 * Урон одному врагу — не чаще 0.12 с (общие ворота на всё заклинание), так что в гуще конуса враг получает несколько ударов.
 * Свойства: 488 Пламенный удар (с каждым кастом мощнее, до урона ×4 и размера ×1.5; пламя краснеет → синеет),
 * 489 Пироман (+2 очага в конусе с тем же уроном), 490 Пламя Цербера (ещё два конуса по бокам).
 * Слияния (основа): C11 Огненное дыхание (5 сторон, быстрее/дальше), C19 Инферно (быстрее разгон, выше потолок),
 * C55 Адское пламя (языков ×2, очаги взрываются 2–3 раза).
 * ВНИМАНИЕ: в данных 488 «size ×4» и C19 «size ×30» — это потолки множителей, а не постоянные моды; здесь они компенсируются.
 */
class Incinerate extends DataSpell {
  private tongues: Tongue[] = [];
  private spare: Tongue[] = [];
  private spots: Spot[] = [];
  private pool = new ImgPool();
  private gate = new HitGate();
  private clock = 0;
  private casts = 0; // для Пламенного удара

  destroy() {
    for (const t of this.tongues) if (t.img) this.pool.put(t.img);
    this.tongues.length = 0;
    this.pool.destroy();
  }

  /** размер без ошибочных «потолков» из данных */
  private get size(): number {
    let s = this.sizeMul;
    if (this.hasProp(488)) s /= 4;
    if (this.hasCombo(19)) s /= 30;
    return s * this.rampSize;
  }

  /** 0..1 — разгон Пламенного удара */
  private get ramp(): number {
    if (!this.hasProp(488)) return 0;
    return Math.min(1, this.casts / (this.hasCombo(19) ? 4 : 8));
  }
  private get rampDmg(): number { return 1 + (this.hasCombo(19) ? 7 : 3) * this.ramp; }
  private get rampSize(): number { return 1 + 0.5 * this.ramp; }

  update(dt: number) {
    this.clock += dt;
    if (this.readyData(dt)) this.cast();

    const dmg = this.dmg * this.rampDmg;
    this.tDmg = dmg;
    for (let i = this.tongues.length - 1; i >= 0; i--) {
      const t = this.tongues[i];
      if (t.delay > 0) {
        t.delay -= dt;
        if (t.delay > 0) continue;
        t.img = this.pool.get(t.blue ? BLUE : RED, DEPTH.projectile).setAlpha(0);
        const P = W.player; t.x = P.x; t.y = P.y; // поток идёт от текущего положения мага
      }
      t.t += dt;
      if (t.t >= t.life) {
        if (t.img) this.pool.put(t.img);
        t.img = null;
        this.tongues[i] = this.tongues[this.tongues.length - 1]; this.tongues.pop();
        this.spare.push(t);
        continue;
      }
      t.x += t.vx * dt; t.y += t.vy * dt;
      const k = t.t / t.life;
      const r = t.r * (0.5 + 0.8 * k);
      const a = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.55) / 0.45);
      const ang = Math.atan2(t.vy, t.vx);
      const img = t.img!;
      if (t.blue) img.setRotation(ang + Math.PI / 2).setScale((r * 3) / BLUE_H);
      else img.setRotation(ang).setScale((r * 2.6) / RED_W);
      img.setPosition(t.x, t.y).setAlpha(a);
      this.cur = t;
      W.enemies.grid.query(t.x, t.y, r, this.onHit);
    }

    // Пироман: очаги
    for (let i = this.spots.length - 1; i >= 0; i--) {
      const s = this.spots[i];
      s.delay -= dt;
      if (s.delay > 0) continue;
      const r = 20 * this.size;
      areaDamage(s.x, s.y, r, dmg, 20, this.def.id);
      W.fx.burst(s.x, s.y, r, this.ramp > 0.5 ? 0x7ab8ff : 0xff6a2a, 0.3);
      if (--s.left > 0) { s.delay = 0.2; continue; }
      this.spots[i] = this.spots[this.spots.length - 1]; this.spots.pop();
    }
    if ((this.clock * 4 | 0) % 20 === 0) this.gate.prune(this.clock, 2);
  }

  private cur: Tongue | null = null;
  private tDmg = 0;
  private onHit = (e: Enemy) => {
    if (!this.gate.ok(e.id, this.clock, 0.12)) return;
    const t = this.cur!, sp = Math.hypot(t.vx, t.vy) || 1;
    W.enemies.damage(e, this.tDmg, (t.vx / sp) * 12, (t.vy / sp) * 12, this.def.id);
  };

  private cast() {
    this.casts++;
    const fa = faceAngle();
    let dirs: number[];
    if (this.hasCombo(11)) dirs = [0, 1, 2, 3, 4].map((i) => fa + (i * Math.PI * 2) / 5);
    else if (this.hasProp(490)) dirs = [fa, fa - Math.PI / 2, fa + Math.PI / 2];
    else dirs = [fa];
    let n = this.count;
    if (this.hasCombo(55)) n *= 2;
    const half = 0.42 * this.stat('width', 1);           // полуширина конуса, рад
    const speed = 240 * this.stat('range', 1) * (this.hasCombo(11) ? 1.4 : 1);
    const life = 0.42;
    const r = 9 * this.size;
    const blue = this.ramp > 0.5;
    const stream = 0.45;
    for (const d of dirs) {
      for (let i = 0; i < n; i++) {
        const a = d + (Math.random() * 2 - 1) * half;
        const s = speed * (0.75 + Math.random() * 0.4);
        const t = this.spare.pop() ?? ({} as Tongue);
        t.x = 0; t.y = 0; t.vx = Math.cos(a) * s; t.vy = Math.sin(a) * s;
        t.t = 0; t.life = life; t.delay = (i / n) * stream + 0.0001; t.r = r; t.blue = blue; t.img = null;
        this.tongues.push(t);
      }
    }
    if (this.hasProp(489)) {
      // Пироман: 2 очага внутри конуса (Адское пламя — взрываются 2–3 раза)
      const P = W.player, reach = speed * life;
      for (let j = 0; j < 2; j++) {
        const a = fa + (Math.random() * 2 - 1) * half, dist = reach * (0.4 + Math.random() * 0.5);
        this.spots.push({ x: P.x + Math.cos(a) * dist, y: P.y + Math.sin(a) * dist, delay: 0.25 + j * 0.1, left: this.hasCombo(55) ? 2 + ((Math.random() * 2) | 0) : 1 });
      }
    }
  }
}

export const INCINERATE = defFromData(SPELL_BY_ID[15], (def) => new Incinerate(def, SPELL_BY_ID[15]));
