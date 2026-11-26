import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { boxDamage, Co, PX, U } from './_orig';
import { addGuard, keepGuard, removeGuard } from './_utilGuard';

/** UnitBase_ShieldMaxNum = 2 (код; текст «1 раз» и note в данных расходятся) */
const MAX_BASE = 2;
/** Unit_ShieldDivine / IsShieldDamageDelay: 0.2 с */
const DIVINE = 0.2;
/** метка 12: эти враги переживают касание щита (ID 16, 26, 33 и боссы 41–46) */
const SURVIVE = new Set([16, 26, 33, 41, 42, 43, 44, 45, 46]);
const two = (n: number) => String(n).padStart(2, '0');
const seq = (pre: string, n: number) => Array.from({ length: n }, (_, i) => `${pre}${two(i + 1)}`);
/** Shield{n}_01..04: набор n = число зарядов (1..5), 128 px, кадры по 0.3 с */
const SH = [1, 2, 3, 4, 5].map((n) => seq(`sh${n}_`, 4));
/** Explosion53_01..09 (поле разрушения), Explosion83_01..12 (квантовый взрыв), холсты 720 px */
const EX53 = seq('shE53_', 9), EX83 = seq('shE83_', 12);
/** DestroyField_Animation (@0x129ad70): 16 состояний; кадр 1,2 (по 0.06), пусто 0.06, кадр 3, пусто 0.03, 4, пусто 0.06, 5, пусто 0.03, 6, пусто 0.06, 7, пусто 0.03, 8, пусто 0.03, 9.
 *  Всё кратно 0.03 с → шаг 0.03, -1 = спрайт скрыт (в оригинале — пустой спрайт Z_Database list[0]) */
const FIELD_SEQ = [0, 0, 1, 1, -1, -1, 2, 2, -1, 3, 3, -1, -1, 4, 4, -1, 5, 5, -1, -1, 6, 6, -1, 7, 7, -1, 8, 8];
/** Explosion83_Animation_A: цвет кадров 1–8 (R,G,B), дальше остаётся цвет 8-го кадра */
const Q_TINT = [0xffffff, 0xffffe6, 0xffffcc, 0xffcc1a, 0xffbf1a, 0xffb214, 0xffa608, 0xff8c03];

export const SHIELD_LOAD: [string, string][] = [
  ...[1, 2, 3, 4, 5].flatMap((n) => [1, 2, 3, 4].map((k): [string, string] => [`sh${n}_${two(k)}`, `vfx/shield/orig/Shield${n}_${two(k)}.png`])),
  ...EX53.map((k, i): [string, string] => [k, `vfx/shield/orig/Explosion53_${two(i + 1)}.png`]),
  ...EX83.map((k, i): [string, string] => [k, `vfx/shield/orig/Explosion83_${two(i + 1)}.png`]),
];

interface Field { t: number; next: number; hits: Set<number>; half: number; dmg: number }
/** DestroyField_Animation: 4 удара */
const FIELD_T = [0, 0.18, 0.39, 0.6];
/** Explosion83_Animation_A (@0x11abb2c): коллайдер по кадрам (ед. × масштаб Area·0.35 + 0.65), паузы кадров; на 10-м — OFF */
const Q_SIZE = [4.5, 5, 5.5, 6.2, 6.5, 6.7, 6.9, 7.1, 7.3, 7.5];
const Q_WAIT = [0.04, 0.05, 0.05, 0.06, 0.06, 0.06, 0.06, 0.07, 0.07, 0.08, 0.08, 0.09];
const Q_END = Q_WAIT.map((_, i) => Q_WAIT.slice(0, i + 1).reduce((a, b) => a + b, 0));
interface Quantum { x: number; y: number; t: number; f: number; dmg: number; hits: Set<number> }

/**
 * #6 Щит — 1:1 по коду оригинала (docs/orig/spells/shield.md, карточка tasks/shield.md):
 * Play_Shield: самый первый щит — сразу, Start_Shield при первом запуске ставит ShieldNum = ShieldMaxNum (2);
 * дальше цикл каждые 0.1 с: ShieldDelay −= 0.1 только пока зарядов < макс.; на нуле +ProductNum (кап MaxNum), ShieldDelay = PSpeed (33 с).
 * Касание врага: заряд −1, неуязвимость 0.2 с (вспышка мага), 0.2 с касания игнорируются; враг исчезает (Unit_Destroy — без маны
 * и без счёта), кроме ID 16/26/33 и боссов. Урон от арены щит не ловит (только касания).
 * Свойства: 407 Барьер (MaxNum +2 = 4), 408 Переустановка (MaxNum +1, ProductNum 2, КД +20 %),
 * 409 Поле разрушения (при каждой потере заряда — взрыв 53: 500 % ATK, коллайдер 4 × 1.11 ед., едет за магом, удары 0/0.18/0.39/0.6 с).
 * Слияние 18 Квантовый взрыв: щита нет; wait(PSpeed) → взрыв 83 у мага → wait 0.3.
 * Для HUD: cdLeft, cdTotal, active, charges, maxCharges.
 */
class Shield extends DataSpell {
  charges = 0;
  cdLeft = 0;
  private co: Co | null = null;
  private first = true;
  private img: Phaser.GameObjects.Image | null = null;
  private animT = 0;
  private fields: Field[] = [];
  private quanta: Quantum[] = [];
  private readonly guard = () => this.absorb();

  get maxCharges() { return Math.max(1, Math.round(this.stat('count', MAX_BASE))); }
  private get productNum() { return this.hasProp(408) ? 2 : 1; }
  get cdTotal() { return Math.max(0.05, this.cdOrig(this.data.base.cd ?? 33) * this.cdGlobal); }
  get active() { return this.charges > 0; }
  /** Area = (100 + MSizeU + ShieldSizeRatio)% */
  private get area(): number { return Math.round(100 + this.pctOf('size') + W.stats.size * 100) / 100; }

  onChange() {
    super.onChange();
    if (this.hasCombo(18)) { removeGuard(this.guard); this.charges = 0; }
    else addGuard(this.guard, 0);
    if (this.charges > this.maxCharges) this.charges = this.maxCharges;
    if (!this.img) this.img = W.scene.add.image(0, 0, SH[0][0]).setDepth(DEPTH.projectile).setVisible(false);
    if (!this.co) this.co = new Co(this.hasCombo(18) ? this.quantumLoop() : this.loop());
  }

  destroy() {
    removeGuard(this.guard);
    this.img?.destroy(); this.img = null;
    this.co = null;
    this.fields.length = 0;
    this.quanta.length = 0;
  }

  // ———— Play_Shield ————
  private *loop(): Generator<number, void, unknown> {
    let delay = 0;
    for (;;) {
      if (this.hasCombo(18)) { this.co = new Co(this.quantumLoop()); return; }
      if (this.charges < this.maxCharges) delay -= 0.1;
      if (delay <= 0) {
        // Start_Shield: первый раз — сразу до максимума, дальше +ProductNum
        this.charges = this.first ? this.maxCharges : Math.min(this.maxCharges, this.charges + this.productNum);
        this.first = false;
        delay = this.cdTotal;
      }
      this.cdLeft = this.charges < this.maxCharges ? Math.max(0, delay) : 0;
      yield 0.1;
    }
  }

  /** Play_Shield_Com01 */
  private *quantumLoop(): Generator<number, void, unknown> {
    for (;;) {
      this.cdLeft = this.cdTotal;
      yield this.cdTotal;
      this.quantum();
      yield 0.3;
    }
  }

  /** касание врага: Unit_AttackShield → Shield_Damage */
  private absorb(): boolean {
    const P = W.player, e = P.hitBy;
    if (!e || this.charges <= 0) return false;
    // Shield_Damage: IsShieldDamageDelay + Unit_ShieldDivine — 0.2 с неуязвимости, маг вспыхивает белым
    P.invulnT = Math.max(P.invulnT, DIVINE);
    P.hurtT = DIVINE;
    if (this.hasProp(409)) this.field();
    this.charges--;
    if (!SURVIVE.has(e.type.uid)) W.enemies.remove(e);
    return true;
  }

  /** Поле разрушения (ID 53) */
  private field() {
    const half = (4 * 1.11 * this.area / 2) * U;
    this.fields.push({ t: 0, next: 0, hits: new Set(), half, dmg: this.dmgOf(500) });
    // Explosion53_01..09, 28 шагов по 0.03 с (≈0.84 с), localScale = Area·1.11, едет за магом (дочерний объект Obj_UnitDestroyFieldMid)
    const s = 1.11 * this.area * PX;
    W.fx.anim(W.player.x, W.player.y, FIELD_SEQ.map((k) => EX53[Math.max(0, k)]), 0.03, 0.03, s, s, {
      hook: (img, t, n) => { img.setPosition(W.player.x, W.player.y).setVisible(FIELD_SEQ[n] >= 0); },
    });
  }

  /** Квантовый взрыв (ID 83): N = MaxNum; урон +2·размер +33·N %, Area +33·N % */
  private quantum() {
    const P = W.player, N = this.maxCharges;
    const sizePct = this.pctOf('size') + W.stats.size * 100;
    const area = (100 + sizePct + 33 * N) / 100;
    const dmg = this.dmgOf(500, 2 * sizePct + 33 * N);
    // ExplosionAttack 0x53: масштаб Area·0.35 + 0.65; взрыв стоит на месте (не едет за магом)
    const f = area * 0.35 + 0.65;
    this.quanta.push({ x: P.x, y: P.y, t: 0, f, dmg, hits: new Set() });
    // Explosion83_01..12: паузы Q_WAIT, цвет кадров 1–8 по Q_TINT (Explosion83_Animation_A). Animation_B — тёмная подложка Sprite_EffectGround_ShieldA (не рисуем, HOLES)
    W.fx.anim(P.x, P.y, EX83, Q_WAIT[0], 0.06, f * PX, f * PX, {
      last: 0.13,
      hook: (img, t) => {
        const k = Math.min(Q_END.findIndex((e) => t < e) < 0 ? 11 : Q_END.findIndex((e) => t < e), 11);
        img.setTexture(EX83[k]).setTint(Q_TINT[Math.min(k, 7)]);
      },
    });
  }

  update(dt: number) {
    keepGuard();
    if (!this.co) this.onChange();
    this.co!.update(dt);
    const P = W.player;

    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i];
      f.t += dt;
      while (f.next < FIELD_T.length && f.t >= FIELD_T[f.next]) {
        f.next++; f.hits.clear();
        boxDamage(P.x, P.y, 0, f.half, f.half, f.dmg, this.def.id, f.hits);
      }
      if (f.next >= FIELD_T.length) { this.fields[i] = this.fields[this.fields.length - 1]; this.fields.pop(); }
    }

    // Explosion83_Animation_A: коллайдер растёт 4.5 → 7.5 ед. (кадры 1–9 ON), каждому врагу — 1 раз (список чистится один раз)
    for (let i = this.quanta.length - 1; i >= 0; i--) {
      const q = this.quanta[i];
      q.t += dt;
      const k = Q_END.findIndex((e) => q.t < e);
      if (k >= 0 && k < 9) { const h = (Q_SIZE[k] / 2) * q.f * U; boxDamage(q.x, q.y, 0, h, h, q.dmg, this.def.id, q.hits); }
      if (k < 0) { this.quanta[i] = this.quanta[this.quanta.length - 1]; this.quanta.pop(); }
    }

    // Play_Shield_Motion: кадры набора Shield{n} (n = число зарядов) по 0.3 с, цикл 1.2 с; 128 px × PX
    const img = this.img;
    if (img) {
      img.setVisible(this.charges > 0);
      if (this.charges > 0) {
        this.animT += dt;
        const fr = Math.floor(this.animT / 0.3) % 4;
        img.setTexture(SH[Math.min(this.charges, 5) - 1][fr]).setPosition(P.x, P.y).setScale(PX);
      }
    }
  }
}

export const SHIELD = defFromData(SPELL_BY_ID[6], (def) => new Shield(def, SPELL_BY_ID[6]));
