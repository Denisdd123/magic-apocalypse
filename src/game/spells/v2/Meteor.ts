import type Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { areaDamage } from '../../Projectiles';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { Later, SkyFx, randomInView } from './_skyfx';
import { ensureDarkTex } from './_darkfx';
import { RING_K, ensureInkFrost } from './_inkfx';
import { SHARD_TEX, SPLASH_TEX, TRAIL_TEX, ensureGroupC } from './_groupC';
import { ImgPool } from './_zoneKit';

/** базовый радиус взрыва метеорита */
const R0 = 42;
/** время падения, с (тень на земле растёт — телеграф). В 2.0 было 0.7, в 2.1 — 0.36 (слишком быстро); теперь чуть быстрее 2.0 */
const FALL = 0.55;
/** приглушённый багрянец телеграфа (STYLE_GUIDE: не розовый) */
const CRIMSON = 0xb8343f;
/** высота старта над точкой удара и снос вбок (дуга: сначала полого, потом почти отвесно) */
const FALL_H = 300, FALL_DX = 0.75;

/** Летящая звезда: квадратичная кривая Безье S → C → E с ускорением к земле */
interface Fall {
  sx: number; sy: number; cx: number; cy: number; ex: number; ey: number;
  t: number; dur: number; delay: number; R: number; dmg: number; crater: boolean;
  head: Phaser.GameObjects.Image | null; tail: Phaser.GameObjects.Image | null; spin: number;
}
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
  private falls: Fall[] = [];
  private freeFall: Fall[] = [];
  private imgs = new ImgPool();

  destroy() { this.fx.destroy(); this.later.clear(); this.craters = []; this.falls = []; this.imgs.destroy(); }

  update(dt: number) {
    ensureDarkTex();
    ensureInkFrost();
    ensureGroupC();
    this.fx.update(dt);
    this.later.update(dt);
    this.updateFalls(dt);
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

  /**
   * Падение: телеграф (растущая тень и тонкое тусклое кольцо) → тёмная «звезда» с узким следом
   * сверху → разлёт обломков и выжженный кратер. Не огненный шар: тёмный камень, багровая кромка,
   * бледное ядро (текстуры _darkfx). instant — извержение без падения.
   */
  private drop(x: number, y: number, R: number, dmg: number, delay: number, instant: boolean, crater = instant) {
    if (instant) {
      const tele = 0.25;
      this.fx.spawn('ink_ring', { x, y, w: R * 0.7 * RING_K, w1: R * RING_K, a0: 0.15, a1: 0.5, life: tele, delay, tint: CRIMSON, depth: DEPTH.zone + 0.1 });
      this.later.add(delay + tele, () => this.land(x, y, R, dmg, crater));
      return;
    }
    const fall = R > R0 * 2 ? FALL * 1.35 : FALL;
    this.fx.spawn('shadow', { x, y, w: R * 0.5, w1: R * 2, h: R * 0.25, h1: R * 0.8, a0: 0.2, a1: 0.7, life: fall, delay, add: false, depth: DEPTH.zone });
    // тонкое тусклое кольцо-телеграф: сжимается к точке удара
    this.fx.spawn('ink_ring', { x, y, w: R * 1.5 * RING_K, w1: R * RING_K, a0: 0.1, a1: 0.45, life: fall, delay, tint: CRIMSON, depth: DEPTH.zone + 0.1 });
    // кривая падения: старт высоко и сбоку (сторона случайная), контрольная точка даёт дугу —
    // сначала камень летит полого, затем почти отвесно «втыкается» в землю
    const side = Math.random() < 0.5 ? -1 : 1, dx = FALL_H * FALL_DX * (0.85 + Math.random() * 0.3);
    const f = this.freeFall.pop() ?? ({} as Fall);
    f.sx = x - side * dx; f.sy = y - FALL_H;
    f.cx = x - side * dx * 0.35; f.cy = y - FALL_H * 0.8;
    f.ex = x; f.ey = y;
    f.t = 0; f.dur = fall; f.delay = delay; f.R = R; f.dmg = dmg; f.crater = crater;
    f.head = null; f.tail = null; f.spin = ((Math.random() * 4) | 0) * (Math.PI / 2);
    this.falls.push(f);
    if (delay <= 0) this.showFall(f);
  }

  /** Картинки звезды (камень dk_star из _darkfx прежний; след — светлый gc_trail) */
  private showFall(f: Fall) {
    // след: «голова» картинки (правый край) совпадает с камнем
    f.tail = this.imgs.get(TRAIL_TEX, DEPTH.top, true).setOrigin(0.95, 0.5).setDisplaySize(f.R * 2.4, f.R * 0.45).setAlpha(0);
    f.head = this.imgs.get('dk_star', DEPTH.top + 0.01, false).setDisplaySize(f.R * 0.8, f.R * 0.8).setRotation(f.spin);
    this.placeFall(f, 0);
  }

  /** Позиция и поворот по кривой; k — доля пути 0..1 */
  private placeFall(f: Fall, k: number) {
    const m = 1 - k;
    const x = m * m * f.sx + 2 * m * k * f.cx + k * k * f.ex;
    const y = m * m * f.sy + 2 * m * k * f.cy + k * k * f.ey;
    // касательная — направление следа
    const tx = m * (f.cx - f.sx) + k * (f.ex - f.cx), ty = m * (f.cy - f.sy) + k * (f.ey - f.cy);
    f.tail!.setPosition(x, y).setRotation(Math.atan2(ty, tx));
    f.head!.setPosition(x, y);
  }

  private updateFalls(dt: number) {
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i];
      if (f.delay > 0) { f.delay -= dt; if (f.delay > 0) continue; this.showFall(f); }
      f.t += dt;
      if (f.t >= f.dur) {
        if (f.head) this.imgs.put(f.head);
        if (f.tail) this.imgs.put(f.tail);
        f.head = f.tail = null;
        this.falls[i] = this.falls[this.falls.length - 1]; this.falls.pop();
        this.freeFall.push(f);
        this.land(f.ex, f.ey, f.R, f.dmg, f.crater);
        continue;
      }
      const u = f.t / f.dur;
      // разгон к земле: медленнее вверху, «бух» в конце
      this.placeFall(f, u * (0.35 + 0.65 * u));
      f.tail!.setAlpha(Math.min(0.95, u * 5));
    }
  }

  private land(x: number, y: number, R: number, dmg: number, crater: boolean) {
    areaDamage(x, y, R, dmg, 80, this.def.id);
    // взрыв в нашем стиле: светлая клякса-вспышка (быстро растёт и гаснет) + штрихи-осколки веером + тонкое кольцо
    const sp = (Math.random() * 2) | 0;
    this.fx.spawn(SPLASH_TEX[sp], { x, y, w: R * 1.3, w1: R * 2.3, life: 0.1, a0: 1, a1: 1, rot: Math.random() * 6.28, tint: 0xfff0d8 });
    this.fx.spawn(SPLASH_TEX[sp ^ 1], { x, y, w: R * 2.3, w1: R * 2.7, life: 0.28, delay: 0.1, a0: 0.9, a1: 0, hold: true, rot: Math.random() * 6.28, tint: 0xffe2b8 });
    const n = R > 60 ? 10 : 7, a0 = Math.random() * 6.28;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * 6.28 + (Math.random() - 0.5) * 0.4, v = R * (3.2 + Math.random() * 2.2);
      this.fx.spawn(SHARD_TEX, {
        x, y, w: R * (0.45 + Math.random() * 0.35), h: R * 0.1, w1: R * 0.2, h1: R * 0.07, life: 0.32, a0: 1, a1: 0, hold: true,
        rot: a, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ox: 0.2, oy: 0.5, tint: 0xffe9c8,
      });
    }
    this.fx.spawn('ink_ring', { x, y, w: R * 0.6 * RING_K, w1: R * 1.5 * RING_K, life: 0.22, a0: 0.55, a1: 0, tint: 0xf0d2a8 });
    // выжженное пятно: гладкая тёмная копоть (fx_thunder_scorch)
    this.fx.spawn('fx_thunder_scorch', { x, y, w: R * 2, life: crater ? 3 : 1.6, a0: 0.85, a1: 0, hold: true, add: false, depth: DEPTH.zone, tint: 0x2a1c18, rot: Math.random() * 6.28 });
    W.fx.sparks(x, y, R > 60 ? 8 : 4, 0xffd8a0, 120);
    if (R > 70) W.scene.cameras.main.shake(140, 0.005);
    if (crater) {
      // кратер: 25% урона каждые 0.5 с в течение 3 с
      const c = this.freeCr.pop() ?? ({} as Crater);
      c.x = x; c.y = y; c.r = R; c.dmg = dmg * 0.25; c.t = 3; c.next = 0.5;
      this.craters.push(c);
      // тлеющие трещины активного кратера: тусклое ADD поверх той же картинки
      this.fx.spawn('ink_ring', { x, y, w: R * 2 * RING_K * 0.5, life: 3, a0: 0.35, a1: 0, hold: true, depth: DEPTH.zone + 0.1, tint: CRIMSON });
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
