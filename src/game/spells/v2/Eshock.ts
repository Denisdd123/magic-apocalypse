import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { areaDamage, type Projectile } from '../../Projectiles';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { aimR, faceVel, lifeToEdge, ROT, rnd } from './_proj';

/**
 * #13 Электрический удар → «Разряд». Ломаные разряды из мага в случайные стороны (летят до края экрана), пробивают всех.
 * Свойства: 470 Цепная молния (от цели перескакивает 1–3 раза), 471 Высокая производительность (взрыв при исчезновении,
 * рост размера идёт в урон), 472 Сверхпроводимость (по очереди в ближайших врагов, ×3 урон, ×2 размер — моды).
 * Слияния (основа): 22 Буйство электричества, 34 Сердце грозы, 47 Дыхание молнии, 63 Дисчардж.
 */
class Eshock extends DataSpell {
  private queue: { delay: number; a: number; target: Enemy | null; front: boolean }[] = [];
  private static readonly SPEED = 300;
  private static readonly LIFE = 0.32;

  update(dt: number) {
    if (this.readyData(dt)) this.cast();
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.delay -= dt;
      if (q.delay > 0) continue;
      this.queue[i] = this.queue[this.queue.length - 1]; this.queue.pop();
      let a = q.a;
      const P = W.player;
      if (q.target) {
        // цель погибла — не теряем выстрел, берём ближайшего на экране
        const t = q.target.alive ? q.target : W.enemies.nearest(P.x, P.y, aimR());
        if (!t) continue;
        a = Math.atan2(t.y - P.y, t.x - P.x);
      }
      this.shock(P.x, P.y, a, q.front);
    }
  }

  destroy() { this.queue.length = 0; }

  private cast() {
    const n = this.count;
    const P = W.player;
    // Буйство электричества: вместо цепочки — 3–7 волн подряд
    const waves = this.hasCombo(22) ? 3 + ((Math.random() * 5) | 0) : 1;
    for (let w = 0; w < waves; w++) {
      const t0 = w * 0.14;
      if (this.hasProp(472)) {
        // Сверхпроводимость: по очереди в ближайших
        const ts = W.enemies.nearestN(P.x, P.y, n, aimR());
        for (let i = 0; i < n; i++) {
          const e = ts.length ? ts[i % ts.length] : null;
          this.queue.push({ delay: t0 + i * 0.06, a: Math.random() * Math.PI * 2, target: e, front: false });
        }
      } else {
        for (let i = 0; i < n; i++) this.queue.push({ delay: t0 + i * 0.03, a: Math.random() * Math.PI * 2, target: null, front: false });
      }
    }
    // Дыхание молнии: ещё три разряда перед магом (по направлению движения)
    if (this.hasCombo(47)) {
      const f = Math.atan2(P.faceY, P.faceX);
      for (let i = -1; i <= 1; i++) this.queue.push({ delay: 0.05, a: f + i * 0.3, target: null, front: true });
    }
  }

  /** Множитель длины полёта (Буйство — дальше) */
  private get rangeK() { return this.hasCombo(22) ? 1.7 : 1; }

  private shock(x: number, y: number, a: number, front: boolean) {
    const hi = this.hasProp(471);
    // Высокая производительность: размер не растёт — его прирост уходит в урон
    const size = hi ? 1 : this.sizeMul;
    const dmg = hi ? this.dmg * this.sizeMul : this.dmg;
    const sp = Eshock.SPEED * this.speedMul * (front ? 1.3 : 1);
    const chain = this.hasProp(470) && !this.hasCombo(22);
    W.projectiles.fire({
      src: this.def.id, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg,
      // без предела длины: разряд пролетает весь экран (Буйство — ещё дальше)
      r: 6 * size, life: lifeToEdge(sp) * this.rangeK, tex: 'fx_eshock_proj', size: 34 * size,
      tint: this.tintFor(), pierce: Infinity, knock: 12,
      rotateToVel: false, update: faceVel(ROT.eshock),
      data: { chained: false },
      onHit: chain ? (p, e) => this.startChain(p, e, dmg, size) : (_p, e) => W.fx.sparks(e.x, e.y, 2, 0xd9b8ff, 70),
      onEnd: hi ? (p) => this.discharge(p.x, p.y, dmg) : undefined,
    });
  }

  private tintFor() {
    return this.hasProp(472) ? 0xa8c8ff : this.hasProp(471) ? 0xffb0c8 : 0xffffff;
  }

  /** Первое попадание снаряда запускает цепочку */
  private startChain(p: Projectile, e: Enemy, dmg: number, size: number) {
    if (p.data.chained) return;
    p.data.chained = true;
    const heart = this.hasCombo(34);
    const jumps = heart ? 3 : 1 + ((Math.random() * 3) | 0);
    this.jump(e, dmg, size, jumps, heart);
  }

  /**
   * Перескок: из врага from в ближайших соседей. Цепная молния — 1 ветка, урон тот же, разряд уменьшается.
   * Сердце грозы — каждая ветка делится на 2, урон и размер −20%, перескок быстрее.
   */
  private jump(from: Enemy, dmg: number, size: number, left: number, heart: boolean) {
    if (left <= 0) return;
    const branches = heart ? 2 : 1;
    const ts = W.enemies.nearestN(from.x, from.y, branches + 1, 110);
    let made = 0;
    for (const t of ts) {
      if (t === from || made >= branches) continue;
      made++;
      const a = Math.atan2(t.y - from.y, t.x - from.x);
      const d = Math.hypot(t.x - from.x, t.y - from.y);
      const sp = heart ? 900 : 600;
      const nd = heart ? dmg * 0.8 : dmg, ns = size * (heart ? 0.8 : 0.85);
      const p = W.projectiles.fire({
        src: this.def.id, x: from.x, y: from.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: nd,
        r: 5 * ns, life: d / sp + 0.05, tex: 'fx_eshock_proj', size: Math.min(48, Math.max(20, d)) * ns, tint: this.tintFor(),
        pierce: 0, rotateToVel: false, update: faceVel(ROT.eshock),
        onHit: (_p, e) => { W.fx.sparks(e.x, e.y, 2, 0xd9b8ff, 70); this.jump(e, nd, ns, left - 1, heart); },
      });
      p.hit.set(from.id, 0); // не бить врага, из которого прыгнули
    }
  }

  /** Высокая производительность: взрыв при исчезновении. Дисчардж — взрыв крупнее и выпускает снаряды. */
  private discharge(x: number, y: number, dmg: number) {
    const dis = this.hasCombo(63);
    const r = 20 * (dis ? 1.8 : 1);
    areaDamage(x, y, r, dmg, 20, this.def.id);
    W.fx.burst(x, y, r, 0xe0b0ff, 0.3, 'blast');
    W.fx.sparks(x, y, 3, 0xd9b8ff, 90);
    if (!dis) return;
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < 4; i++) {
      const a = a0 + (i * Math.PI) / 2 + rnd(-0.2, 0.2), sp = Eshock.SPEED;
      W.projectiles.fire({
        src: this.def.id, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: dmg * 0.5,
        r: 5, life: Eshock.LIFE * 0.8, tex: 'fx_eshock_proj', size: 24, tint: 0xffb0c8,
        pierce: Infinity, rotateToVel: false, update: faceVel(ROT.eshock),
      });
    }
  }
}

export const ESHOCK = defFromData(SPELL_BY_ID[13], (def) => new Eshock(def, SPELL_BY_ID[13]));
