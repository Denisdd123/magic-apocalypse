import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { areaDamage } from '../../Projectiles';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { Later, SkyFx, randomInView } from './_skyfx';

/** базовый радиус взрыва метеорита */
const R0 = 42;
/** время падения (тень на земле растёт — телеграф) */
const FALL = 0.7;
/** базовый интервал между метеоритами одного залпа, с (стат interval) */
const GAP = 0.3;

interface Crater { x: number; y: number; r: number; dmg: number; t: number; next: number }

/**
 * #10 Метеорит → «Падение звезды». Раз в КД count метеоритов падают в случайные точки экрана
 * (тень на земле — телеграф), взрыв, кратер.
 * Свойства: 443 Извержение вулкана (взрыв сразу из-под земли + кратер 25% каждые 0.5 с, 3 с),
 * 444 Метеоритный дождь (чистые моды: ×3 штук, интервал −30%), 445 Астероид (один, +50% размера за каждый).
 * Слияния (основа): 5 Военный климат, 35 Великое столкновение, 41 Пламенный шторм.
 */
class Meteor extends DataSpell {
  private fx = new SkyFx();
  private later = new Later();
  private craters: Crater[] = [];
  private freeCr: Crater[] = [];

  destroy() { this.fx.destroy(); this.later.clear(); this.craters = []; }

  update(dt: number) {
    this.fx.update(dt);
    this.later.update(dt);
    this.updateCraters(dt);

    if (this.hasCombo(5)) {
      // 5 Военный климат: КД делится на число метеоритов, по одному за КД; каждый сокращает следующий КД на 0–80%
      if (this.ready(dt, this.cdSec / this.count)) {
        const p = randomInView(30);
        this.drop(p.x, p.y, R0 * this.sizeMul, this.dmg, 0, false);
        this.cd *= 1 - Math.random() * 0.8;
      }
      return;
    }
    if (this.readyData(dt)) this.cast();
  }

  private cast() {
    const P = W.player;
    const n = this.count, dmg = this.dmg, size = this.sizeMul;
    const instant = this.hasProp(443);

    // 41 Пламенный шторм: извержения линиями по 5+ направлениям от мага, кратеры не бьют
    if (this.hasCombo(41)) {
      const extra = (size >= 1.33 ? 1 : 0) + (size >= 1.66 ? 1 : 0) + (size >= 1.99 ? 1 : 0);
      const dirs = 5 + extra, d = dmg * (10 + 5 * extra) / 10, R = R0 * 0.8 * size;
      const a0 = Math.random() * Math.PI * 2;
      for (let i = 0; i < dirs; i++) {
        const a = a0 + (i * Math.PI * 2) / dirs, c = Math.cos(a), s = Math.sin(a);
        for (let k = 0; k < 4; k++) {
          const dist = 45 + k * R * 1.5;
          this.drop(P.x + c * dist, P.y + s * dist, R, d, k * 0.09, true, false);
        }
      }
      return;
    }

    // 445 Астероид: один огромный, +50% размера за каждый метеорит
    if (this.hasProp(445)) {
      const R = R0 * size * (1 + 0.5 * (n - 1));
      if (this.hasCombo(35)) {
        // 35 Великое столкновение: 3 падения подряд, первое на 50% мощнее
        for (let k = 0; k < 3; k++) { const p = randomInView(40); this.drop(p.x, p.y, R, k === 0 ? dmg * 1.5 : dmg, k * 0.45, false); }
        return;
      }
      const p = randomInView(40);
      this.drop(p.x, p.y, R, dmg, 0, false);
      return;
    }

    const gap = this.stat('interval', GAP);
    for (let j = 0; j < n; j++) {
      const p = randomInView(30);
      this.drop(p.x, p.y, R0 * size, dmg, j * gap, instant);
    }
  }

  /** Падение: телеграф (растущая тень и тусклый круг) → камень сверху → взрыв. instant — извержение без падения. */
  private drop(x: number, y: number, R: number, dmg: number, delay: number, instant: boolean, crater = instant) {
    if (instant) {
      const tele = 0.25;
      this.fx.spawn('ring', { x, y, w: R * 1.2, w1: R * 2.2, a0: 0.2, a1: 0.7, life: tele, delay, tint: 0xff5a2a });
      this.later.add(delay + tele, () => this.land(x, y, R, dmg, crater));
      return;
    }
    const fall = R > R0 * 2 ? FALL * 1.4 : FALL;
    const H = 240, dx = H * 0.35;
    this.fx.spawn('shadow', { x, y, w: R * 0.5, w1: R * 2, h: R * 0.25, h1: R * 0.8, a0: 0.25, a1: 0.85, life: fall, delay, add: false, depth: DEPTH.zone });
    this.fx.spawn('ring', { x, y, w: R * 2.2, a0: 0.15, a1: 0.45, life: fall, delay, tint: 0xb83a20 });
    const vx = dx / fall, vy = H / fall, rot = Math.atan2(vy, vx);
    this.fx.spawn('blast', { x: x - dx, y: y - H, vx, vy, w: R * 1.5, life: fall, delay, a0: 0.7, a1: 0.9, tint: 0xff4a18 });
    this.fx.spawn('fx_meteor_rock', { x: x - dx, y: y - H, vx, vy, w: R * 1.2, life: fall, delay, a0: 1, a1: 1, add: false, rot, spin: 2.5, depth: DEPTH.top });
    this.later.add(delay + fall, () => this.land(x, y, R, dmg, crater));
  }

  private land(x: number, y: number, R: number, dmg: number, crater: boolean) {
    areaDamage(x, y, R, dmg, 80, this.def.id);
    this.fx.spawn('fx_meteor_impact', { x, y, w: R * 1.2, w1: R * 2.6, life: 0.45, a0: 1, a1: 0, rot: Math.random() * 6.28 });
    this.fx.spawn('fx_thunder_scorch', { x, y, w: R * 2.2, life: crater ? 3 : 1.6, a0: 0.9, a1: 0, hold: true, add: false, depth: DEPTH.zone, tint: 0x3a2018, rot: Math.random() * 6.28 });
    W.fx.sparks(x, y, R > 60 ? 12 : 6, 0xff7a3a, 130);
    if (R > 70) W.scene.cameras.main.shake(140, 0.005);
    if (crater) {
      // кратер: 25% урона каждые 0.5 с в течение 3 с
      const c = this.freeCr.pop() ?? ({} as Crater);
      c.x = x; c.y = y; c.r = R; c.dmg = dmg * 0.25; c.t = 3; c.next = 0.5;
      this.craters.push(c);
      this.fx.spawn('fx_meteor_impact', { x, y, w: R * 2, life: 3, a0: 0.55, a1: 0, hold: true, add: true, depth: DEPTH.zone + 0.1, tint: 0x9a3010, spin: 0.3 });
    }
  }

  private updateCraters(dt: number) {
    for (let i = this.craters.length - 1; i >= 0; i--) {
      const c = this.craters[i];
      c.t -= dt; c.next -= dt;
      if (c.next <= 0) { c.next += 0.5; areaDamage(c.x, c.y, c.r, c.dmg, 0, this.def.id); }
      if (c.t <= 0) { this.craters[i] = this.craters[this.craters.length - 1]; this.craters.pop(); this.freeCr.push(c); }
    }
  }
}

export const METEOR = defFromData(SPELL_BY_ID[10], (def) => new Meteor(def, SPELL_BY_ID[10]));
