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
/** Shield1..5: условный цвет набора по числу зарядов (кадры рисуем с Денисом позже) */
const SET_TINT = [0xffffff, 0xffffff, 0xbfe4ff, 0xffe9a0, 0xd8b0ff];
const TEX = 'sh_bubble';

function textures() {
  if (W.scene.textures.exists(TEX)) return;
  // Shield*_0x 128×128: тонкое светлое кольцо-пузырь
  const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
  g.lineStyle(3, 0xffffff, 0.9); g.strokeCircle(64, 64, 58);
  g.lineStyle(1.5, 0xffffff, 0.5); g.strokeCircle(64, 64, 52);
  g.fillStyle(0xffffff, 0.08); g.fillCircle(64, 64, 57);
  g.generateTexture(TEX, 128, 128); g.destroy();
}

interface Field { t: number; next: number; hits: Set<number>; half: number; dmg: number }
/** DestroyField_Animation: 4 удара */
const FIELD_T = [0, 0.18, 0.39, 0.6];

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
  private readonly guard = () => this.absorb();

  get maxCharges() { return Math.max(1, Math.round(this.stat('count', MAX_BASE))); }
  private get productNum() { return this.hasProp(408) ? 2 : 1; }
  get cdTotal() { return Math.max(0.05, this.cdOrig(this.data.base.cd ?? 33) * this.cdGlobal); }
  get active() { return this.charges > 0; }
  /** Area = (100 + MSizeU + ShieldSizeRatio)% */
  private get area(): number { return Math.round(100 + this.pctOf('size') + W.stats.size * 100) / 100; }

  onChange() {
    super.onChange();
    textures();
    if (this.hasCombo(18)) { removeGuard(this.guard); this.charges = 0; }
    else addGuard(this.guard, 0);
    if (this.charges > this.maxCharges) this.charges = this.maxCharges;
    if (!this.img) this.img = W.scene.add.image(0, 0, TEX).setDepth(DEPTH.projectile).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    if (!this.co) this.co = new Co(this.hasCombo(18) ? this.quantumLoop() : this.loop());
  }

  destroy() {
    removeGuard(this.guard);
    this.img?.destroy(); this.img = null;
    this.co = null;
    this.fields.length = 0;
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
    W.fx.burst(W.player.x, W.player.y, half * 1.2, 0x9fb8ff, 0.84, 'ring', W.player);
  }

  /** Квантовый взрыв (ID 83): N = MaxNum; урон +2·размер +33·N %, Area +33·N % */
  private quantum() {
    const P = W.player, N = this.maxCharges;
    const sizePct = this.pctOf('size') + W.stats.size * 100;
    const area = (100 + sizePct + 33 * N) / 100;
    const dmg = this.dmgOf(500, 2 * sizePct + 33 * N);
    // коллайдер Explosion83 не разобран (карточка «Нерешённое») — заглушка по масштабу картинки Area·0.35 + 0.65
    const half = (area * 0.35 + 0.65) * U;
    boxDamage(P.x, P.y, 0, half, half, dmg, this.def.id);
    W.fx.burst(P.x, P.y, half * 1.3, 0xd8e4ff, 0.5, 'ring');
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

    // Play_Shield_Motion: кадры набора Shield{n} по 0.3 с (цикл 1.2 с); заглушка — лёгкая пульсация
    const img = this.img;
    if (img) {
      img.setVisible(this.charges > 0);
      if (this.charges > 0) {
        this.animT += dt;
        const fr = Math.floor(this.animT / 0.3) % 4;
        img.setPosition(P.x, P.y).setScale(PX * (1 + fr * 0.02)).setTint(SET_TINT[Math.min(this.charges, 5) - 1]).setAlpha(0.85);
      }
    }
  }
}

export const SHIELD = defFromData(SPELL_BY_ID[6], (def) => new Shield(def, SPELL_BY_ID[6]));
