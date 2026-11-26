import Phaser from 'phaser';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { boxDamage, Co, OrigBullets, PX, TICK, U } from './_orig';

/** UnitApply_ShootingRange: цель дальше 23 ед. (взвешенно) — шар не вылетает */
const RANGE = 23;
/** UnitBase_FireballMSpeed 80 × 0.1 = 8 (за тик 0.03 с снаряд проходит BulletSpeed·0.02 ед.) */
const MSPEED = 8;
/** Приоритет цели (боссы/эпики UnitID 41–46 ×0.5) */
const prio = (uid: number) => (uid >= 41 && uid <= 46 ? 0.5 : 1);
/** Чёрная смерть: ячейки 3×4 вокруг мага (ед., y вверх) */
const BD_X = [2, 0, -2], BD_Y = [4.5, 2, -2, -4.5];

// ——— текстуры-заглушки по меркам спрайтов (рисуем с Денисом позже) ———
const T = { ball: 'fb_ball', boom: 'fb_boom', gas: 'fb_gas', star: 'fb_star' };
/** готовые кадры шара (грузятся в GameScene.preload) */
const BALL = ['fb_ball_1', 'fb_ball_2', 'fb_ball_3'];
const seq = (pre: string, n: number) => Array.from({ length: n }, (_, i) => `${pre}_${String(i + 1).padStart(2, '0')}`);
/** кадры оригинала (холсты Unity: Explosion6 548², Explosion27 520², Bullet27 400×348) */
const EX6 = seq('Explosion6', 9), EX27 = seq('Explosion27', 8), B27 = seq('Bullet27', 3);
/** Газ и Созвездие: взрывы 52 / 75–77 — кадры оригинала; снаряды и дымки сглажены ×4 (smooth_small.py) → масштаб /4 */
const EX52 = seq('Explosion52', 14), EX75 = [75, 76, 77].map((n) => seq(`Explosion${n}`, 8));
const B52 = 'Bullet52_01_s', B75 = seq('Bullet75', 3).map((k) => k + '_s');
const SM52 = seq('BulletSmoke52', 3).map((k) => k + '_s'), SM75 = seq('BulletSmoke75', 3).map((k) => k + '_s');
/** цвет облака газа со 2-го кадра (Explosion52_Animation_B @0x11a7950) */
const GAS_TINT = 0x40db14;
/** во сколько раз текстура меньше спрайта оригинала */
const K_BALL = 4, K_BOOM = 4, K_STAR = 1;

/** scene — для галереи (там нет W.scene) */
export function textures(scene: Phaser.Scene = W.scene) {
  const tx = scene.textures;
  const make = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    if (tx.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g); g.generateTexture(key, w, h); g.destroy();
  };
  // Bullet6 520×300 (рисуем 130×75): по замеру кадра шар с языками ≈60 % ширины справа от центра, вокруг — бледное красное свечение
  make(T.ball, 130, 75, (g) => {
    g.fillStyle(0xff3030, 0.08); g.fillEllipse(68, 37, 124, 70);
    g.fillStyle(0xff3030, 0.14); g.fillEllipse(72, 37, 96, 50);
    g.fillStyle(0xe8201a, 1); g.fillEllipse(68, 38, 70, 24);
    for (const [x, y, w] of [[28, 31, 14], [24, 40, 12], [34, 46, 10], [40, 26, 8]]) g.fillRect(x, y, w, 2);
    g.fillStyle(0xffb020, 1); g.fillEllipse(78, 37, 50, 28);
    g.fillStyle(0xffeab0, 1); g.fillEllipse(88, 36, 30, 26);
  });
  // Explosion6 548 (рисуем 137): кольцо оранжевых «капель», видимая часть ≈55 % холста
  make(T.boom, 137, 137, (g) => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r = 28 + (i % 3) * 3;
      g.fillStyle(i % 2 ? 0xff8a2a : 0xffc050, 1); g.fillCircle(68.5 + Math.cos(a) * r, 68.5 + Math.sin(a) * r, 5 + (i % 3) * 1.5);
    }
    g.fillStyle(0xfff0c0, 0.35); g.fillCircle(68.5, 68.5, 18);
  });
  // Explosion52 (газ): белый мягкий диск, красится в зелёный
  make(T.gas, 128, 128, (g) => {
    for (let i = 0; i < 6; i++) { g.fillStyle(0xffffff, 0.12 + i * 0.08); g.fillCircle(64, 64, 62 - i * 9); }
  });
  // Bullet75 88 px: звёздочка-огонёк
  make(T.star, 88, 88, (g) => {
    g.fillStyle(0xffb040, 0.3); g.fillCircle(44, 44, 30);
    g.fillStyle(0xffe0a0, 1); g.fillCircle(44, 44, 14);
    g.fillStyle(0xffffff, 1); g.fillTriangle(44, 8, 50, 44, 38, 44); g.fillTriangle(44, 80, 50, 44, 38, 44);
    g.fillTriangle(8, 44, 44, 38, 44, 50); g.fillTriangle(80, 44, 44, 38, 44, 50);
  });
}

interface Boom { x: number; y: number; t: number; hits: Set<number>; dmg: number; half: number; times: number[]; next: number; grow: boolean; follow: boolean; ox: number; oy: number }

/**
 * #2 Огненный шар — 1:1 по коду оригинала (docs/orig/spells/fireball.md, карточка tasks/fireball.md):
 * Play_Fireball: wait 0.1 при старте; залп — Num шаров ОДНОВРЕМЕННО, каждый в свою цель (1-й, 2-й… ближайший,
 * d = (|dx|+|dy|)·приоритет ≤ 23 ед.; врагов меньше Num — лишние не вылетают); затем wait(PSpeed 1.5 с).
 * Шар: 5.33 ед/с (303 px/с), 81 тик, alpha 2.4 − t, без цели исчезает БЕЗ взрыва; хитбокс 0.275×0.306 ед.;
 * попадание → взрыв (ID 6): квадрат 2.4×0.7 = 1.68 ед. × Size, урон только в 1-й тик; картинка 548 px × 0.7.
 * Свойства: 371 Большой взрыв (1-й шар ×1.5 урон и размер), 372 Ядовитый газ (взрыв 52: рост, 3 удара 0/0.18/0.42 с),
 * 373 Созвездие (ID 75: пауза 0.1 с, случайное направление, шар едет с магом, 3.0 с, торможение 100/(100+11n)).
 * Слияния: 6 Уравнение демона (по кругу, пробой 999, 60 тиков, взрыв 26), 8 Пандемониум (рыщет, взрыв ×3 при исчезновении),
 * 46 Чёрная смерть (взрывы в ячейках 3×4 вокруг мага, 4 удара). Числа слияний — из библии, полностью — партия 6.
 */
class Fireball extends DataSpell {
  private bullets = new OrigBullets();
  private co: Co | null = null;
  private booms: Boom[] = [];
  private bdCell = 0;

  // ———— числа (StartInformation_B) ————
  /** Size = (100 + AreaU + MSizeU)% */
  private get size(): number { return Math.round(100 + this.pctOf('size') + W.stats.size * 100) / 100; }
  /** скорость, наших ед./с */
  private get speed(): number { return (MSPEED * this.speedMul * 0.02 / TICK) * U; }
  private get pSpeed(): number { return Math.max(0.05, this.cdOrig(this.data.base.cd ?? 1.5) * this.cdGlobal); }
  /** +1 от артефакта 138 Лук феникса (эффект 183) */
  private get pierce(): number { return Math.round(this.stat('pierce', 0) + (W.stats.artFx[183] ?? 0)); }
  private get num(): number { return this.count; }

  onChange() {
    super.onChange();
    textures();
    if (!this.co) this.co = new Co(this.loop());
  }

  destroy() {
    this.bullets.destroy();
    this.booms.length = 0;
    this.co = null;
  }

  update(dt: number) {
    if (!this.co) this.onChange();
    this.co!.update(dt);
    this.bullets.update(dt);
    this.updateBooms(dt);
  }

  // ———— Play_Fireball ————
  private *loop(): Generator<number, void, unknown> {
    yield 0.1;
    for (;;) {
      if (this.hasCombo(46)) { yield* this.blackDeath(); yield this.pSpeed; continue; }
      if (this.hasCombo(6)) { this.demonEq(); yield this.pSpeed; continue; }
      if (!this.hasCombo(8) && this.hasProp(373)) {
        // Play_IsConstellation: шары по одному через 0.1 с, цель не выбирается
        if (!W.enemies.list.some((e) => e.alive)) { yield 0.1; continue; }
        for (let i = 1; i <= this.num; i++) {
          this.constellation(i);
          if (i < this.num) yield 0.1;
        }
        yield this.pSpeed;
        continue;
      }
      const P = W.player;
      const list = W.enemies.list.filter((e) => e.alive)
        .map((e) => ({ e, d: ((Math.abs(e.x - P.x) + Math.abs(e.y - P.y)) / U) * prio(e.type.uid) }))
        .sort((a, b) => a.d - b.d);
      if (!list.length) { yield 0.1; continue; }
      for (let i = 1; i <= this.num; i++) {
        const t = list[i - 1];
        if (!t || t.d > RANGE) break;
        const a = Math.atan2(t.e.y - P.y, t.e.x - P.x);
        // 8 Пандемониум: обычный Play_Fireball (залп в цели), пуля 27
        if (this.hasCombo(8)) this.pandemonium(a); else this.shoot(a, this.power(i));
      }
      yield this.pSpeed;
    }
  }

  /** Большой взрыв: шар с номером CastPowerNum (=1) — power 1.5 */
  private power(i: number) { return this.hasProp(371) && i === 1 ? 1.5 : 1; }

  /** Bullet_Create кейс 6 / 52: старт +0.4 ед. вперёд, 81 тик, взрыв при касании */
  private shoot(ang: number, power: number) {
    const P = W.player, S = this.size, gas = this.hasProp(372);
    const c = Math.cos(ang), s = Math.sin(ang);
    const dmg = this.dmg * power, area = S * power;
    this.bullets.fire({
      x: P.x + c * 0.4 * U, y: P.y + s * 0.4 * U, ang, sp: this.speed, life: 81 * TICK,
      // шар — нарисованные кадры Bullet6 (холст 340×224, «гладкий»), localScale (0.5, 0.45)·Size, 3 кадра по 0.06 с
      // газ (кейс 52): Bullet52_01, localScale 1.4·Size, дымок BulletSmoke52 каждые 0.06 с (Play_BulletSmoke)
      ...(gas
        ? { tex: B52, scaleX: 1.4 * S / 4, normal: true, smokeDt: 0.06, smokeFrames: SM52, smokeScale: PX / 4 }
        : { tex: BALL[0], frames: BALL, frameDt: 0.06, scaleX: 0.5 * S, scaleY: 0.45 * S, normal: true }),
      hl: (gas ? 10 : 0.1375 * U / PX) * PX * S, hw: (gas ? 4 : 0.153 * U / PX) * PX * S,
      pierce: this.pierce, dmg, src: this.def.id, alpha: (b) => 2.4 - b.t,
      onHit: (b, e) => { this.directHit(e, b.dmg); this.explode(b.x, b.y, b.dmg, area); return true; },
    });
  }

  /** 138 Лук феникса (эффект 198 = 50): прямое попадание ещё +50 % урона шара */
  private directHit(e: Enemy, dmg: number) {
    const r = (W.stats.artFx[198] ?? 0) / 100;
    if (r > 0) W.enemies.damage(e, dmg * r, 0, 0, this.def.id);
  }

  /** Созвездие (ID 75): направление — на случайную точку рамки, шар — дочерний объект мага, 100 тиков + 5 шагов гашения */
  private constellation(i: number) {
    const S = this.size, power = this.power(i), area = S * power;
    const ang = Math.random() * Math.PI * 2;
    const live = 100 * TICK, fade = 5 * TICK;
    this.bullets.fire({
      x: W.player.x, y: W.player.y, ang, sp: 0, life: live + fade,
      // Bullet75_01..03 по 0.06 с, дымок BulletSmoke75 раз в 6 тиков (0.18 с), первый на 5-м тике (Constellation_Moving)
      tex: B75[0], frames: B75, frameDt: 0.06, scaleX: 1.4 * S / 4, normal: true,
      smokeDt: 0.18, smoke0: 0.12, smokeFrames: SM75, smokeScale: PX / 4,
      hl: 0.175 * U * S, hw: 0.175 * U * S,
      pierce: this.pierce, dmg: this.dmg * power, src: this.def.id,
      data: { ox: 0, oy: 0, n: 0, acc: 0 },
      alpha: (b) => (b.t < live ? 1 : 1 - 0.2 * Math.floor((b.t - live) / TICK)),
      step: (b) => {
        const d = b.data;
        // тик 0.03 с: смещение BulletSpeed·0.02·0.6·100/(100+11n) ед.
        while (d.acc + TICK <= b.t && d.n < 100) {
          d.acc += TICK; d.n++;
          const v = MSPEED * this.speedMul * 0.02 * 0.6 * 100 / (100 + 11 * d.n) * U;
          d.ox += Math.cos(b.ang) * v; d.oy += Math.sin(b.ang) * v;
        }
        b.x = W.player.x + d.ox; b.y = W.player.y + d.oy;
      },
      // Bullet_Create кейс 75 передаёт ExplosionID 75 (C_Battle_AllyUnit.c:40371) — свой взрыв, не 6/52
      onHit: (b, e) => { this.directHit(e, b.dmg); this.explode75(b.x, b.y, b.dmg, area); return true; },
    });
  }

  /** ExplosionAttack 75 (C_Battle_AllyExplosion.c:26005): ID = Random.Range(75, 78), BaseScale 1.6, коллайдер 1.2,
   *  кадры Explosion75..77_01..08 по 0.06 с (Explosion_Animation) */
  private explode75(x: number, y: number, dmg: number, area: number) {
    const half = (1.2 * 1.6 * area / 2) * U;
    boxDamage(x, y, 0, half, half, dmg, this.def.id);
    W.fx.anim(x, y, EX75[Math.floor(Math.random() * 3)], 0.06, 0.06, 1.6 * area * PX);
  }

  /** Уравнение демона (ID 26): N шаров по кругу 360/N·k, без цели, пробой 999, 0.6·Speed ед/с, 60 тиков */
  private demonEq() {
    const P = W.player, n = this.num, S = this.size, dmg = this.dmg;
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2;
      this.bullets.fire({
        x: P.x, y: P.y, ang, sp: 0.6 * MSPEED * this.speedMul * U, life: 60 * TICK,
        tex: T.ball, scaleX: 0.5 * K_BALL * S, scaleY: 0.45 * K_BALL * S, tint: 0xd8a0ff,
        hl: 0.1375 * U * S, hw: 0.153 * U * S, pierce: 999, dmg, src: this.def.id,
        onHit: (b) => { this.explodeId(b.x, b.y, dmg, S, 0.25, 0.2, 2.65, 11 * 0.05, 0xd8a0ff); return true; },
      });
    }
  }

  /**
   * Пандемониум (ID 27, C_Battle_AllyBullet.c:19446): курс на цель, каждый тик pos += right·Speed·0.022 и
   * rotation.z += RotationRan (Random.Range(3, 8) — целое, один раз на шар); Apply_ExplosionID = 0 — при касании
   * не взрывается, прямой урон = Attack·FireballDirectDamageRatio (только арт. 138), пробой всех; коллайдер 1.35×1.05.
   * Жизнь = ConstellationTime·0.025 + 0.005, ConstellationTime = round(100·(100 + FireballTimeRatio + MTimeU)%).
   * В конце — ExplosionAttack 27, урон FirstAttack·3. FireballDamage ветки = (Pierce·3 + 4)·урон (StartInformation_B
   * @0x11da604) — ×4 уже пришло модом слияния (881), поэтому ×(3P + 4)/4.
   */
  private pandemonium(ang: number) {
    const P = W.player, S = this.size;
    const dmg = this.dmg * (this.pierce * 3 + 4) / 4;
    const ct = Math.round(100 + this.pctOf('duration') + W.stats.duration * 100);
    const life = ct * 0.025 + 0.005;
    const rot = (3 + Math.floor(Math.random() * 5)) * Math.PI / 180;
    const sy = S * 0.18 + 0.09;   // localScale.y (x — S·k + 0.1, k не прочитан: HOLES)
    this.bullets.fire({
      x: P.x, y: P.y, ang, sp: 0, life,
      // кадры Bullet27_01..03 по 0.06 с (счётчик кадров шагает раз в 2 тика); scale.x не прочитан (HOLES) — берём scale.y
      tex: B27[0], frames: B27, frameDt: 0.06, scaleX: sy, scaleY: sy, normal: true, src: this.def.id,
      hl: 0.675 * sy * U, hw: 0.525 * sy * U, pierce: 999, dmg: 0,
      onHit: (_b, e) => { this.directHit(e, dmg); return true; },
      data: { acc: 0 },
      step: (b) => {
        while (b.data.acc + TICK <= b.t) {
          b.data.acc += TICK;
          b.ang -= rot;   // Unity rotation.z += (против часовой) = на экране (y вниз) угол уменьшается
          const v = 0.022 * MSPEED * this.speedMul * U;
          b.x += Math.cos(b.ang) * v; b.y += Math.sin(b.ang) * v;
        }
      },
      // Explosion27_01..08: 1-й кадр 0.06 с, дальше по 0.035 с
      onEnd: (b) => this.explodeId(b.x, b.y, dmg * 3, S, 0.48, 0.5, 3.3, 8 * 0.035, 0xd8e4ff, [EX27, 0.06, 0.035]),
    });
  }

  /** Чёрная смерть (Explosion100): Num = floor(Num·(1+0.5·Pierce)), ячейки 3×4 вокруг мага ±0.2, пауза 0.2 с */
  private *blackDeath(): Generator<number, void, unknown> {
    const n = Math.floor(this.num * (1 + 0.5 * this.pierce)), S = this.size;
    for (let i = 0; i < n; i++) {
      const cell = this.bdCell++ % 12;
      const ox = (BD_X[cell % 3] + (Math.random() * 0.4 - 0.2)) * U;
      const oy = -(BD_Y[(cell / 3) | 0] + (Math.random() * 0.4 - 0.2)) * U;
      const half = (2.35 * 0.4 * S / 2) * U;
      this.addBoom(W.player.x + ox, W.player.y + oy, this.dmg * S, half, [0, 0.165, 0.39, 0.615], true, false, ox, oy);
      W.fx.puff(W.player.x + ox, W.player.y + oy, half * 2.4, 0x6619e6, 0.8, T.gas);
      if (i < n - 1) yield 0.2;
    }
  }

  // ———— взрывы ————
  /** Взрыв шара: ID 6 (или 52 при Ядовитом газе) */
  private explode(x: number, y: number, dmg: number, area: number) {
    if (this.hasProp(372)) {
      // Explosion52: BaseScale 0.75, коллайдер 2.15 ед., рост ×(1.03 − 0.001i) каждые 0.06 с, удары 0 / 0.18 / 0.42 с
      const half = (2.15 * 0.75 * area / 2) * U;
      this.addBoom(x, y, dmg, half, [0, 0.18, 0.42], true, false, 0, 0);
      // Explosion52_01..14 по 0.06 с (последний 0.03), localScale Area·0.75, рост ×(1.03 − 0.001i) каждые 0.06 с (26 шагов),
      // белый 1–2-й кадр, дальше зелёный (0.25, 0.86, 0.08)
      const s0 = 0.75 * area * PX;
      W.fx.anim(x, y, EX52, 0.06, 0.06, s0, s0, {
        last: 0.03,
        hook: (img, t, n) => {
          let k = 1;
          for (let i = 0, steps = Math.min(26, Math.floor(t / 0.06)); i < steps; i++) k *= 1.03 - 0.001 * i;
          img.setScale(s0 * k);
          if (n >= 2) img.setTint(GAS_TINT); else img.clearTint();
        },
      });
      return;
    }
    const half = (1.68 * area / 2) * U;
    boxDamage(x, y, 0, half, half, dmg, this.def.id);
    // Explosion6_01..09 по 0.06 с, localScale = Area·0.7
    W.fx.anim(x, y, EX6, 0.06, 0.06, 0.7 * area * PX);
  }

  /** Взрыв слияния: квадрат коллайдер × (Area·BaseScale + Plus), урон один раз; anim — кадры оригинала [кадры, 1-й кадр с, шаг с] */
  private explodeId(x: number, y: number, dmg: number, area: number, base: number, plus: number, coll: number, life: number, tint: number,
    anim?: [string[], number, number]) {
    const half = (coll * (area * base + plus) / 2) * U;
    boxDamage(x, y, 0, half, half, dmg, this.def.id);
    if (anim) W.fx.anim(x, y, anim[0], anim[1], anim[2], (area * base + plus) * PX);
    else W.fx.puff(x, y, half * 2.3, tint, life, T.boom);
  }

  /** Многократный взрыв: удары в моменты times, список задетых очищается перед каждым */
  private addBoom(x: number, y: number, dmg: number, half: number, times: number[], grow: boolean, follow: boolean, ox: number, oy: number) {
    this.booms.push({ x, y, t: 0, hits: new Set(), dmg, half, times, next: 0, grow, follow, ox, oy });
  }

  private updateBooms(dt: number) {
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      b.t += dt;
      while (b.next < b.times.length && b.t >= b.times[b.next]) {
        b.next++;
        // рост ×(1.03 − 0.001·i) каждые 0.06 с
        let k = 1;
        if (b.grow) { const n = Math.min(26, Math.floor(b.t / 0.06)); for (let j = 0; j < n; j++) k *= 1.03 - 0.001 * j; }
        b.hits.clear();
        const x = b.follow ? W.player.x + b.ox : b.x, y = b.follow ? W.player.y + b.oy : b.y;
        boxDamage(x, y, 0, b.half * k, b.half * k, b.dmg, this.def.id, b.hits);
      }
      if (b.next >= b.times.length) { this.booms[i] = this.booms[this.booms.length - 1]; this.booms.pop(); }
    }
  }
}

export const FIREBALL = defFromData(SPELL_BY_ID[2], (def) => new Fireball(def, SPELL_BY_ID[2]));

