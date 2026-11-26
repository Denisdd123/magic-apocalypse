import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { boxDamage, Co, PX, TICK, U } from './_orig';

const DEG = Math.PI / 180;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** ASpeed: 0.083 с между сосульками (в spells_data поля нет — константа кода, blizzard.md :L22) */
const ASPEED = 0.083;
/** 506 Лютый холод: BlizzardSlowRatioNum = 3 % за стек */
const SLOW_STEP = 0.03;

// ——— текстуры-заглушки по меркам спрайтов (рисуем с Денисом позже); [ключ, ширина, высота, во сколько раз меньше спрайта] ———
const T = { needle: 'bz_needle', star: 'bz_star', c: 'bz_c', d: 'bz_d', burst: 'bz_burst', fire: 'bz_fire' };
function textures() {
  const tx = W.scene.textures;
  const make = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    if (tx.exists(key)) return;
    const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g); g.generateTexture(key, w, h); g.destroy();
  };
  // BlizzardA1 201×16 (рисуем 100×8 = ×2): тонкая игла, остриё справа
  make(T.needle, 100, 8, (g) => {
    g.fillStyle(0x8fd8ff, 0.35); g.fillEllipse(50, 4, 98, 7);
    g.fillStyle(0xdff6ff, 1); g.fillTriangle(10, 3, 99, 4, 10, 5);
  });
  // BlizzardB1 175×43 (×2): падающая звезда
  make(T.star, 88, 22, (g) => {
    g.fillStyle(0x9fe0ff, 0.3); g.fillEllipse(44, 11, 86, 18);
    g.fillStyle(0xe8f8ff, 1); g.fillEllipse(56, 11, 52, 8);
    g.fillStyle(0xffffff, 1); g.fillCircle(78, 11, 7);
  });
  // BlizzardC1 168×22 (×2)
  make(T.c, 84, 11, (g) => { g.fillStyle(0x9fe0ff, 0.4); g.fillEllipse(42, 5.5, 82, 10); g.fillStyle(0xffffff, 1); g.fillTriangle(6, 4, 83, 5.5, 6, 7); });
  // BlizzardD1 126×126 (×2): снежинка-кристалл
  make(T.d, 63, 63, (g) => {
    g.fillStyle(0xbfeaff, 0.3); g.fillCircle(31.5, 31.5, 30);
    g.fillStyle(0xffffff, 1);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.fillTriangle(31.5, 31.5, 31.5 + Math.cos(a) * 28 - Math.sin(a) * 3, 31.5 + Math.sin(a) * 28 + Math.cos(a) * 3, 31.5 + Math.cos(a) * 28 + Math.sin(a) * 3, 31.5 + Math.sin(a) * 28 - Math.cos(a) * 3); }
  });
  // Explosion17/34/81/105: ледяной разрыв (видимая ≈90 из 100)
  make(T.burst, 100, 100, (g) => {
    g.fillStyle(0xffffff, 0.25); g.fillCircle(50, 50, 45);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.fillStyle(0xffffff, 0.9); g.fillTriangle(50, 50, 50 + Math.cos(a - 0.12) * 44, 50 + Math.sin(a - 0.12) * 44, 50 + Math.cos(a + 0.12) * 44, 50 + Math.sin(a + 0.12) * 44); }
    g.fillStyle(0xffffff, 1); g.fillCircle(50, 50, 14);
  });
  // Explosion50/29: огненный клуб
  make(T.fire, 100, 100, (g) => {
    g.fillStyle(0xff3a10, 0.5); g.fillCircle(50, 50, 46);
    g.fillStyle(0xff9a20, 1); g.fillCircle(50, 50, 32);
    g.fillStyle(0xffe890, 1); g.fillCircle(50, 50, 16);
  });
}

interface Vis { img: Phaser.GameObjects.Image; t: number; step: (v: Vis, dt: number) => boolean }

/** параметры взрыва: scale = Area·base + plus; коллайдер — квадрат coll × scale; px — видимый размер кадра оригинала */
interface Ex { base: number; plus: number; coll: number; px: number; tex: string; tint: number }
const EX17: Ex = { base: 0.7, plus: 0.2, coll: 2.05, px: 222, tex: T.burst, tint: 0xd8f2ff };
const EX34: Ex = { base: 0.65, plus: 0.25, coll: 2.5, px: 321, tex: T.burst, tint: 0xe8f8ff };
const EX81: Ex = { base: 0.3, plus: 0, coll: 4, px: 255, tex: T.burst, tint: 0xbfe6ff };

/**
 * #17 Метель — 1:1 по коду оригинала (docs/orig/spells/blizzard.md, карточка tasks/blizzard.md):
 * Play_Blizzard: wait(PSpeed) один раз; цикл: Num сосулек через ASpeed 0.083 с (20 шт. = 1.66 с), затем wait(PSpeed + 0.15).
 * Сосулька (ID 17): точка = маг + (Random(±2.72), Random(±3.45)) ед.; летит под Random(−70°, −75°) из 20 ед.,
 * 29 тиков × 0.65 ед. (0.87 с); удар — квадрат 2.05 × (Area·0.7 + 0.2), урон раз (окно 0.06 с);
 * заморозка при КАЖДОМ попадании 1.0 с × сопротивление (сопротивление ×0.67).
 * Свойства: 506 Лютый холод (пока идёт метель — раз в 1.0 с всем врагам стек −3 % скорости, в конце сброс),
 * 507 Падающая звезда (ID 34: 37 тиков × 0.5 ед., взрыв 2.5 × (Area·0.65 + 0.25)),
 * 508 Пожар (Play_Blaze: без падения, ±1.8 × ±1.9 ед., 3 взрыва подряд на месте ×0.9/×0.81/×0.729, хитбокс 1.35 ед., без заморозки).
 * Слияния (числа §9; полностью — партия 6): 12 Поджог эфира (ID 29: взрыв делится на 2 ещё раз — 3 взрыва),
 * 15 Зимний шторм (ID 81: ±3.5 × ±5.5 ед., сосулька C), 51 Бытие (Com03: по 1 сосульке D через PSpeed).
 */
class Blizzard extends DataSpell {
  private co: Co | null = null;
  private vis: Vis[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  private frzRes = new Map<number, number>();
  /** 506: флаг «метель идёт», стек и таймер ColdSeason */
  private storm = false;
  private coldT = 0;
  private coldStack = 0;

  private get area(): number { return Math.round(100 + this.pctOf('size') + W.stats.size * 100) / 100; }
  private get pSpeed(): number { return Math.max(0.05, this.cdOrig(this.data.base.cd ?? 6) * this.cdGlobal); }
  private get aSpeed(): number { return Math.max(0.01, this.stat('interval', ASPEED)); }
  private get freezeT(): number { return 1.0 * W.stats.durMul; }

  onChange() {
    super.onChange();
    textures();
    if (!this.co) this.co = new Co(this.loop());
  }

  destroy() {
    this.coldEnd();
    for (const v of this.vis) v.img.destroy();
    for (const i of this.pool) i.destroy();
    this.vis = []; this.pool = []; this.co = null; this.frzRes.clear();
  }

  update(dt: number) {
    if (!this.co) this.onChange();
    this.co!.update(dt);
    if (this.storm && this.hasProp(506) && !this.hasProp(508)) {
      // ColdSeason: стек +1 сразу и далее раз в 1.0 с
      this.coldT -= dt;
      if (this.coldT <= 0) {
        this.coldT += 1.0; this.coldStack++;
        const k = Math.min(0.95, SLOW_STEP * this.coldStack);
        for (const e of W.enemies.list) if (e.alive) { e.slowT = 0; W.enemies.slow(e, k, 1e9); }
      }
    }
    for (let i = this.vis.length - 1; i >= 0; i--) {
      const v = this.vis[i];
      v.t += dt;
      if (!v.step(v, dt)) {
        v.img.setVisible(false); this.pool.push(v.img);
        this.vis[i] = this.vis[this.vis.length - 1]; this.vis.pop();
      }
    }
  }

  /** ColdSeasonSlow_End: стек = 0 у всех */
  private coldEnd() {
    if (!this.coldStack) return;
    for (const e of W.enemies.list) if (e.slowT > 1e6) { e.slowT = 0; e.slowK = 0; }
    this.coldStack = 0; this.coldT = 0;
  }

  private img(tex: string, depth: number, add: boolean) {
    const img = this.pool.pop() ?? W.scene.add.image(0, 0, tex);
    img.setTexture(tex).setVisible(true).setAlpha(1).setRotation(0).setScale(1).clearTint().setDepth(depth)
      .setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    return img;
  }
  private addVis(img: Phaser.GameObjects.Image, step: (v: Vis, dt: number) => boolean) { this.vis.push({ img, t: 0, step }); }

  // ———— корутины ————
  private *loop(): Generator<number, void, unknown> {
    if (this.hasCombo(51)) { yield* this.genesis(); return; }
    if (this.hasProp(508) && !this.hasCombo(12)) { yield* this.blaze(); return; }
    yield this.pSpeed;
    for (;;) {
      this.storm = true; this.coldT = 0;
      const n = this.count;
      for (let i = 0; i < n; i++) {
        if (this.hasCombo(12)) this.ether();
        else if (this.hasCombo(15)) this.winter();
        else if (this.hasProp(507)) this.star();
        else this.shard();
        yield this.aSpeed;
      }
      this.storm = false; this.coldEnd();
      yield this.pSpeed + 0.15;
    }
  }

  /** Play_Blaze (508): wait(PSpeed); Num взрывов через ASpeed; wait(PSpeed) без +0.15 */
  private *blaze(): Generator<number, void, unknown> {
    yield this.pSpeed;
    for (;;) {
      const n = this.count;
      for (let i = 0; i < n; i++) { this.fire(); yield this.aSpeed; }
      yield this.pSpeed;
    }
  }

  /** Play_Blizzard_Com03 (51): по одной сосульке D, k = 1..3, между ними wait(PSpeed) */
  private *genesis(): Generator<number, void, unknown> {
    yield this.pSpeed;
    for (;;) {
      for (let k = 1; k < 4; k++) {
        const x = W.player.x + rnd(-3.6, 3.6) * U, y = W.player.y - rnd(-5.8, 5.8) * U;
        const ex: Ex = { base: rnd(0.7, 1.1) * 0.25, plus: 0.5, coll: 3.5, px: 379, tex: T.burst, tint: 0xe0f4ff };
        // BlizzardD: 50 тиков × 0.35 ед. (1.5 с); удар — окно 6 кадров × 0.045 с
        this.fall(x, y, rnd(70, 75) * DEG, 20, 0.35, 50, T.d, 2, 0, () => this.explode(x, y, this.dmg, ex, true, 6 * 0.045));
        yield this.pSpeed;
      }
    }
  }

  // ———— падения ————
  /** сосулька от (x, y) − dir·start ед., шаг step ед. за тик, n тиков; затем onLand */
  private fall(x: number, y: number, ang: number, start: number, step: number, n: number, tex: string, k: number, spin: number, onLand: () => void) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const im = this.img(tex, DEPTH.top, true).setRotation(spin ? Math.random() * 6.28 : ang).setScale(PX * k);
    let i = 0, acc = 0;
    const place = () => im.setPosition(x - c * (start - step * i) * U, y - s * (start - step * i) * U);
    place();
    this.addVis(im, (_v, dt) => {
      acc += dt;
      while (acc >= TICK && i < n) { acc -= TICK; i++; }
      place();
      if (spin) im.rotation += spin * dt;
      if (i >= n) { onLand(); return false; }
      return true;
    });
  }

  /** ID 17: маг + (±2.72, ±3.45) ед., угол Random(−70°, −75°), 29 × 0.65 ед. */
  private shard() {
    const x = W.player.x + rnd(-2.72, 2.72) * U, y = W.player.y - rnd(-3.45, 3.45) * U;
    this.fall(x, y, rnd(70, 75) * DEG, 20, 0.65, 29, T.needle, 2, 0, () => this.explode(x, y, this.dmg, EX17, true));
  }

  /** 507 (ID 34): scale 1.5, 37 × 0.5 ед. (1.11 с) */
  private star() {
    const x = W.player.x + rnd(-2.72, 2.72) * U, y = W.player.y - rnd(-3.45, 3.45) * U;
    this.fall(x, y, rnd(70, 75) * DEG, 20, 0.5, 37, T.star, 2 * 1.5, 0, () => this.explode(x, y, this.dmg, EX34, true));
  }

  /** 15 (ID 81): маг + (±3.5, ±5.5) ед., сосулька C под −72…−78°, 33 × 0.55 ед., scale 2 */
  private winter() {
    const x = W.player.x + rnd(-3.5, 3.5) * U, y = W.player.y - rnd(-5.5, 5.5) * U;
    this.fall(x, y, rnd(72, 78) * DEG, 20, 0.55, 33, T.c, 2 * 2, 0, () => this.explode(x, y, this.dmg, { ...EX81, plus: 0.05 }, true, 0.03));
  }

  // ———— взрывы ————
  /** Explosion_Animation: урон в окне коллайдера (по умолчанию 0.06 с), каждому врагу раз; кадры ≈0.6 с */
  private explode(x: number, y: number, dmg: number, ex: Ex, freeze: boolean, win = 0.06) {
    const sc = this.area * ex.base + ex.plus, half = (ex.coll / 2) * sc * U;
    const hits = new Set<number>();
    const onHit = freeze ? this.freezeHit : null;
    const im = this.img(ex.tex, DEPTH.fx, true).setPosition(x, y).setTint(ex.tint).setRotation(Math.random() * 6.28);
    const full = (ex.px / 90) * PX * sc;
    this.addVis(im, (v, dt) => {
      // окно коллайдера: кадр, начавшийся внутри окна, ещё бьёт (окно 0.03 с короче кадра 1/30 с)
      if (v.t - dt < win) this.hitBox(x, y, half, dmg, hits, onHit);
      const k = Math.min(1, v.t / 0.6);
      im.setScale(full * (0.3 + 0.7 * Math.min(1, v.t / 0.18))).setAlpha(1 - k * k);
      return v.t < 0.6;
    });
  }

  private hitBox(x: number, y: number, half: number, dmg: number, hits: Set<number>, onHit: ((e: Enemy) => void) | null) {
    if (!onHit) { boxDamage(x, y, 0, half, half, dmg, this.def.id, hits); return; }
    W.enemies.grid.query(x, y, half * 1.5, (e) => {
      if (hits.has(e.id) || Math.abs(e.x - x) > half + e.r || Math.abs(e.y - y) > half + e.r) return;
      hits.add(e.id);
      W.enemies.damage(e, dmg, 0, 0, this.def.id);
      onHit(e);
    });
  }

  /** Unit_Damage: FreezeTime × FreezeRes, FreezeRes ×0.67 */
  private freezeHit = (e: Enemy) => {
    const r = this.frzRes.get(e.id) ?? 1;
    if (r > 0) W.enemies.freeze(e, this.freezeT * r);
    this.frzRes.set(e.id, r * 0.67);
  };

  /** 508 (ID 50): маг + (±1.8, ±1.9) ед.; 3 взрыва подряд: scale 0.665·0.9, урон ×0.9ⁿ⁺¹, кадр 0.054 − 0.004n, коллайдер кадры 4–6 */
  private fire() {
    const x = W.player.x + rnd(-1.8, 1.8) * U, y = W.player.y - rnd(-1.9, 1.9) * U;
    const sc = 0.665 * 0.9, half = (2.25 / 2) * sc * U, base = this.dmg;
    const im = this.img(T.fire, DEPTH.fx, true).setPosition(x, y);
    const full = (206 / 90) * PX * sc;
    let n = 0, t0 = 0, hits = new Set<number>(), dmg = base * 0.9;
    this.addVis(im, (v) => {
      const d = 0.054 - 0.004 * n, f = Math.floor((v.t - t0) / d) + 1;   // номер кадра 1..15
      if (f > 15) {
        n++; if (n > 2) return false;
        t0 = v.t; hits = new Set(); dmg *= 0.9;
        return true;
      }
      if (f >= 4 && f < 6) boxDamage(x, y, 0, half, half, dmg, this.def.id, hits);
      im.setScale(full * Math.min(1, f / 7)).setAlpha(f <= 7 ? 1 : Math.max(0, 1 - (f - 7) / 8));
      return true;
    });
  }

  /** 12 (ID 29): маг + (±2.5, ±2.8) ед.; взрыв scale Area·0.4 + 0.2, коллайдер 3.2, кадры 11 × 0.04 с (коллайдер 3–8); SV01 = 2 → ещё 2 взрыва ×0.9 */
  private ether() {
    const x = W.player.x + rnd(-2.5, 2.5) * U, y = W.player.y - rnd(-2.8, 2.8) * U;
    this.etherBoom(x, y, this.dmg, this.area, 2);
  }

  private etherBoom(x: number, y: number, dmg: number, area: number, sv: number) {
    const sc = area * 0.4 + 0.2, half = (3.2 / 2) * sc * U, hits = new Set<number>();
    const im = this.img(T.fire, DEPTH.fx, true).setPosition(x, y).setTint(0xd8c8ff);
    const full = (220 / 90) * PX * sc;
    this.addVis(im, (v) => {
      const f = Math.floor(v.t / 0.04) + 1;
      if (f > 11) {
        if (sv - 1 > 0) for (let j = 0; j < 2; j++) this.etherBoom(x + rnd(-2.8, 2.8) * U, y - rnd(-3.2, 3.2) * U, dmg * 0.9, area * 0.9, sv - 1);
        return false;
      }
      if (f >= 3 && f < 8) boxDamage(x, y, 0, half, half, dmg, this.def.id, hits);
      im.setScale(full * Math.min(1, f / 4)).setAlpha(f <= 6 ? 1 : 1 - (f - 6) / 6);
      return true;
    });
  }
}

export const BLIZZARD = defFromData(SPELL_BY_ID[17], (def) => new Blizzard(def, SPELL_BY_ID[17]));
