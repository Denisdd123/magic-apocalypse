import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { HitGate, ImgPool, randomViewPoint } from './_zoneKit';
import { LAVA_D, ensureDarkTex } from './_darkfx';

/**
 * Лужа — пиксельная магма из _darkfx в 2 кадрах (dk_lava0/1): тёмная корка, тлеющие трещины, пузыри.
 * Кадры меняются рывком раз в FRAME_SEC. fx_lava_wave — дуга фронта (выпуклостью вниз) для C56.
 */
const POOL_TEX = ['dk_lava0', 'dk_lava1'], POOL_D = LAVA_D;
const FRAME_SEC = 0.32;
const WAVE_TEX = 'fx_lava_wave', WAVE_D = 153;

interface Pool {
  x: number; y: number; vx: number; vy: number;
  r0: number; r: number; t: number; life: number;
  img: Phaser.GameObjects.Image; front: Phaser.GameObjects.Image | null;
}

/**
 * #20 Лавовая область → «Кипящая земля». Лужи лавы у врагов на экране, тик 0.5 с, длительность 6 с;
 * перезарядка начинается после окончания всех луж. Урон одному врагу — не чаще тика (общие ворота).
 * Свойства: 533 Плавление (каждый тик +5% к урону лавы по этому врагу, до stat effect = 30%),
 * 534 Кратер (чистые моды), 535 Излияние магмы (одна лужа, +30% размера за каждую).
 * Слияния (основа): C21 Доменная печь (лужа растёт, урон ∝ размеру), C56 Эра Солнца (лужи во все стороны и движутся).
 */
class Lava extends DataSpell {
  private pools: Pool[] = [];
  private pool = new ImgPool();
  private gate = new HitGate();
  private melt = new Map<number, number>(); // id врага → число наложений Плавления
  private clock = 0;
  private tickAcc = 0;

  destroy() {
    for (const p of this.pools) { this.pool.put(p.img); if (p.front) this.pool.put(p.front); }
    this.pools.length = 0;
    this.pool.destroy();
  }

  update(dt: number) {
    ensureDarkTex();
    this.clock += dt;
    // КД идёт только когда луж нет (оригинал: «5 с после окончания»)
    if (!this.pools.length && this.readyData(dt)) this.cast();
    if (!this.pools.length) return;

    this.tickAcc += dt;
    const tick = this.tickSec;
    const doTick = this.tickAcc >= tick;
    if (doTick) this.tickAcc -= tick;

    for (let i = this.pools.length - 1; i >= 0; i--) {
      const p = this.pools[i];
      p.t += dt;
      if (p.t >= p.life) {
        this.pool.put(p.img); if (p.front) this.pool.put(p.front);
        this.pools[i] = this.pools[this.pools.length - 1]; this.pools.pop();
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (this.hasCombo(21)) p.r = p.r0 * (1 + p.t * 0.3); // Доменная печь: растёт
      // картинка: проявляется, гаснет; кадр корки меняется рывком (без «дыхания» — не песок)
      const k = p.t / p.life;
      const a = k < 0.06 ? k / 0.06 : k > 0.88 ? (1 - k) / 0.12 : 1;
      const tex = POOL_TEX[((p.t / FRAME_SEC) | 0) & 1];
      if (p.img.texture.key !== tex) p.img.setTexture(tex);
      p.img.setPosition(p.x, p.y).setScale((p.r * 2) / POOL_D).setAlpha(a * 0.95);
      if (p.front) {
        const ang = Math.atan2(p.vy, p.vx);
        p.front.setPosition(p.x + Math.cos(ang) * p.r * 0.7, p.y + Math.sin(ang) * p.r * 0.7)
          .setRotation(ang - Math.PI / 2).setScale((p.r * 1.6) / WAVE_D).setAlpha(a);
      }
      if (doTick) this.burn(p);
    }
    if (doTick) this.gate.prune(this.clock, 3);
  }

  private cast() {
    this.tickAcc = this.tickSec; // первый тик сразу
    const n = this.count;
    let r = 34 * this.sizeMul;
    const life = this.durSec;
    const P = W.player;

    if (this.hasCombo(56)) {
      // Эра Солнца: одновременно во все стороны, движутся от мага
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
        this.spawn(P.x, P.y, Math.cos(a) * 55, Math.sin(a) * 55, r, life, true);
      }
      return;
    }
    if (this.hasProp(535)) {
      // Излияние магмы: одна лужа, +30% размера за каждую
      r *= 1 + 0.3 * n;
      const t = W.enemies.nearest(P.x, P.y, 220);
      this.spawn(t ? t.x : P.x, t ? t.y : P.y, 0, 0, r, life, false);
      return;
    }
    // обычные: у случайных врагов на экране (если их нет — в случайной точке экрана)
    for (let i = 0; i < n; i++) {
      const e = W.enemies.randomVisible();
      const pt = e ? e : randomViewPoint(40);
      this.spawn(pt.x, pt.y, 0, 0, r, life, false);
    }
  }

  private spawn(x: number, y: number, vx: number, vy: number, r: number, life: number, moving: boolean) {
    // поворот кратен 90° — у разных луж разный рисунок трещин, пиксели не плывут
    const img = this.pool.get(POOL_TEX[0], DEPTH.zone, false).setPosition(x, y).setAlpha(0)
      .setRotation(((Math.random() * 4) | 0) * (Math.PI / 2));
    if (this.hasProp(533)) img.setTint(0xffc4b4); // Плавление: корка чуть краснее
    const front = moving ? this.pool.get(WAVE_TEX, DEPTH.zone).setAlpha(0).setTint(0xb06040) : null;
    this.pools.push({ x, y, vx, vy, r0: r, r, t: 0, life, img, front });
  }

  // параметры текущего тика (без замыканий в цикле)
  private bDmg = 0;
  private onBurn = (e: Enemy) => {
    if (!this.gate.ok(e.id, this.clock, this.tickSec * 0.9)) return;
    let d = this.bDmg;
    if (this.hasProp(533)) {
      // Плавление: +5% за каждый полученный тик, до stat effect (30%)
      const st = this.melt.get(e.id) ?? 0;
      d *= 1 + Math.min(st * 0.05, this.stat('effect', 0) / 100);
      this.melt.set(e.id, st + 1);
    }
    W.enemies.damage(e, d, 0, 0, this.def.id);
  };

  private burn(p: Pool) {
    let d = this.dmg;
    if (this.hasCombo(21)) d *= p.r / p.r0;                // урон ∝ размеру
    if (this.hasCombo(56)) d *= Math.max(1, 3 * p.t);      // множитель растёт на 3 в секунду
    this.bDmg = d;
    W.enemies.grid.query(p.x, p.y, p.r * 0.9, this.onBurn);
    if (this.melt.size > 600) this.melt.clear();
    if (Math.random() < 0.35) W.fx.sparks(p.x + (Math.random() - 0.5) * p.r, p.y + (Math.random() - 0.5) * p.r, 1, 0xa8461a, 30);
  }
}

export const LAVA = defFromData(SPELL_BY_ID[20], (def) => new Lava(def, SPELL_BY_ID[20]));
