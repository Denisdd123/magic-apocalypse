import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';

/**
 * Общие помощники зоны «удары с неба / ауры / орбита» (Гнев туч, Падение звезды, Ледяная буря,
 * Ледяной венец, Поле разрядов, Кольцо сфер). Свой пул картинок — без tween-ов и без аллокаций Image в бою.
 */

export interface FxOpt {
  x: number; y: number;
  /** ширина в игровых единицах (высота — по пропорциям текстуры, если h не задан) */
  w: number; h?: number;
  /** конечные размеры (по умолчанию = начальным) */
  w1?: number; h1?: number;
  a0?: number; a1?: number;
  life: number;
  /** задержка появления, с */
  delay?: number;
  rot?: number; spin?: number;
  vx?: number; vy?: number;
  tint?: number;
  add?: boolean;       // ADD-смешивание (свечение); иначе обычное (тени, камни, кратеры)
  depth?: number;
  ox?: number; oy?: number; // origin
  /** следовать за врагом, пока он жив и заморожен (корка льда) */
  frozen?: Enemy;
  /** следовать за точкой (маг) */
  follow?: { x: number; y: number };
  /** кривая альфы: 0 — линейно, 1 — держится и гаснет в конце */
  hold?: boolean;
}

interface Item {
  img: Phaser.GameObjects.Image | null; tex: string;
  t: number; delay: number; life: number;
  x: number; y: number; vx: number; vy: number;
  w0: number; h0: number; w1: number; h1: number;
  a0: number; a1: number; spin: number; rot: number;
  tint: number; add: boolean; depth: number; ox: number; oy: number; hold: boolean;
  frozen: Enemy | null; follow: { x: number; y: number } | null; fx: number; fy: number;
}

export class SkyFx {
  private act: Item[] = [];
  private items: Item[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  private all: Phaser.GameObjects.Image[] = [];
  /** сколько активных корок льда (ограничение для iPhone) */
  crusts = 0;

  private img(tex: string) {
    let im = this.pool.pop();
    if (!im) { im = W.scene.add.image(0, 0, tex); this.all.push(im); }
    return im.setTexture(tex).setVisible(true).setAlpha(1).setRotation(0).clearTint();
  }

  spawn(tex: string, o: FxOpt) {
    const it: Item = this.items.pop() ?? ({} as Item);
    const frame = W.scene.textures.getFrame(tex);
    const asp = frame ? frame.height / frame.width : 1;
    it.img = null; it.tex = tex; it.t = 0; it.delay = o.delay ?? 0; it.life = o.life;
    it.x = o.x; it.y = o.y; it.vx = o.vx ?? 0; it.vy = o.vy ?? 0;
    it.w0 = o.w; it.h0 = o.h ?? o.w * asp; it.w1 = o.w1 ?? it.w0; it.h1 = o.h1 ?? (o.w1 !== undefined && o.h === undefined ? o.w1 * asp : it.h0);
    it.a0 = o.a0 ?? 1; it.a1 = o.a1 ?? 0; it.spin = o.spin ?? 0; it.rot = o.rot ?? 0;
    it.tint = o.tint ?? 0xffffff; it.add = o.add ?? true; it.depth = o.depth ?? DEPTH.fx;
    it.ox = o.ox ?? 0.5; it.oy = o.oy ?? 0.5; it.hold = !!o.hold;
    it.frozen = o.frozen ?? null; it.follow = o.follow ?? null;
    it.fx = it.follow ? o.x - it.follow.x : 0; it.fy = it.follow ? o.y - it.follow.y : 0;
    if (it.frozen) this.crusts++;
    this.act.push(it);
    if (it.delay <= 0) this.show(it);
  }

  private show(it: Item) {
    const im = this.img(it.tex).setOrigin(it.ox, it.oy).setDepth(it.depth).setTint(it.tint)
      .setBlendMode(it.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL).setRotation(it.rot);
    it.img = im;
    this.apply(it, 0);
  }

  private apply(it: Item, k: number) {
    const im = it.img!;
    const e = 1 - (1 - k) * (1 - k);
    let x = it.x, y = it.y;
    if (it.frozen) { x = it.frozen.x; y = it.frozen.y; }
    else if (it.follow) { x = it.follow.x + it.fx; y = it.follow.y + it.fy; }
    im.setPosition(x, y).setDisplaySize(it.w0 + (it.w1 - it.w0) * e, it.h0 + (it.h1 - it.h0) * e);
    const ka = it.hold ? Math.max(0, (k - 0.6) / 0.4) : k;
    im.setAlpha(it.a0 + (it.a1 - it.a0) * ka);
  }

  update(dt: number) {
    for (let i = this.act.length - 1; i >= 0; i--) {
      const it = this.act[i];
      if (it.delay > 0) { it.delay -= dt; if (it.delay > 0) continue; this.show(it); }
      it.t += dt;
      it.x += it.vx * dt; it.y += it.vy * dt;
      if (it.spin && it.img) it.img.rotation += it.spin * dt;
      let done = it.t >= it.life;
      if (it.frozen && (!it.frozen.alive || it.frozen.freezeT <= 0)) done = true;
      if (!done) { this.apply(it, Math.min(1, it.t / it.life)); continue; }
      this.release(it);
      this.act[i] = this.act[this.act.length - 1];
      this.act.pop();
    }
  }

  private release(it: Item) {
    if (it.img) { it.img.setVisible(false); this.pool.push(it.img); it.img = null; }
    if (it.frozen) { this.crusts--; it.frozen = null; }
    it.follow = null;
    this.items.push(it);
  }

  destroy() {
    for (const im of this.all) im.destroy();
    this.all = []; this.pool = []; this.act = []; this.items = []; this.crusts = 0;
  }
}

/** Отложенные действия (серии ударов, падения). Замыкания только на каст — не в горячем цикле. */
export class Later {
  private q: { t: number; fn: () => void }[] = [];
  add(delay: number, fn: () => void) { if (delay <= 0) fn(); else this.q.push({ t: delay, fn }); }
  update(dt: number) {
    for (let i = this.q.length - 1; i >= 0; i--) {
      const q = this.q[i];
      q.t -= dt;
      if (q.t <= 0) { this.q[i] = this.q[this.q.length - 1]; this.q.pop(); q.fn(); }
    }
  }
  get size() { return this.q.length; }
  clear() { this.q.length = 0; }
}

/** Заморозить врага и надеть на него корку льда (fx_frost_crust). Элитки и боссы не мёрзнут. */
/** Заморозка: по отзыву пользователя корку льда не рисуем — моб просто подсвечивается синим (Enemies.freeze) */
export function freezeCrust(_fx: SkyFx, e: Enemy, sec: number) {
  if (!e.alive || e.elite || e.type.id === 'boss') return;
  W.enemies.freeze(e, sec);
}

/** Случайная точка в видимой области (с отступом) — переиспользуемый объект */
const pt = { x: 0, y: 0 };
export function randomInView(margin = 24) {
  const v = W.scene.cameras.main.worldView;
  pt.x = v.x + margin + Math.random() * Math.max(1, v.width - margin * 2);
  pt.y = v.y + margin + Math.random() * Math.max(1, v.height - margin * 2);
  return pt;
}

/**
 * Урон по кольцу rIn < d ≤ rOut (расширяющийся взрыв: каждый тик бьёт только новых).
 * onHit — статус (заморозка, оглушение). Возвращает число задетых.
 */
export function ringDamage(x: number, y: number, rIn: number, rOut: number, dmg: number, knock: number, src: string, onHit?: (e: Enemy) => void): number {
  let n = 0;
  W.enemies.grid.query(x, y, rOut, (e) => {
    const dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
    if (rIn > 0) { const ri = rIn + e.r; if (d2 <= ri * ri) return; }
    let kx = 0, ky = 0;
    if (knock) { const d = Math.sqrt(d2) || 1; kx = (dx / d) * knock; ky = (dy / d) * knock; }
    W.enemies.damage(e, dmg, kx, ky, src);
    if (onHit) onHit(e);
    n++;
  });
  return n;
}
