import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { aimR, keepTarget } from './_proj';
import { HitGate, ImgPool, randomViewPoint } from './_zoneKit';

/** fx_cyclone / fx_cyclone_void: круглые спирали, видимый диаметр ≈ 210 px из 256 */
const TEX = 'fx_cyclone', TEX_VOID = 'fx_cyclone_void', TEX_D = 210;

type Mode = 'seek' | 'void' | 'orbit' | 'neutron' | 'typhoon' | 'super' | 'hole';

interface Wind {
  mode: Mode; x: number; y: number; vx: number; vy: number;
  t: number; life: number; delay: number; r0: number; r: number;
  ang: number; shotT: number; gate: HitGate;
  /** удерживаемая цель (не перескакивает между врагами каждый кадр) */
  tgt: Enemy | null;
  img: Phaser.GameObjects.Image | null;
}

/**
 * #12 Вихрь → «Смерч». Вихрь ползёт к ближайшему врагу и постепенно растёт; тик 0.3 с, длительность 2 с.
 * Каждый вихрь бьёт одного врага не чаще тика (свои ворота у каждого вихря).
 * Свойства: 461 Штормовое предупреждение (чистые моды), 462 Электрическая сфера (сжимается и стреляет зарядами),
 * 463 Космические пустоты (по одному в случайных местах, стоят, растут в 9 раз быстрее — speed ×9 из данных).
 * Слияния (основа): C10 Вихрь, C14 Генерация нейтронов, C25 Повелитель тайфуна, C39 Супертайфун, C50 Чёрная дыра.
 */
class Cyclone extends DataSpell {
  private winds: Wind[] = [];
  private spare: Wind[] = [];
  private pool = new ImgPool();
  private clock = 0;

  destroy() {
    for (const w of this.winds) if (w.img) this.pool.put(w.img);
    this.winds.length = 0;
    this.pool.destroy();
  }

  /** слияния, у которых КД начинается после окончания вихря */
  private get cdAfterEnd(): boolean { return this.hasCombo(39) || this.hasCombo(50); }

  update(dt: number) {
    this.clock += dt;
    if (!(this.cdAfterEnd && this.winds.length) && this.readyData(dt)) this.cast();
    if (!this.winds.length) return;
    const P = W.player;
    const grow = 0.5 * this.speedMul; // скорость роста радиуса (доля r0 в секунду); у Пустот ×9
    const tick = this.tickSec;
    for (let i = this.winds.length - 1; i >= 0; i--) {
      const w = this.winds[i];
      if (w.delay > 0) {
        w.delay -= dt;
        if (w.delay > 0) continue;
        w.img = this.pool.get(this.texFor(w.mode), DEPTH.zone, w.mode !== 'void' && w.mode !== 'hole' && w.mode !== 'orbit');
        if (this.hasProp(462)) w.img.setTint(0xcfe4ff);
      }
      w.t += dt;
      if (w.t >= w.life) { this.kill(i); continue; }
      const k = w.t / w.life;
      switch (w.mode) {
        case 'seek': { // ползёт к ближайшему врагу
          const e = w.tgt = keepTarget(w.tgt, w.x, w.y);
          if (e) this.steer(w, e.x, e.y, 55, dt);
          w.r = this.hasProp(462) ? w.r0 * (1.3 - 0.8 * k) : w.r0 * Math.min(4, 1 + grow * w.t);
          if (this.hasProp(462)) this.shoot(w, dt);
          break;
        }
        case 'void': case 'hole':
          w.vx = w.vy = 0;
          w.r = w.r0 * Math.min(5, 1 + grow * w.t);
          break;
        case 'orbit': // C10: кружит рядом с магом, постепенно сужается
          w.ang += dt * 2.2;
          w.x = P.x + Math.cos(w.ang) * 60; w.y = P.y + Math.sin(w.ang) * 60;
          w.r = w.r0 * (2.4 - 1.4 * k);
          break;
        case 'neutron': { // C14: один, быстро расширяется, скорость падает
          const e = w.tgt = keepTarget(w.tgt, w.x, w.y);
          if (e) this.steer(w, e.x, e.y, 90 * (1 - k), dt);
          w.r = w.r0 * (1 + 2.5 * k);
          break;
        }
        case 'typhoon': { // C25: разлетаются, сначала быстро, потом медленно
          const sp = 30 + 230 * (1 - k) * (1 - k), d = Math.hypot(w.vx, w.vy) || 1;
          w.vx = (w.vx / d) * sp; w.vy = (w.vy / d) * sp;
          w.r = w.r0 * Math.min(3, 1 + grow * w.t);
          break;
        }
        case 'super': // C39: закреплён за магом
          w.x = P.x; w.y = P.y; w.vx = w.vy = 0;
          w.r = w.r0 * Math.min(2, 1 + grow * w.t * 0.5);
          break;
      }
      w.x += w.vx * dt; w.y += w.vy * dt;
      const img = w.img!;
      const a = k < 0.1 ? k / 0.1 : k > 0.85 ? (1 - k) / 0.15 : 1;
      img.setPosition(w.x, w.y).setScale((w.r * 2) / TEX_D).setAlpha(a * 0.9);
      img.rotation -= dt * (w.mode === 'void' || w.mode === 'hole' ? 3 : 7);
      // урон
      this.cur = w; this.curTick = tick;
      W.enemies.grid.query(w.x, w.y, w.r * 0.85, this.onHit);
    }
  }

  private texFor(m: Mode) { return m === 'void' || m === 'hole' || m === 'orbit' ? TEX_VOID : TEX; }

  private cur: Wind | null = null;
  private curTick = 0.3;
  private onHit = (e: Enemy) => {
    const w = this.cur!;
    if (!w.gate.ok(e.id, this.clock, this.curTick)) return;
    let d = this.dmg;
    if (w.mode === 'super') d *= 1 + w.t;                                  // множитель растёт со временем следования
    if (w.mode === 'hole') d *= 3 * this.count * W.stats.durMul;           // ×3 за вихрь и от темпа длительности
    if (w.mode === 'hole') W.enemies.stun(e, 0.3);
    const dx = w.x - e.x, dy = w.y - e.y, dl = Math.hypot(dx, dy) || 1;
    W.enemies.damage(e, d, (dx / dl) * 8, (dy / dl) * 8, this.def.id);      // слегка затягивает внутрь
  };

  private steer(w: Wind, tx: number, ty: number, speed: number, dt: number) {
    const dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, dt * 3);
    w.vx += ((dx / d) * speed - w.vx) * k;
    w.vy += ((dy / d) * speed - w.vy) * k;
  }

  /** 462: заряды из сжимающейся сферы */
  private shoot(w: Wind, dt: number) {
    w.shotT -= dt;
    if (w.shotT > 0) return;
    w.shotT = 0.3;
    const a = Math.random() * Math.PI * 2, sp = 200;
    W.projectiles.fire({
      src: this.def.id, x: w.x, y: w.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      dmg: this.dmg * 0.5, r: 4, life: 0.5, tex: 'spark', size: 10, tint: 0xbfe0ff, pierce: 0, knock: 10,
    });
  }

  private kill(i: number) {
    const w = this.winds[i];
    if (w.img) this.pool.put(w.img);
    w.img = null;
    this.winds[i] = this.winds[this.winds.length - 1]; this.winds.pop();
    this.spare.push(w);
  }

  private add(mode: Mode, x: number, y: number, vx: number, vy: number, r0: number, life: number, delay = 0, ang = 0) {
    const w = this.spare.pop() ?? { gate: new HitGate() } as Wind;
    w.gate.clear();
    Object.assign(w, { mode, x, y, vx, vy, t: 0, life, delay, r0, r: r0, ang, shotT: 0.15, img: null, tgt: null });
    if (delay <= 0) {
      w.delay = 0;
      w.img = this.pool.get(this.texFor(mode), DEPTH.zone, mode !== 'void' && mode !== 'hole' && mode !== 'orbit').setAlpha(0);
      if (this.hasProp(462)) w.img.setTint(0xcfe4ff);
    }
    this.winds.push(w);
  }

  private cast() {
    const P = W.player;
    const n = this.count;
    const r0 = 16 * this.sizeMul;
    const life = this.durSec;

    if (this.hasCombo(10)) { this.add('orbit', P.x + 60, P.y, 0, 0, r0, life, 0, 0); return; }
    if (this.hasCombo(14)) { this.add('neutron', P.x, P.y, 0, 0, r0 * (1 + 0.25 * n), life); return; }
    if (this.hasCombo(39)) { this.add('super', P.x, P.y, 0, 0, r0 * (1 + 0.2 * n), life); return; }
    if (this.hasCombo(50)) { const p = randomViewPoint(60); this.add('hole', p.x, p.y, 0, 0, r0, life); return; }
    if (this.hasCombo(25)) {
      // в четыре стороны, 3 раза подряд
      for (let b = 0; b < 3; b++) for (let j = 0; j < 4; j++) {
        const a = (j * Math.PI) / 2 + b * (Math.PI / 4);
        this.add('typhoon', P.x, P.y, Math.cos(a), Math.sin(a), r0, life, b * 0.35);
      }
      return;
    }
    if (this.hasProp(463)) {
      for (let i = 0; i < n; i++) { const p = randomViewPoint(40); this.add('void', p.x, p.y, 0, 0, r0, life, i * 0.2); }
      return;
    }
    // каждый вихрь сразу берёт свою цель — ближайших врагов на экране по очереди (нет врагов — случайная сторона)
    const ts = W.enemies.nearestN(P.x, P.y, n, aimR());
    for (let i = 0; i < n; i++) {
      const e = ts.length ? ts[i % ts.length] : null;
      const a = e ? Math.atan2(e.y - P.y, e.x - P.x) : Math.random() * Math.PI * 2;
      this.add('seek', P.x + Math.cos(a) * 12, P.y + Math.sin(a) * 12, Math.cos(a) * 40, Math.sin(a) * 40, r0, life);
      this.winds[this.winds.length - 1].tgt = e;
    }
  }
}

export const CYCLONE = defFromData(SPELL_BY_ID[12], (def) => new Cyclone(def, SPELL_BY_ID[12]));
