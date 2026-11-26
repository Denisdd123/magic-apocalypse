import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { aimAngle, boxDamage, Co, ensureOrigTextures, OrigBullets, OT, origTargets, PX, smoke, TICK, U, type OBullet } from './_orig';

/** UnitApply_ShootingRange (StartInformation_B @0x11c488c) */
const RANGE = 23;
/** Obj_UnitDoppelganger01–03, позиции в сцене C_BattleField (ед., y вверх) — Двойник (367) */
const DOPPEL: [number, number][] = [[-0.5997, 0.5087], [0.7404, 0.265], [-0.1407, -0.7737]];
/** Аватар (10033): шестиугольник вокруг мага (StartInformation_B @0x11dc998, 9-й круг) */
const AVATAR: [number, number][] = [[-1.5, 0], [-0.75, 1.3], [0.75, 1.3], [1.5, 0], [0.75, -1.3], [-0.75, -1.3]];
/** Фейерверк (кейс 98): r = Random(1, 10) → множитель урона, Area, цвет */
const FIRE: { k: number; area: number; tint: number }[] = [
  { k: 9, area: 3.8, tint: 0xff5973 }, { k: 5, area: 2.5, tint: 0xf2ff52 }, { k: 5, area: 2.5, tint: 0xf2ff52 },
  { k: 3, area: 2.0, tint: 0x94ff54 }, { k: 3, area: 2.0, tint: 0x94ff54 }, { k: 2, area: 1.5, tint: 0x4ff7ff },
  { k: 2, area: 1.5, tint: 0x4ff7ff }, { k: 1, area: 1.0, tint: 0xe07aff }, { k: 1, area: 1.0, tint: 0xe07aff },
];
const COL_ARROW = 0x8cf2ff;     // (0.55, 0.95, 1)
const COL_CRACKER = 0xfffaab;   // (1, 0.98, 0.67)
const COL_BLASTER = 0xccd1ff;   // (0.8, 0.82, 1)

// ——— кадры оригинала (полные холсты Unity, public/vfx/bolt/orig; мелкие — сглажены ×4, суффикс _s, масштаб /4) ———
const O = 'vfx/bolt/orig/';
const seq = (pre: string, n: number, suf = '') => Array.from({ length: n }, (_, i) => `${pre}_${String(i + 1).padStart(2, '0')}${suf}`);
const B1 = 'Bullet1_01_s', SM1 = seq('BulletSmoke1', 3, '_s'), HIT1 = seq('Bullet1Hit', 6);
const ARROW = seq('Incinerate3', 3), SM3 = ['BulletSmoke3_04'];
const B8 = 'Bullet8_01', SM8 = seq('BulletSmoke8', 3), EX8 = seq('Explosion8', 8);
const B10 = 'Bullet10_01', SM10 = seq('BulletSmoke10', 3), HIT10 = seq('Bullet10Hit', 6);
const EX98 = seq('Explosion98', 11), BEAM = seq('Incinerate20', 10);
/** список загрузки (GameScene.preload): [ключ, путь] */
export const BOLT_LOAD: [string, string][] = [
  ...[B1, ...SM1, ...ARROW, ...SM3, B8, ...SM8, ...EX8, B10, ...SM10, ...HIT1, ...HIT10, ...EX98, ...BEAM].map((k): [string, string] => [k, `${O}${k}.png`]),
];

type Pt = { x: number; y: number };
interface Phantom { img: Phaser.GameObjects.Image; ox: number; oy: number; co: Co; t: number; phase: number }

/**
 * #1 Магическая пуля (MagicBullet) — 1:1 по коду оригинала (docs/orig/spells/bolt.md):
 * Unit_DistanceAttack: цель — одна на залп, d = (|dx| + |dy|)·приоритет ≤ 23 ед. (боссы ×0.5),
 * Num пуль через 0.2/Num с (≥ 0.042), разброс ±AccuracyAim·0.2°, после залпа пауза PSpeed (0.05…4.5 с).
 * Пуля: 9.67 ед/с, 81 тик, прозрачность 2.4 − t, коллайдер 0.2×0.075 ед., дымок раз в 0.06 с, вспышка попадания 0.36 с.
 * Свойства: 362 Стрела (кейс 3), 363 Петарда (кейс 8 + взрыв 8), 364 Раскол (кейс 10, 3 цели),
 * 365 Непрерывная атака (числа), 366 Лихорадка (Play_WildShot), 367 Двойник (3 фантома стреляют вместо мага).
 * Слияния (партия 6): 33 Аватар (6 фантомов, Num = 1, +33 %·(N−1), ×1.5 при 362, ×9.99), 42 Фейерверк (кейс 98 + взрыв 98),
 * 54 Бластер (кейс 108: каждая 6-я пуля мага — луч ×7). Множители ×5/×9.99 и размер +50 % — моды слияния.
 */
class Bolt extends DataSpell {
  private bullets = new OrigBullets();
  private co: Co | null = null;
  private phantoms: Phantom[] = [];
  /** BulletFireCount Бластера (каждая 6-я пуля мага) */
  private fireCount = 0;

  // ———————— числа (StartInformation_B) ————————
  private get avatar() { return this.hasCombo(33); }
  /** Num до сжатия Аватаром */
  private get numRaw() { return Math.max(1, this.count); }
  private get num() { return this.avatar ? 1 : this.numRaw; }
  private get shotNum() { return this.hasProp(363) ? 3 : 1; }       // эффект 156 +2
  private get targetNum() { return this.hasProp(364) ? 3 : 1; }     // эффект 171 +2 (больше 3 целей код не берёт)
  private get bulletId(): number {
    if (this.hasCombo(42)) return 98;
    if (this.hasCombo(54)) return 108;
    if (this.hasProp(362)) return 3;
    if (this.hasProp(363)) return 8;
    if (this.hasProp(364)) return 10;
    return 1;
  }
  private get aim(): number {
    let a = Math.max((this.shotNum - 1) * 33 + 10, 0);
    if (this.hasProp(362)) a = 60;
    if (this.hasProp(363)) a = 120;
    if (this.hasProp(366)) a = 900;
    if (this.hasCombo(54)) a = this.hasProp(366) ? 900 : 200;
    return a;
  }
  /** пауза между пулями залпа */
  private get dSpeed(): number {
    let d = Math.max(0.2 / this.numRaw, 0.042);
    if (this.hasProp(366)) d = 0.04;
    if (this.hasProp(367)) d += 0.005;
    return d;
  }
  /** пауза после залпа: (0.75 + сек) × ΠRatio × MagicCooltimeRatio, clamp 0.05…4.5 */
  private get pSpeed(): number { return Math.min(4.5, Math.max(0.05, this.cdOrig(this.data.base.cd ?? 0.75) * this.cdGlobal)); }
  /** MagicBulletSize: (100 + SizeU + MSizeU)% (у Стрелы «размер +180%» — только текст, в коде размера нет) */
  private get size(): number {
    const u = this.pctOf('size') - (this.hasProp(362) ? 180 : 0);
    return Math.round(100 + u + W.stats.size * 100) / 100;
  }
  /** скорость, наших ед./с: MSpeed × 0.02 за тик 0.03 с; у Стрелы/Бластера MSpeed = 50 (код, не «+180%») */
  private get speed(): number {
    const ms = this.hasProp(362) ? 50 : 14.5 * Math.max(0, 1 + this.pctOf('speed') / 100);
    return (ms * 0.02 / TICK) * U;
  }
  /** Аватар (@0x11dc5f0): +33 % за каждую пулю до сжатия Num, ×1.5 при 362, ×9.99 всегда (×9.99 — мод слияния) */
  private get bulletDmg(): number {
    const d = this.dmgOf(this.data.base.dmgPct ?? 500, this.avatar ? 33 * (this.numRaw - 1) : 0);
    return this.avatar && this.hasProp(362) ? d * 1.5 : d;
  }

  // ———————— жизненный цикл ————————
  onChange() {
    super.onChange();
    ensureOrigTextures();
    if (!this.co) this.co = new Co(this.mageLoop());
    const pos = this.avatar ? AVATAR : this.hasProp(367) ? DOPPEL : [];
    if (this.phantoms.length !== pos.length) {
      this.phantoms.forEach((p) => p.img.destroy());
      this.phantoms = pos.map(([ox, oy]) => {
        const ph: Phantom = {
          img: W.scene.add.image(0, 0, W.player.img.texture.key).setDepth(DEPTH.player - 0.1),
          ox: ox * U, oy: -oy * U, co: null as unknown as Co, t: 0, phase: 0.2 + Math.random() * 0.6,
        };
        ph.co = new Co(this.phantomLoop(ph));
        return ph;
      });
    }
  }

  destroy() {
    this.bullets.destroy();
    this.phantoms.forEach((p) => p.img.destroy());
    this.phantoms = [];
    this.co = null;
  }

  update(dt: number) {
    if (!this.co) this.onChange();
    this.co!.update(dt);
    if (this.phantoms.length) this.updatePhantoms(dt);
    this.bullets.update(dt);
  }

  /** Play_Doppelganger_MotionAll / Motion: копия кадра мага, прозрачность A01→A02→A03→A02 по 0.2 с */
  private updatePhantoms(dt: number) {
    const P = W.player, pi = P.img;
    const [r, a1, a2, a3] = this.avatar ? [0x80e6ff, 0.8, 0.7, 0.6] : [0xffffff, 0.5, 0.4, 0.3];
    const seq = [a1, a2, a3, a2];
    for (const ph of this.phantoms) {
      ph.t += dt;
      ph.co.update(dt);
      const k = ph.t < ph.phase ? 0 : Math.floor((ph.t - ph.phase) / 0.2) % 4;
      ph.img.setTexture(pi.texture.key).setFlipX(pi.flipX).setScale(pi.scaleX, pi.scaleY)
        .setPosition(P.x + ph.ox, pi.y + ph.oy).setTint(r).setAlpha(seq[k]);
    }
  }

  // ———————— корутины ————————
  /** Unit_DistanceAttack (мага) / Play_WildShot (Лихорадка) */
  private *mageLoop(): Generator<number, void, unknown> {
    yield 0.1;
    for (;;) {
      if (this.phantoms.length) { yield 0.1; continue; } // Двойник: стреляют фантомы (корутина мага остановлена)
      const P = W.player;
      if (this.hasProp(366)) {
        // Play_WildShot: без выбора врага — точка в 1 ед. от мага под случайным углом
        const a = Math.random() * Math.PI * 2;
        const pt = { x: P.x + Math.cos(a) * U, y: P.y + Math.sin(a) * U };
        yield* this.salvo(() => W.player, [pt, pt, pt], 0.03, true);
      } else {
        const T = origTargets(P.x, P.y, RANGE);
        if (!T) { yield 0.1; continue; }
        yield* this.salvo(() => W.player, T.map((e) => ({ x: e.x, y: e.y })), 0.03, true);
      }
      yield this.pSpeed;
    }
  }

  /** Play_Doppelganger_Attack: старт через Random(0.2, 3), цель — от позиции фантома, пауза ShotNum 0.075 с */
  private *phantomLoop(ph: Phantom): Generator<number, void, unknown> {
    yield 0.2 + Math.random() * 2.8;
    const at = () => ({ x: W.player.x + ph.ox, y: W.player.y + ph.oy });
    for (;;) {
      const o = at();
      const T = origTargets(o.x, o.y, RANGE);
      if (!T) { yield 0.1; continue; }
      yield* this.salvo(at, T.map((e) => ({ x: e.x, y: e.y })), 0.075, false);
      yield this.pSpeed;
    }
  }

  /** Залп: Num × TargetNum × ShotNum; пауза ShotNum (0.03 / 0.075 с), между пулями — DSpeed */
  private *salvo(src: () => Pt, pts: Pt[], shotGap: number, main: boolean): Generator<number, void, unknown> {
    const N = this.num, Tn = Math.min(3, this.targetNum), Sn = this.shotNum;
    for (let r = 1; r <= N; r++) {
      for (let t = 0; t < Tn; t++) {
        for (let s = 1; s <= Sn; s++) {
          this.shoot(src(), pts[t], main && t === 0);
          if (Sn > s) yield shotGap;
        }
      }
      if (N > r) yield this.dSpeed;
    }
  }

  // ———————— снаряды (Bullet_Create → BulletAttack) ————————
  private shoot(o: Pt, pt: Pt, main: boolean) {
    const id = this.bulletId;
    let spec = false;
    if (id === 108 && main && ++this.fireCount >= 6) { spec = true; this.fireCount = 0; }
    const ang = aimAngle(o.x, o.y, pt.x, pt.y, this.aim);
    const S = this.size, v = this.speed, dmg = this.bulletDmg, src = this.def.id;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const fade = (b: OBullet) => 2.4 - (b.t - b.moveAt);
    switch (id) {
      case 3: this.arrow(o, ang, S, v, dmg, 2 * S + 0.35, 1.5 * S + 0.35, S * 0.95 + 0.45, COL_ARROW); break;
      case 108:
        if (spec) this.blasterBeam(o, ang, S, dmg * 7);
        else this.arrow(o, ang, S, v * 1.15, dmg, 2.1, 0.45 * S + 1.5, 1.5, COL_BLASTER);
        break;
      case 8: // Петарда: светло-жёлтая, 66 тиков, при касании — взрыв 8 (урон только взрывом)
        this.bullets.fire({
          x: o.x + cs * 0.15 * U, y: o.y + sn * 0.15 * U, ang, tex: B8, scaleX: S, tint: COL_CRACKER, sp: v, normal: true,
          life: 66 * TICK, dmg, hl: 0.2 * S * U, hw: 0.05 * S * U, alpha: fade, smokeDt: 0.06, smokeTint: COL_CRACKER, src,
          smokeFrames: SM8, smokeScale: PX,
          onHit: (b) => { this.explosion8(b.x, b.y, b.dmg, S); return true; },
        });
        break;
      case 98: { // Фейерверк: пуля без коллайдера летит 4…27 тиков и взрывается
        const f = FIRE[(Math.random() * 9) | 0], steps = 3 + ((Math.random() * 24) | 0);
        this.bullets.fire({
          x: o.x + cs * 0.15 * U, y: o.y + sn * 0.15 * U, ang, tex: B8, scaleX: 1.2 * S, scaleY: 1.1 * S, tint: f.tint, normal: true,
          sp: v * 0.9, life: (steps + 1) * TICK, smokeDt: 0.06, smokeTint: f.tint, smokeFrames: SM8, smokeScale: PX, src,
          onEnd: (b) => this.explosion98(b.x, b.y, dmg * f.k, S * f.area, f.tint, f.k === 9),
        });
        break;
      }
      case 10: // Раскол: крупнее, вспышка Bullet10Hit — на враге
        this.bullets.fire({
          x: o.x, y: o.y, ang, tex: B10, scaleX: S, sp: v, life: 81 * TICK, dmg, normal: true,
          hl: 0.25 * S * U, hw: 0.05 * S * U, cx: 0.2 * S * U, alpha: fade, smokeDt: 0.06, smokeFrames: SM10, smokeScale: PX, src,
          // BulletHitStart(10): scale 1, поворот 0, 6 кадров по 0.06 с, в позиции врага
          onHit: (_b, e) => { W.fx.anim(e.x, e.y, HIT10, 0.06, 0.06, PX); },
        });
        break;
      default: // кейс 1: белая пуля
        this.bullets.fire({
          x: o.x, y: o.y, ang, tex: B1, scaleX: S / 4, sp: v, life: 81 * TICK, dmg, normal: true,
          hl: 0.1 * S * U, hw: 0.0375 * S * U, alpha: fade, smokeDt: 0.06, smokeFrames: SM1, smokeScale: PX / 4, src,
          // BulletHitStart(1): scale 1, случайный поворот, 6 кадров по 0.06 с, в позиции пули
          onHit: (b) => { const r = Math.random() * Math.PI * 2; W.fx.anim(b.x, b.y, HIT1, 0.06, 0.06, PX, PX, { hook: (img) => { img.setRotation(r); } }); },
        });
    }
  }

  /**
   * Кейс 3 «Магическая стрела» (и обычная пуля Бластера): старт впереди мага, 4 тика растёт на месте
   * (MagicBulletB_Animation: коллайдер 0.2 → 0.65 → 1.2 × 0.3 ед. × localScale), затем 66 тиков полёта; пробой 999.
   */
  private arrow(o: Pt, ang: number, _S: number, v: number, dmg: number, sx: number, sy: number, fwd: number, tint: number) {
    const cs = Math.cos(ang), sn = Math.sin(ang), grow = 4 * TICK;
    this.bullets.fire({
      x: o.x + cs * fwd * U, y: o.y + sn * fwd * U, ang, tex: ARROW[0], scaleX: sx, scaleY: sy, tint, sp: v, normal: true,
      moveAt: grow, life: grow + 66 * TICK, dmg, pierce: 999, hw: 0.15 * sy * U, smokeDt: 0.06, smokeTint: tint, smokeFrames: SM3, smokeScale: PX, src: this.def.id,
      alpha: (b) => (b.t < TICK ? 0 : 2.4 - (b.t - grow)),
      step: (b) => {
        const f = Math.min(3, Math.floor(b.t / TICK)); // 0..3
        b.img.setTexture(ARROW[Math.max(1, f) - 1]); // Incinerate3_00 (пустой) → _01, _02, _03; кадр 0 невидим (alpha 0)
        const len = [0.2, 0.65, 1.2, 1.2][f], c = [-0.45, -0.2, 0, 0][f];
        b.hl = (len / 2) * sx * U; b.cx = c * sx * U;
        b.img.setScale(PX * sx * [0.1, 0.4, 0.75, 1][f], PX * sy);
      },
    });
  }

  /** Взрыв 8 (Петарда): квадрат 1.65 ед. × Area, урон в первом кадре (0.03 с), 8 кадров ≈ 0.31 с */
  private explosion8(x: number, y: number, dmg: number, area: number) {
    const a = Math.random() * Math.PI * 2, h = 0.825 * area * U;
    boxDamage(x, y, a, h, h, dmg, this.def.id);
    // Explosion8_01..08: 1-й кадр 0.03 с, дальше по 0.04 с (0.31 с), localScale 0.75·Area, случайный поворот
    const r = a;
    W.fx.anim(x, y, EX8, 0.03, 0.04, 0.75 * area * PX, 0.75 * area * PX, { hook: (img) => { img.setRotation(r); } });
  }

  /** Взрыв 98 (Фейерверк): квадрат 4 × 0.35·Area ед., урон 7 кадров по 0.039 с (r = 1: 0.05 с) */
  private explosion98(x: number, y: number, dmg: number, area: number, tint: number, big: boolean) {
    const fr = big ? 0.05 : 0.039, h = 2 * 0.35 * area * U;
    this.bullets.fire({
      x, y, ang: Math.random() * Math.PI * 2, tex: OT.smoke, scaleX: 0, life: 7 * fr, dmg, pierce: 999, hl: h, hw: h, src: this.def.id,
    });
    // Explosion98_01..11 по fr с, localScale 0.35·Area, случайный поворот; кадры 1–7 окрашены, 8–11 — как есть
    const r = Math.random() * Math.PI * 2, sc = 0.35 * area * PX;
    W.fx.anim(x, y, EX98, fr, fr, sc, sc, { hook: (img, _t, n) => { img.setRotation(r); if (n < 7) img.setTint(tint); else img.clearTint(); } });
  }

  /**
   * Бластер, каждая 6-я пуля (кейс 108, Spec01 = 2): ×7, луч Incinerate20 впереди на 5.35 ед.,
   * коллайдер растёт 1 → 2.2 → 4.5 → 6.1 → 5.5 → 4.5 → 3.0 (× 1.8), 10 кадров. Пауза кадра = BulletSpeed = 0.05 с (0x3d4ccccd),
   * как у копья 99 (пауза = BulletSpeed). Кадры Incinerate20 рисуем с Денисом.
   */
  private blasterBeam(o: Pt, ang: number, S: number, dmg: number) {
    const sx = 1.8, sy = 0.45 * S + 4.0, fr = 0.05, fwd = 5.35 * U;
    const lens = [1, 2.2, 4.5, 6.1, 5.5, 4.5, 3.0];
    this.bullets.fire({
      x: o.x + Math.cos(ang) * fwd, y: o.y + Math.sin(ang) * fwd, ang, tex: BEAM[0], scaleX: sx, scaleY: sy, frames: BEAM, frameDt: fr, normal: true,
      tint: 0xe6ebff, life: 10 * fr, dmg, pierce: 999, hl: 0.5 * sx * U, hw: 0.375 * sy * U, src: this.def.id,
      step: (b) => { const f = Math.floor(b.t / fr); b.hl = f < 7 ? (lens[f] / 2) * sx * U : 0; },
    });
    smoke(o.x, o.y, 0xe6ebff);
  }
}

export const BOLT = defFromData(SPELL_BY_ID[1], (def) => new Bolt(def, SPELL_BY_ID[1]));
