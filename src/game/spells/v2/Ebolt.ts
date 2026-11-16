import { SPELL_BY_ID } from '../../../data/spells_data';
import { areaDamage, type Projectile } from '../../Projectiles';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { aimR, rnd } from './_proj';

/**
 * #16 Энергетическая пуля → «Сгустки силы». Залп пробивающих сгустков в ближайших врагов, летят недалеко (длительность 0.6 с).
 * Свойства: 497 Заряженная частица (в конце возвращаются к магу), 498 Искра (бьёт тиками 0.3 с, живёт ×2.5),
 * 499 Вспышка (сразу в 4 стороны, в конце взрыв двойной мощности).
 * Слияния (основа): 3 Световая стрельба, 9 Противодействие, 29 Отправной взрыв.
 */
class Ebolt extends DataSpell {
  private queue: { delay: number; a: number }[] = [];
  private static readonly SPEED = 230;

  update(dt: number) {
    if (this.readyData(dt)) this.cast();
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.delay -= dt;
      if (q.delay > 0) continue;
      this.queue[i] = this.queue[this.queue.length - 1]; this.queue.pop();
      this.shoot(q.a);
    }
  }

  destroy() { this.queue.length = 0; }

  private cast() {
    const P = W.player;
    let n = this.count;
    const a0 = Math.random() * Math.PI * 2;
    if (this.hasCombo(29)) {
      // Отправной взрыв: урон и количество растут с длительностью; сразу во все стороны
      n = Math.round(n * W.stats.durMul);
      for (let i = 0; i < n; i++) this.queue.push({ delay: 0, a: a0 + (i / n) * Math.PI * 2 });
    } else if (this.hasCombo(3)) {
      // Световая стрельба: 4 потока во все стороны, вращаются — непрерывная очередь
      const per = Math.ceil(n / 4);
      for (let i = 0; i < n; i++) {
        const k = i % per, s = (i / per) | 0;
        this.queue.push({ delay: k * 0.04, a: a0 + (s * Math.PI) / 2 + k * 0.12 });
      }
    } else if (this.hasCombo(9)) {
      for (let i = 0; i < n; i++) this.queue.push({ delay: 0, a: a0 + (i / n) * Math.PI * 2 });
    } else if (this.hasProp(499)) {
      // Вспышка: четыре стороны разом, сгустки веером в каждой
      for (let i = 0; i < n; i++) this.queue.push({ delay: 0, a: a0 + ((i % 4) * Math.PI) / 2 + rnd(-0.25, 0.25) });
    } else {
      const ts = W.enemies.nearestN(P.x, P.y, n, aimR()); // ближайшие на экране
      if (!ts.length) { this.cd = 0.2; return; } // нет целей — ждём (не тратим залп впустую)
      for (let i = 0; i < n; i++) {
        const e = ts[i % ts.length];
        const spread = i < ts.length ? 0 : 0.2; // точно в цель; лишние сгустки — узким веером
        this.queue.push({ delay: i * 0.025, a: Math.atan2(e.y - P.y, e.x - P.x) + rnd(-spread, spread) });
      }
    }
  }

  private shoot(a: number) {
    const P = W.player, size = this.sizeMul;
    const spark = this.hasProp(498), flare = this.hasProp(499), back = this.hasProp(497);
    const reaction = this.hasCombo(9), spray = this.hasCombo(3), origin = this.hasCombo(29);
    let sp = Ebolt.SPEED * this.speedMul, life = this.durSec;
    if (spark) sp *= 0.7;
    if (spray) life *= 3;
    if (origin) life = Math.min(life, 0.3);
    const dmg = origin ? this.dmg * W.stats.durMul : this.dmg;
    const tint = flare ? 0xffb090 : spark ? 0xb8d8ff : 0xffffff;
    W.projectiles.fire({
      src: this.def.id, x: P.x, y: P.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      dmg: reaction ? 0 : dmg, r: 5 * size, life, tex: 'fx_ebolt_proj', size: 13 * size, tint,
      pierce: Infinity, knock: 8, rotateToVel: false, spin: 4,
      hitInterval: spark && !reaction ? 0.3 : undefined,
      data: { boom: 0, k: 0 },
      // Искра/Противодействие: сгусток плавно тормозит и висит
      update: spark ? (p, dt) => this.sparkUpdate(p, dt, dmg) : undefined,
      onEnd: flare ? (p) => this.flareBoom(p.x, p.y, dmg * 2) : back && !spray ? (p) => this.comeBack(p, dmg) : undefined,
    });
  }

  private sparkUpdate(p: Projectile, dt: number, dmg: number) {
    const k = Math.max(0, 1 - dt * 1.6);
    p.vx *= k; p.vy *= k;
    if (!this.hasCombo(9)) return;
    // Противодействие: взрыв каждые 0.5 с, каждый следующий +20%
    p.data.boom += dt;
    if (p.data.boom >= 0.5) {
      p.data.boom -= 0.5;
      const r = 22 * this.sizeMul;
      areaDamage(p.x, p.y, r, dmg * (1 + 0.2 * p.data.k), 10, this.def.id);
      p.data.k++;
      W.fx.burst(p.x, p.y, r, 0xc8b0ff, 0.3, 'fx_ebolt_flare');
    }
  }

  /** Вспышка: взрыв двойной мощности в конце жизни (Отправной взрыв: +50% размера — уже в sizeMul) */
  private flareBoom(x: number, y: number, dmg: number) {
    const r = 22 * this.sizeMul;
    areaDamage(x, y, r, dmg, 20, this.def.id);
    W.fx.burst(x, y, r * 1.15, 0xffffff, 0.35, 'fx_ebolt_flare');
  }

  /** Заряженная частица: по окончании летит обратно к магу и снова бьёт насквозь */
  private comeBack(p: Projectile, dmg: number) {
    const size = this.sizeMul, sp = Ebolt.SPEED * this.speedMul * 1.2;
    W.projectiles.fire({
      src: this.def.id, x: p.x, y: p.y, vx: 0, vy: 0, dmg, r: 5 * size, life: 1.6,
      tex: 'fx_ebolt_proj', size: 13 * size, tint: 0xd8f0ff, pierce: Infinity, knock: 0,
      rotateToVel: false, spin: -4,
      update: (q) => {
        const P = W.player, dx = P.x - q.x, dy = P.y - q.y, d = Math.hypot(dx, dy);
        if (d < 10) { q.life = 0; return; }
        q.vx = (dx / d) * sp; q.vy = (dy / d) * sp;
      },
    });
  }
}

export const EBOLT = defFromData(SPELL_BY_ID[16], (def) => new Ebolt(def, SPELL_BY_ID[16]));
