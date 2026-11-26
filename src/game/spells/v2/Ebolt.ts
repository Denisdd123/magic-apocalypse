import { SPELL_BY_ID } from '../../../data/spells_data';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { boxDamage, Co, OrigBullets, PX, U, type OBullet } from './_orig';

const DEG = Math.PI / 180;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** UnitApply_ShootingRange */
const RANGE = 23;
/** DSpeed — пауза между пулями залпа */
const DSPEED = 0.07;
/** тик MovingA */
const TK = 0.03;
/** дочерний Sprite_EnergyBullet scale 0.6 */
const CHILD = 0.6;
const prio = (uid: number) => (uid >= 41 && uid <= 46 ? 0.5 : 1);

type Mode = 'a' | 'back' | 'spark' | 'flare' | 'c3' | 'c9' | 'c29';

// ——— кадры оригинала (холсты Unity: Incinerate2/17 256², Incinerate7 460², Incinerate6 256², Explosion33 300²; PPU 100) ———
const O = 'vfx/ebolt/orig/';
const seq = (pre: string, n: number, k = 'eb_') => Array.from({ length: n }, (_, i) => `${k}${pre}_${String(i + 1).padStart(2, '0')}`);
const ORB = seq('Incinerate2', 3), BACK = seq('Incinerate17', 3), SPARK = seq('Incinerate7', 4), FLARE = seq('Incinerate6', 3), BOOM = seq('Explosion33', 9);
/** список загрузки (GameScene.preload): [ключ, путь от public] */
export const EBOLT_LOAD: [string, string][] = [
  ...[ORB, BACK, SPARK, FLARE, BOOM].flat().map((k): [string, string] => [k, `${O}${k.slice(3)}.png`]),
];
/** кадры пули по режиму (спрайт Sprite_Bullet01..03 / 01..04) */
const FRAMES: Record<Mode, string[]> = { a: ORB, back: BACK, spark: SPARK, flare: FLARE, c3: ORB, c9: ORB, c29: FLARE };

/**
 * #16 Энергетическая пуля — 1:1 по коду оригинала (docs/orig/spells/ebolt.md, карточка tasks/ebolt.md):
 * Play_EnergyBullet: цель — ближайший (|dx|+|dy|)·приоритет ≤ 23 ед. (иначе wait 0.1); залп FireNum пуль в ОДНУ цель
 * через 0.07 с, затем wait(PSpeed 3.3 с).
 * Пуля (ID 16): старт 9.17 ед/с (521 px/с), за тик 0.03 шаг Speed·ratio·0.025, ratio ×0.905; первые 3 тика без коллайдера;
 * летит Time·Random(0.8, 1.1), затем 4 тика затухания; хитбокс 1.45 × Size·0.575·0.6 ≈ 28 px, спрайт ≈ 50 px; пробой 999, каждого врага раз.
 * Свойства: 497 Заряженная частица (разворот ОДИН раз на точку мага, ratio растёт +0.05·0.9ⁿ, список попаданий очищен),
 * 498 Искра (Time ×2.5, мигание, повторный урон тем же врагам каждые 0.27/0.30 с), 499 Вспышка (все сразу в случайные стороны,
 * Size·k, Speed·Random(0.75, 1.35), в конце взрыв 1.35·k ед. урона ×2).
 * Слияния (числа карточки; полностью — партия 6): 3 Световая стрельба, 9 Противодействие, 29 Отправной взрыв.
 */
class Ebolt extends DataSpell {
  private co: Co | null = null;
  private bullets = new OrigBullets();

  private get size(): number { return Math.round(100 + this.pctOf('size') + W.stats.size * 100) / 100; }
  private get pSpeed(): number { return Math.max(0.05, this.cdOrig(this.data.base.cd ?? 3.3) * this.cdGlobal); }
  /** MSpeed = 110·0.1 (× (100 + speed%)) ед. за «шаг 0.025» */
  private get mSpeed(): number { return 11 * Math.max(0, 1 + this.pctOf('speed') / 100); }
  /** EnergyBulletTime */
  private get time(): number { return this.durSec; }

  onChange() {
    super.onChange();
    if (!this.co) this.co = new Co(this.loop());
  }

  destroy() {
    this.bullets.destroy();
    this.co = null;
  }

  update(dt: number) {
    if (!this.co) this.onChange();
    this.co!.update(dt);
    this.bullets.update(dt);
  }

  // ———— корутины ————
  private *loop(): Generator<number, void, unknown> {
    for (;;) {
      const n = this.count;
      if (this.hasCombo(3)) {
        // Com01: wait PSpeed; 4 залпа по FireNum·0.25 без цели через DSpeed
        yield this.pSpeed;
        const k = Math.max(1, Math.round(n * 0.25));
        for (let j = 0; j < 4; j++) { for (let i = 0; i < k; i++) this.fire('c3', Math.random() * Math.PI * 2); if (j < 3) yield DSPEED; }
        continue;
      }
      if (this.hasCombo(29)) {
        for (let i = 0; i < n; i++) this.fire('c29', Math.random() * Math.PI * 2);
        yield this.pSpeed + 0.1;
        continue;
      }
      if (this.hasProp(499)) {
        // Play_Flare: все пули сразу, без цели, AccuracyAim 900 (±180°)
        for (let i = 0; i < n; i++) this.fire('flare', Math.random() * Math.PI * 2);
        yield this.pSpeed;
        continue;
      }
      const P = W.player;
      let best = null as null | { x: number; y: number }, bd = Infinity;
      for (const e of W.enemies.list) {
        if (!e.alive) continue;
        const d = ((Math.abs(e.x - P.x) + Math.abs(e.y - P.y)) / U) * prio(e.type.uid);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best || bd > RANGE) { yield 0.1; continue; }
      const tgt = best;
      const mode: Mode = this.hasCombo(9) ? 'c9' : this.hasProp(498) ? 'spark' : this.hasProp(497) ? 'back' : 'a';
      for (let i = 0; i < n; i++) {
        const a = Math.atan2(tgt.y - W.player.y, tgt.x - W.player.x) + (mode === 'c9' ? rnd(-100, 100) * DEG : 0);
        this.fire(mode, a);
        yield DSPEED;
      }
      yield this.pSpeed;
    }
  }

  /** Bullet_Create + BulletAttack (кейсы 16 / 66 / 36 / 33 / 20 / 28 / 89) */
  private fire(mode: Mode, ang: number, child?: { x: number; y: number; size: number; speed: number }) {
    const P = W.player, S = this.size;
    let size = S, speed = this.mSpeed, root = 0.575, coll = 1.45, val = 0.905, tint = 0xffffff;
    let time = this.time * rnd(0.8, 1.1), area = 1, x = P.x, y = P.y, wait = 0;
    switch (mode) {
      case 'back': time = this.time * rnd(0.7, 1.0); break;
      case 'spark': root = 0.522; coll = 1.6; break;
      case 'flare': { const k = rnd(0.5, 1.0); size = S * k; area = k; speed *= rnd(0.75, 1.35); break; }
      case 'c3': {
        size = S * rnd(0.45, 0.85); speed *= rnd(0.65, 0.7); val = 0.985;
        const off = rnd(-0.5, 0.5) * U; x += -Math.sin(ang) * off; y += Math.cos(ang) * off; break;
      }
      case 'c9': root = 0.85 / CHILD; coll = 1.2; val = 0.96; area = rnd(0.7, 1.0); tint = 0xc8b0ff; break;
      case 'c29': {
        size = S * rnd(0.5, 1.0); time = this.time * rnd(0.5, 1.5); tint = 0xfff0c0;
        const off = rnd(0.25, 4.5) * U; x += Math.cos(ang) * off; y += Math.sin(ang) * off; wait = rnd(0.03, 0.4); break;
      }
    }
    // 131 Хекстековый модуль (эффект 499 = 22 %): время ×0.6, в конце — две дочерние пули ±40° (Size, Speed ×0.8); 499 «Вспышка» не делится
    let split = false;
    if (child) { size = child.size; speed = child.speed; x = child.x; y = child.y; wait = 0; }
    else if (mode !== 'flare' && (W.stats.artFx[499] ?? 0) >= 1 + Math.floor(Math.random() * 100)) { split = true; time *= 0.6; }
    const sc = size * root * CHILD;        // мировой масштаб сгустка
    const half = (coll * sc / 2) * U;
    const dmg = this.dmg;
    const fadeN = mode === 'spark' ? 3 : 4, fadeA = mode === 'spark' ? 0.25 : 0.2;
    this.bullets.fire({
      x, y, ang, sp: 0, life: mode === 'c29' ? wait + time + fadeN * TK : 99, // остальные гаснут сами (фаза 2)
      // Sprite_Bullet03 стоит до начала цикла кадров; холст в px оригинала → масштаб = мировой scale
      tex: FRAMES[mode][FRAMES[mode].length - 1], scaleX: sc, tint, normal: true,
      hl: 0, hw: half, pierce: 999, dmg, src: this.def.id,
      data: { acc: 0, n: 0, fn: 0, ratio: 1, up: 0.05, phase: 0, m: 0, half, turnT: 0, speed, val, time, wait, boomT: 0, boomN: 0, area },
      step: (b) => this.move(b, mode, fadeN, fadeA),
      onEnd: (b) => {
        if (mode === 'flare' || mode === 'c29') this.explode(b.x, b.y, b.dmg * 2, b.data.area);
        if (split) for (const s of [40, -40]) this.fire(mode, b.ang + s * DEG, { x: b.x, y: b.y, size: size * 0.8, speed: speed * 0.8 });
      },
    });
  }

  /** MovingA / MovingB / MovingC / MovingD / MovingE — тик 0.03 */
  private move(b: OBullet, mode: Mode, fadeN: number, fadeA: number) {
    const d = b.data;
    while (d.acc + TK <= b.t) {
      d.acc += TK; d.n++;
      const t = d.acc;
      if (mode === 'c29') {
        // MovingD: ждёт, затем константа 5.0 ед/с (0.125 ед/тик), коллайдер выкл.
        if (t >= d.wait && t < d.wait + d.time) { b.x += Math.cos(b.ang) * 0.125 * U; b.y += Math.sin(b.ang) * 0.125 * U; }
        if (t >= d.wait + d.time) { const i = Math.floor((t - d.wait - d.time) / TK); b.img.setAlpha(Math.max(0, 1 - fadeA * (i + 1))); }
        else b.img.setAlpha(t < d.wait ? 0 : 1);
        continue;
      }
      // фаза вперёд
      if (d.phase === 0) {
        b.x += Math.cos(b.ang) * d.speed * d.ratio * 0.025 * U;
        b.y += Math.sin(b.ang) * d.speed * d.ratio * 0.025 * U;
        d.ratio *= d.val;
        if (d.n === 3) b.hl = d.half;                      // первые 3 тика без коллайдера
        if (t >= d.time + 3 * TK) {
          if (mode === 'back') {
            // 497: разворот ОДИН раз на точку мага, список попаданий очищен
            d.phase = 1; d.turnT = t; b.hits.clear();
            b.ang = Math.atan2(W.player.y - b.y, W.player.x - b.x);
          } else d.phase = 2;
        }
      } else if (d.phase === 1) {
        b.x += Math.cos(b.ang) * d.speed * d.ratio * 0.025 * U;
        b.y += Math.sin(b.ang) * d.speed * d.ratio * 0.025 * U;
        d.ratio += d.up; d.up = Math.max(d.up * 0.9, 0.01);
        if (t >= d.turnT + Math.min(this.time, 1.0)) d.phase = 2;
      }
      if (d.phase === 2) {
        // затухание fadeN тиков
        d.m = (d.m || 0) + 1;
        b.img.setAlpha(Math.max(0, 1 - fadeA * d.m));
        if (d.m >= fadeN) { b.life = 0; return; }
      }
      // смена кадров по ApplyTimeNum (:102): 0→01, 2→02, 4→03 и сброс (период 5 тиков); фазы «вперёд» и «разворот», со 4-го тика
      if (mode !== 'spark' && d.phase < 2 && d.n > 3) {
        const fr = FRAMES[mode], k = d.fn;
        if (k === 0) b.img.setTexture(fr[0]); else if (k === 2) b.img.setTexture(fr[1]); else if (k === 4) b.img.setTexture(fr[2]);
        d.fn = k === 4 ? 0 : k + 1;
      }
      // 498 Искра: цикл 19 тиков (мигание), сброс списка попаданий на n=8 и n=18
      if (mode === 'spark' && d.phase === 0) {
        const c = (d.n - 1) % 19;
        b.img.setTexture(c < 5 ? SPARK[0] : c < 10 ? SPARK[1] : c < 15 ? SPARK[2] : SPARK[3]);
        b.img.setVisible(!(c >= 3 && c < 5) && !(c >= 8 && c < 10) && !(c >= 13 && c < 15) && c !== 18);
        if (c === 8 || c === 18) b.hits.clear();
      }
      // 9 Противодействие (MovingE): взрыв каждые 0.5 с, урон ×(1 + 0.2n)
      if (mode === 'c9' && d.phase === 0) {
        d.boomT += TK;
        if (d.boomT >= 0.5) { d.boomT -= 0.5; this.explode(b.x, b.y, b.dmg * (1 + 0.2 * d.boomN), d.area); d.boomN++; }
      }
    }
  }

  /** взрыв ID 33 / 89 / 28: квадрат 1.35·Area ед., урон в 1-й кадр; Explosion33_01..09 по 0.06 с, localScale = Area (холст 300 px) */
  private explode(x: number, y: number, dmg: number, area: number) {
    const half = (1.35 * area / 2) * U;
    boxDamage(x, y, 0, half, half, dmg, this.def.id);
    W.fx.anim(x, y, BOOM, 0.06, 0.06, area * PX);
  }
}

export const EBOLT = defFromData(SPELL_BY_ID[16], (def) => new Ebolt(def, SPELL_BY_ID[16]));
