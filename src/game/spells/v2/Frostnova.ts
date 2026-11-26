import Phaser from 'phaser';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { Co, PX, U } from './_orig';

/** Снежное цветение: цель — только если взвешенная дистанция ≤ 28 ед. */
const BLOSSOM_RANGE = 28;
/** Землетрясение: ApplyStunTime */
const STUN = 0.2;
const T = { ice: 'fn_ice', quake: 'fn_quake' };

function textures() {
  const tx = W.scene.textures;
  const make = (key: string, w: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    if (tx.exists(key)) return;
    const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g); g.generateTexture(key, w, w); g.destroy();
  };
  // Explosion12 500 px: короткие тонкие голубые иглы по кольцу (≈0.55…1.0 R), центр пустой
  make(T.ice, 500, (g) => {
    const c = 250;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2 + Math.sin(i * 7.3) * 0.03;
      const r0 = 120 + ((i * 37) % 60), r1 = r0 + 30 + ((i * 53) % 70) + (i % 9 === 0 ? 60 : 0);
      g.lineStyle(i % 3 ? 3 : 5, 0xb0f0ff, 1);
      g.lineBetween(c + Math.cos(a) * r0, c + Math.sin(a) * r0, c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    }
  });
  // Explosion48 720 px (рисуем 120): бурое кольцо трещин
  make(T.quake, 120, (g) => {
    const c = 60;
    g.lineStyle(3, 0xd0a878, 1); g.strokeCircle(c, c, 50);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.lineStyle(2, 0xd0a878, 1); g.lineBetween(c + Math.cos(a) * 18, c + Math.sin(a) * 18, c + Math.cos(a + 0.15) * 56, c + Math.sin(a + 0.15) * 56);
    }
  });
}

interface Hit { x: number; y: number; t: number; half: number; dmg: number; hits: Set<number>; kind: 'abs' | 'quake'; done: boolean; rift?: boolean }

/**
 * #5 Ледяные иглы (IceNova) — 1:1 по коду оригинала (docs/orig/spells/frostnova.md, карточка tasks/frostnova.md):
 * Play_IceNova: wait(PSpeed) ДО первого каста, затем цикл «взрыв у мага → wait(PSpeed 5.5 с)».
 * Взрыв 12: BaseScale 1.33, коллайдер 3.3 ед. → квадрат ±125 px × Area у мага; урон и заморозка (1.0 с) только в 1-й кадр (0.06 с);
 * картинка 500 px × 1.33 = 378 px, 8 кадров по 0.06 с. Следа на земле нет — враги залиты синим.
 * Свойства: 398 Абсолютный ноль (ID 30: 2-е окно 0.03 с, коллайдер ×1.25, только заморозка),
 * 399 Ледниковый период (ID 35: 3 взрыва в точке каста через 0.33 с, k = 1 / 1.5 / 2 на урон и размер; КД ×2 — в данных),
 * 400 Землетрясение (ID 48: урон ×2, оглушение 0.2 с × сопротивление (×0.67 за раз), коллайдер 5×0.875, окно 0.12 с).
 * Слияния: 24 Снежное цветение (до 24 взрывов через 0.04 с в разных врагах, k = 1/(1+0.05n)), 31 Большой разлом (ID 91, отталкивание).
 */
class Frostnova extends DataSpell {
  private co: Co | null = null;
  private hits: Hit[] = [];
  /** StunResistance врагов (по id): 1 → ×0.67 после каждого оглушения */
  private stunRes = new Map<number, number>();

  /** Area = (100 + AreaU − AreaD + MSizeU)% */
  private get area(): number { return Math.round(100 + this.pctOf('size') + W.stats.size * 100) / 100; }
  private get pSpeed(): number { return Math.max(0.05, this.cdOrig(this.data.base.cd ?? 5.5) * this.cdGlobal); }
  /** FreezeTime 1.0 с × (100 + эффект 75)% */
  private get freezeT(): number { return this.stat('duration', 1) * W.stats.durMul; }
  private get bulletId(): number {
    if (this.hasCombo(24)) return 87;
    if (this.hasCombo(31)) return 91;
    if (this.hasProp(398)) return 30;
    if (this.hasProp(399)) return 35;
    if (this.hasProp(400)) return 48;
    return 12;
  }

  onChange() {
    super.onChange();
    textures();
    if (!this.co) this.co = new Co(this.loop());
  }

  destroy() { this.co = null; this.hits.length = 0; this.stunRes.clear(); }

  update(dt: number) {
    if (!this.co) this.onChange();
    this.co!.update(dt);
    this.updateHits(dt);
  }

  // ———— Play_IceNova ————
  private *loop(): Generator<number, void, unknown> {
    yield this.pSpeed;
    for (;;) {
      const P = W.player, id = this.bulletId;
      if (id === 35) {
        // Ледниковый период: 3 взрыва в точке каста, пауза 0.33 с
        const x = P.x, y = P.y;
        for (let n = 0; n < 3; n++) {
          const k = 1 + 0.5 * n;
          this.nova(x, y, this.dmg * k, this.area * k, 1.33, 3.3);
          if (n < 2) yield 0.33;
        }
      } else if (id === 87) {
        yield* this.blossom();
      } else if (id === 48) {
        this.quake(P.x, P.y, 0.875, 5);
      } else if (id === 91) {
        this.quake(P.x, P.y, 0.5 * this.area + 0.25, 7.5, true);
      } else {
        this.nova(P.x, P.y, this.dmg, this.area, 1.33, 3.3, id === 30);
      }
      yield this.pSpeed;
    }
  }

  /** Взрыв 12/30/35/87: урон + заморозка по квадрату в первом окне */
  private nova(x: number, y: number, dmg: number, area: number, base: number, coll: number, abs = false, rot = 0) {
    const half = (coll * base * area / 2) * U;
    const hitSet = new Set<number>();
    this.boxHit(x, y, rot, half, hitSet, (e) => {
      W.enemies.damage(e, dmg, 0, 0, this.def.id);
      W.enemies.freeze(e, this.freezeT);
    });
    // Абсолютный ноль: ещё 0.03 с коллайдер ×1.25 без урона — только заморозка (список задетых тот же)
    if (abs) this.hits.push({ x, y, t: 0, half: half * 1.25, dmg: 0, hits: hitSet, kind: 'abs', done: false });
    W.fx.puff(x, y, 500 * base * area * PX, 0xffffff, abs ? 0.42 : 0.48, T.ice, rot);
  }

  /** Землетрясение (48) / Большой разлом (91): оглушение вместо заморозки, коллайдер включён 0.12 с */
  private quake(x: number, y: number, scale: number, coll: number, rift = false) {
    const half = (coll * scale * (rift ? 1 : this.area) / 2) * U;
    // урон ×2 Землетрясения и ×10 Разлома — уже в модах данных (эффекты 1071)
    const h: Hit = { x, y, t: 0, half, dmg: this.dmg, hits: new Set(), kind: 'quake', done: false, rift };
    this.quakeHit(h);
    this.hits.push(h);
    // картинка: Explosion48 720 px × 0.875 × Area; Explosion91 — размер кадров не разобран (заглушка по коллайдеру)
    W.fx.puff(x, y, rift ? half * 2.2 : 720 * scale * this.area * PX, 0xffffff, rift ? 1.4 : 0.9, T.quake);
  }

  private quakeHit(h: Hit) {
    const rift = !!h.rift;
    this.boxHit(h.x, h.y, 0, h.half, h.hits, (e) => {
      if (rift) {
        // отталкивание от мага: 0.45·KR/dist ед., clamp ±1.25 ед. (KnockbackResistance = 1)
        const dx = e.x - W.player.x, dy = e.y - W.player.y, d = Math.max(0.01, Math.hypot(dx, dy) / U);
        const m = Math.min(1.25, 0.45 / d) * U;
        e.x += (dx / (d * U)) * m; e.y += (dy / (d * U)) * m;
      }
      W.enemies.damage(e, h.dmg, 0, 0, this.def.id);
      const r = this.stunRes.get(e.id) ?? 1;
      if (r > 0) { W.enemies.stun(e, STUN * r); this.stunRes.set(e.id, r * 0.67); }
      if (this.stunRes.size > 2000) this.stunRes.clear();
    });
  }

  /** Снежное цветение (87): до 24 взрывов через 0.04 с, каждый в новом ближайшем враге (≤ 28 ед.) */
  private *blossom(): Generator<number, void, unknown> {
    const used = new Set<number>();
    for (let n = 0; n < 24; n++) {
      const P = W.player;
      let best: Enemy | null = null, bd = Infinity;
      for (const e of W.enemies.list) {
        if (!e.alive || used.has(e.id)) continue;
        const d = ((Math.abs(e.x - P.x) + Math.abs(e.y - P.y)) / U) * (e.type.uid >= 41 && e.type.uid <= 46 ? 0.5 : 1);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best || bd > BLOSSOM_RANGE) break;
      used.add(best.id);
      const k = 1 / (1 + 0.05 * (n + 1));
      this.nova(best.x, best.y, this.dmg * k, this.area * k, 1.45, 3, false, Math.random() * Math.PI * 2);
      if (n < 23) yield 0.04;
    }
  }

  private updateHits(dt: number) {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      h.t += dt;
      if (h.kind === 'abs' && !h.done && h.t >= 0.03) {
        h.done = true;
        this.boxHit(h.x, h.y, 0, h.half, h.hits, (e) => W.enemies.freeze(e, this.freezeT));
      }
      if (h.kind === 'quake' && !h.done && h.t >= 0.06) {
        // коллайдер включён ещё 0.06 с: новые враги в зоне тоже получают удар
        h.done = true;
        this.quakeHit(h);
      }
      if (h.done) { this.hits[i] = this.hits[this.hits.length - 1]; this.hits.pop(); }
    }
  }

  /** квадрат ±half (повёрнут на rot) против круга врага; каждый враг — раз */
  private boxHit(x: number, y: number, rot: number, half: number, hit: Set<number>, cb: (e: Enemy) => void) {
    const c = Math.cos(rot), s = Math.sin(rot);
    W.enemies.grid.query(x, y, half * Math.SQRT2, (e) => {
      if (hit.has(e.id)) return;
      const dx = e.x - x, dy = e.y - y;
      const lx = dx * c + dy * s, ly = -dx * s + dy * c;
      const qx = Math.max(-half, Math.min(half, lx)), qy = Math.max(-half, Math.min(half, ly));
      if ((lx - qx) ** 2 + (ly - qy) ** 2 > e.r * e.r) return;
      hit.add(e.id);
      cb(e);
    });
  }
}

export const FROSTNOVA = defFromData(SPELL_BY_ID[5], (def) => new Frostnova(def, SPELL_BY_ID[5]));
