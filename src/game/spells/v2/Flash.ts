import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { faceAngle, forSegment, randomViewPoint, viewHalfDiag } from './_zoneKit';


interface Strip {
  x: number; y: number; ang: number; halfLen: number; halfW: number;
  t: number; life: number; delay: number; done: boolean; tint: number;
}

/**
 * #21 Световая вспышка → «Разрез света». Полоса света через весь экран по направлению движения мага
 * (W.player.faceX/faceY), удар один раз в момент вспышки.
 * Свойства: 542 Уничтожение (центр ×10), 543 Рагнарок (+5 вспышек, шире разброс), 544 Когти дьявола
 * (случайные места/направления + боковые, число активаций растёт 1→4 и сбрасывается).
 * Слияния (основа): C7 Безумие, C44 Ворота, C49 Брандиш, C59 Эксидиум.
 */
class Flash extends DataSpell {
  private strips: Strip[] = [];
  private g: Phaser.GameObjects.Graphics | null = null;
  private stack = 0; // Когти дьявола / Безумие: накопленные активации

  destroy() {
    this.strips.length = 0;
    this.g?.destroy(); this.g = null;
  }

  /** доля ширины, считающаяся «центром» (Уничтожение) */
  private get coreK(): number { return this.hasCombo(59) ? 0.45 : 0.18; }

  /** бонус активаций за каждые 4.5 с сокращения КД (Безумие, Брандиш) */
  private cdBonus(): number {
    const eff = this.cdSec * W.stats.cdMul;
    return Math.max(0, Math.floor((this.data.base.cd! - eff) / 4.5));
  }

  update(dt: number) {
    if (this.readyData(dt)) this.cast();
    if (!this.g) this.g = W.scene.add.graphics().setDepth(DEPTH.fx); // обычный бленд: чёткая линия без ореола
    const g = this.g;
    g.clear();
    for (let i = this.strips.length - 1; i >= 0; i--) {
      const s = this.strips[i];
      if (s.delay > 0) { s.delay -= dt; continue; }
      if (!s.done) { s.done = true; this.strike(s); }
      s.t += dt;
      if (s.t >= s.life) {
        this.strips[i] = this.strips[this.strips.length - 1]; this.strips.pop();
        continue;
      }
      this.draw(g, s);
    }
  }

  private cast() {
    const P = W.player;
    const fa = faceAngle();
    const L = viewHalfDiag() + 30;
    const hw = 22 * this.sizeMul;
    const tint = this.hasProp(544) ? 0xff8a8a : 0xfff4e0;
    const madness = this.hasCombo(7);

    if (this.hasCombo(49)) {
      // Брандиш: со всех сторон 7 раз подряд (+1 за каждые 4.5 с сокращения КД)
      const n = 7 + this.cdBonus();
      for (let i = 0; i < n; i++) this.add(P.x, P.y, fa + (i * Math.PI) / n, L, hw, i * 0.1, tint);
      return;
    }
    if (this.hasProp(544)) {
      // Когти дьявола: активаций 1..4 (Безумие: 3..7 + бонус), каждая — случайная вспышка; плюс две боковые
      const lo = madness ? 3 : 1, hi = madness ? 7 + this.cdBonus() : 4;
      this.stack = this.stack < lo || this.stack >= hi ? lo : this.stack + 1;
      const len = madness ? L * 1.5 : L;
      for (let i = 0; i < this.stack; i++) {
        const p = randomViewPoint(30);
        this.add(p.x, p.y, Math.random() * Math.PI * 2, len, hw, i * (madness ? 0.06 : 0.12), tint);
      }
      const px = -Math.sin(fa), py = Math.cos(fa), off = hw * 3;
      this.add(P.x + px * off, P.y + py * off, fa, len, hw, 0.05, tint);
      this.add(P.x - px * off, P.y - py * off, fa, len, hw, 0.05, tint);
      return;
    }
    // обычная: первая через мага, остальные (Рагнарок/Ворота) — параллельно со смещением
    const n = this.count;
    const spread = this.hasProp(543) ? viewHalfDiag() * 0.8 : hw * 2;
    const px = -Math.sin(fa), py = Math.cos(fa);
    const gap = n > 12 ? 0.05 : 0.09;
    for (let i = 0; i < n; i++) {
      const o = i === 0 ? 0 : (Math.random() * 2 - 1) * spread;
      this.add(P.x + px * o, P.y + py * o, fa, L, hw, i * gap, tint);
    }
  }

  private add(x: number, y: number, ang: number, halfLen: number, halfW: number, delay: number, tint: number) {
    this.strips.push({ x, y, ang, halfLen, halfW, t: 0, life: this.hasCombo(7) ? 0.3 : 0.45, delay, done: false, tint });
  }

  private sDmg = 0; private sCore = 0; private sOnlyCore = false; private sUx = 0; private sUy = 0;
  private onHit = (e: Enemy, perp: number) => {
    const inCore = perp <= this.sCore;
    if (this.sOnlyCore && !inCore) return;
    const mul = inCore && this.hasProp(542) ? 10 : 1;
    W.enemies.damage(e, this.sDmg * mul, this.sUx * 20, this.sUy * 20, this.def.id);
  };

  /** удар полосы — один раз */
  private strike(s: Strip) {
    let dmg = this.dmg;
    if (this.hasCombo(44)) dmg *= Math.max(1, this.sizeMul); // Ворота: темп роста размера → урон
    this.sDmg = dmg;
    this.sCore = s.halfW * this.coreK;
    this.sOnlyCore = this.hasCombo(49);
    const ux = Math.cos(s.ang), uy = Math.sin(s.ang);
    this.sUx = -uy; this.sUy = ux; // отбрасывание поперёк полосы — слабое
    forSegment(s.x - ux * s.halfLen, s.y - uy * s.halfLen, ux, uy, s.halfLen * 2, s.halfW, this.onHit);
  }

  /**
   * Вид: чёткая тонкая белая линия-разрез (без полос, ореолов и показа ширины/радиуса) + короткая вспышка света
   * (острая звёздочка) в точке удара. Линия появляется мгновенно и быстро гаснет.
   */
  private draw(g: Phaser.GameObjects.Graphics, s: Strip) {
    const k = s.t / s.life;
    const a = k < 0.12 ? 1 : Math.max(0, 1 - (k - 0.12) / 0.6);
    if (a <= 0) return;
    const ux = Math.cos(s.ang), uy = Math.sin(s.ang), nx = -uy, ny = ux;
    const L = s.halfLen;
    const x0 = s.x - ux * L, y0 = s.y - uy * L, x1 = s.x + ux * L, y1 = s.y + uy * L;
    // основная линия + тонкая «чернильная» вторая, чуть сдвинутая (накаляканность без ореола)
    g.lineStyle(2.6, 0xffffff, a);
    g.lineBetween(x0, y0, x1, y1);
    const off = 1.4;
    g.lineStyle(1.2, s.tint, 0.7 * a);
    g.lineBetween(x0 + nx * off, y0 + ny * off, x1 - nx * off * 0.5, y1 - ny * off * 0.5);
    // короткая вспышка света: звёздочка-штрих, живёт первую треть жизни
    if (k < 0.35) {
      const f = k / 0.35, len = (10 + 20 * f) * (1 - f * 0.5), fa = 1 - f;
      g.lineStyle(2, 0xffffff, fa);
      for (let q = 0; q < 4; q++) {
        const an = s.ang + (q * Math.PI) / 4 + f * 0.3, c = Math.cos(an), sn = Math.sin(an);
        g.lineBetween(s.x - c * len, s.y - sn * len, s.x + c * len, s.y + sn * len);
      }
    }
  }
}

export const FLASH = defFromData(SPELL_BY_ID[21], (def) => new Flash(def, SPELL_BY_ID[21]));
