import { areaDamage, type Projectile } from '../Projectiles';
import { W } from '../World';
import { Spell, type SpellDef } from './Spell';

/** Пламенное ядро — взрывной снаряд в ближайшего врага. */
class FlameCore extends Spell {
  private shotIndex = 0;
  private pending: { delay: number }[] = [];
  private gas: { x: number; y: number; t: number; hits: number; r: number; dmg: number }[] = [];

  get count() { return 1 + (this.level >= 2 ? 1 : 0) + (this.level >= 5 ? 1 : 0); }
  get dmgMul() {
    let m = 1 + (this.level >= 3 ? 0.5 : 0) + (this.level >= 6 ? 0.5 : 0);
    if (this.has('bigbang')) m *= 1.8;
    if (this.has('plague')) m *= 0.7;
    return m;
  }
  get radius() { return 26 * (this.level >= 4 ? 1.2 : 1) * W.stats.sizeMul; }

  update(dt: number) {
    if (this.ready(dt, 1.5)) {
      this.shotIndex = 0;
      for (let i = 0; i < this.count; i++) this.pending.push({ delay: i * 0.12 });
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      this.pending[i].delay -= dt;
      if (this.pending[i].delay <= 0) { this.pending.splice(i, 1); this.shoot(); }
    }
    // чумной дым: расширяется и бьёт 3 раза
    for (let i = this.gas.length - 1; i >= 0; i--) {
      const g = this.gas[i];
      g.t += dt;
      const need = Math.floor(g.t / 0.3) + 1;
      while (g.hits < Math.min(3, need)) {
        g.hits++;
        const r = g.r * (1 + 0.25 * g.hits);
        areaDamage(g.x, g.y, r, g.dmg);
        W.fx.burst(g.x, g.y, r, 0x7dff4a, 0.45, 'ring');
      }
      if (g.hits >= 3) this.gas.splice(i, 1);
    }
  }

  private shoot() {
    const P = W.player, s = W.stats;
    const first = this.shotIndex++ === 0;
    const big = this.has('bigbang') && first ? 1.5 : 1;
    const dmg = s.spellDamage(300, this.dmgMul * big);
    const r = this.radius * big;
    const tint = this.has('plague') ? 0x7dff4a : this.has('constellation') ? 0x7fb8ff : this.has('bigbang') ? 0xffe0b0 : 0xffffff;

    if (this.has('constellation')) {
      // ядро улетает в случайную точку рядом, висит и следует за магом
      const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 90;
      const ox = Math.cos(a) * d, oy = Math.sin(a) * d;
      W.projectiles.fire({
        x: P.x, y: P.y, vx: 0, vy: 0, dmg: 0, r: 9 * s.sizeMul, life: 3.5 * s.durMul,
        tex: 'fireball', size: 22 * big * s.sizeMul, tint, pierce: 1, rotateToVel: false, spin: 3,
        data: { ox, oy, k: 0 },
        update: (p, dt2) => {
          p.data.k = Math.min(1, p.data.k + dt2 * 3);
          p.x = P.x + p.data.ox * p.data.k; p.y = P.y + p.data.oy * p.data.k;
        },
        onHit: (p) => this.explode(p.x, p.y, r, dmg, tint),
      });
      return;
    }

    const e = W.enemies.nearest(P.x, P.y, 300);
    if (!e) return;
    const ang = Math.atan2(e.y - P.y, e.x - P.x) + (Math.random() - 0.5) * 0.15;
    W.projectiles.fire({
      x: P.x, y: P.y, vx: Math.cos(ang) * 200, vy: Math.sin(ang) * 200, dmg: 0,
      r: 7 * s.sizeMul, life: 1.4, tex: 'fireball', size: 20 * big * s.sizeMul, tint, rotateToVel: false,
      onEnd: (p: Projectile) => this.explode(p.x, p.y, r, dmg, tint),
    });
  }

  private explode(x: number, y: number, r: number, dmg: number, tint: number) {
    if (this.has('plague')) {
      this.gas.push({ x, y, t: 0, hits: 0, r, dmg });
      return;
    }
    areaDamage(x, y, r, dmg, 50);
    W.fx.burst(x, y, r, tint === 0xffffff ? 0xffa64d : tint, 0.35);
    W.fx.sparks(x, y, 4, 0xffc070, 80);
  }
}

export const FLAME_CORE: SpellDef = {
  id: 'flame', name: 'Пламенное ядро', icon: 'ico_fireball', kind: 'attack',
  desc: 'Стреляет взрывающимися огненными ядрами.',
  maxLevel: 7, attrLevels: [7],
  levelText: { 2: ['Число ядер +1'], 3: ['Урон ядер +50%'], 4: ['Размер взрыва +20%'], 5: ['Число ядер +1'], 6: ['Урон ядер +50%'] },
  attrs: {
    7: [
      { id: 'bigbang', name: 'Большой взрыв', tint: 0xffe0b0, lines: ['Первое ядро в залпе в 1.5 раза сильнее и больше.', 'Урон ядер +80%'] },
      { id: 'plague', name: 'Чумной дым', tint: 0x7dff4a, lines: ['Взрыв превращается в ядовитое облако: расширяется и бьёт 3 раза.', 'Урон ядер -30%'] },
      { id: 'constellation', name: 'Созвездие', tint: 0x7fb8ff, lines: ['Ядра зависают вокруг тебя и следуют за тобой 3.5 сек.', 'Взрываются при касании врага (до 2 раз).'] },
    ],
  },
  create: () => new FlameCore(FLAME_CORE),
};
