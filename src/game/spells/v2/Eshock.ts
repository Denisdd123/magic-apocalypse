import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { boxDamage, Co, PX, U } from './_orig';

const DEG = Math.PI / 180;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** Приоритет цели (боссы/эпики UnitID 41–46 ×0.5) */
const prio = (uid: number) => (uid >= 41 && uid <= 46 ? 0.5 : 1);

// ——— кадры оригинала (холсты Unity целиком, PPU 100: масштаб в игре = localScale × PX на 1 px холста) ———
const seq = (pre: string, n: number) => Array.from({ length: n }, (_, i) => `${pre}_${String(i + 1).padStart(2, '0')}`);
/** Incinerate11 600×200 (база, 470), Incinerate45 220×100 (471), Explosion124 512² (взрыв 471), Incinerate16 848×300 (472) */
const I11 = seq('Incinerate11', 10), I45 = seq('Incinerate45', 9), EX124 = seq('Explosion124', 6), I16 = seq('Incinerate16', 11);
const DIR = 'vfx/eshock/orig/';
export const ESHOCK_LOAD: [string, string][] = [...I11, ...I45, ...EX124, ...I16].map((k): [string, string] => [k, `${DIR}${k}.png`]);
/** ElectricB: кадр Incinerate16 на шаг (−1 = Sprite_Trans) */
const FRAMES_B = [0, 1, -1, 2, 3, -1, 4, 5, -1, 6, 7, 8, 9, 10];

/**
 * ElectricA_Animation: [кадр Incinerate11 (−1 = Sprite_Trans), центр коллайдера x, размер x, пауза] (локальные ед. до ×1.2·BulletSize).
 * Коллайдер на дочернем Sprite_Electric со сдвигом +2.85 → в корне хит-зона «бежит» от мага наружу.
 */
const STEPS_A: [number, number, number, number][] = [
  [0, -2.75, 0.3, 0.03], [1, -2.35, 1.0, 0.03], [-1, -2.35, 1.0, 0.03],
  [2, -1.45, 2.8, 0.06], [3, -0.5, 4.6, 0.06], [-1, -0.5, 4.6, 0.03],
  [4, 0.5, 4.8, 0.06], [5, 0.9, 4.0, 0.06], [-1, 0.9, 4.0, 0.03],
  [6, 1.4, 3.0, 0.06], [7, 1.9, 2.0, 0.05], [8, 2.5, 0.8, 0.04],
  [9, 0, 0, 0.03],
];

/** ElectricB_Animation (472): [виден, центр x, размер x, пауза] */
const STEPS_B: [boolean, number, number, number][] = [
  [true, -3.22, 0.3, 0.03], [true, -2.75, 1.1, 0.03], [false, 0, 0, 0.03],
  [true, -1.6, 3.2, 0.06], [true, -0.3, 4.8, 0.06], [false, 0, 0, 0.03],
  [true, 0.9, 5.0, 0.06], [true, 1.33, 4.2, 0.06], [false, 0, 0, 0.03],
  [true, 1.7, 3.5, 0.06], [true, 2.33, 2.2, 0.06], [true, 3.03, 0.8, 0.05],
  [true, 0, 0, 0.04], [true, 0, 0, 0.03],
];

interface Shock {
  x: number; y: number; ang: number; s: number; dmg: number;
  hits: Set<number>; img: Phaser.GameObjects.Image; flip: boolean;
  /** текущий коллайдер в корне: от a до b ед. вдоль направления (до масштаба), полутолщина hw (наших ед.) */
  a: number; b: number; hw: number; on: boolean;
}

/**
 * #13 Электрический удар — 1:1 по коду оригинала (docs/orig/spells/eshock.md, карточка tasks/eshock.md).
 * Play_Electric: wait(PSpeed); цикл: AttackNum залпов (1; между ними 0.225 с), в залпе Num разрядов В ОДИН КАДР,
 * у мага в случайном направлении (Aim 900 → ±180°); затем wait(PSpeed 2 с).
 * Разряд НЕ летит: неподвижный отрезок 5.75·1.2·BulletSize ед. (≈370 px) от точки мага +0.45 ед.,
 * BulletSize = Size·Random(0.92, 1.15)·Random(0.8, 1.0); хит-зона высотой 0.22·1.2·BS «бежит» от мага наружу по шагам
 * ElectricA_Animation, жизнь 0.57 с; пробой 999 — каждый враг раз за разряд. Шанс усиления ElectricEnforceRan — ×2.5, красный.
 * Свойства: 470 Цепная молния (1–3 звена из EndPoint01 через 0.24 с, зигзаг ±40°/±16°, ×0.925),
 * 471 Высокая производительность (ID 124: короткая молния ×1.5 летит 0–6 шагов по 0.62 ед. за 0.05 с, взрыв 3.125 ед.),
 * 472 Сверхпроводимость (ID 57: по одному каждые 0.15 с в ближайшего, ±12°, Incinerate16, жизнь 0.63 с).
 * Слияния 22/34/47/63: Play_Electric_Com01/03 не разобраны — пока как своё свойство-основа (партия 6).
 */
class Eshock extends DataSpell {
  private co: Co | null = null;
  private mode = -1;
  private shocks: Shock[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  private seq: { done: boolean; co: Co }[] = [];

  // ———— числа (StartInformation_B) ————
  private get sizePct(): number { return this.pctOf('size') + W.stats.size * 100; }
  /** ElectricSize = (100 + AreaU + MSizeU)%; у 471 = 1 (бонусы размера идут в урон) */
  private get size(): number { return this.hasProp(471) ? 1 : Math.round(100 + this.sizePct) / 100; }
  private get damage(): number { return this.hasProp(471) ? this.dmgOf(this.data.base.dmgPct ?? 500, this.sizePct) : this.dmg; }
  private get pSpeed(): number { return Math.max(0.05, this.cdOrig(this.data.base.cd ?? 2) * this.cdGlobal); }
  /** AttackNum: эффект 423 в данных не используется → 1 */
  private readonly attackNum = 1;
  /** ElectricEnforceRan (Z+0xf28): источник бонуса (артефакт/класс) ещё не перенесён → 0 */
  private readonly enforceRan = 0;
  private get kind(): number { return this.hasProp(472) ? 472 : 0; }

  onChange() {
    super.onChange();
    const k = this.kind;
    if (!this.co || k !== this.mode) { this.mode = k; this.co = new Co(k === 472 ? this.loopSC() : this.loop()); }
  }

  destroy() {
    for (const s of this.shocks) s.img.destroy();
    for (const i of this.pool) i.destroy();
    this.shocks = []; this.pool = []; this.seq = []; this.co = null;
  }

  update(dt: number) {
    if (!this.co) this.onChange();
    this.co!.update(dt);
    for (let i = this.seq.length - 1; i >= 0; i--) {
      const j = this.seq[i];
      j.co.update(dt);
      if (j.done) { this.seq[i] = this.seq[this.seq.length - 1]; this.seq.pop(); }
    }
    for (const s of this.shocks) this.collide(s);
  }

  // ———— Play_Electric ————
  private *loop(): Generator<number, void, unknown> {
    yield this.pSpeed;
    for (;;) {
      for (let i = 1; i <= this.attackNum; i++) {
        const P = W.player;
        for (let k = 0; k < this.count; k++) {
          const ang = Math.random() * Math.PI * 2;
          if (this.hasProp(471)) this.run(this.high(P.x, P.y, ang));
          else {
            const chain = this.hasProp(470) ? ((1 + Math.random() * 3) | 0) * 10 : 0;
            this.run(this.shockA(P.x, P.y, ang, this.size * rnd(0.92, 1.15), chain));
          }
        }
        if (i < this.attackNum) yield 0.225;
      }
      yield this.pSpeed;
    }
  }

  // ———— Play_Superconductivity (472): по одному каждые 0.15 с в ближайшего ————
  private *loopSC(): Generator<number, void, unknown> {
    yield this.pSpeed;
    for (;;) {
      for (let k = 0; k < this.count; k++) {
        const P = W.player;
        let best = null as null | { x: number; y: number }, bd = Infinity;
        for (const e of W.enemies.list) {
          if (!e.alive) continue;
          const d = (Math.abs(e.x - P.x) + Math.abs(e.y - P.y)) * prio(e.type.uid);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          const ang = Math.atan2(best.y - P.y, best.x - P.x) + rnd(-60, 60) * 0.2 * DEG;
          this.run(this.superB(P.x, P.y, ang));
        }
        yield 0.15;
      }
      yield this.pSpeed;
    }
  }

  /** запустить анимацию разряда отдельной корутиной */
  private run(g: Generator<number, void, unknown>) {
    const job = { done: false, co: null as unknown as Co };
    job.co = new Co((function* () { yield* g; job.done = true; })());
    this.seq.push(job);
  }

  private img(tex: string): Phaser.GameObjects.Image {
    const i = this.pool.pop() ?? W.scene.add.image(0, 0, tex).setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD);
    return i.setTexture(tex).setVisible(true).setAlpha(1).clearTint();
  }

  private add(x: number, y: number, ang: number, s: number, dmg: number, hw: number, tex: string): Shock {
    const sh: Shock = { x, y, ang, s, dmg, hits: new Set(), img: this.img(tex), flip: Math.random() < 0.5, a: 0, b: 0, hw, on: false };
    sh.img.setRotation(ang).setFlipY(sh.flip);
    this.shocks.push(sh);
    return sh;
  }

  private remove(sh: Shock) {
    const i = this.shocks.indexOf(sh);
    if (i >= 0) { this.shocks[i] = this.shocks[this.shocks.length - 1]; this.shocks.pop(); }
    sh.img.setVisible(false); this.pool.push(sh.img);
  }

  /** хит-зона: отрезок [a, b] ед. (корень, до масштаба s) вдоль направления, полутолщина hw */
  private collide(sh: Shock) {
    if (!sh.on || sh.b <= sh.a) return;
    const k = sh.s * U, hl = (sh.b - sh.a) / 2 * k, mid = (sh.a + sh.b) / 2 * k;
    const c = Math.cos(sh.ang), s = Math.sin(sh.ang);
    const x = sh.x + c * mid, y = sh.y + s * mid;
    // boxDamage бьёт каждого из hits один раз
    boxDamage(x, y, sh.ang, hl, sh.hw, sh.dmg, this.def.id, sh.hits);
  }

  /** спрайт отрезка: кадр f (Incinerate11_f+1 целиком), центр спрайта на +2.85 ед. от корня, масштаб s·PX */
  private drawA(sh: Shock, f: number, tint?: number) {
    if (f < 0) { sh.img.setVisible(false); return; }
    const c = Math.cos(sh.ang), s = Math.sin(sh.ang), d = 2.85 * sh.s * U;
    sh.img.setVisible(true).setTexture(I11[f]).setPosition(sh.x + c * d, sh.y + s * d).setScale(sh.s * PX);
    if (tint !== undefined) sh.img.setTint(tint);
  }

  /** ElectricA_Animation (база, 470) */
  private *shockA(px: number, py: number, ang: number, bs: number, chain: number): Generator<number, void, unknown> {
    let dmg = this.damage, tint: number | undefined;
    if (Math.random() * 100 + 1 <= this.enforceRan) { dmg *= 2.5; tint = 0xff3333; }
    bs *= rnd(0.8, 1.0);
    const s = 1.2 * bs;
    // старт +0.45 ед. вперёд; Sprite_Electric сдвинут на +2.85 (локальные ед.)
    const ox = px + Math.cos(ang) * 0.45 * U, oy = py + Math.sin(ang) * 0.45 * U;
    const sh = this.add(ox, oy, ang, s, dmg, 0.22 * s / 2 * U, I11[0]);
    sh.on = true;
    for (let i = 0; i < STEPS_A.length; i++) {
      const [f, cx, sx, w] = STEPS_A[i];
      if (i === 12) sh.on = false;
      else { sh.a = cx - sx / 2 + 2.85; sh.b = cx + sx / 2 + 2.85; }
      this.drawA(sh, f, tint);
      if (i === 6 && chain >= 10) this.link(sh, bs, chain);
      yield w;
    }
    this.remove(sh);
  }

  /** 470: новое звено из EndPoint01 (локально x 5.7): k = 0, 2 — назад к началу (±40°), k = 1, 3 — вперёд к EndPoint02 (±16°) */
  private link(sh: Shock, bs: number, chain: number) {
    const c = Math.cos(sh.ang), s = Math.sin(sh.ang);
    const ex = sh.x + c * 5.7 * sh.s * U, ey = sh.y + s * 5.7 * sh.s * U;
    const k = chain % 10;
    let tx: number, ty: number, aim: number;
    if (k % 2 === 0) { tx = sh.x; ty = sh.y; aim = 200; }
    else { tx = sh.x + c * 6.0 * sh.s * U; ty = sh.y + s * 6.0 * sh.s * U; aim = 80; }
    const a = Math.atan2(ty - ey, tx - ex) + rnd(-aim, aim) * 0.2 * DEG;
    // новое звено стартует прямо из EndPoint01 (без сдвига +0.45)
    const back = 0.45 * U;
    this.run(this.shockA(ex - Math.cos(a) * back, ey - Math.sin(a) * back, a, bs * 0.925, chain - 9));
  }

  /** ElectricH_Animation (471, ID 124): короткая молния ×1.5 летит, затем взрыв в EndPoint01 */
  private *high(px: number, py: number, ang: number): Generator<number, void, unknown> {
    const dmg = this.damage, S = 1.5;
    const c = Math.cos(ang), s = Math.sin(ang);
    // корень на 3 ед. позади мага; Sprite_Electric сдвиг +2.85, EndPoint01 x 3.9
    let rx = px - c * 3 * U, ry = py - s * 3 * U;
    const sh = this.add(rx, ry, ang, S, dmg, 0.35 * S / 2 * U, I45[0]);
    sh.on = true;
    const N = (Math.random() * 7) | 0;
    const d = 2.85 * S * U;
    const set = (cx: number, sx: number, f: number) => {
      sh.x = rx; sh.y = ry;
      sh.a = cx - sx / 2 + 2.85; sh.b = cx + sx / 2 + 2.85;
      sh.img.setVisible(true).setTexture(I45[f]).setPosition(rx + c * d, ry + s * d).setScale(S * PX);
    };
    set(-0.7, 0.3, 0); yield 0.03;
    set(-0.35, 1.0, 1); yield 0.05;
    set(-0.2, 1.25, 2); yield 0.05;
    for (let count = 1; count <= N; count++) {
      rx += c * 0.62 * U; ry += s * 0.62 * U;
      set(0.05, 2.0, 3 + (count - 1) % 3); yield 0.05;
    }
    const ex = rx + c * 3.9 * S * U, ey = ry + s * 3.9 * S * U;
    this.explode124(ex, ey, dmg);
    sh.on = false;
    // кадры 07, 08, 09 по 0.03 с (позиция корня — последняя)
    for (let f = 6; f < 9; f++) {
      sh.img.setTexture(I45[f]).setPosition(rx + c * d, ry + s * d);
      yield 0.03;
    }
    this.remove(sh);
  }

  /** Explosion124: квадрат 2.5 × 1.25 = 3.125 ед., окно 0.03 с, кадры 5 × 0.045 с; Area не влияет */
  private explode124(x: number, y: number, dmg: number) {
    const half = 2.5 * 1.25 / 2 * U;
    const hits = new Set<number>();
    this.run((function* (self: Eshock) {
      boxDamage(x, y, 0, half, half, dmg, self.def.id, hits);
      yield 0.015;
      boxDamage(x, y, 0, half, half, dmg, self.def.id, hits);
    })(this));
    const rot = Math.random() * 361 * DEG;
    W.fx.anim(x, y, EX124, 0.03, 0.045, 1.25 * PX, 1.25 * PX, { hook: (img) => { img.setRotation(rot); } });
  }

  /** ElectricB_Animation (472, ID 57): Incinerate16 848×300, тинт (0.7, 0.9, 1), scale (1.22, 1.16)·Size, h 0.55, +0.8 ед., 0.63 с */
  private *superB(px: number, py: number, ang: number): Generator<number, void, unknown> {
    const bs = this.size, sx = 1.22 * bs, sy = 1.16 * bs;
    const c = Math.cos(ang), s = Math.sin(ang);
    const sh = this.add(px + c * 0.8 * U, py + s * 0.8 * U, ang, sx, this.damage, 0.55 * sy / 2 * U, I16[0]);
    sh.img.setTint(0xb3e6ff);
    sh.on = true;
    for (let i = 0; i < STEPS_B.length; i++) {
      const [vis, cx, w0, w] = STEPS_B[i];
      if (i === 12) sh.on = false;
      else if (w0 > 0) { sh.a = cx - w0 / 2 + 2.85; sh.b = cx + w0 / 2 + 2.85; }
      const f = FRAMES_B[i], d = 2.85 * sx * U;
      sh.img.setVisible(vis && f >= 0);
      if (f >= 0) sh.img.setTexture(I16[f]).setPosition(sh.x + c * d, sh.y + s * d).setScale(sx * PX, sy * PX);
      yield w;
    }
    this.remove(sh);
  }
}

export const ESHOCK = defFromData(SPELL_BY_ID[13], (def) => new Eshock(def, SPELL_BY_ID[13]));
