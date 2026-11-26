import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { boxDamage, Co, PX, TICK, U } from './_orig';

const DEG = Math.PI / 180;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** мешок мест падения: 3 × 4 ячейки вокруг мага (ед., y вверх); в центре (y = 0) ячеек нет */
const CELL_X = [-2, 0, 2], CELL_Y = [4.5, 2, -2, -4.5];

// ——— текстуры-заглушки по меркам спрайтов (рисуем с Денисом позже) ———
const T = { rockC: 'mt_rock_c', rock: 'mt_rock', flash: 'mt_flash', smoke: 'mt_smoke', scorch: 'mt_scorch', lava: 'mt_lava', dot: 'mt_dot' };
function textures() {
  const tx = W.scene.textures;
  const make = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    if (tx.exists(key)) return;
    const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g); g.generateTexture(key, w, h); g.destroy();
  };
  // MeteorA1 rect 360×200, видимая 274×60 (рисуем 90×50 = ×4): тёмный камень спереди (справа), раскалённый хвост
  make(T.rock, 90, 50, (g) => {
    g.fillStyle(0xff7a2a, 0.35); g.fillEllipse(48, 25, 68, 14);
    g.fillStyle(0xffc060, 0.8); g.fillEllipse(56, 25, 46, 8);
    g.fillStyle(0x3a1a12, 1); g.fillEllipse(74, 25, 16, 13);
    g.fillStyle(0xfff0c0, 1); g.fillEllipse(80, 25, 5, 9);
  });
  // MeteorC1 видимая 302×324 (рисуем 76×81 = ×4): круглая глыба с раскалённой кромкой
  make(T.rockC, 76, 81, (g) => {
    g.fillStyle(0xff7a2a, 0.35); g.fillCircle(38, 40, 37);
    g.fillStyle(0x4a2418, 1); g.fillCircle(38, 40, 30);
    g.fillStyle(0xffb050, 1); g.fillCircle(50, 52, 9);
    g.fillStyle(0x2a120c, 1); g.fillCircle(30, 32, 10);
  });
  // Explosion9_01: белая «вата» (rect 400, рисуем 100)
  make(T.flash, 100, 100, (g) => {
    for (let i = 0; i < 5; i++) { g.fillStyle(0xffffff, 0.2 + i * 0.16); g.fillCircle(50, 50, 30 - i * 4); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.fillStyle(0xffffff, 0.8); g.fillCircle(50 + Math.cos(a) * 22, 50 + Math.sin(a) * 22, 10); }
  });
  // Explosion9_04..10: клубы дыма (тинт тёмно-красный → чёрный)
  make(T.smoke, 100, 100, (g) => {
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; g.fillStyle(0xffffff, 0.9); g.fillCircle(50 + Math.cos(a) * 16, 50 + Math.sin(a) * 14, 13); }
    g.fillStyle(0xffffff, 1); g.fillCircle(50, 50, 18);
  });
  // MeteorLand1 227×118 (рисуем как есть): копоть
  make(T.scorch, 114, 59, (g) => {
    g.fillStyle(0xffffff, 0.5); g.fillEllipse(57, 30, 110, 56);
    g.fillStyle(0xffffff, 1); g.fillEllipse(57, 30, 80, 38);
  });
  // MeteorLand2A 419×381 (рисуем 105×95): лавовая лужа — жёлто-оранжевый центр, красная кромка
  make(T.lava, 105, 95, (g) => {
    g.fillStyle(0x8a1a10, 0.9); g.fillEllipse(52, 48, 100, 88);
    g.fillStyle(0xe03a14, 1); g.fillEllipse(52, 48, 84, 72);
    g.fillStyle(0xff9a20, 1); g.fillEllipse(52, 48, 60, 50);
    g.fillStyle(0xffe070, 1); g.fillEllipse(52, 48, 34, 28);
  });
  make(T.dot, 12, 12, (g) => { g.fillStyle(0xffffff, 0.4); g.fillCircle(6, 6, 6); g.fillStyle(0xffffff, 1); g.fillCircle(6, 6, 3.5); });
}

/** Визуальный объект с временной шкалой: step(t) вернул false — убрать */
interface Vis { img: Phaser.GameObjects.Image; t: number; step: (v: Vis, dt: number) => boolean }
interface Job { t: number; fn: () => void }

/** параметры взрыва ExplosionAttack: scale = Area·base + plus; коллайдер cw×ch × scale */
interface Expl { base: number; plus: number; cw: number; ch: number; delay?: number; cy?: number }
const EX9: Expl = { base: 0.95, plus: 0.25, cw: 3, ch: 2.5 };          // ID 9 (база, 444)
const EX32: Expl = { base: 1.05, plus: 0, cw: 3.15, ch: 2.65 };       // 443 (Plus по умолчанию 0 — C_Battle_AllyExplosion.c, ExplosionAttack)
const EX54: Expl = { base: 0.3, plus: 0.5, cw: 6.5, ch: 6 };          // 445
const EX25: Expl = { base: 0.55, plus: 0.3, cw: 4, ch: 4 };           // слияние 5
const EX93: Expl = { base: 0.23, plus: 0, cw: 7.5, ch: 6, cy: 0.5 };  // слияние 35 (первый: Plus 0.9, урон ×1.5)
const EX97: Expl = { base: 0.55, plus: 0.55, cw: 2.25, ch: 3.5, delay: 0.03 }; // слияние 41

/**
 * #10 Метеорит — 1:1 по коду оригинала (docs/orig/spells/meteor.md, карточка tasks/meteor.md):
 * Play_Meteor: wait(PSpeed); залп Num метеоров с паузой MeteorDSpeed 0.15 с (444: 0.1), места — мешок 12 ячеек
 * x ∈ {−2, 0, 2}, y ∈ {±2, ±4.5} ед. ± 0.2 (на мага не падает; при ≤ 4 в мешке — новый без последней), затем wait(PSpeed).
 * Падение MeteorA: прямая под Random(−75°, −68°) сверху-слева, старт 20 ед., 26 тиков × 0.7015 ед. (0.78 с),
 * взрыв Explosion9: прямоугольник 3×2.5 × (Area·0.95 + 0.25), урон один раз; подпалина MeteorLand1 0.6 с без урона.
 * Свойства: 443 Извержение (без падения, лесенка SV01·0.15 с, взрыв 3.15×2.65 × Area·1.05, лавовый кратер ×0.25:
 * квадрат 1.25 ед. × Size, удар раз в 0.495 с, живёт 1.0 с + 0.6 с угасания, на 0.92 ед. ниже), 444 Дождь (данные ×3, пауза 0.1),
 * 445 Астероид (один, Area + 50 %·Num, падение 2:1 за 22 тика, взрыв 6.5×6 × (Area·0.3 + 0.5)).
 * Слияния (числа §9.3/§9.4; полностью — партия 6): 5 Военный климат (Com01: поток в ±4.6 × ±5.8 ед., урон ×7),
 * 35 Великое столкновение (3 падения через 0.3 с почти вертикально), 41 Пламенный шторм (Com03: «ромашка» 5–8 лучей).
 */
class Meteor extends DataSpell {
  private co: Co | null = null;
  private vis: Vis[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  private jobs: Job[] = [];
  private bag: number[] = [];
  private lastCell = -1;
  /** артефакт 129: счётчик залпов; артефакт 140: идёт дополнительный залп */
  private powerN = 0;
  private extraCast = false;

  /** Area = (100 + AreaU)% */
  private get area(): number { return Math.round(100 + this.pctOf('size') + W.stats.size * 100) / 100; }
  private get pSpeed(): number { return Math.max(0.05, this.cdOrig(this.data.base.cd ?? 4.5) * this.cdGlobal); }
  /** VolcanoTime = (100 + MTimeU)·0.01 × (100 − MTimeD)·0.01 → 1.0 с */
  private get volcanoT(): number { return Math.max(0.01, (1 + this.pctOf('duration') / 100) * W.stats.durMul); }

  onChange() {
    super.onChange();
    textures();
    if (!this.co) this.co = new Co(this.loop());
  }

  destroy() {
    for (const v of this.vis) v.img.destroy();
    for (const i of this.pool) i.destroy();
    this.vis = []; this.pool = []; this.jobs = []; this.co = null;
  }

  update(dt: number) {
    if (!this.co) this.onChange();
    this.co!.update(dt);
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const j = this.jobs[i];
      j.t -= dt;
      if (j.t <= 0) { this.jobs[i] = this.jobs[this.jobs.length - 1]; this.jobs.pop(); j.fn(); }
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

  private after(t: number, fn: () => void) { if (t <= 0) fn(); else this.jobs.push({ t, fn }); }

  private img(tex: string, depth: number, add: boolean) {
    const img = this.pool.pop() ?? W.scene.add.image(0, 0, tex);
    img.setTexture(tex).setVisible(true).setAlpha(1).setRotation(0).setScale(1).clearTint().setDepth(depth)
      .setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    return img;
  }
  private addVis(img: Phaser.GameObjects.Image, step: (v: Vis, dt: number) => boolean) { this.vis.push({ img, t: 0, step }); }

  // ———— Play_Meteor ————
  private *loop(): Generator<number, void, unknown> {
    yield this.pSpeed;
    if (this.hasCombo(5)) { yield* this.warClimate(); return; }
    for (;;) {
      if (this.hasCombo(41)) yield* this.flameStorm();
      else {
        // 129 Небесный календарь (эффект 336 = 3): каждый 4-й залп — урон и взрыв ×1.5
        const calN = W.stats.artFx[336] ?? 0;
        let pw = 1;
        if (calN >= 1) { if (this.powerN < calN) this.powerN++; else { this.powerN = 0; pw = 1.5; } }
        const big = this.hasProp(445) || this.hasCombo(35);
        const n = this.hasCombo(35) ? 3 : this.hasProp(445) ? 1 : this.count;
        const ds = this.hasCombo(35) ? 0.3 : this.hasProp(444) ? 0.1 : 0.15;
        // 445: Area = (100 + AreaU + Num·50)% (Num до сброса в 1)
        const area = this.hasProp(445) && !this.hasCombo(35) ? this.area + this.count * 0.5 : this.area;
        for (let i = 0; i < n; i++) {
          const [cx, cy] = this.cell();
          const x = W.player.x + cx * U, y = W.player.y - cy * U;
          if (this.hasCombo(35)) this.impact(x, y, area, i === 0, pw);
          else if (big) this.asteroid(x, y, area, pw);
          else if (this.hasProp(443)) this.volcano(x, y, area, i, pw);
          else this.fallA(x, y, area, pw);
          if (i + 1 < n) yield ds;
        }
        // 140 Портал (эффект 338 = 20%): весь залп повторяется ещё раз, без цепочки
        if (!this.extraCast && (W.stats.artFx[338] ?? 0) >= 1 + Math.floor(Math.random() * 100)) {
          this.extraCast = true;
          yield this.hasCombo(35) ? 0.9 : 0.33;
          continue;
        }
        this.extraCast = false;
      }
      yield this.pSpeed;
    }
  }

  /** мешок 12 ячеек: при ≤ 4 оставшихся — новый мешок без последней выпавшей; ± 0.2 ед. по обеим осям */
  private cell(): [number, number] {
    if (this.bag.length <= 4) { this.bag = []; for (let k = 0; k < 12; k++) if (k !== this.lastCell) this.bag.push(k); }
    const k = this.bag.splice((Math.random() * this.bag.length) | 0, 1)[0];
    this.lastCell = k;
    return [CELL_X[k % 3] + rnd(-0.2, 0.2), CELL_Y[(k / 3) | 0] + rnd(-0.2, 0.2)];
  }

  // ———— падения ————
  /**
   * Камень летит от (x, y) − dir·startU, шаг stepU за тик (tick с), nSteps шагов, затем onLand.
   * dir — экранный угол полёта. scale — масштаб спрайта MeteorA (360×200).
   */
  private fall(x: number, y: number, ang: number, startU: number, stepU: number, nSteps: number, tick: number, scale: number, onLand: () => void, tex: string = T.rock) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const rock = this.img(tex, DEPTH.top, true).setRotation(tex === T.rock ? ang : 0).setScale(PX * 4 * scale);
    let i = 0, acc = 0, trail = 0;
    const place = () => rock.setPosition(x - c * (startU - stepU * i) * U, y - s * (startU - stepU * i) * U);
    place();
    this.addVis(rock, (_v, dt) => {
      acc += dt; trail += dt;
      while (acc >= tick && i < nSteps) { acc -= tick; i++; }
      place();
      // TrailRenderer 0.45 с
      if (trail >= TICK) { trail = 0; W.fx.puff(rock.x, rock.y, 16 * scale * PX * 4, 0xffa040, 0.45, T.dot); }
      if (i >= nSteps) { onLand(); return false; }
      return true;
    });
  }

  /** MeteorA_AnimationB: угол Random(−75°, −68°) (экран: вниз-вправо), старт 20 ед., 26 × 0.7015 ед. */
  private fallA(x: number, y: number, area: number, pw: number) {
    const ang = rnd(68, 75) * DEG;
    this.fall(x, y, ang, 20, 0.7015, 26, TICK, 1.25, () => {
      this.explode(x, y, area * pw, this.dmg * pw, EX9);
      this.scorch(x, y, area * pw * 1.1, 227, 118, 0x1a1a1a);
    });
  }

  /** 443 (ID 32, MeteorB): без падения, wait SV01·0.15, взрыв + лавовый кратер на 0.92 ед. ниже */
  private volcano(x: number, y: number, area: number, i: number, pw: number) {
    const dmg = this.dmg * pw;
    this.after(i * 0.15, () => {
      this.explode(x, y, area * pw, dmg, EX32);
      this.crater(x, y + 0.92 * U, area * pw, dmg * 0.25);
    });
  }

  /** 445 (ID 54, MeteorC): local(i) = (−4.88 + 0.22i, 9.76 − 0.44i), i = 1..22 по 0.03 с; камень Area·0.38 */
  private asteroid(x: number, y: number, area: number, pw: number) {
    const ang = Math.atan2(0.44, 0.22);   // экран: вниз-вправо, наклон 2:1
    const L = Math.hypot(4.88, 9.76);
    this.fall(x, y, ang, L, Math.hypot(0.22, 0.44), 22, TICK, area * 0.38, () => {
      this.explode(x, y, area * pw, this.dmg * pw, EX54);
      this.scorch(x, y, area * pw * 1.1, 485, 83, 0x333333);
    }, T.rockC);
  }

  /** 35 (ID 93, MeteorE): поле повёрнуто на 15–21° против часовой, старт +11 ед. по up, 22 × 0.48 ед. */
  private impact(x: number, y: number, area: number, first: boolean, pw: number) {
    const th = Math.floor(rnd(15, 22)) * DEG;
    // up Unity (−sin θ, cos θ) → экран (−sin θ, −cos θ); полёт — обратно
    const ang = Math.atan2(Math.cos(th), Math.sin(th));
    const dmg = this.dmg * (first ? 1.5 : 1) * pw, ex = first ? { ...EX93, plus: 0.9 } : EX93;
    this.fall(x, y, ang, 11, 0.48, 22, TICK, (first ? 0.45 : 0) + area * 0.3 + 0.2, () => {
      this.explode(x, y, area * pw, dmg, ex);
      this.scorch(x, y, area * pw * 1.45, 485, 83, 0x333333);
    });
  }

  /** 5 Военный климат (Com01, ID 25, MeteorD): поток в ±4.6 × ±5.8 ед., пауза PSpeed'·Random(0.2, 1.0) */
  private *warClimate(): Generator<number, void, unknown> {
    for (;;) {
      const x = W.player.x + rnd(-4.6, 4.6) * U, y = W.player.y - rnd(-5.8, 5.8) * U;
      const area = this.area, dmg = this.dmg * (7 / 6);   // данные ×6, код ×7
      this.fall(x, y, rnd(68, 75) * DEG, 20, 0.76, 24, TICK, 1.5, () => {
        this.explode(x, y, area, dmg, EX25);
        this.scorch(x, y, area * 1.1, 227, 118, 0x1a1a1a);
      });
      const ps = Math.max(0.02, (this.pSpeed + 2) / (this.count * 0.5 + 23));
      yield ps * rnd(0.2, 1.0);
    }
  }

  /** 41 Пламенный шторм (Com03, ID 97): лучи 360/AddNum от 90°, шаг 1.84 ед., центр маг + 0.5 ед. вверх, ряд за рядом через 0.2 с */
  private *flameStorm(): Generator<number, void, unknown> {
    const A = this.area;
    const k = A >= 1.99 ? 3 : A >= 1.66 ? 2 : A >= 1.33 ? 1 : 0;
    const rays = 5 + k, dmg = this.dmg * (10 + 5 * k) / 10;   // данные ×10
    const n = this.count, step = 360 / rays;
    for (let row = 1; row <= n; row++) {
      const cx = W.player.x, cy = W.player.y - 0.5 * U;
      for (let j = 0; j < rays; j++) {
        const a = (90 - step * j) * DEG;
        const x = cx + 1.84 * row * Math.cos(a) * U, y = cy - 1.84 * row * Math.sin(a) * U;
        this.explode(x, y, A, dmg, EX97);
        this.scorch(x, y, A * 0.9, 303, 191, 0x8a1010);   // MeteorLand 7 — без урона
      }
      yield 0.2;
    }
  }

  // ———— взрывы и следы ————
  /** ExplosionAttack + Explosion9_Animation: кадр 01 (вспышка) — коллайдер 0.06 с, затем 9 кадров дыма по 0.06 с */
  private explode(x: number, y: number, area: number, dmg: number, ex: Expl) {
    const sc = area * ex.base + ex.plus;
    const hl = (ex.cw / 2) * sc * U, hw = (ex.ch / 2) * sc * U;
    const oy = -(ex.cy ?? 0) * sc * U;
    this.after(ex.delay ?? 0, () => boxDamage(x, y + oy, 0, hl, hw, dmg, this.def.id));
    // вспышка Explosion9_01: видимая ≈440 px × scale
    const fl = this.img(T.flash, DEPTH.fx, true).setPosition(x, y).setScale((440 / 64) * PX * sc);
    this.addVis(fl, (v) => { fl.setAlpha(v.t < 0.06 ? 1 : Math.max(0, 1 - (v.t - 0.06) / 0.12)); return v.t < 0.18; });
    const sm = this.img(T.smoke, DEPTH.fx, false).setPosition(x, y).setAlpha(0);
    const col0 = Phaser.Display.Color.ValueToColor(0x8a1a10), col1 = Phaser.Display.Color.ValueToColor(0x141010);
    this.addVis(sm, (v) => {
      if (v.t < 0.06) return true;
      const k = Math.min(1, (v.t - 0.06) / 0.54);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(col0, col1, 100, k * 100);
      sm.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b)).setAlpha(0.85 * (1 - k * k))
        .setScale((230 / 58) * PX * sc * (1 + 0.25 * k));
      return v.t < 0.6;
    });
  }

  /** MeteorLand_DurationA: тинт, alpha 1 − 0.1·i, 10 шагов по 0.06 с; размер спрайта w×h px × scale; без урона */
  private scorch(x: number, y: number, scale: number, w: number, h: number, tint: number) {
    const im = this.img(T.scorch, DEPTH.zone, false).setPosition(x, y).setTint(tint)
      .setScale((w / 114) * PX * scale, (h / 59) * PX * scale);
    this.addVis(im, (v) => { im.setAlpha(1 - 0.1 * Math.floor(v.t / 0.06)); return v.t < 0.6; });
  }

  /** MeteorLand тип 2 (443): scale Size·0.5, коллайдер 2.5 × scale, удар в первые 0.165 с каждого периода 0.495 с, живёт VolcanoTime + 0.6 с */
  private crater(x: number, y: number, size: number, dmg: number) {
    const sc = size * 0.5, half = 1.25 * sc * U, life = this.volcanoT;
    const im = this.img(T.lava, DEPTH.zone, false).setPosition(x, y).setScale((419 / 105) * PX * sc);
    const hits = new Set<number>();
    let period = -1;
    const tints = [0xffffff, 0xffd8b0, 0xffb090];
    this.addVis(im, (v) => {
      if (v.t < life) {
        const p = Math.floor(v.t / 0.495), ph = v.t - p * 0.495;
        if (p !== period) { period = p; hits.clear(); }
        im.setTint(tints[Math.min(2, Math.floor(ph / 0.165))]);
        if (ph < 0.165) boxDamage(x, y, 0, half, half, dmg, this.def.id, hits);
        return true;
      }
      im.setAlpha(Math.max(0, 1 - 0.1 * Math.floor((v.t - life) / 0.06)));
      return v.t < life + 0.6;
    });
  }
}

export const METEOR = defFromData(SPELL_BY_ID[10], (def) => new Meteor(def, SPELL_BY_ID[10]));
