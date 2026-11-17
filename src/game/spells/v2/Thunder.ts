
import { SPELL_BY_ID } from '../../../data/spells_data';
import { areaDamage } from '../../Projectiles';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { aimR } from './_proj';
import { Later, SkyFx, randomInView, ringDamage } from './_skyfx';
import { MAGE_H } from './_linefx';
import { GA, ensureGroupA } from './_groupA';

/** ширина молнии с неба (по текстуре 96×384 при высоте ~11 ростов мага) */
const SKY_W = 4.2 * MAGE_H;

/** базовый радиус взрыва молнии у земли (игровые единицы) */
const R0 = 28;
/** короткая задержка перед ударом, с */
const TELE = 0.05;

/**
 * #7 Молния → «Гнев туч». Раз в КД count молний бьют в ближайших врагов (у земли — взрыв и выжженное пятно).
 * Свойства: 416 Гром среди ясного неба (каждая молния бьёт 1–3 раза подряд), 417 Грозовой взрыв
 * (случайные точки одна за другой, взрыв расширяется 3 тика), 418 Суд (одна большая молния, рядом — половина урона).
 * Слияния (основа): 1 Гнев небес, 13 Орбитальная бомбардировка, 17 Взрыв молний, 52 Астрапе.
 */
class Thunder extends DataSpell {
  private fx = new SkyFx();
  private later = new Later();

  destroy() { this.fx.destroy(); this.later.clear(); }

  private get color() {
    // магия светлая: свойства лишь слегка окрашивают белую молнию
    if (this.hasProp(416)) return 0xc4d6ff;
    if (this.hasProp(417)) return 0xb8f0e6;
    if (this.hasProp(418)) return 0xfff0c8;
    return 0xf4f0ff;
  }

  update(dt: number) {
    this.fx.update(dt);
    this.later.update(dt);
    if (this.readyData(dt)) { ensureGroupA(); this.cast(); }
  }

  private cast() {
    const P = W.player;
    const n = this.count, dmg = this.dmg, size = this.sizeMul;
    let R = R0 * size;

    // 418 Суд: все молнии сливаются в одну, +20% размера за каждую
    if (this.hasProp(418)) {
      const t = W.enemies.nearest(P.x, P.y, aimR());
      if (!t) return;
      R *= 1 + 0.2 * n;
      this.strike(t.x, t.y, R, dmg, 0, 'judg');
      return;
    }

    // слияние 17 «Взрыв молний»: 5 волн подряд по случайным местам, каждая на 30% шире и многочисленнее
    if (this.hasCombo(17)) {
      for (let k = 0; k < 5; k++) {
        const m = Math.round(n * 1.3 ** k), rad = 110 * 1.3 ** k;
        for (let j = 0; j < m; j++) {
          const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * rad;
          this.strike(P.x + Math.cos(a) * d, P.y + Math.sin(a) * d, R, dmg, k * 0.3 + j * 0.025, 'plain');
        }
      }
      return;
    }

    // 417 Грозовой взрыв: одна за другой в случайных местах, взрыв расширяется
    if (this.hasProp(417)) {
      const wrath = this.hasCombo(1);              // 1 Гнев небес: радиус больше, но без расширения
      const mode = wrath ? 'plain' : 'expand';
      const r = wrath ? R * 1.8 : R;
      if (this.hasCombo(13)) {
        // 13 Орбитальная бомбардировка: молнии быстро сыплются вокруг выбранной точки
        const t = W.enemies.nearest(P.x, P.y, aimR());
        const cx = t ? t.x : P.x, cy = t ? t.y : P.y;
        for (let j = 0; j < n; j++) {
          const a = Math.random() * Math.PI * 2, d = Math.random() * 45 * size;
          this.strike(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, dmg, j * 0.06, mode);
        }
        return;
      }
      for (let j = 0; j < n; j++) {
        const p = randomInView(30);
        this.strike(p.x, p.y, r, dmg, j * (wrath ? 0.05 : 0.12), mode);
      }
      return;
    }

    // база: ближайшие враги; 416 — каждая молния бьёт 1–3 раза подряд
    const targets = W.enemies.nearestN(P.x, P.y, n, aimR());
    targets.forEach((e, j) => {
      const reps = this.hasProp(416) ? 1 + ((Math.random() * 3) | 0) : 1;
      for (let k = 0; k < reps; k++) {
        const ox = k ? (Math.random() - 0.5) * R : 0, oy = k ? (Math.random() - 0.5) * R : 0;
        this.strike(e.x + ox, e.y + oy, R, dmg, j * 0.05 + k * 0.2, 'plain');
      }
    });
  }

  /** Удар молнии: короткая задержка (серия) → вспышка, урон. Без телеграфа-кольца. */
  private strike(x: number, y: number, R: number, dmg: number, delay: number, mode: 'plain' | 'expand' | 'judg') {
    const tint = this.color;
    this.later.add(delay + TELE, () => this.hit(x, y, R, dmg, mode, tint));
  }

  private hit(x: number, y: number, R: number, dmg: number, mode: 'plain' | 'expand' | 'judg', tint: number) {
    const src = this.def.id;
    const big = mode === 'judg';
    // одна белая ломаная молния от верхнего края экрана до точки удара (низ картинки — в точке)
    const k = Math.min(2, Math.max(0.8, R / R0)) * (big ? 1.6 : 1);
    const top = W.scene.cameras.main.worldView.y;
    const h = Math.max(8 * MAGE_H, y - top + 20);
    const bw = SKY_W * k;
    const f0 = (Math.random() * 3) | 0, f1 = (f0 + 1 + ((Math.random() * 2) | 0)) % 3;
    // два кадра подряд — молния «дрожит» (мерцание 2 кадра)
    this.fx.spawn(GA.sky[f0], { x, y, w: bw, h, ox: 0.5, oy: 1, life: 0.08, a0: 1, a1: 1, tint });
    this.fx.spawn(GA.sky[f1], { x, y, w: bw, h, ox: 0.5, oy: 1, life: 0.16, delay: 0.08, a0: 1, a1: 0, hold: true, tint });
    // короткая вспышка-клякса на земле
    this.fx.spawn(GA.splat[(Math.random() * 2) | 0], { x, y, w: R * 2.4, life: 0.24, a0: 1, a1: 0, tint, rot: Math.random() * 6.28 });

    if (mode === 'expand') {
      // 3 тика: R → 1.5R → 2R, каждый бьёт только новых
      areaDamage(x, y, R, dmg, 40, src);
      this.later.add(0.1, () => ringDamage(x, y, R, R * 1.5, dmg, 40, src));
      this.later.add(0.2, () => ringDamage(x, y, R * 1.5, R * 2, dmg, 40, src));
      return;
    }
    areaDamage(x, y, R, dmg, 40, src);
    if (big) {
      W.scene.cameras.main.shake(120, 0.004);
      if (this.hasCombo(52)) {
        // 52 Астрапе: ударная волна — половина урона и оглушение вокруг
        ringDamage(x, y, R, R * 3, dmg * 0.5, 120, src, (e) => W.enemies.stun(e, 1.5));
      } else {
        // Суд: враги рядом с местом удара получают половину урона
        ringDamage(x, y, R, R * 2, dmg * 0.5, 60, src);
      }
    }
  }
}

export const THUNDER = defFromData(SPELL_BY_ID[7], (def) => new Thunder(def, SPELL_BY_ID[7]));
