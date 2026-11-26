import Phaser from 'phaser';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { boxDamage, Co, OrigBullets, type OBullet, TICK, U } from './_orig';

const DEG = Math.PI / 180;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** 434 Полюс: точки появления d[k] и курсы e[k] (ед., y вверх), k = 1..7 (tsunami.md §6.1) */
const POLE_D: [number, number][] = [[6.259, 7.272], [9.588, -0.359], [5.697, -7.721], [-2.484, -9.268], [-8.795, -3.836], [-8.483, 4.484], [-1.782, 9.428]];
/** 23 Потоп: пять параллельных волн, локальный y (x = −2) */
const FLOOD_Y = [-4.2, -2.1, 0, 2.1, 4.2];
/** 48 Феникс: веер относительно джойстика, без повторов до опустошения */
const PHOENIX_FAN = [-40, -20, 0, 20, 40];

// ——— текстуры-заглушки по меркам спрайтов (rect 800×300, рисуем 200×75 = ×4; рисуем с Денисом позже) ———
const K = 4;
type Kind = 'water' | 'ice' | 'lava' | 'flood' | 'phoenix' | 'glacium';
const COLORS: Record<Kind, [number, number, number]> = {
  // тело, гребень, хвост
  water: [0x33c6ff, 0xffffff, 0x1f8fd0],      // Incinerate4
  ice: [0x9fe4ff, 0xffffff, 0x6fb8e8],        // Incinerate9
  lava: [0xd8261a, 0x1a0a08, 0xffb030],       // Incinerate8: красное тело, чёрный гребень, жёлто-оранжевый хвост
  flood: [0x2fa8ff, 0xe8fbff, 0x1a70c0],      // Incinerate29
  phoenix: [0xff5a1a, 0xfff0b0, 0xc01808],    // Incinerate33
  glacium: [0xbff0ff, 0xffffff, 0x80c8f0],    // Incinerate44
};
const texKey = (k: Kind, f: number) => `ts_${k}_${f}`;
/** длина видимой части кадров 01..03 (720 / 685 / 644 из 800) */
const FRAME_LEN = [0.9, 0.856, 0.805];

function textures() {
  const tx = W.scene.textures;
  for (const kind of Object.keys(COLORS) as Kind[]) {
    const [body, crest, tail] = COLORS[kind];
    FRAME_LEN.forEach((len, f) => {
      const key = texKey(kind, f);
      if (tx.exists(key)) return;
      const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
      const w = 200, h = 75, x1 = 100 + (w * len) / 2 - 2, x0 = 100 - (w * len) / 2;
      // рваный хвост слева
      g.fillStyle(tail, 0.55);
      for (let i = 0; i < 6; i++) g.fillEllipse(x0 + 14 + i * 9, 20 + ((i * 17) % 36), 26, 7);
      // тело
      g.fillStyle(body, 0.85); g.fillEllipse((x0 + x1) / 2 + 8, 37, (x1 - x0) * 0.86, 62);
      g.fillStyle(body, 1); g.fillEllipse((x0 + x1) / 2 + 22, 37, (x1 - x0) * 0.6, 50);
      // гребень спереди (справа)
      g.fillStyle(crest, 1); g.fillEllipse(x1 - 16, 37, 26, 58);
      g.fillStyle(body, 1); g.fillEllipse(x1 - 26, 37, 18, 46);
      g.generateTexture(key, w, h); g.destroy();
    });
  }
}

/** кадр по циклу 01 → 02 → 03 → 02 */
const CYCLE = [0, 1, 2, 1];

interface WaveData { kind: Kind; fd: number; i: number; nextT: number; phase: number; freeze: boolean; gone?: boolean; boom?: number }

/**
 * #9 Цунами — 1:1 по коду оригинала (docs/orig/spells/tsunami.md, карточка tasks/tsunami.md):
 * Play_Tsunami: wait(PSpeed); цикл: Base = позиция мага в момент каста, wait 0.5 (предупреждение),
 * Num волн (ID 14): старт Base + (−4.9, +8.25) + (r, r), r = Random(±1.66), курс всегда −59.3° (сверху-слева вниз-вправо),
 * между волнами 0.123 + Random(−0.03, 0.06); затем wait(PSpeed + 0.5). Волна: Random(0.295, 0.315) ед. за тик 0.03 с,
 * AnimationA: 18 кадров по Random(0.07, 0.09) с, alpha 1 − 0.055·i, коллайдер 3.4×2.8 (центр +1.1) × (Size·0.5 + 0.4)
 * выключается после 15-го; каждому врагу — один удар за волну, пробой 999.
 * Свойства: 434 Полюс (ID 49: 7 точек d[k]·Random(0.5,1.5), курсы e[k], 0.03–0.05 с, заморозка 1 с × сопротивление ×0.67),
 * 435 Песнь сирены (ID 63: от мага по джойстику ±12°, 3 ед. назад, медленнее, AnimationC — проявление),
 * 436 Великое извержение (ID 37: ±2.66, 0.065–0.125 с, лава).
 * Слияния (числа §9/§9.1; полностью — партия 6): 23 Потоп (ID 86: N × 5 параллельных волн, 0.2 с, MovingD),
 * 48 Феникс (ID 102: веер ±40° по джойстику, 0.18 с, 4 взрыва ×0.25 вокруг волны), 61 Глейсиум (ID 123: кольцо из N, MovingE, AnimationE).
 */
class Tsunami extends DataSpell {
  private bullets = new OrigBullets();
  private co: Co | null = null;
  /** FreezeResistance врагов (по id): 1 → ×0.67 после каждой заморозки */
  private frzRes = new Map<number, number>();
  private fan: number[] = [];
  /** артефакт 146: накопленный множитель урона, перезарядки и число накоплений */
  private sumDmg = 1;
  private sumCool = 1;
  private sumN = 0;

  /** TsunamiSize = (100 + AreaU)% */
  private get size(): number { return Math.round(100 + this.pctOf('size') + W.stats.size * 100) / 100; }
  private get flow(): number { return this.speedMul; }
  private get pSpeed(): number { return Math.max(0.05, this.cdOrig(this.data.base.cd ?? 8.5) * this.cdGlobal); }
  private get freezeT(): number { return 1.0 * W.stats.durMul; }

  onChange() {
    super.onChange();
    textures();
    if (!this.co) this.co = new Co(this.loop());
  }

  destroy() { this.bullets.destroy(); this.co = null; this.frzRes.clear(); }

  update(dt: number) {
    if (!this.co) this.onChange();
    this.co!.update(dt);
    this.bullets.update(dt);
  }

  /** джойстик (экран, y вниз): текущее направление или последнее */
  private joy(): number { return Math.atan2(W.player.faceY, W.player.faceX); }

  // ———— Play_Tsunami ————
  private *loop(): Generator<number, void, unknown> {
    yield this.pSpeed;
    for (;;) {
      const P = W.player, bx = P.x, by = P.y;
      yield 0.5;
      const n = this.count;
      // 146 Волшебная флейта (эффект 265 = 12 %): 3 накопления (+12 % урона, КД ×0.88), 4-й запуск — сброс
      const flute = (W.stats.artFx[265] ?? 0) / 100;
      if (this.fusion || flute <= 0 || this.sumN > 2) { this.sumDmg = 1; this.sumCool = 1; this.sumN = 0; }
      else { this.sumDmg += flute; this.sumCool *= 1 - flute; this.sumN++; }
      if (this.hasCombo(61)) {
        // ID 123: кольцо, все в одном кадре
        const a0 = rnd(0, 90);
        for (let x = 0; x < n; x++) this.glacium(bx, by, -(a0 + (360 / n) * x) * DEG);
      } else if (this.hasCombo(23)) {
        const ang = this.joy();
        for (let x = 0; x < n; x++) { for (const ly of FLOOD_Y) this.flood(bx, by, ang, ly); yield 0.2; }
      } else if (this.hasCombo(48)) {
        const ang = this.joy();
        for (let x = 0; x < n; x++) {
          if (!this.fan.length) this.fan = PHOENIX_FAN.slice();
          const a = this.fan.splice((Math.random() * this.fan.length) | 0, 1)[0];
          this.phoenix(bx, by, ang - a * DEG);
          yield 0.18;
        }
      } else if (this.hasProp(434)) {
        for (let x = 0; x < n; x++) {
          const [dx, dy] = POLE_D[(Math.random() * 7) | 0], r = rnd(0.5, 1.5);
          // e = −(d.y, d.x) + шум ±2 (ед., y вверх) → экран: y со знаком минус
          const ex = -dy + rnd(-2, 2), ey = -dx + rnd(-2, 2);
          this.wave('ice', bx + dx * r * U, by - dy * r * U, Math.atan2(-ey, ex), true);
          yield 0.04 + rnd(-0.01, 0.01);
        }
      } else if (this.hasProp(435)) {
        for (let x = 0; x < n; x++) { this.siren(); yield 0.123 + rnd(-0.03, 0.06); }
      } else {
        const lava = this.hasProp(436), R = lava ? 2.66 : 1.66;
        const ang = Math.atan2(8.25, 4.9);   // экран: (+4.9, +8.25) → 59.3° вниз-вправо
        for (let x = 0; x < n; x++) {
          const r = rnd(-R, R);
          this.wave(lava ? 'lava' : 'water', bx + (-4.9 + r) * U, by - (8.25 + r) * U, ang, false);
          yield lava ? 0.095 + rnd(-0.03, 0.03) : 0.123 + rnd(-0.03, 0.06);
        }
      }
      yield this.pSpeed * this.sumCool + 0.5;
    }
  }

  // ———— волны ————
  /** общий коллайдер префаба Tusnami: (3.4, 2.8), центр (1.1, 0) × scale */
  private baseWave(kind: Kind, x: number, y: number, ang: number, step: number, sc: number, life: number, o: Partial<OBullet> = {}): OBullet {
    const b = this.bullets.fire({
      x, y, ang, sp: (step * this.flow / TICK) * U, life,
      tex: texKey(kind, 0), scaleX: K * sc,
      hl: 1.7 * sc * U, hw: 1.4 * sc * U, cx: 1.1 * sc * U,
      pierce: 999, dmg: this.dmg * this.sumDmg, src: this.def.id, ...o,
    });
    if (kind === 'lava') b.img.setBlendMode(Phaser.BlendModes.NORMAL);
    return b;
  }

  /** ID 14 / 37 / 49: MovingA/B + AnimationA (18 кадров, коллайдер OFF после 15-го) */
  private wave(kind: Kind, x: number, y: number, ang: number, freeze: boolean) {
    const sc = this.size * rnd(0.9, 1.1) * 0.5 + 0.4, fd = rnd(0.07, 0.09);
    const hl = 1.7 * sc * U;
    this.baseWave(kind, x, y, ang, rnd(0.295, 0.315), sc, 18 * fd + 1e-4, {
      data: { kind, fd, i: 0, nextT: 0, phase: 0, freeze } as WaveData,
      step: (b) => this.animA(b, hl),
      onHit: freeze ? (b, e) => { this.hitFreeze(b, e); return true; } : undefined,
    });
  }

  private animA(b: OBullet, hl: number) {
    const d = b.data as WaveData;
    while (b.t >= d.nextT && d.i < 18) {
      d.i++; d.nextT += d.fd;
      b.img.setTexture(texKey(d.kind, CYCLE[d.i % 4])).setAlpha(1 - 0.055 * d.i);
      b.hl = d.i > 15 ? 0 : hl;
    }
    b.alpha = () => 1 - 0.055 * d.i;
  }

  private hitFreeze(b: OBullet, e: Enemy) {
    W.enemies.damage(e, b.dmg, 0, 0, b.src);
    const r = this.frzRes.get(e.id) ?? 1;
    if (r > 0) W.enemies.freeze(e, this.freezeT * r);
    this.frzRes.set(e.id, r * 0.67);
  }

  /** AnimationC (435, 86): проявление 4 кадра alpha 0.25·i (коллайдер ON при i = 2, список ударов очищается), затем 12 кадров 1 − 0.078·i, OFF при i ≥ 9 */
  private animC(b: OBullet, hl: number) {
    const d = b.data as WaveData;
    while (b.t >= d.nextT && d.i < 16) {
      d.i++; d.nextT += d.fd;
      const f = d.i <= 4 ? d.i : d.i - 4;
      const a = d.i <= 4 ? 0.25 * f : 1 - 0.078 * f;
      b.img.setTexture(texKey(d.kind, CYCLE[d.i % 4]));
      b.alpha = () => a;
      if (d.i === 2) { b.hits.clear(); b.hl = hl; }
      if (d.i > 4 && f >= 9) b.hl = 0;
    }
  }

  /** ID 63: из мага по джойстику (Aim 60 → ±12°), MovingC: Random(0.2, 0.3), сдвиг (r, r) и 3 ед. назад */
  private siren() {
    const P = W.player, ang = this.joy() + rnd(-12, 12) * DEG;
    const sc = this.size * rnd(0.9, 1.1) * 0.5 + 0.4, fd = rnd(0.07, 0.09), r = rnd(-1.5, 1.5);
    const hl = 1.7 * sc * U;
    const x = P.x + Math.cos(ang) * U + (r - Math.cos(ang) * 3.0) * U;
    const y = P.y + Math.sin(ang) * U + (-r - Math.sin(ang) * 3.0) * U;
    const b = this.baseWave('water', x, y, ang, rnd(0.2, 0.3), sc, 16 * fd + 1e-4, {
      data: { kind: 'water', fd, i: 0, nextT: 0, phase: 0, freeze: false } as WaveData,
      step: (bb) => this.animC(bb, hl),
    });
    b.hl = 0; b.img.setAlpha(0); b.alpha = () => 0;
  }

  /** ID 86 (Потоп): локально (−2, y) от точки каста, MovingD Random(0.25, 0.35), сдвиг (r, r) и 3.5 ед. назад, AnimationC */
  private flood(bx: number, by: number, ang: number, ly: number) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const sc = this.size * 0.5 + 0.4, fd = rnd(0.07, 0.09), r = rnd(-1.5, 1.5), hl = 1.7 * sc * U;
    // локальный (lx, ly) Unity → экран: поворот на ang, y локальный со знаком минус
    const lx = -2 - 3.5, lyS = -ly;
    const x = bx + (lx * c - lyS * s + r) * U, y = by + (lx * s + lyS * c - r) * U;
    const b = this.baseWave('flood', x, y, ang, rnd(0.25, 0.35), sc, 16 * fd + 1e-4, {
      data: { kind: 'flood', fd, i: 0, nextT: 0, phase: 0, freeze: false } as WaveData,
      step: (bb) => this.animC(bb, hl),
    });
    b.hl = 0; b.img.setAlpha(0); b.alpha = () => 0;
  }

  /** ID 102 (Феникс): scale (S·0.15 + 0.75, S·0.1 + 0.55), коллайдер 7.5×6.5, 35 тиков × 0.48 ед., затем 8 тиков alpha 0.8 − 0.1·i; 4 взрыва ×0.25 */
  private phoenix(bx: number, by: number, ang: number) {
    const S = this.size, sx = S * 0.15 + 0.75, sy = S * 0.1 + 0.55;
    const b = this.bullets.fire({
      x: bx, y: by, ang, sp: (0.48 / TICK) * U, life: 43 * TICK,
      tex: texKey('phoenix', 0), scaleX: K * sx, scaleY: K * sy,
      hl: 3.75 * sx * U, hw: 3.25 * sy * U, pierce: 999, dmg: this.dmg, src: this.def.id,
      data: { kind: 'phoenix', fd: 0.05, i: 0, nextT: 0.05, phase: 0, freeze: false, boom: 0 } as WaveData,
      alpha: (bb) => (bb.t < 35 * TICK ? 0.85 : 0.8 - 0.1 * Math.floor((bb.t - 35 * TICK) / TICK)),
      step: (bb) => {
        const d = bb.data as WaveData;
        if (bb.t >= 35 * TICK) bb.sp = 0;
        // Tsunami102_Animation: кадры 2/3/4 по 0.05 с → 1, 1, 2 взрыва ID 102
        while (bb.t >= d.nextT && d.i < 3) {
          d.i++; d.nextT += 0.05;
          const k = d.i === 3 ? 2 : 1, rr = [3.3, 3.6, 3.9][d.i - 1];
          for (let j = 0; j < k; j++) {
            const a = Math.random() * Math.PI * 2, r = rnd(1, rr);
            const ex = bb.x + Math.cos(a) * r * U, ey = bb.y + Math.sin(a) * r * U, half = 2.5 * 0.7 / 2 * U;
            boxDamage(ex, ey, 0, half, half, this.dmg * 0.25, this.def.id);
            W.fx.puff(ex, ey, half * 2.4, 0xff7a30, 0.3);
          }
        }
      },
    });
    b.img.setBlendMode(Phaser.BlendModes.ADD);
  }

  /** ID 123 (Глейсиум): scale (S·0.6 + 0.6, S·0.5 + 0.5), коллайдер (3, 2.8) центр (1.5, 0), MovingE 0.28, AnimationE */
  private glacium(bx: number, by: number, ang: number) {
    const S = this.size, sx = S * 0.6 + 0.6, sy = S * 0.5 + 0.5, wait0 = rnd(0.03, 0.09);
    const hl = 1.5 * sx * U;
    const b = this.bullets.fire({
      x: bx, y: by, ang, sp: (0.28 * this.flow / TICK) * U, life: 99,
      tex: texKey('glacium', 0), scaleX: K * sx, scaleY: K * sy,
      hl: 0, hw: 1.4 * sy * U, cx: 1.5 * sx * U, pierce: 999, dmg: this.dmg, src: this.def.id,
      data: { kind: 'glacium', fd: 0, i: 0, nextT: wait0, phase: 0, freeze: false } as WaveData,
      step: (bb) => {
        const d = bb.data as WaveData;
        while (bb.t >= d.nextT) {
          if (d.i >= 25) { this.bullets.end(bb); return; }
          d.i++;
          d.nextT += rnd(0.06, 0.08);
          const a = Math.min(1, 1.5 - 0.06 * d.i);
          bb.img.setTexture(texKey('glacium', CYCLE[d.i % 4]));
          bb.alpha = () => a;
          bb.hl = d.i >= 21 ? 0 : hl;
        }
      },
    });
    b.alpha = () => 1;
  }
}

export const TSUNAMI = defFromData(SPELL_BY_ID[9], (def) => new Tsunami(def, SPELL_BY_ID[9]));
