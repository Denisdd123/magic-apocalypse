import { SPELL_BY_ID } from '../../../data/spells_data';
import { areaDamage, type Projectile } from '../../Projectiles';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { aimR, lifeToEdge, rnd } from './_proj';
import { LF, MAGE_H, animFrames, ensureLineFx } from './_linefx';

/** Длина огненной кометы (голова + шлейф) — ~1.7 роста мага, голова ≈ треть роста */
const COMET = 1.7 * MAGE_H;
/** Диаметр огненной сферы «Созвездия» */
const ORB = 1.1 * MAGE_H;
/** Покадровая анимация пламени (3 кадра штриховых языков, ~14 кадров/с) */
const fireAnim = animFrames(LF.fire, 14);

/** Облако яда / многократный взрыв: расширяется и бьёт hitsMax раз */
interface Gas { x: number; y: number; t: number; hits: number; hitsMax: number; r: number; dmg: number; step: number; tint: number }

/**
 * #2 Огненный шар → «Пламенное ядро». Шар летит в ближайшего врага и взрывается при касании (урон — взрывом).
 * Свойства: 371 Большой взрыв (первый шар залпа ×1.5 урон и размер), 372 Ядовитый газ (взрыв расширяется, бьёт 3 раза),
 * 373 Созвездие (шары в случайные стороны, тормозят и следуют за магом; пробивная сила +1 → взрыв на каждом касании).
 * Слияния (основа): 6 Уравнение демона, 8 Пандемониум, 46 Чёрная смерть.
 */
class Fireball extends DataSpell {
  private queue: { delay: number; first: boolean; i: number; n: number }[] = [];
  private gas: Gas[] = [];
  private gasFree: Gas[] = [];

  /** базовый радиус взрыва (до множителя размера) */
  private static readonly R = 24;

  update(dt: number) {
    if (this.readyData(dt)) {
      ensureLineFx(W.scene);
      const n = this.count;
      if (this.hasCombo(46)) {
        // Чёрная смерть: шар сразу взрывается в случайной точке, 4 удара
        for (let i = 0; i < n; i++) this.queue.push({ delay: i * 0.08, first: i === 0, i, n });
      } else if (this.hasCombo(6)) {
        // Уравнение демона: все шары разом во все стороны
        const a0 = Math.random() * Math.PI * 2;
        for (let i = 0; i < n; i++) this.shootDir(a0 + (i / n) * Math.PI * 2, false);
      } else {
        for (let i = 0; i < n; i++) this.queue.push({ delay: i * 0.12, first: i === 0, i, n });
      }
    }
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.delay -= dt;
      if (q.delay > 0) continue;
      this.queue[i] = this.queue[this.queue.length - 1]; this.queue.pop();
      if (this.hasCombo(46)) this.blackDeath();
      else if (this.hasCombo(8)) this.pandemonium();
      else if (this.hasProp(373)) this.constellation(q.first);
      else this.shootNearest(q.first);
    }
    this.updateGas(dt);
  }

  destroy() { this.queue.length = 0; this.gas.length = 0; }

  // ——— цвета ———
  private get boomTint() { return this.hasProp(372) ? 0x8fdc5a : 0xffffff; }
  private get projTint() { return this.hasProp(372) ? 0x9cff7a : this.hasProp(373) ? 0xd8e4ff : 0xffffff; }

  /** «Большой взрыв»: первый шар залпа ×1.5 урон и размер (в Уравнении демона свойство пропадает) */
  private bigK(first: boolean) { return first && this.hasProp(371) && !this.hasCombo(6) ? 1.5 : 1; }

  private shootNearest(first: boolean) {
    const P = W.player;
    // ближайший враг на экране, точно в него (без разброса)
    const e = W.enemies.nearest(P.x, P.y, aimR());
    if (!e) return;
    this.shootDir(Math.atan2(e.y - P.y, e.x - P.x), first);
  }

  private shootDir(a: number, first: boolean) {
    const P = W.player, k = this.bigK(first), size = this.sizeMul * k, sp = 210 * this.speedMul;
    const dmg = this.dmg * k, r = Fireball.R * size;
    W.projectiles.fire({
      src: this.def.id, x: P.x, y: P.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: 0,
      r: 7 * size, life: lifeToEdge(sp, 1.5), tex: LF.fire[0], size: COMET * size, tint: this.projTint,
      pierce: Math.round(this.stat('pierce', 0)), update: fireAnim,
      onHit: (p) => this.explode(p.x, p.y, r, dmg),
      // долетел, ни в кого не попав — взрыв в конце пути
      onEnd: (p) => { if (p.t >= p.life && p.hit.size === 0) this.explode(p.x, p.y, r, dmg); },
    });
  }

  /** Созвездие: в случайную сторону, скорость гаснет, шар держится рядом с магом и плывёт за ним */
  private constellation(first: boolean) {
    const P = W.player, k = this.bigK(first), size = this.sizeMul * k;
    const dmg = this.dmg * k, r = Fireball.R * size;
    const a = Math.random() * Math.PI * 2, sp = rnd(140, 220) * this.speedMul;
    W.projectiles.fire({
      src: this.def.id, x: P.x, y: P.y, vx: 0, vy: 0, dmg: 0, r: 7 * size, life: 3.5 * W.stats.durMul,
      tex: LF.fireOrb, size: ORB * size, tint: this.projTint, rotateToVel: false, spin: 2.5,
      pierce: Math.round(this.stat('pierce', 0)),
      // ox/oy — смещение от мага, v — скорость разлёта (гаснет)
      data: { ox: 0, oy: 0, cx: Math.cos(a), cy: Math.sin(a), v: sp },
      update: (p, dt) => {
        const d = p.data;
        d.v *= Math.max(0, 1 - dt * 2.2);
        d.ox += d.cx * d.v * dt; d.oy += d.cy * d.v * dt;
        p.x = W.player.x + d.ox; p.y = W.player.y + d.oy;
      },
      onHit: (p) => this.explode(p.x, p.y, r, dmg),
    });
  }

  /**
   * Пандемониум: шар блуждает случайно и пронзает всех; при касании жжёт (множитель 3 за каждую единицу пробивной силы),
   * взрывается ×3 только при исчезновении. Урон растёт пропорционально длительности.
   */
  private pandemonium() {
    const P = W.player, size = this.sizeMul, durK = W.stats.durMul, life = 3 * durK;
    const base = this.dmg * durK, r = Fireball.R * size;
    const touch = base * 3 * Math.max(1, this.stat('pierce', 0));
    const a = Math.random() * Math.PI * 2, sp = 120 * this.speedMul;
    W.projectiles.fire({
      src: this.def.id, x: P.x, y: P.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: touch,
      r: 8 * size, life, tex: LF.fire[0], size: COMET * size, tint: 0xd8e4ff,
      pierce: Infinity, hitInterval: 0.5, knock: 10,
      data: { turn: rnd(-2, 2) },
      update: (p, dt) => {
        // случайное блуждание + мягкое притяжение к магу, чтобы не улетал за экран
        const d = p.data;
        if (Math.random() < dt * 1.5) d.turn = rnd(-3, 3);
        const ang = Math.atan2(p.vy, p.vx) + d.turn * dt;
        let vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp;
        const dx = W.player.x - p.x, dy = W.player.y - p.y, dist = Math.hypot(dx, dy);
        if (dist > 110) { vx += (dx / dist) * sp * 0.6; vy += (dy / dist) * sp * 0.6; }
        p.vx = vx; p.vy = vy;
        fireAnim(p);
      },
      onEnd: (p) => this.explode(p.x, p.y, r * 1.3, base * 3, true),
    });
  }

  /** Чёрная смерть: мгновенный взрыв в случайной точке экрана, 4 удара; урон растёт с размером */
  private blackDeath() {
    const v = W.scene.cameras.main.worldView;
    const e = Math.random() < 0.6 ? W.enemies.randomVisible() : null;
    const x = e ? e.x : rnd(v.x + 20, v.right - 20), y = e ? e.y : rnd(v.y + 20, v.bottom - 20);
    const size = this.sizeMul;
    this.addGas(x, y, Fireball.R * size, this.dmg * size, 4, 0.22, 0x8fdc5a);
  }

  /** Взрыв шара (с учётом «Ядовитого газа») */
  private explode(x: number, y: number, r: number, dmg: number, plain = false) {
    if (!plain && this.hasProp(372)) { this.addGas(x, y, r, dmg, 3, 0.3, 0x8fdc5a); return; }
    areaDamage(x, y, r, dmg, 40, this.def.id);
    // кольцо рваных огненных штрихов + белая вспышка лучами в центре
    W.fx.burst(x, y, r * 1.15, this.boomTint, 0.45, LF.fireBoom);
    W.fx.burst(x, y, r * 0.8, 0xfff0d0, 0.2, LF.spark);
    W.fx.sparks(x, y, 3, 0xffa060, 80);
  }

  private addGas(x: number, y: number, r: number, dmg: number, hitsMax: number, step: number, tint: number) {
    const g = this.gasFree.pop() ?? ({} as Gas);
    g.x = x; g.y = y; g.t = 0; g.hits = 0; g.hitsMax = hitsMax; g.r = r; g.dmg = dmg; g.step = step; g.tint = tint;
    this.gas.push(g);
  }

  /** Облака: каждый удар — шире предыдущего */
  private updateGas(dt: number) {
    for (let i = this.gas.length - 1; i >= 0; i--) {
      const g = this.gas[i];
      g.t += dt;
      const need = Math.min(g.hitsMax, Math.floor(g.t / g.step) + 1);
      while (g.hits < need) {
        g.hits++;
        const r = g.r * (1 + 0.25 * (g.hits - 1));
        areaDamage(g.x, g.y, r, g.dmg, 0, this.def.id);
        W.fx.burst(g.x, g.y, r * 1.1, g.tint, 0.5, LF.fireBoom);
        if (g.hits === 1) W.fx.burst(g.x, g.y, r * 1.2, g.tint, 0.6, LF.ring);
      }
      if (g.hits >= g.hitsMax) {
        this.gas[i] = this.gas[this.gas.length - 1]; this.gas.pop();
        this.gasFree.push(g);
      }
    }
  }
}

export const FIREBALL = defFromData(SPELL_BY_ID[2], (def) => new Fireball(def, SPELL_BY_ID[2]));
