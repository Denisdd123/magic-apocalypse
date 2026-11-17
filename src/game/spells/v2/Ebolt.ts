import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { areaDamage, type Projectile } from '../../Projectiles';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { DEPTH } from '../../../config';
import { HitGate, ImgPool } from './_zoneKit';
import { GA, ensureGroupA } from './_groupA';
import { aimR, rnd } from './_proj';

/** Код оригинала: старт 520 px/с (×0.75…1.35), торможение ×0.905 каждые 0.03 с, живёт 0.6×(0.8…1.1) с, размер ×(0.5…1.0) */
const V0 = 520, DRAG = 0.905, DRAG_STEP = 0.03, FLIGHT = 0.6;
/** Диаметр видимого сгустка при размере 1.0 (коллайдер кода 1.45 ед. ≈ 82 px — берём компактнее для читаемости) */
const ORB_D = 64;
/** Потолок одновременных зон (iPhone) */
const MAX_ZONES = 36;

interface Zone {
  x: number; y: number; t: number; life: number; s: number; r: number; dmg: number;
  tick: number; boom: number; k: number; full: number; img: ReturnType<ImgPool['get']>;
}

/**
 * #16 Энергетическая пуля → «Сгустки силы». Залп сгустков веером в ближайших врагов (интервал 0.1 с по коду),
 * они вылетают быстро, тормозят (×0.905 / 0.03 с), останавливаются и ненадолго остаются на земле зоной:
 * враг, наступивший на сгусток, получает урон по тикам; потом сгусток тает.
 * Свойства: 497 Заряженная частица (в конце возвращаются к магу), 498 Искра (бьёт чаще — тик 0.3 с, живёт дольше),
 * 499 Вспышка (сразу в 4 стороны, в конце взрыв двойной мощности).
 * Слияния (основа): 3 Световая стрельба, 9 Противодействие, 29 Отправной взрыв.
 */
class Ebolt extends DataSpell {
  private queue: { delay: number; a: number }[] = [];
  private zones: Zone[] = [];
  private pool = new ImgPool();
  private gate = new HitGate();
  private clock = 0;

  update(dt: number) {
    ensureGroupA();
    this.clock += dt;
    if (this.readyData(dt)) this.cast();
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.delay -= dt;
      if (q.delay > 0) continue;
      this.queue[i] = this.queue[this.queue.length - 1]; this.queue.pop();
      this.shoot(q.a);
    }
    this.updateZones(dt);
  }

  destroy() {
    this.queue.length = 0;
    for (const z of this.zones) this.pool.put(z.img);
    this.zones.length = 0;
    this.pool.destroy();
  }

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
      // залп веером: направление на ближайшего врага, каждый следующий сгусток — со своим разбросом; интервал 0.1 с (код)
      const ts = W.enemies.nearestN(P.x, P.y, n, aimR());
      if (!ts.length) { this.cd = 0.2; return; } // нет целей — ждём (не тратим залп впустую)
      for (let i = 0; i < n; i++) {
        const e = ts[i % ts.length];
        const spread = i < ts.length ? 0.12 : 0.3;
        this.queue.push({ delay: i * 0.1, a: Math.atan2(e.y - P.y, e.x - P.x) + rnd(-spread, spread) });
      }
    }
  }

  private shoot(a: number) {
    const P = W.player;
    const spark = this.hasProp(498), flare = this.hasProp(499), back = this.hasProp(497);
    const reaction = this.hasCombo(9), spray = this.hasCombo(3), origin = this.hasCombo(29);
    const s = rnd(0.5, 1.0) * this.sizeMul;           // размер ×(0.5…1.0) из кода
    const v0 = V0 * rnd(0.75, 1.35) * this.speedMul;   // старт 520 px/с ×(0.75…1.35)
    let life = FLIGHT * rnd(0.8, 1.1);                 // 0.6 × (0.8…1.1) с
    if (spray) life *= 3;
    if (origin) life = Math.min(life, 0.3);
    const dmg = origin ? this.dmg * W.stats.durMul : this.dmg;
    const tint = flare ? 0xffe0d0 : spark ? 0xd0e4ff : 0xffffff;
    const zone = !spray && !origin;                    // потоки Световой стрельбы и Отправной взрыв зон не оставляют
    W.projectiles.fire({
      src: this.def.id, x: P.x, y: P.y, vx: Math.cos(a) * v0, vy: Math.sin(a) * v0,
      dmg: reaction ? 0 : dmg, r: 18 * s, life, tex: GA.orb[0], size: ORB_D * s, tint,
      pierce: Infinity, knock: 6, rotateToVel: false,
      hitInterval: spark && !reaction ? 0.3 : undefined,
      // торможение ×0.905 каждые 0.03 с (степень от dt) и мерцание 3 кадров штрихов
      update: (p, dt) => {
        const k = Math.pow(DRAG, dt / DRAG_STEP);
        p.vx *= k; p.vy *= k;
        const f = GA.orb[((p.t * 16) | 0) % 3];
        if (p.img.texture.key !== f) p.img.setTexture(f);
      },
      onEnd: (p) => {
        if (flare) this.flareBoom(p.x, p.y, dmg * 2);
        if (zone) this.land(p.x, p.y, s, reaction ? this.dmg : dmg);
        if (back && !spray) this.comeBack(p, dmg);
      },
    });
  }

  /** Сгусток остановился: остаётся на земле зоной на ~0.5–1 с, бьёт наступивших по тикам, затем тает */
  private land(x: number, y: number, s: number, dmg: number) {
    if (this.zones.length >= MAX_ZONES) return;
    const spark = this.hasProp(498);
    // длительность: базовая 0.6 с из данных (+ свойства/мод длительности) → 0.9 с на земле
    const life = Math.min(4, Math.max(0.5, this.durSec * 1.5));
    const img = this.pool.get(GA.orb[1], DEPTH.zone).setPosition(x, y).setAlpha(0).setTint(spark ? 0xd0e4ff : 0xdfe6ff);
    this.zones.push({ x, y, t: 0, life, s, r: 26 * s, dmg: dmg * 0.5, full: dmg, tick: 0, boom: 0, k: 0, img });
  }

  private zDmg = 0;
  private zTick = 0.35;
  private onStep = (e: Enemy) => {
    if (!this.gate.ok(e.id, this.clock, this.zTick * 0.9)) return;
    W.enemies.damage(e, this.zDmg, 0, 0, this.def.id);
  };

  private updateZones(dt: number) {
    if (!this.zones.length) return;
    const spark = this.hasProp(498), reaction = this.hasCombo(9);
    this.zTick = spark ? 0.3 : 0.35;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.t += dt;
      if (z.t >= z.life) {
        this.pool.put(z.img);
        this.zones[i] = this.zones[this.zones.length - 1]; this.zones.pop();
        continue;
      }
      const k = z.t / z.life;
      // проявляется за 0.08 с, держится, гаснет и сжимается в последней трети
      const a = k < 0.1 ? k / 0.1 : k > 0.65 ? (1 - k) / 0.35 : 1;
      const sc = (ORB_D * z.s * (k > 0.65 ? 0.6 + 0.4 * a : 1)) / 64;
      const f = GA.orb[1 + (((z.t * 10) | 0) & 1)];
      if (z.img.texture.key !== f) z.img.setTexture(f);
      z.img.setPosition(z.x, z.y).setScale(sc, sc * 0.85).setAlpha(0.35 + 0.55 * a);
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick += this.zTick;
        this.zDmg = z.dmg;
        W.enemies.grid.query(z.x, z.y, z.r, this.onStep);
      }
      if (reaction) {
        // Противодействие: взрыв каждые 0.5 с, каждый следующий +20%
        z.boom += dt;
        if (z.boom >= 0.5) {
          z.boom -= 0.5;
          const r = 22 * this.sizeMul;
          areaDamage(z.x, z.y, r, z.full * (1 + 0.2 * z.k), 10, this.def.id);
          z.k++;
          W.fx.burst(z.x, z.y, r, 0xc8b0ff, 0.3, 'fx_ebolt_flare');
        }
      }
    }
    this.gate.prune(this.clock, 3);
  }

  /** Вспышка: взрыв двойной мощности в конце жизни (Отправной взрыв: +50% размера — уже в sizeMul) */
  private flareBoom(x: number, y: number, dmg: number) {
    const r = 22 * this.sizeMul;
    areaDamage(x, y, r, dmg, 20, this.def.id);
    W.fx.burst(x, y, r * 1.15, 0xffffff, 0.35, 'fx_ebolt_flare');
  }

  /** Заряженная частица: по окончании летит обратно к магу и снова бьёт насквозь */
  private comeBack(p: Projectile, dmg: number) {
    const size = this.sizeMul, sp = V0 * this.speedMul * 0.7;
    W.projectiles.fire({
      src: this.def.id, x: p.x, y: p.y, vx: 0, vy: 0, dmg, r: 16 * size, life: 1.6,
      tex: GA.orb[2], size: ORB_D * 0.8 * size, tint: 0xd8f0ff, pierce: Infinity, knock: 0,
      rotateToVel: false,
      update: (q) => {
        const P = W.player, dx = P.x - q.x, dy = P.y - q.y, d = Math.hypot(dx, dy);
        if (d < 10) { q.life = 0; return; }
        q.vx = (dx / d) * sp; q.vy = (dy / d) * sp;
      },
    });
  }
}

export const EBOLT = defFromData(SPELL_BY_ID[16], (def) => new Ebolt(def, SPELL_BY_ID[16]));
