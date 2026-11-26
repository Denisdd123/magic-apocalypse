import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { boxDamage, Co, PX, U } from './_orig';

const DEG = Math.PI / 180;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** пауза между вспышками одного каста */
const GAP = 0.128;
/** FlashShock_AnimationA: кадры 1–7 — центр хитбокса по оси и ширина (лок. ед. дочернего спрайта) */
const RUN: [number, number][] = [[-2.9, 1.0], [-2.28, 2.2], [-1.17, 4.5], [0, 6.1], [0.3, 5.5], [0.8, 4.5], [1.55, 3.0]];
/** белая вспышка земли: alpha по шагам 0.035 с */
const GROUND = [0.02, 0.03, 0.04, 0.05, 0.04, 0.03, 0.02];

// ——— заглушка по меркам спрайта (рисуем с Денисом позже): Incinerate12 848×400, рисуем 212×100 ———
const T = { a: 'fl_a' };
const SW = 848, TW = 212;
function textures() {
  const tx = W.scene.textures;
  if (tx.exists(T.a)) return;
  const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
  for (let i = 0; i < 6; i++) { g.fillStyle(0xffffff, 0.06 + i * 0.05); g.fillEllipse(106, 50, 210 - i * 22, 60 - i * 9); }
  g.fillStyle(0xffffff, 1); g.fillEllipse(110, 50, 150, 6);
  g.generateTexture(T.a, TW, 100); g.destroy();
}

type Mode = 'a' | 'rag' | 'devil' | 'c7' | 'c44' | 'c49' | 'c59';

interface Fl {
  mode: Mode; x: number; y: number; ang: number; t: number;
  /** множители локальных ед. по длине и по ширине (дочерний 1.2 × корень) */
  kx: number; ky: number;
  /** пауза кадра; высота основного коллайдера; есть ли центр-полоса ×10 */
  d: number; h: number; center: boolean;
  dmg: number; hits: Set<number>; hitsC: Set<number>; live: boolean;
  img: Phaser.GameObjects.Image;
}

/**
 * #21 Световая вспышка — 1:1 по коду оригинала (docs/orig/spells/flash.md, карточка tasks/flash.md):
 * Play_FlashShock: wait(PSpeed 10 с); цикл: Num вспышек через 0.128 с по направлению ДВИЖЕНИЯ мага, затем wait(PSpeed).
 * Вспышка (ID 1): стоит на месте у мага; корень (Size·2.3), дочерний спрайт ×1.2: 848×400 px → ≈1330 px по длине при Size 1;
 * 10 кадров × 0.055 с; на кадрах 1–7 хитбокс (высота 1.7) пробегает от заднего края к переднему (центр −2.9 → 1.55, ширина 1 → 6.1 → 3),
 * кадр 8 — выкл.; каждый враг раз; первая вспышка каста — белая вспышка земли 0.245 с.
 * Свойства: 542 Уничтожение (центр-полоса высотой 0.6 бьёт ×10), 543 Рагнарок (ID 2: ±0.5 ед., сдвиг k ∈ 0..4 вбок 0/±0.75/±1.5, высота 1.2, тёплая),
 * 544 Когти дьявола (ID 3: серии 1→4 через 0.22 с, маг ± 3.9 ед., угол случайный, красная, кадр 0.04, высота 0.35).
 * Слияния (числа карточки; полностью — партия 6): 7, 44, 49, 59.
 */
class Flash extends DataSpell {
  private co: Co | null = null;
  private list: Fl[] = [];
  private spare: Phaser.GameObjects.Image[] = [];
  private ground: Phaser.GameObjects.Rectangle | null = null;
  private groundT = -1;
  private series = 0;

  private get size(): number { return Math.round(100 + this.pctOf('size') + W.stats.size * 100) / 100; }
  private get pSpeed(): number { return Math.max(0.05, this.cdOrig(this.data.base.cd ?? 10) * this.cdGlobal); }
  private get num(): number { return this.count; }

  onChange() {
    super.onChange();
    textures();
    if (!this.co) this.co = new Co(this.loop());
  }

  destroy() {
    for (const f of this.list) f.img.destroy();
    for (const i of this.spare) i.destroy();
    this.ground?.destroy();
    this.list = []; this.spare = []; this.ground = null; this.co = null;
  }

  update(dt: number) {
    if (!this.co) this.onChange();
    this.co!.update(dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      if (!this.step(f, dt)) {
        f.img.setVisible(false); this.spare.push(f.img);
        this.list[i] = this.list[this.list.length - 1]; this.list.pop();
      }
    }
    // Play_FlashShockEffect
    if (this.groundT >= 0) {
      this.groundT += dt;
      const i = Math.floor(this.groundT / 0.035);
      if (!this.ground) this.ground = W.scene.add.rectangle(0, 0, 4000, 4000, 0xffffff).setScrollFactor(0).setDepth(DEPTH.projectile + 1);
      this.ground.setVisible(i < GROUND.length).setAlpha(GROUND[i] ?? 0);
      if (i >= GROUND.length) this.groundT = -1;
    }
  }

  private moveAng() { return Math.atan2(W.player.faceY, W.player.faceX); }

  // ———— корутины ————
  private *loop(): Generator<number, void, unknown> {
    yield this.pSpeed;
    for (;;) {
      const n = this.num;
      if (this.hasProp(544)) {
        // Play_FlashShock_Devil: серии 1, 2, 3, 4, 1, … (Num не используется)
        this.series = (this.series % 4) + 1;
        for (let i = 0; i < this.series; i++) { this.make('devil', i === 0); if (i + 1 < this.series) yield 0.22; }
        yield this.pSpeed;
        continue;
      }
      if (this.hasCombo(7)) {
        // Безумие: серия от Num+3 до Num+7, затем сброс
        this.series = this.series < 3 || this.series >= 7 ? 3 : this.series + 1;
        const m = n + this.series;
        for (let i = 0; i < m; i++) { this.make('c7', i === 0); if (i + 1 < m) yield 0.125; }
        yield this.pSpeed;
        continue;
      }
      if (this.hasCombo(44)) {
        const slots = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5);
        for (let i = 0; i < n; i++) { this.make('c44', i === 0, slots[i % 5]); if (i + 1 < n) yield 0.075; }
        yield Math.min(999, Math.max(0.5, this.pSpeed - 1));
        continue;
      }
      if (this.hasCombo(49)) { for (let i = 0; i < n; i++) { this.make('c49', i === 0); if (i + 1 < n) yield 0.08; } yield this.pSpeed; continue; }
      if (this.hasCombo(59)) {
        // Эксидиум: 7 тиков по 0.04 с × 2 = 14 вспышек; боевая только центральная
        const angs = Array.from({ length: 18 }, (_, k) => k * 20).sort(() => Math.random() - 0.5);
        for (let k = 0; k < 7; k++) {
          for (let j = 0; j < 2; j++) this.make('c59', k === 0 && j === 0, k === 0 && j === 0 ? -1 : angs[(k * 2 + j) % 18]);
          yield 0.04;
        }
        yield this.pSpeed;
        continue;
      }
      const rag = this.hasProp(543);
      for (let i = 0; i < n; i++) {
        this.make(rag ? 'rag' : 'a', rag ? i % 2 === 0 : i === 0);
        if (i + 1 < n) yield GAP;
      }
      yield this.pSpeed;
    }
  }

  /** Bullet_Create 69 (ID 1/2/3) и слияния */
  private make(mode: Mode, groundFx: boolean, slot = 0) {
    const P = W.player, S = this.size;
    let ang = this.moveAng(), x = P.x, y = P.y;
    let rx = S * 2.3, ry = S * 2.3, d = 0.055, h = 1.7, tint = 0xffffff, center = this.hasProp(542);
    const dmg = this.dmg;
    switch (mode) {
      case 'rag': {
        // ID 2: (маг + dir) ± 0.5 ед.; k = 0..4 → Location0k вбок (±0.75 / ±1.5 лок. × корень)
        ang += rnd(-30, 30) * 0.2 * DEG;
        x += Math.cos(ang) * U + rnd(-0.5, 0.5) * U; y += Math.sin(ang) * U + rnd(-0.5, 0.5) * U;
        const k = (Math.random() * 5) | 0, off = [0, 0.75, -0.75, 1.5, -1.5][k] * ry;
        x += -Math.sin(ang) * off * U; y += Math.cos(ang) * off * U;
        h = 1.2; tint = 0xfffad9;
        break;
      }
      case 'devil':
        x += Math.cos(ang) * U + rnd(-3.9, 3.9) * U; y += Math.sin(ang) * U + rnd(-3.9, 3.9) * U;
        ang = rnd(-360, 361) * DEG; rx = S * 2.5; d = 0.04; h = 0.35; center = false; tint = 0xff1f26;
        break;
      case 'c7': rx = S * 2.5 + 0.1; ry = S * 2.2 + 0.1; d = 0.04; h = 0.32; tint = 0xff3366; break;
      case 'c44': {
        const off = [0, 0.75, -0.75, 1.5, -1.5][slot] * 2.35;
        x += -Math.sin(ang) * off * U; y += Math.cos(ang) * off * U;
        rx = 4.5 / 1.2; ry = 2.35 / 1.2; d = 0.05; h = 0.52; tint = 0x99ffcc;
        break;
      }
      case 'c49': ang = Math.random() * Math.PI * 2; rx = 3.3 / 1.2; ry = (S * 0.5 + 1) / 1.2; d = 0.082; h = 0.6; tint = 0xfff0c0; break;
      case 'c59': {
        rx = 3.5 / 1.2; ry = (S * 0.6 + 2) / 1.2; d = 0.06; tint = 0xffffff;
        if (slot >= 0) { x += Math.cos(slot * DEG) * 1.25 * U; y += Math.sin(slot * DEG) * 1.25 * U; }
        else { x += Math.cos(ang) * U; y += Math.sin(ang) * U; }
        break;
      }
    }
    const kx = 1.2 * rx, ky = 1.2 * ry;
    const img = (this.spare.pop() ?? W.scene.add.image(0, 0, T.a)).setTexture(T.a).setVisible(true)
      .setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD).setPosition(x, y).setRotation(ang)
      .setScale((SW * PX * kx) / TW, (400 * PX * ky) / 100).setTint(tint).setAlpha(1);
    this.list.push({ mode, x, y, ang, t: 0, kx, ky, d, h, center, dmg, hits: new Set(), hitsC: new Set(), live: mode !== 'c59' || slot < 0, img });
    if (groundFx) this.groundT = 0;
  }

  /** FlashShock_AnimationA/B: кадры по d; хитбокс бежит на кадрах 1–7; false — уничтожить */
  private step(f: Fl, dt: number): boolean {
    f.t += dt;
    const fr = Math.floor(f.t / f.d);          // 0..9
    if (fr >= 10) return false;
    f.img.setAlpha(fr < 7 ? 1 : Math.max(0, 1 - (fr - 6) * 0.3));
    if (fr < 7 && f.live) {
      const [cx, w] = RUN[fr];
      const c = Math.cos(f.ang), s = Math.sin(f.ang);
      const ox = f.x + c * cx * f.kx * U, oy = f.y + s * cx * f.kx * U;
      boxDamage(ox, oy, f.ang, (w / 2) * f.kx * U, (f.h / 2) * f.ky * U, f.dmg, this.def.id, f.hits);
      // 542: центр-полоса (высота 0.6) — урон ×10 (эффект 611 = 1000 %)
      if (f.center) boxDamage(ox, oy, f.ang, (w / 2) * f.kx * U, 0.3 * f.ky * U, f.dmg * 10, this.def.id, f.hitsC);
    }
    return true;
  }
}

export const FLASH = defFromData(SPELL_BY_ID[21], (def) => new Flash(def, SPELL_BY_ID[21]));
