import { SPELL_BY_ID } from '../../../data/spells_data';
import type Phaser from 'phaser';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { boxDamage, Co, PX, TICK, U } from './_orig';

/** UnitApply_ShootingRange: цель дальше 23 ед. (взвешенно) — молния не бьёт */
const RANGE = 23;
/** Приоритет цели (боссы/эпики UnitID 41–46 ×0.5) */
const prio = (uid: number) => (uid >= 41 && uid <= 46 ? 0.5 : 1);
const DEG = Math.PI / 180;

// ——— кадры оригинала (холсты Unity: ThunderA/B 256×1024, ThunderD 512×1024, Explosion7 512², Explosion38 240×308, Explosion58 700²) ———
const O = 'vfx/thunder/orig/';
const seq = (pre: string, n: number) => Array.from({ length: n }, (_, i) => `${pre}_${String(i + 1).padStart(2, '0')}`);
const A0 = 'ThunderA0', B_BOLT = ['ThunderB0', 'ThunderB1', 'ThunderB2'], D_BOLT = Array.from({ length: 6 }, (_, i) => `ThunderD${i}`);
const EX7 = seq('Explosion7', 8), EX38 = seq('Explosion38', 8), EX58 = seq('Explosion58', 7);
/** список загрузки (GameScene.preload): [ключ, путь] */
export const THUNDER_LOAD: [string, string][] = [
  A0, ...B_BOLT, ...D_BOLT, ...EX7, ...EX38, ...EX58,
].map((k): [string, string] => [k, `${O}${k}.png`]);

/** Explosion58_AnimationA: сетка 0.03 с; кадры 01×2, пусто, 02×2, 03×2, пусто, 04×2, 05×2, пусто, 06×2, 07×2 (0 = пустой спрайт) */
const EX58_SEQ = [0, 0, -1, 1, 1, 2, 2, -1, 3, 3, 4, 4, -1, 5, 5, 6, 6];
const EX58_FR = EX58_SEQ.map((i) => EX58[Math.max(0, i)]);
/** ThunderD_AnimationA: [кадр D (-1 пусто), пауза с] */
const D_SEQ: [number, number][] = [[0, 0.08], [-1, 0.03], [1, 0.08], [2, 0.08], [-1, 0.03], [3, 0.08], [4, 0.08], [5, 0.08]];

/** Взрыв с окнами урона: [конец окна (с), половина стороны квадрата, урон]; список задетых общий на все окна */
interface Boom { x: number; y: number; t: number; hits: Set<number>; win: [number, number, number][]; i: number }

/**
 * #7 Молния — 1:1 по коду оригинала (docs/orig/spells/thunder.md, карточка tasks/thunder.md).
 * Play_ThunderA: wait(PSpeed) (поле 0xC10 = UnitApply_ThunderPSpeed, dump.cs); цикл: Num молний ОДНОВРЕМЕННО,
 * k-я — в k-го ближайшего (d = (|dx|+|dy|)·приоритет); цель дальше 23 ед. — wait 0.1 и стоп залпа; затем wait(PSpeed 2 с).
 * Снаряда нет: взрыв (ID 7) сразу в точке цели — квадрат 1.5 × (0.35·Area + 0.35) ед. (60 px), урон только 0.06 с;
 * разряд ThunderA0 160×814 px, центр на 409 px выше цели, гаснет 9 тиков (α −0.12); кольцо 512 px × масштаб, 8 кадров по 0.06.
 * Свойства: 416 Гром (ID 38: 2–3 удара цепочкой через 0.12 с, сдвиг ±0.6 ед., квадрат 0.9×0.88·Area),
 * 417 Грозовой взрыв (Play_ThunderC: по одной каждые 0.1 с в точку маг ± (3.3, 5) ед., ID 41: 2.25 × (0.45·Area + 0.75), окно 0.03 с),
 * 418 Суд (одна молния, Area +20 % за каждую, ID 58: квадрат 1.65·k полный урон 0.03 с, затем ×2 и половина урона 0.03 с).
 * Слияния 1/13/17/52: Play_Thunder_Com02/03 не разобраны — пока ведут себя как своё свойство-основа (партия 6).
 */
class Thunder extends DataSpell {
  private co: Co | null = null;
  private booms: Boom[] = [];
  private mode = -1;

  // ———— числа (StartInformation_B) ————
  /** Area = round(100·(100 + AreaU + MSizeU [+ num·20 у Суда])%)·0.01 */
  private area(extra = 0): number { return Math.round(100 + this.pctOf('size') + W.stats.size * 100 + extra) / 100; }
  private get pSpeed(): number { return Math.max(0.05, this.cdOrig(this.data.base.cd ?? 2) * this.cdGlobal); }
  private get num(): number { return this.count; }
  /** 416 / 417 / 418 / база — какую корутину крутить (смена свойства перезапускает её, как StopCoroutine/StartCoroutine) */
  private get kind(): number { return this.hasProp(417) ? 417 : this.hasProp(418) ? 418 : this.hasProp(416) ? 416 : 0; }

  onChange() {
    super.onChange();
    const k = this.kind;
    if (!this.co || k !== this.mode) { this.mode = k; this.co = new Co(k === 417 ? this.loopC() : this.loopA()); }
  }

  destroy() { this.booms.length = 0; this.co = null; }

  update(dt: number) {
    if (!this.co) this.onChange();
    // таймеры цепочки Грома — до корутины, чтобы новый таймер не терял кадр
    const due = this.timers;
    this.timers = [];
    for (const q of due) { q.t -= dt; if (q.t > 1e-6) this.timers.push(q); else q.fn(); }
    this.co!.update(dt);
    this.updateBooms(dt);
  }

  // ———— Play_ThunderA ————
  private *loopA(): Generator<number, void, unknown> {
    yield this.pSpeed;
    for (;;) {
      const P = W.player;
      const list = W.enemies.list.filter((e) => e.alive)
        .map((e) => ({ e, d: ((Math.abs(e.x - P.x) + Math.abs(e.y - P.y)) / U) * prio(e.type.uid) }))
        .sort((a, b) => a.d - b.d);
      if (!list.length) { yield 0.1; continue; }
      const judg = this.hasProp(418);
      const n = judg ? 1 : this.num;
      let far = false;
      for (let i = 0; i < n; i++) {
        const t = list[i];
        if (!t) break;
        if (t.d > RANGE) { far = true; break; }
        if (judg) this.judgment(t.e.x, t.e.y);
        else if (this.hasProp(416)) this.clap(t.e.x, t.e.y, 1 + ((Math.random() * 2) | 0));
        else this.strike(t.e.x, t.e.y);
      }
      if (far) { yield 0.1; continue; }
      yield this.pSpeed;
    }
  }

  // ———— Play_ThunderC (417): первая пауза — поле 0xC08 по библии (это UnitApply_ThunderNum), берём PSpeed как у ThunderA ————
  private *loopC(): Generator<number, void, unknown> {
    yield this.pSpeed;
    for (;;) {
      const n = this.num;
      for (let i = 0; i < n; i++) {
        const P = W.player;
        this.blast(P.x + (Math.random() * 6.6 - 3.3) * U, P.y + (Math.random() * 10 - 5) * U);
        yield 0.1;
      }
      yield this.pSpeed;
    }
  }

  // ———— взрывы ————
  /** ID 7: квадрат 1.5·s, s = 0.35·Area + 0.35; урон 0.06 с */
  private strike(x: number, y: number) {
    const s = 0.35 * this.area() + 0.35;
    this.addBoom(x, y, [[0.06, 1.5 * s / 2 * U, this.dmg]]);
    this.bolt(x, y, 'A');
    this.ring(x, y, EX7, 0.06, s * PX);
  }

  /** ID 38 (Гром): квадрат 0.9 × 0.88·Area; Spec01 > 0 — через 4 тика следующий удар рядом (±0.6 ед.) */
  private clap(x: number, y: number, spec: number) {
    const s = 0.88 * this.area();
    this.addBoom(x, y, [[0.06, 0.9 * s / 2 * U, this.dmg]]);
    this.bolt(x, y, 'B');
    W.fx.anim(x, y, EX38, 0.06, 0.06, s * PX);
    if (spec > 0) {
      const nx = x + (Math.random() * 1.2 - 0.6) * U, ny = y + (Math.random() * 1.2 - 0.6) * U;
      this.later(4 * TICK, () => this.clap(nx, ny, spec - 1));
    }
  }

  /** ID 41 (Грозовой взрыв): квадрат 2.25 × (0.45·Area + 0.75), окно 0.03 с, затем 7 кадров по 0.05 с */
  private blast(x: number, y: number) {
    const s = 0.45 * this.area() + 0.75;
    this.addBoom(x, y, [[0.03, 2.25 * s / 2 * U, this.dmg]]);
    this.bolt(x, y, 'C');
    // кадры Explosion7_01..08 (Explosion41_Animation берёт SpriteList_ExplosionNN[7]): 0.03 + 7×0.05 с, 1-й кадр белый, дальше (0, 1, 0.9)
    this.ring(x, y, EX7, 0.05, s * PX, 0.03, (img, n) => { if (n >= 1) img.setTint(0x00ffe6); else img.clearTint(); });
  }

  /** ID 58 (Суд): k = 0.4·(Area − 1) + 1; квадрат 1.65·k (полный урон 0.03 с), затем ×2 и урон ×0.5 ещё 0.03 с */
  private judgment(x: number, y: number) {
    const area = this.area(Math.max(0, this.num * 20));
    const k = 0.4 * (area - 1) + 1, s = 1.25 * k;
    const half = 1.65 * k / 2 * U;
    this.addBoom(x, y, [[0.03, half, this.dmg], [0.06, half * 2, this.dmg * 0.5]]);
    this.bolt(x, y, 'D');
    // Explosion58_AnimationA: цвет (1, 1, 0.85), сетка 0.03 с с пустыми кадрами
    const sc = s * PX;
    W.fx.anim(x, y, EX58_FR, 0.03, 0.03, sc, sc, {
      hook: (img, t) => {
        const n = Math.min(EX58_SEQ.length - 1, t < 0.03 ? 0 : 1 + Math.floor((t - 0.03) / 0.03));
        img.setTint(0xffffd9).setAlpha(EX58_SEQ[n] < 0 ? 0 : 1);
      },
    });
  }

  /** кольцо Explosion7 (1-й кадр dt0, остальные dt), случайный поворот 0..360 (Euler z = Random.Range(0, 361)) */
  private ring(x: number, y: number, fr: string[], dt: number, sc: number, dt0 = dt, tint?: (img: Phaser.GameObjects.Image, n: number) => void) {
    const rot = Math.random() * 361 * DEG;
    W.fx.anim(x, y, fr, dt0, dt, sc, sc, { hook: (img, _t, n) => { img.setRotation(rot); tint?.(img, n); } });
  }

  /** разряд с неба: Sprite_Thunder pos (0, 7.2 ед.), scale (1.1, 1.4); альфа по тикам 0.03 с.
   *  A — ThunderA0, α 1 − 0.12·i (9 тиков); B (416) — ThunderB0..2 случайный, α 1 − 0.15·i (4 тика), затем 0.4 − 0.1·i (4 тика);
   *  C (417) — ThunderA0, 1-й тик белый α 1, затем (0, 1, 0.9) α 1 − 0.125·i, i = 1..7; D (418) — ThunderD0..5 по ThunderD_AnimationA */
  private bolt(x: number, y: number, kind: 'A' | 'B' | 'C' | 'D') {
    const by = y - 7.2 * U, sx = 1.1 * PX, sy = 1.4 * PX;
    const fx = W.fx;
    if (kind === 'D') {
      // сетка 0.01 с не нужна: паузы кратны 0.01 — разворачиваем в таблицу кадров по времени
      const keys: string[] = [], T: number[] = [];
      let t = 0;
      for (const [f, w] of D_SEQ) { keys.push(f < 0 ? D_BOLT[0] : D_BOLT[f]); T.push(f < 0 ? -1 : t); t += w; }
      const ends: number[] = []; t = 0; for (const [, w] of D_SEQ) { t += w; ends.push(t); }
      fx.anim(x, by, keys, 0.06, 0.06, sx, sy, {
        last: 0.12,
        hook: (img, tt) => {
          let i = ends.findIndex((e) => tt < e - 1e-9); if (i < 0) i = ends.length - 1;
          img.setTexture(keys[i]).setAlpha(T[i] < 0 ? 0 : 1);
        },
      });
      return;
    }
    const tex = kind === 'B' ? B_BOLT[(Math.random() * 3) | 0] : A0;
    const n = kind === 'A' ? 9 : 8;
    fx.anim(x, by, [tex], n * TICK, n * TICK, sx, sy, {
      last: n * TICK,
      hook: (img, t) => {
        const i = Math.min(n - 1, Math.floor(t / TICK + 1e-6));
        let a: number;
        if (kind === 'A') a = 1 - 0.12 * i;
        else if (kind === 'B') a = i < 4 ? 1 - 0.15 * i : 0.4 - 0.1 * (i - 4);
        else a = i === 0 ? 1 : 1 - 0.125 * i;
        img.setAlpha(a);
        if (kind === 'C' && i > 0) img.setTint(0x00ffe6); else img.clearTint();
      },
    });
  }

  private addBoom(x: number, y: number, win: [number, number, number][]) {
    const b: Boom = { x, y, t: 0, hits: new Set(), win, i: 0 };
    this.booms.push(b);
    this.tickBoom(b);
  }

  private tickBoom(b: Boom) {
    while (b.i < b.win.length && b.t >= b.win[b.i][0]) b.i++;
    if (b.i >= b.win.length) return false;
    const [, half, dmg] = b.win[b.i];
    boxDamage(b.x, b.y, 0, half, half, dmg, this.def.id, b.hits);
    return true;
  }

  private updateBooms(dt: number) {
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      b.t += dt;
      if (!this.tickBoom(b)) { this.booms[i] = this.booms[this.booms.length - 1]; this.booms.pop(); }
    }
  }

  private timers: { t: number; fn: () => void }[] = [];
  private later(t: number, fn: () => void) { this.timers.push({ t, fn }); }
}

export const THUNDER = defFromData(SPELL_BY_ID[7], (def) => new Thunder(def, SPELL_BY_ID[7]));
