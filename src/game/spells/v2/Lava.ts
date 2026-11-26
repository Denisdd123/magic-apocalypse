import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { Co, PX, U } from './_orig';
/** кадры лужи MeteorLand4A/B/C (полный холст 512 px, PPU 100); грузятся в GameScene.preload */
export const LAVA_LOAD: [string, string][] = [
  ['lv_a', 'vfx/lava/orig/MeteorLand4A.png'],
  ['lv_b', 'vfx/lava/orig/MeteorLand4B.png'],
  ['lv_c', 'vfx/lava/orig/MeteorLand4C.png'],
];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** радиус круга точек и шаг 30° (Play_LavaField) */
const RING = 4.0, STEP = 0.5236;
/** пауза между лужами */
const GAP = 0.3;
/** 533: SV02 = HitDamageRatioNum (эффект 592 = 5 → 0.05), не больше 6 стопок */
const MELT = 0.05, MELT_MAX = 6;
/** 148 Сера (эффект 593): LavaFieldSizeExpandRatioNum = 0.03 (StartInformation_B @0x11cac70). У свойства 535 роста нет: его эффект 591 — это КД +50 % */
const SULFUR_EXPAND = 0.03;

// ——— вид: MeteorLand4A/B/C, холст 512 px: в игре localScale × PX на px холста ———
const T = { a: 'lv_a', b: 'lv_b', c: 'lv_c' };

type Kind = 'base' | 'furnace' | 'sun';

interface Pool {
  kind: Kind; x: number; y: number; t: number;
  sc: number; coll: number; expand: number; expT: number;
  dmg: number; dmgExpand: number;
  life: number; hits: Set<number>;
  /** C56: курс, скорость (ед./тик) */
  ang: number; v: number; acc: number;
  img: Phaser.GameObjects.Image;
}

/**
 * #20 Лавовая область — 1:1 по коду оригинала (docs/orig/spells/lava.md, карточка tasks/lava.md):
 * Play_LavaField: wait(PSpeed); цикл: 12 точек на круге 4 ед. (227 px) вокруг мага, шаг 30°; Num луж в случайные точки
 * без повторов, ± Random(−2, 2) ед. по осям, по одной через 0.3 с; затем wait(PSpeed + Time) — КД после окончания.
 * Лужа (MeteorLand ID 4): scale Size·0.5 + 0.35, коллайдер КВАДРАТ 2.5 × scale (121 px); появление 11 × 0.06 с без урона,
 * Time 6 с — кадры A/B/C по 0.15 с, импульс в окне кадра A (раз в 0.45 с, каждый враг раз за импульс), угасание 11 × 0.06 с.
 * Свойства: 533 Плавление (каждое попадание лужи: стопка +5 % получаемого врагом урона, до 6; не спадает),
 * 534 Кратер (только числа), 535 Излияние магмы (одна лужа: Size +30 п.п. за каждую, рост +0.5·0.33 каждые 0.33 с ×0.98, ≥0.008).
 * Слияния (числа карточки; полностью — партия 6): 21 Доменная печь (под магом, рост урона и размера), 56 Эра Солнца (катятся от мага).
 */
class Lava extends DataSpell {
  private co: Co | null = null;
  private pools: Pool[] = [];
  private spare: Phaser.GameObjects.Image[] = [];
  /** 533: id врага → [стопки, базовый hitRatio] */
  private melt = new Map<number, [number, number]>();

  /** Num до пересчёта 535 (534 — ×2 из данных) */
  private get numRaw(): number { return this.count; }
  private get num(): number { return this.hasProp(535) ? 1 : this.numRaw; }
  /** Size = (100 + SizeU + MSizeU + 535: Num·30)% */
  private get size(): number {
    const bonus = this.hasProp(535) ? this.numRaw * 30 : 0;
    return Math.round(100 + this.pctOf('size') + W.stats.size * 100 + bonus) / 100;
  }
  private get pSpeed(): number { return Math.max(0.05, this.cdOrig(this.data.base.cd ?? 5) * this.cdGlobal); }
  private get time(): number { return this.durSec; }

  onChange() {
    super.onChange();
    if (!this.co) this.co = new Co(this.loop());
  }

  destroy() {
    for (const p of this.pools) p.img.destroy();
    for (const i of this.spare) i.destroy();
    this.pools = []; this.spare = []; this.co = null;
    this.melt.clear();
  }

  update(dt: number) {
    if (!this.co) this.onChange();
    this.co!.update(dt);
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const p = this.pools[i];
      if (!this.step(p, dt)) {
        p.img.setVisible(false); this.spare.push(p.img);
        this.pools[i] = this.pools[this.pools.length - 1]; this.pools.pop();
      }
    }
  }

  // ———— Play_LavaField ————
  private *loop(): Generator<number, void, unknown> {
    yield this.pSpeed;
    for (;;) {
      const n = this.num;
      if (this.hasCombo(21)) {
        // Com01: лужа прямо под магом, паузы 0.5 с; wait PSpeed + Time + 0.6
        for (let i = 0; i < n; i++) { this.make('furnace', W.player.x, W.player.y, 0); if (i + 1 < n) yield 0.5; }
        yield this.pSpeed + this.time + 0.6;
        continue;
      }
      if (this.hasCombo(56)) {
        // Com02: лужи катятся от мага, start Random(−50, 50)°, шаг 360/Num ± 5°
        const start = rnd(-50, 50), step = 360 / n;
        for (let k = 1; k <= n; k++) this.make('sun', W.player.x, W.player.y, -(start + k * step + rnd(-5, 5)) * Math.PI / 180);
        yield this.pSpeed + this.time;
        continue;
      }
      const P = W.player;
      let avail: { x: number; y: number }[] = [];
      for (let i = 0; i < n; i++) {
        if (!avail.length) for (let k = 0; k < 12; k++) avail.push({ x: P.x + Math.cos(k * STEP) * RING * U, y: P.y + Math.sin(k * STEP) * RING * U });
        const p = avail.splice((Math.random() * avail.length) | 0, 1)[0];
        this.make('base', p.x + rnd(-2, 2) * U, p.y + rnd(-2, 2) * U, 0);
        yield GAP;
      }
      yield this.pSpeed + this.time;
    }
  }

  private make(kind: Kind, x: number, y: number, ang: number) {
    const S = this.size;
    const sulfur = (W.stats.artFx[593] ?? 0) > 0 ? SULFUR_EXPAND : 0;
    let sc = S * 0.5 + 0.35, coll = 2.5, expand = sulfur * 0.33, dmgExpand = 0, v = 0;
    if (kind === 'furnace') { sc = S * 0.35 + 0.025; coll = 5; expand = (sulfur + 0.08) * 0.33; dmgExpand = 0.25 * 0.33; }
    if (kind === 'sun') { sc = S * 0.15 + 0.35; coll = 3.65; v = 0.04; }
    const img = (this.spare.pop() ?? W.scene.add.image(0, 0, T.a)).setTexture(T.a).setVisible(true)
      .setDepth(DEPTH.zone).setPosition(x, y).setAlpha(0).setTint(0x000000).setRotation(0);
    const p: Pool = {
      kind, x, y, t: 0, sc, coll, expand, expT: 0, dmg: this.dmg, dmgExpand, life: this.time,
      hits: new Set(), ang, v: kind === 'sun' ? v * 1.5 : 0, acc: 0, img,
    };
    this.pools.push(p);
  }

  /** MeteorLand_DurationC + AnimationC (+ Expand, + качение C56); false — в пул */
  private step(p: Pool, dt: number): boolean {
    p.t += dt;
    const APPEAR = 11 * 0.06, end = APPEAR + p.life, FADE = 11 * 0.06;
    if (p.t >= end + FADE) return false;
    // C56: качение v = 0.04 ед/тик, первый толчок ×1.5, −0.0005 за тик, мин 0.01
    if (p.kind === 'sun') {
      while (p.acc + 0.03 <= p.t) {
        p.acc += 0.03;
        p.x += Math.cos(p.ang) * p.v * U; p.y += Math.sin(p.ang) * p.v * U;
        p.v = p.acc < 0.031 ? 0.04 : Math.max(0.01, p.v - 0.0005);
      }
    }
    // Expand: каждые 0.33 с
    if (p.expand > 0 || p.dmgExpand > 0) {
      while (p.expT + 0.33 <= p.t) {
        p.expT += 0.33;
        p.sc += p.expand; p.expand = Math.min(1, Math.max(0.008, p.expand * 0.98));
        if (p.dmgExpand > 0) { p.dmg += this.dmg * p.dmgExpand; p.dmgExpand *= 0.98; }
      }
    }
    // вид: появление (0.1·i), кадры A/B/C по 0.15 с, угасание
    let a = 1, c = 1;
    if (p.t < APPEAR) { const i = Math.min(10, Math.floor(p.t / 0.06)); a = c = 0.1 * i; }
    else if (p.t >= end) { const i = Math.min(10, Math.floor((p.t - end) / 0.06)); c = Math.max(0, (5 - i) * 0.2); a = (10 - i) * 0.1; }
    const ph = p.t % 0.45, frame = ph < 0.15 ? 0 : ph < 0.3 ? 1 : 2;
    const k = Math.round(Math.min(1, c) * 255);
    p.img.setTexture(frame === 0 ? T.a : frame === 1 ? T.b : T.c).setPosition(p.x, p.y)
      .setScale(PX * p.sc).setAlpha(Math.max(0, Math.min(1, a))).setTint((k << 16) | (k << 8) | k);
    // урон: коллайдер ON в окне кадра A, пока AttackON; список очищается в начале цикла
    if (ph < dt) p.hits.clear();
    if (frame === 0 && p.t >= APPEAR && p.t < end) {
      const h = (p.coll * p.sc / 2) * U;
      W.enemies.grid.query(p.x, p.y, h * 1.42, (e) => {
        if (p.hits.has(e.id)) return;
        if (Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) > h + e.r) return;
        p.hits.add(e.id);
        W.enemies.damage(e, p.dmg, 0, 0, this.def.id);
        if (this.hasProp(533)) this.meltHit(e);
      });
    }
    return true;
  }

  /** 533 Unit_Damage: Melt_DebuffCount ≤ 5 → ++, HitDamageRatio = (1 + n·0.05)·база */
  private meltHit(e: Enemy) {
    if (!e.alive) return;
    let m = this.melt.get(e.id);
    if (!m) { m = [0, e.hitRatio]; this.melt.set(e.id, m); }
    if (m[0] >= MELT_MAX) return;
    m[0]++;
    e.hitRatio = (1 + m[0] * MELT) * m[1];
    if (this.melt.size > 800) for (const [id] of this.melt) if (!W.enemies.list.some((x) => x.alive && x.id === id)) this.melt.delete(id);
  }
}

export const LAVA = defFromData(SPELL_BY_ID[20], (def) => new Lava(def, SPELL_BY_ID[20]));
