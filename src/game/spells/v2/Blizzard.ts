import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { areaDamage } from '../../Projectiles';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { Later, SkyFx, ringDamage } from './_skyfx';
import { RING_K, ensureInkBlizzard, freezeOnly } from './_inkfx';

/** радиус разрыва одной льдинки */
const R0 = 22;
/** радиус области, где падают льдинки (вокруг мага) */
const AREA = 150;
/** базовый интервал появления льдинок, с (стат interval): 20 шт ≈ 2 с метели */
const GAP = 0.1;
/** шанс заморозки при попадании */
const FREEZE_CHANCE = 0.3;
/** направление падения: круто вниз-вправо */
const FALL_A = (70 * Math.PI) / 180;

/**
 * #17 Метель → «Ледяная буря». Раз в КД начинается метель: count ледяных осколков с интервалом падают
 * вокруг мага (без меток на земле), разрыв, шанс заморозки (W.enemies.freeze).
 * Свойства: 506 Лютый холод (пока идёт метель — все враги −3%/с скорости), 507 Падающая звезда (крупные медленные звёзды),
 * 508 Пожар (каждый осколок взрывается 2 раза, −10% мощности, без заморозки).
 * Слияния (основа): 12 Поджог эфира, 15 Зимний шторм, 51 Бытие.
 */
class Blizzard extends DataSpell {
  private fx = new SkyFx();
  private later = new Later();
  private left = 0;
  private next = 0;
  private stormT = 0;
  private slowAcc = 0;
  // заморозка без корки на мобе: подсветку даёт Enemies.freeze
  private freezeCb = (e: Enemy) => { if (Math.random() < FREEZE_CHANCE) freezeOnly(e, this.durSec); };

  destroy() { this.fx.destroy(); this.later.clear(); }

  /** тинт поверх штриховых текстур _inkfx: лёд — без тинта, Пожар — тёплый */
  private get color() { return this.hasProp(508) ? 0xffb080 : 0xffffff; }

  update(dt: number) {
    ensureInkBlizzard();
    this.fx.update(dt);
    this.later.update(dt);

    if (this.hasCombo(51)) {
      // 51 Бытие: КД делится на число льдинок, интервал появления = КД — непрерывный поток звёзд
      if (this.ready(dt, this.cdSec / this.count)) this.shard();
      return;
    }

    if (this.readyData(dt)) { this.left += this.count; if (this.next < 0) this.next = 0; }
    if (this.left > 0) {
      this.next -= dt;
      const gap = Math.max(0.02, this.stat('interval', GAP));
      while (this.next <= 0 && this.left > 0) { this.shard(); this.left--; this.next += gap; }
    }

    // 506 Лютый холод: пока метель идёт, скорость всех врагов падает на 3% в секунду; потом сбрасывается
    const active = this.left > 0 || this.later.size > 0;
    if (active && this.hasProp(506)) {
      this.stormT += dt;
      this.slowAcc -= dt;
      if (this.slowAcc <= 0) {
        this.slowAcc = 0.4;
        const k = Math.min(0.6, 0.03 * Math.ceil(this.stormT));
        for (const e of W.enemies.list) if (e.alive) W.enemies.slow(e, k, 0.5);
      }
    } else { this.stormT = 0; this.slowAcc = 0; }
  }

  /** Одна льдинка: тёмная игла со светлыми кромками падает по косой (без меток на земле) */
  private shard() {
    const P = W.player, size = this.sizeMul;
    const star = this.hasProp(507);
    const r = R0 * size;
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * AREA * size;
    const x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d;
    const fall = star ? 0.75 : 0.28, L = 220;
    const vx = (Math.cos(FALL_A) * L) / fall, vy = (Math.sin(FALL_A) * L) / fall;
    const tint = this.color;
    this.fx.spawn(star ? 'ink_icestar' : 'ink_needle', {
      x: x - vx * fall, y: y - vy * fall, vx, vy, w: star ? r * 1.8 : 40 * Math.sqrt(size), life: fall, a0: 1, a1: 1,
      rot: star ? Math.random() * 6.28 : FALL_A, spin: star ? 3 : 0, tint, add: star, depth: DEPTH.top,
    });
    const dmg = this.dmg;
    this.later.add(fall, () => this.burstAt(x, y, r, dmg));
  }

  /** Разрыв: 508 — дважды (−10%), 12 — каждый взрыв делится на два */
  private burstAt(x: number, y: number, r: number, dmg: number) {
    if (this.hasProp(508)) {
      this.explode(x, y, r, dmg, false);
      this.later.add(0.18, () => this.explode(x, y, r, dmg * 0.9, false));
      return;
    }
    this.explode(x, y, r, dmg, true);
  }

  private explode(x: number, y: number, r: number, dmg: number, freeze: boolean) {
    if (this.hasCombo(12)) {
      // 12 Поджог эфира: взрыв раздваивается
      const a = Math.random() * Math.PI, ox = Math.cos(a) * r * 0.7, oy = Math.sin(a) * r * 0.7;
      this.blast(x + ox, y + oy, r, dmg, freeze);
      this.blast(x - ox, y - oy, r, dmg, freeze);
      return;
    }
    this.blast(x, y, r, dmg, freeze);
  }

  private blast(x: number, y: number, r: number, dmg: number, freeze: boolean) {
    const src = this.def.id, tint = this.color, cb = freeze ? this.freezeCb : undefined;
    if (this.hasCombo(15)) {
      // 15 Зимний шторм: взрыв расширяется в 3 тика
      ringDamage(x, y, 0, r, dmg, 20, src, cb);
      this.later.add(0.1, () => ringDamage(x, y, r, r * 1.5, dmg, 20, src, cb));
      this.later.add(0.2, () => ringDamage(x, y, r * 1.5, r * 2, dmg, 20, src, cb));
      // кольцо холода расходится под тики расширения (r → 2r)
      this.fx.spawn('ink_ring', { x, y, w: r * RING_K, w1: r * 2 * RING_K, life: 0.3, a0: 0.85, a1: 0, hold: true, tint: 0xcfeaff });
    } else if (cb) ringDamage(x, y, 0, r, dmg, 20, src, cb);
    else areaDamage(x, y, r, dmg, 20, src);
    // разрыв: маленький штриховой венец осколков быстро раскрывается и гаснет
    const rot = Math.random() * Math.PI * 2;
    this.fx.spawn((Math.random() * 2) | 0 ? 'ink_frost1' : 'ink_frost0', { x, y, w: r * 1.0, w1: r * 2.2, life: 0.3, a0: 1, a1: 0, hold: true, tint, rot });
  }
}

export const BLIZZARD = defFromData(SPELL_BY_ID[17], (def) => new Blizzard(def, SPELL_BY_ID[17]));
