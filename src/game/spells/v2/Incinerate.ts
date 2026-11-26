import { SPELL_BY_ID } from '../../../data/spells_data';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { boxDamage, Co, OrigBullets, PX, U, type OBullet } from './_orig';

const DEG = Math.PI / 180;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** ASpeed: пауза между облачками потока */
const ASPEED = 0.07;
/** AccuracyAim 80 · 0.2 = ±16° */
const AIM = 16;

// ——— кадры оригинала (холсты Unity: Incinerate1 300×280, Explosion50 380×380; PPU 100 → масштаб = localScale × PX) ———
const seq = (pre: string, n: number) => Array.from({ length: n }, (_, i) => `${pre}_${String(i + 1).padStart(2, '0')}`);
const CLOUD = seq('Incinerate1', 10), EX50 = seq('Explosion50', 14);
/** список загрузки (GameScene.preload): [ключ, путь от public] */
export const INCINERATE_LOAD: [string, string][] = [...CLOUD, ...EX50].map((k): [string, string] => [k, `vfx/incinerate/orig/${k}.png`]);

/** вид облачка: стартовый цвет и сдвиг цвета за тик, множители урона/размера, масштаб (sx, sy) = S·k + plus */
interface Kind { c: [number, number, number]; d: [number, number, number]; pw: number; sz: number; kx: number; ky: number; px: number; py: number; cy: number }
const BASE: Kind = { c: [1, 1, 0.5], d: [0.01, 0.1, 0.05], pw: 1, sz: 1, kx: 0.75, ky: 0.75, px: 0.2, py: 0.2, cy: 0.8 };
/** 488 Пламенный удар: ступени по номеру облачка в касте */
const STEPS: [number, number, number, [number, number, number], [number, number, number]][] = [
  [30, 4, 1.5, [0.3, 0.7, 1.0], [0.03, 0.07, 0.01]],
  [24, 3.25, 1.375, [0.475, 0.775, 0.875], [0.025, 0.0775, 0.02]],
  [17, 2.5, 1.25, [0.65, 0.85, 0.75], [0.02, 0.085, 0.03]],
  [9, 1.75, 1.125, [0.825, 0.925, 0.625], [0.015, 0.0925, 0.04]],
];
/** 19 Инферно: ступени урона/размера */
const INFERNO: [number, number, number][] = [[24, 30, 2], [17, 22, 1.7], [12, 16, 1.5], [8, 12, 1.3], [5, 9, 1.2], [2, 7, 1], [0, 6, 1]];

const rgb = (c: number[]) => {
  const k = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (k(c[0]) << 16) | (k(c[1]) << 8) | k(c[2]);
};

/**
 * #15 Испепеление — 1:1 по коду оригинала (docs/orig/spells/incinerate.md, карточка tasks/incinerate.md):
 * Play_Incinerate: wait(PSpeed 4 с) ПЕРЕД залпом; затем FireNum облачков через 0.07 с, каждое рождается у мага
 * и летит по направлению ДВИЖЕНИЯ мага в момент рождения ±16° (маг движется — поток гнётся).
 * Облачко (ID 15): 6.82 ед/с (387 px/с), scale Size·0.75 + 0.2, ×1.115 за тик 0.03; коллайдер (1.0 × 0.8) × scale;
 * кадры 01..06 по 0.05 с, на 07 скорость ×0.5 и рост ×1.01, на 09 коллайдер выкл.; жизнь 0.42 с; пробой 999, каждого врага раз.
 * Свойства: 488 Пламенный удар (ступени по номеру облачка в касте: ×1.75 с 10-го … ×4 голубое с 31-го),
 * 489 Пироман (на КАЖДОЕ облачко 2 языка-взрыва 72 px после кадров 4 и 7), 490 Пламя Цербера (3 облачка за тик: 0, ±40°, розовые).
 * Слияния (числа карточки; полностью — партия 6): 11 Огненное дыхание (5 потоков по 72°), 19 Инферно (ступени ×6…×30),
 * 55 Адское пламя (цикл углов, 2 взрыва на облачко).
 */
class Incinerate extends DataSpell {
  private co: Co | null = null;
  private clouds = new OrigBullets();
  private booms: { x: number; y: number; t: number; at: number; half: number; dmg: number }[] = [];

  private get size(): number { return Math.round(100 + this.pctOf('size') + W.stats.size * 100) / 100; }
  private get pSpeed(): number { return Math.max(0.05, this.cdOrig(this.data.base.cd ?? 4) * this.cdGlobal); }
  /** BSpeed = 62·(Range+100)·0.01·0.1; шаг за тик 0.03 — BSpeed·0.033 */
  private get rangeK(): number { return (this.pctOf('range') + 100) / 100; }
  /** BulletAniDeley = (Range·0.01 + 1)·0.05 */
  private get aniDelay(): number { return this.rangeK * 0.05; }

  onChange() {
    super.onChange();
    if (!this.co) this.co = new Co(this.loop());
  }

  destroy() {
    this.clouds.destroy();
    this.booms = []; this.co = null;
  }

  update(dt: number) {
    if (!this.co) this.onChange();
    this.co!.update(dt);
    this.clouds.update(dt);
    this.updateBooms(dt);
  }

  // ———— Play_Incinerate ————
  private *loop(): Generator<number, void, unknown> {
    for (;;) {
      yield this.pSpeed;
      const n = this.count;
      if (this.hasCombo(19)) {
        const cyc = [0, 8, -8, 16, -16];
        for (let i = 0; i < n; i++) { this.cloud(this.moveAng() + cyc[i % 5] * DEG, i, 1); if (i < n - 1) yield 0.06; }
        continue;
      }
      if (this.hasCombo(55)) {
        const cyc: [number, number][] = [[0, 1.2], [14, 1], [-14, 1], [28, 0.8], [-28, 0.8]];
        for (let i = 0; i < n; i++) { const [a, p] = cyc[i % 5]; this.cloud(this.moveAng() + a * DEG, i, p); if (i < n - 1) yield ASPEED; }
        continue;
      }
      for (let i = 0; i < n; i++) {
        const a = this.moveAng();
        if (this.hasCombo(11)) for (let k = 0; k < 5; k++) this.cloud(a + k * 72 * DEG, i, 1);
        else if (this.hasProp(490)) for (const k of [0, 40, -40]) this.cloud(a + k * DEG, i, 1);
        else this.cloud(a, i, 1);
        if (i < n - 1) yield ASPEED;
      }
    }
  }

  /** направление движения мага (_moveVector, стоит — последнее) */
  private moveAng() { return Math.atan2(W.player.faceY, W.player.faceX); }

  /** Bullet_Create кейс 15 / 47 / 64 / 65 / 84 / 109 */
  private cloud(dir: number, i: number, power: number) {
    const P = W.player, S = this.size;
    let k: Kind = BASE, pw = power, sz = 1;
    const c11 = this.hasCombo(11), c19 = this.hasCombo(19), c55 = this.hasCombo(55);
    if (c11) k = { ...BASE, c: [1, 0.6, 0.1], d: [0.01, 0.06, 0.01], kx: 0.7, ky: 0.2, px: 0.25, py: 0.25, cy: 0.7 };
    else if (this.hasProp(490)) k = { ...BASE, c: [1, 0.6, 0.9], d: [0.01, 0.05, 0.09], kx: 0.75, ky: 0.5, px: 0, py: 0 };
    if (this.hasProp(488) && !c11) {
      const st = STEPS.find((s) => i >= s[0]);
      if (st) { pw *= st[1]; sz = st[2]; k = { ...k, c: st[3], d: st[4] }; }
      if (!this.hasProp(490)) k = { ...k, px: 0.15, py: 0.15 };
    }
    if (c19) { const st = INFERNO.find((s) => i >= s[0])!; pw *= st[1]; sz = st[2]; k = { ...k, c: [0.6, 0.85, 1], d: [0.02, 0.05, 0.01] }; }
    const ang = dir + rnd(-AIM, AIM) * DEG;
    const c = Math.cos(ang), s = Math.sin(ang);
    const fwd = (S * 0.125 + (c11 ? 0.25 : 0)) * U;
    const sx0 = (S * k.kx + k.px) * sz, sy0 = (S * k.ky + k.py) * sz;
    const ani = this.aniDelay, step = 6.2 * this.rangeK * 0.033 * U;
    const life = c19 ? 0.33 : 6 * ani + 4 * 0.03;
    const dmg = this.dmg * pw;
    const pyro = this.hasProp(489) && !c11 && !c19 && !c55;
    this.clouds.fire({
      x: P.x + c * (fwd + 6.2 * this.rangeK * 0.01 * U), y: P.y + s * (fwd + 6.2 * this.rangeK * 0.01 * U), ang, sp: 0, life,
      tex: CLOUD[0], scaleX: sx0, scaleY: sy0, tint: rgb(k.c), normal: true,
      hl: 0.5 * sx0 * U, hw: (k.cy / 2) * sy0 * U, pierce: 999, dmg, src: this.def.id,
      data: { acc: 0, n: 0, sx: sx0, sy: sy0, up: 1.115, v: step, booms: 0 },
      step: (b) => this.move(b, k, ani, pyro, c55, power),
    });
  }

  /** Incinerate_Moving + Incinerate_Animation: тик 0.03 */
  private move(b: OBullet, k: Kind, ani: number, pyro: boolean, c55: boolean, power: number) {
    const d = b.data;
    while (d.acc + 0.03 <= b.t) {
      d.acc += 0.03; d.n++;
      // после кадров 01..06 (6·ani) — кадр 07: скорость ×0.5, рост ×1.01; кадр 09 — коллайдер выкл.
      if (d.acc >= 6 * ani && d.up !== 1.01) { d.up = 1.01; d.v *= 0.5; }
      if (d.acc >= 6 * ani + 0.06) b.hl = 0;
      d.sx *= d.up; d.sy *= d.up;
      b.x += Math.cos(b.ang) * d.v; b.y += Math.sin(b.ang) * d.v;
      if (b.hl > 0) { b.hl = 0.5 * d.sx * U; b.hw = (k.cy / 2) * d.sy * U; }
      b.img.setScale(PX * d.sx, PX * d.sy);
      b.img.setTint(rgb([k.c[0] - k.d[0] * d.n, k.c[1] - k.d[1] * d.n, k.c[2] - k.d[2] * d.n]));
      b.img.setAlpha(Math.max(0, 0.9 - 0.045 * d.n));
      // 489 Пироман: после кадра 4 и после кадра 7 — язык; 55: после кадра 5 и после кадра 9 — взрыв
      if (pyro && ((d.booms === 0 && d.acc >= 4 * ani) || (d.booms === 1 && d.acc >= 6 * ani + 0.03))) {
        d.booms++;
        const r = rnd(-0.2, 2.85);
        this.boom(b.x + (rnd(-1.5, 1.5) + Math.cos(b.ang) * r) * U, b.y + (rnd(-1.5, 1.5) + Math.sin(b.ang) * r) * U,
          (1.7 * 0.75 * this.size / 2) * U, b.dmg, 0.09, 0.84, 1.275 * 1.25 * this.size);
      }
      if (c55 && ((d.booms === 0 && d.acc >= 5 * ani) || (d.booms === 1 && d.acc >= 6 * ani + 0.09))) {
        const first = d.booms === 0; d.booms++;
        const r = first ? rnd(1, 2) : rnd(1.2, 2.2), a = Math.random() * Math.PI * 2, f = first ? 1.58 : 2.92;
        const x = b.x + (Math.cos(a) * r + Math.cos(b.ang) * f) * U, y = b.y + (Math.sin(a) * r + Math.sin(b.ang) * f) * U;
        // Explosion109: спрайта в игре нет — только урон (Base 0.75, коллайдер 3.5)
        this.boom(x, y, (3.5 * 0.75 * this.size / 2) * U, b.dmg, 0, 0, 0);
      }
    }
    // Incinerate_Animation: 01..06 по BulletAniDeley, 07..10 по 0.03
    const f = b.t < 6 * ani ? Math.floor(b.t / ani) : 6 + Math.min(3, Math.floor((b.t - 6 * ani) / 0.03));
    b.img.setTexture(CLOUD[f]);
  }

  // ———— взрывы ————
  private boom(x: number, y: number, half: number, dmg: number, at: number, life: number, _px: number) {
    // язык пламени (Explosion64): Explosion50_01..14, паузы 0.03, 0.03, далее 0.06; BaseScale 0.75 (Area 1)
    if (life > 0) {
      W.fx.anim(x, y, EX50, 0.03, 0.06, 0.75 * PX, 0.75 * PX, {
        last: 0.03,
        hook: (img, t) => { img.setTexture(EX50[t < 0.03 ? 0 : t < 0.06 ? 1 : Math.min(13, 2 + Math.floor((t - 0.06) / 0.06))]); },
      });
    }
    this.booms.push({ x, y, t: 0, at, half, dmg });
  }

  private updateBooms(dt: number) {
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      const was = b.t;
      b.t += dt;
      if (was <= b.at && b.t >= b.at) boxDamage(b.x, b.y, 0, b.half, b.half, b.dmg, this.def.id);
      if (b.t >= b.at + 0.01) {
        this.booms[i] = this.booms[this.booms.length - 1]; this.booms.pop();
      }
    }
  }
}

export const INCINERATE = defFromData(SPELL_BY_ID[15], (def) => new Incinerate(def, SPELL_BY_ID[15]));
