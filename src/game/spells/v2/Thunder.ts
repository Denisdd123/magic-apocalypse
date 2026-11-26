import Phaser from 'phaser';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { boxDamage, Co, PX, TICK, U } from './_orig';

/** UnitApply_ShootingRange: цель дальше 23 ед. (взвешенно) — молния не бьёт */
const RANGE = 23;
/** Приоритет цели (боссы/эпики UnitID 41–46 ×0.5) */
const prio = (uid: number) => (uid >= 41 && uid <= 46 ? 0.5 : 1);
const DEG = Math.PI / 180;

// ——— текстуры-заглушки по меркам спрайтов (рисуем с Денисом позже) ———
const T = { bolt: 'th_bolt', ring: 'th_ring', b38: 'th_b38', judg: 'th_judg' };

function textures() {
  const tx = W.scene.textures;
  const make = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    if (tx.exists(key)) return;
    const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g); g.generateTexture(key, w, h); g.destroy();
  };
  // ThunderA0 256×1024 × (1.1, 1.4) → пропорция 0.196: рисуем 100×512, белая ломаная сверху вниз
  make(T.bolt, 100, 512, (g) => {
    const pts: [number, number][] = [[50, 0]];
    for (let y = 28; y < 512; y += 28) pts.push([50 + (Math.random() * 2 - 1) * 22, y]);
    pts.push([50, 512]);
    for (const [w, a] of [[14, 0.12], [6, 0.35], [2.5, 1]] as const) {
      g.lineStyle(w, 0xffffff, a);
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) g.lineTo(p[0], p[1]);
      g.strokePath();
    }
  });
  // Explosion7 512 px (рисуем 128): белое кольцо с мягкой кромкой
  make(T.ring, 128, 128, (g) => {
    g.lineStyle(10, 0xffffff, 0.15); g.strokeCircle(64, 64, 52);
    g.lineStyle(5, 0xffffff, 0.4); g.strokeCircle(64, 64, 52);
    g.lineStyle(2, 0xffffff, 1); g.strokeCircle(64, 64, 52);
    g.fillStyle(0xffffff, 0.25); g.fillCircle(64, 64, 22);
  });
  // Explosion38 240×308 (рисуем 60×77): вытянутое белое пятно
  make(T.b38, 60, 77, (g) => {
    g.fillStyle(0xffffff, 0.18); g.fillEllipse(30, 38.5, 58, 75);
    g.fillStyle(0xffffff, 0.45); g.fillEllipse(30, 42, 36, 46);
    g.fillStyle(0xffffff, 1); g.fillEllipse(30, 46, 16, 20);
  });
  // Explosion58 700 px (рисуем 128): широкое кольцо Суда
  make(T.judg, 128, 128, (g) => {
    for (let i = 0; i < 5; i++) { g.lineStyle(14 - i * 3, 0xffffff, 0.1 + i * 0.18); g.strokeCircle(64, 64, 56); }
    g.fillStyle(0xffffff, 0.3); g.fillCircle(64, 64, 30);
  });
}

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
    textures();
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
    this.bolt(x, y, 1);
    W.fx.puff(x, y, 512 * PX * s, 0xffffff, 8 * 0.06, T.ring, Math.random() * 361 * DEG);
  }

  /** ID 38 (Гром): квадрат 0.9 × 0.88·Area; Spec01 > 0 — через 4 тика следующий удар рядом (±0.6 ед.) */
  private clap(x: number, y: number, spec: number) {
    const s = 0.88 * this.area();
    this.addBoom(x, y, [[0.06, 0.9 * s / 2 * U, this.dmg]]);
    this.bolt(x, y, 1);
    W.fx.puff(x, y, 308 * PX * s, 0xffffff, 8 * 0.06, T.b38);
    if (spec > 0) {
      const nx = x + (Math.random() * 1.2 - 0.6) * U, ny = y + (Math.random() * 1.2 - 0.6) * U;
      this.later(4 * TICK, () => this.clap(nx, ny, spec - 1));
    }
  }

  /** ID 41 (Грозовой взрыв): квадрат 2.25 × (0.45·Area + 0.75), окно 0.03 с, затем 7 кадров по 0.05 с */
  private blast(x: number, y: number) {
    const s = 0.45 * this.area() + 0.75;
    this.addBoom(x, y, [[0.03, 2.25 * s / 2 * U, this.dmg]]);
    this.bolt(x, y, 1);
    W.fx.puff(x, y, 512 * PX * s, 0xffffff, 0.03 + 7 * 0.05, T.ring, Math.random() * 361 * DEG);
  }

  /** ID 58 (Суд): k = 0.4·(Area − 1) + 1; квадрат 1.65·k (полный урон 0.03 с), затем ×2 и урон ×0.5 ещё 0.03 с */
  private judgment(x: number, y: number) {
    const area = this.area(Math.max(0, this.num * 20));
    const k = 0.4 * (area - 1) + 1, s = 1.25 * k;
    const half = 1.65 * k / 2 * U;
    this.addBoom(x, y, [[0.03, half, this.dmg], [0.06, half * 2, this.dmg * 0.5]]);
    this.bolt(x, y, 1);
    W.fx.puff(x, y, 700 * PX * s, 0xffffd9, 7 * 0.05, T.judg);
  }

  /** разряд с неба: спрайт 160×814 px (× k), центр на 7.2 ед. выше цели, 9 тиков α 1 → 0.04 */
  private bolt(x: number, y: number, k: number) {
    W.fx.puff(x, y - 7.2 * U, 1024 * 1.4 * PX * k, 0xffffff, 9 * TICK, T.bolt);
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
