import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { areaDamage } from '../../Projectiles';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { Later, SkyFx, freezeCrust, ringDamage } from './_skyfx';

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
 * вокруг мага (короткий телеграф — круг на земле), разрыв, шанс заморозки (W.enemies.freeze).
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
  private freezeCb = (e: Enemy) => { if (Math.random() < FREEZE_CHANCE) freezeCrust(this.fx, e, this.durSec); };

  destroy() { this.fx.destroy(); this.later.clear(); }

  private get color() { return this.hasProp(508) ? 0xff7a3a : this.hasProp(507) ? 0xe8f4ff : 0xbfdcff; }

  update(dt: number) {
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

  /** Одна льдинка: падает по косой, на земле — круг-телеграф */
  private shard() {
    const P = W.player, size = this.sizeMul;
    const star = this.hasProp(507);
    const r = R0 * size;
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * AREA * size;
    const x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d;
    const fall = star ? 0.75 : 0.28, L = 220;
    const vx = (Math.cos(FALL_A) * L) / fall, vy = (Math.sin(FALL_A) * L) / fall;
    const tint = this.color;
    this.fx.spawn('ring', { x, y, w: r * 2.2, w1: r * 1.6, a0: 0.15, a1: 0.5, life: fall, tint });
    this.fx.spawn(star ? 'fx_blizzard_star' : 'fx_blizzard_shard', {
      x: x - vx * fall, y: y - vy * fall, vx, vy, w: star ? r * 3 : 38 * Math.sqrt(size), life: fall, a0: 0.95, a1: 0.95,
      rot: FALL_A - Math.PI / 4, tint: this.hasProp(508) ? tint : 0xffffff, depth: DEPTH.top,
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
      this.fx.spawn('ring', { x, y, w: r * 1.5, w1: r * 4.4, life: 0.35, a0: 0.9, a1: 0, tint });
    } else if (cb) ringDamage(x, y, 0, r, dmg, 20, src, cb);
    else areaDamage(x, y, r, dmg, 20, src);
    this.fx.spawn('fx_frostnova_ring', { x, y, w: r * 0.8, w1: r * 2.4, life: 0.3, a0: 0.9, a1: 0, tint, rot: Math.random() * 6.28 });
    this.fx.spawn('blast', { x, y, w: r * 0.6, w1: r * 1.6, life: 0.2, a0: 0.8, a1: 0, tint });
  }
}

export const BLIZZARD = defFromData(SPELL_BY_ID[17], (def) => new Blizzard(def, SPELL_BY_ID[17]));
