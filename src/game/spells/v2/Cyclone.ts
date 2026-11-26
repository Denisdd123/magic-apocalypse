import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { boxDamage, Co, OrigBullets, PX, U } from './_orig';

const DEG = Math.PI / 180;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** UnitApply_ShootingRange (как у Огн. шара / Пули) */
const RANGE = 23;
/** тик анимации базы (AnimationA) и корутин 462/463 */
const TA = 0.033, TC = 0.03;
/** UnitApply_TornadoDelay — пауза между вихрями Пустот */
const VOID_DELAY = 0.35;
/** приоритет цели: боссы/эпики ×0.5 */
const prio = (uid: number) => (uid >= 41 && uid <= 46 ? 0.5 : 1);

// ——— заглушки по меркам спрайтов (рисуем с Денисом позже): [ключ, px спрайта оригинала, ширина текстуры] ———
const T = { a: 'cy_a', c: 'cy_c', b: 'cy_b', l: 'cy_l' };
const PXS: Record<string, [number, number]> = { cy_a: [400, 100], cy_c: [400, 100], cy_b: [409, 100], cy_l: [180, 90] };
function textures() {
  const tx = W.scene.textures;
  const make = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    if (tx.exists(key)) return;
    const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g); g.generateTexture(key, w, h); g.destroy();
  };
  // TornadoA 400 (видимо ≈250 = 62 %): белые закрученные дуги
  make(T.a, 100, 100, (g) => {
    for (let i = 0; i < 5; i++) {
      g.lineStyle(2.5 - i * 0.3, 0xffffff, 0.9 - i * 0.12);
      g.beginPath(); g.arc(50, 50, 9 + i * 5.5, i * 1.3, i * 1.3 + 3.6); g.strokePath();
    }
    g.fillStyle(0xffffff, 0.18); g.fillCircle(50, 50, 30);
  });
  // TornadoC (электрическая сфера, видимо ≈360–430 из 400): мягкий бело-голубой шар
  make(T.c, 100, 100, (g) => {
    for (let i = 0; i < 6; i++) { g.fillStyle(0xbfe6ff, 0.08 + i * 0.05); g.fillCircle(50, 50, 46 - i * 6); }
    g.fillStyle(0xffffff, 1); g.fillCircle(50, 50, 12);
  });
  // TornadoB (пустота) 409: тёмно-фиолетовый вихрь
  make(T.b, 100, 100, (g) => {
    g.fillStyle(0x2a1040, 0.45); g.fillCircle(50, 50, 48);
    for (let i = 0; i < 4; i++) { g.lineStyle(2, 0xb070ff, 0.7); g.beginPath(); g.arc(50, 50, 14 + i * 8, i * 1.6, i * 1.6 + 3.4); g.strokePath(); }
    g.fillStyle(0x000000, 0.8); g.fillCircle(50, 50, 10);
  });
  // Incinerate15 (молния сферы) ≤179 px: ломаная вдоль оси x
  make(T.l, 90, 12, (g) => {
    g.lineStyle(3, 0x9fdcff, 0.5); g.beginPath(); g.moveTo(2, 6); for (let x = 10; x <= 88; x += 9) g.lineTo(x, x % 2 ? 2 : 10); g.strokePath();
    g.lineStyle(1.2, 0xffffff, 1); g.beginPath(); g.moveTo(2, 6); for (let x = 10; x <= 88; x += 9) g.lineTo(x, x % 2 ? 2 : 10); g.strokePath();
  });
}

type Kind = 'a' | 'c' | 'b' | 'orbit' | 'neutron' | 'typhoon' | 'super' | 'hole';

interface Wind {
  kind: Kind; x: number; y: number;
  /** курс при создании и текущий (рад, экран) */
  h0: number; h: number;
  t: number; life: number; fade: number; fadeA: number;
  /** localScale объекта и коллайдер (ед. до умножения на scale) */
  sc: number; coll: number; grow: number; expand: number;
  /** скорость, ед. ориг./с */
  v: number;
  dmg: number; hitT: number; hitK: number;
  acc: number; n: number;
  ox: number; oy: number;
  img: Phaser.GameObjects.Image;
  tex: string;
}

/**
 * #12 Вихрь — 1:1 по коду оригинала (docs/orig/spells/cyclone.md, карточка tasks/cyclone.md):
 * Play_Tornado: wait(PSpeed) один раз; залп — Num вихрей в один кадр у мага, k-й в k-го ближайшего (≤ 23 ед.,
 * врагов меньше — лишние не создаются), затем wait(PSpeed 3.5 с).
 * Вихрь (ID 13): курс один раз при создании, каждые 4 кадра (0.13 с) rotation = курс·Random(0.3, 1.2) (умножение, как в коде);
 * 2.36 ед/с (134 px/с), scale Size·0.375 + Size·0.375·0.0075 за тик 0.033; коллайдер квадрат 2.5 × scale;
 * урон: wait 0.3, затем каждые 0.33 с (коллайдер 0.03 с + пауза 0.3), каждый враг раз за тик, без отброса.
 * Свойства: 461 — только числа; 462 Электрическая сфера (ID 60: 2.2 ед/с без виляния, ×0.9933 за тик, 2 молнии раз в 28 тиков);
 * 463 Космические пустоты (ID 39: по одному через 0.35 с в точке маг ± (3.8, 5.5) ед., рост +0.03·0.998ⁿ за тик, ×9 из данных не действует).
 * Слияния (числа карточки; полностью — партия 6): 10, 14, 25, 39, 50.
 */
class Cyclone extends DataSpell {
  private co: Co | null = null;
  private winds: Wind[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  private bolts = new OrigBullets();
  /** слияния 39/50: КД после окончания вихря */
  private alive = 0;
  /** артефакт 141: счётчик вихрей до усиленного */
  private powerN = 0;

  private get size(): number { return Math.round(100 + this.pctOf('size') + W.stats.size * 100) / 100; }
  private get pSpeed(): number { return Math.max(0.2, this.cdOrig(this.data.base.cd ?? 3.5) * this.cdGlobal); }
  private get num(): number { return this.count; }

  onChange() {
    super.onChange();
    textures();
    if (!this.co) this.co = new Co(this.loop());
  }

  destroy() {
    for (const w of this.winds) w.img.destroy();
    for (const i of this.pool) i.destroy();
    this.winds = []; this.pool = []; this.co = null;
    this.bolts.destroy();
  }

  update(dt: number) {
    if (!this.co) this.onChange();
    this.co!.update(dt);
    this.bolts.update(dt);
    for (let i = this.winds.length - 1; i >= 0; i--) {
      const w = this.winds[i];
      if (!this.step(w, dt)) {
        w.img.setVisible(false); this.pool.push(w.img);
        this.winds[i] = this.winds[this.winds.length - 1]; this.winds.pop();
      }
    }
    this.alive = this.winds.length;
  }

  // ———— корутины каста ————
  private *loop(): Generator<number, void, unknown> {
    yield this.pSpeed;
    for (;;) {
      if (this.hasCombo(39) || this.hasCombo(50)) {
        this.make(this.hasCombo(39) ? 'super' : 'hole', 0);
        yield 0.1;
        while (this.alive) yield 0.1;
        yield this.pSpeed;
        continue;
      }
      if (this.hasCombo(10)) { this.make('orbit', 0); yield this.pSpeed; continue; }
      if (this.hasProp(463)) {
        // Play_Void: по одному через 0.35 с, Num штук, затем КД
        for (let i = 0; i < this.num; i++) {
          this.make('b', 0);
          if (i < this.num - 1) yield VOID_DELAY;
        }
        yield this.pSpeed;
        continue;
      }
      const P = W.player;
      const list = W.enemies.list.filter((e) => e.alive)
        .map((e) => ({ e, d: ((Math.abs(e.x - P.x) + Math.abs(e.y - P.y)) / U) * prio(e.type.uid) }))
        .sort((a, b) => a.d - b.d);
      if (!list.length) { yield 0.1; continue; }
      if (this.hasCombo(25)) {
        // Повелитель тайфуна: 3 залпа ×Num через 0.25 с, направления AimPlus = i
        const a0 = Math.atan2(list[0].e.y - P.y, list[0].e.x - P.x);
        for (let x = 0; x < 3; x++) {
          for (let i = 0; i < this.num; i++) this.make('typhoon', a0 + (i / this.num) * Math.PI * 2 + rnd(-25, 25) * DEG);
          if (x < 2) yield 0.25;
        }
        yield this.pSpeed + 0.03;
        continue;
      }
      const n = this.hasCombo(14) ? 1 : this.num;
      for (let i = 0; i < n; i++) {
        const t = list[i];
        if (!t || t.d > RANGE) break;
        const a = Math.atan2(t.e.y - P.y, t.e.x - P.x);
        this.make(this.hasCombo(14) ? 'neutron' : this.hasProp(462) ? 'c' : 'a', a);
      }
      yield this.pSpeed;
    }
  }

  /** 141 Опахало (эффект 410 = 5): каждый 6-й вихрь — урон ×2, размер ×1.75 (в коде; Пустоты и слияние 50 — ×1.5) */
  private power(kind: Kind): [number, number] {
    const n = W.stats.artFx[410] ?? 0;
    if (n < 1 || (kind !== 'a' && kind !== 'c' && kind !== 'b' && kind !== 'hole')) return [1, 1];
    if (this.powerN < n) { this.powerN++; return [1, 1]; }
    this.powerN = 0;
    return [2, kind === 'a' || kind === 'c' ? 1.75 : 1.5];
  }

  // ———— создание (TornadoAttack) ————
  private make(kind: Kind, ang: number) {
    const P = W.player, S = this.size;
    let x = P.x, y = P.y, tex = T.a, sc = S * 0.375, coll = 2.5, v = 3.0 * 0.026 / TA, grow = S * 0.375 * 0.0075, expand = 0;
    let life = this.durSec, fade = 3, fadeA = 0.1875, tint = 0xffffff;
    switch (kind) {
      case 'c': tex = T.c; v = 3.0 * 0.022 / TC; grow = 0; break;
      case 'b': case 'hole':
        x += rnd(-3.8, 3.8) * U; y += rnd(-5.5, 5.5) * U; tex = T.b; v = 0; grow = 0;
        if (kind === 'b') { sc = S * 0.25; coll = 3.75; expand = 0.03; fade = 8; fadeA = 0.09375; }
        else { sc = S * 0.1 + 0.1; coll = 6; expand = 0.055; life += 1.0; tint = 0x8040c0; }
        break;
      case 'orbit': tex = T.b; sc = S * 0.25 + 0.15; coll = 2.35; v = 0; grow = 0; tint = 0xff42ff; break;
      case 'neutron': sc = S * 0.12 + 0.3 + 0.25 * S * (this.num - 1); coll = 5; v = 2.5; grow = 0; tint = 0xffe0a0; break;
      case 'typhoon': sc = S * 0.1 + 0.35; coll = 3.5; grow = 0.01; tint = 0xd0f0ff; break;
      case 'super': sc = S * 0.18 + 0.25; coll = 7; v = 0; grow = 0; break;
    }
    const [pd, ps] = this.power(kind);
    sc *= ps; grow *= ps; expand *= ps;
    const img = (this.pool.pop() ?? W.scene.add.image(0, 0, tex)).setTexture(tex).setVisible(true)
      .setDepth(DEPTH.zone).setBlendMode(kind === 'b' || kind === 'hole' ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD)
      .setTint(tint).setAlpha(0.75).setRotation(ang);
    const w: Wind = {
      kind, x, y, h0: ang, h: ang, t: 0, life, fade, fadeA, sc, coll, grow, expand, v,
      dmg: this.dmg * pd, hitT: 0.3, hitK: 1, acc: 0, n: 0, ox: kind === 'orbit' ? 60 : x - P.x, oy: y - P.y, img, tex,
    };
    this.winds.push(w);
    this.draw(w, 0.75);
  }

  /** кадр объекта; false — уничтожить */
  private step(w: Wind, dt: number): boolean {
    w.t += dt;
    const P = W.player;
    const tick = w.kind === 'a' || w.kind === 'typhoon' || w.kind === 'neutron' ? TA : TC;
    while (w.acc + tick <= w.t) {
      w.acc += tick; w.n++;
      switch (w.kind) {
        case 'a': case 'typhoon':
          // каждые 4 кадра: rotation = TornadoAngle · Random(0.3, 1.2)
          if (w.n % 4 === 0) w.h = w.h0 * rnd(0.3, 1.2);
          w.sc += w.kind === 'a' ? w.grow : 0.01;
          break;
        case 'c':
          w.sc *= 0.9933;
          if (w.n === 21) { this.ballLightning(w); w.n = -6; }
          break;
        case 'b': case 'hole':
          if (w.t >= 0.09) { w.sc += w.expand; w.expand *= 0.998; }
          break;
        case 'orbit': {
          // центр вращается −1.95° за тик 0.03
          const a = -1.95 * DEG, c = Math.cos(a), s = Math.sin(a);
          const ox = w.ox * c - w.oy * s; w.oy = w.ox * s + w.oy * c; w.ox = ox;
          break;
        }
        case 'neutron':
          if (w.n % 7 === 0) w.sc += 0.05625 * this.size;
          break;
      }
      if (w.v) { w.x += Math.cos(w.h) * w.v * tick * U; w.y += Math.sin(w.h) * w.v * tick * U; }
    }
    if (w.kind === 'super') { w.x = P.x; w.y = P.y; }
    if (w.kind === 'orbit') { w.x = P.x + w.ox; w.y = P.y + w.oy; }
    // урон: Tornado_Attack — wait 0.3, далее раз в 0.33 с, каждый враг раз за тик
    if (w.t >= w.hitT) {
      w.hitT += 0.33;
      const h = (w.coll * w.sc / 2) * U;
      let d = w.dmg;
      if (w.kind === 'super') { d *= w.hitK; w.hitK += w.t > w.life ? 0.3 : 0.1; }
      boxDamage(w.x, w.y, w.h, h, h, d, this.def.id, new Set());
      if (w.kind === 'hole') W.enemies.grid.query(w.x, w.y, h, (e) => { W.enemies.stun(e, 0.33); });
    }
    // жизнь + затухание
    const over = w.t - w.life;
    if (over >= w.fade * TC) return false;
    this.draw(w, over < 0 ? 0.75 : 0.75 - w.fadeA * (Math.floor(over / TC) + 1));
    return true;
  }

  private draw(w: Wind, a: number) {
    const [px, tw] = PXS[w.tex];
    let k = 1;
    if (w.kind === 'c') { const f = ((w.n % 28) + 28) % 28; k = f >= 21 || f < 0 ? 1.22 : 1; }
    // кадры A1..4 по 1 тику — поворот рисунка на 90° на кадр
    const spin = w.kind === 'a' || w.kind === 'typhoon' || w.kind === 'super' ? (w.n % 4) * Math.PI / 2 : w.t * -3;
    w.img.setPosition(w.x, w.y).setScale(px * PX * w.sc * k / tw).setRotation(w.h + spin).setAlpha(Math.max(0, a));
  }

  /** 462 BallLightningAttack: ровно 2 молнии в случайных направлениях, дочерние к сфере, полный урон, пробой 999 */
  private ballLightning(w: Wind) {
    for (let j = 0; j < 2; j++) {
      const a = Math.random() * Math.PI * 2;
      const L = 2.35 * this.size * w.sc; // ед.
      this.bolts.fire({
        x: w.x, y: w.y, ang: a, sp: 0, life: 0.42, tex: T.l,
        scaleX: (L * 100) / PXS[T.l][1] / 1, scaleY: (L * 100 * 0.12) / 12,
        hl: (L / 2) * U, hw: (L * 0.06) * U, cx: 0, pierce: 999, dmg: w.dmg, src: this.def.id,
        tint: 0xcfeaff, data: { off: 0 },
        step: (b) => {
          // ElectricD: 10 шагов по 0.042 с, сдвиг +0.2 ед. на шаг; коллайдер ≈0.35 с; следует за сферой
          b.data.off = Math.min(10, Math.floor(b.t / 0.042)) * 0.2 * U;
          b.x = w.x + Math.cos(b.ang) * (b.data.off + (L / 2) * U);
          b.y = w.y + Math.sin(b.ang) * (b.data.off + (L / 2) * U);
          if (b.t > 0.35) b.hl = 0;
        },
        alpha: (b) => 1 - Math.max(0, b.t - 0.3) / 0.12,
      });
    }
  }
}

export const CYCLONE = defFromData(SPELL_BY_ID[12], (def) => new Cyclone(def, SPELL_BY_ID[12]));
