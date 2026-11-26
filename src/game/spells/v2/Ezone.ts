import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { Co, PX, U } from './_orig';

const DEG = Math.PI / 180;

// ——— текстуры-заглушки по меркам спрайтов (рисуем с Денисом позже) ———
const T = { zone: ['ez_a', 'ez_b', 'ez_c'], fire: 'ez_fire', arc: 'ez_arc', ice: 'ez_ice' };
/** ElectricZone1A 676 px — рисуем 169 (×4) */
const ZONE_PX = 676, ZONE_TEX = 169;
/** FireRing7..14 ≈ 489 px — рисуем 128 */
const FIRE_PX = 489;

function textures() {
  const tx = W.scene.textures;
  const make = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    if (tx.exists(key)) return;
    const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g); g.generateTexture(key, w, h); g.destroy();
  };
  // кольцо рваных белых зигзагов, центр пустой (3 кадра)
  const c = ZONE_TEX / 2;
  T.zone.forEach((key, f) => make(key, ZONE_TEX, ZONE_TEX, (g) => {
    for (const [w, a] of [[4, 0.18], [1.5, 1]] as const) {
      g.lineStyle(w, 0xffffff, a);
      g.beginPath();
      const n = 36;
      for (let i = 0; i <= n; i++) {
        const ang = (i / n) * Math.PI * 2 + f * 0.11;
        const r = 72 + (((i * 7 + f * 5) % 9) - 4) * 1.6;
        const x = c + Math.cos(ang) * r, y = c + Math.sin(ang) * r;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokePath();
    }
  }));
  // FireRing: оранжево-красное кольцо, жёлтые искры
  make(T.fire, 128, 128, (g) => {
    g.lineStyle(14, 0xff3a10, 0.25); g.strokeCircle(64, 64, 54);
    g.lineStyle(7, 0xff7a20, 0.7); g.strokeCircle(64, 64, 54);
    g.lineStyle(2.5, 0xffe070, 1); g.strokeCircle(64, 64, 54);
    g.fillStyle(0xffe070, 1);
    for (let i = 0; i < 14; i++) { const a = i * 2.39; g.fillCircle(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40, 1.5); }
  });
  // Incinerate27 (заряд-дуга слияния 20): дуга 128×64
  make(T.arc, 128, 64, (g) => {
    for (const [w, a] of [[8, 0.2], [3, 0.6], [1.5, 1]] as const) {
      g.lineStyle(w, 0xffffff, a);
      g.beginPath(); g.arc(64, 150, 118, -Math.PI / 2 - 0.48, -Math.PI / 2 + 0.48); g.strokePath();
    }
  });
  // FireRing21..34 (слияние 36): голубой шестиугольник из дуг
  make(T.ice, 128, 128, (g) => {
    g.lineStyle(6, 0x9fe0ff, 0.3);
    g.strokePoints([0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: 64 + Math.cos(i * Math.PI / 3) * 56, y: 64 + Math.sin(i * Math.PI / 3) * 56 })), true);
    g.lineStyle(2, 0xe0f6ff, 1);
    g.strokePoints([0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: 64 + Math.cos(i * Math.PI / 3) * 56, y: 64 + Math.sin(i * Math.PI / 3) * 56 })), true);
  });
}

/** Ширина «спицы» слияния 20 (Unity: Add01 — тег 2; Add02, Add03 — теги 3, 4, scale 0.6) */
const SPOKE_PHASE = [1, 3.8, 3.0, 5.8];
const SPOKE_ANG = [25, 70, 115, 160, 205, 250, 295, 340];
/** 427: размер коллайдера по кадрам FireRing1..14 (по 0.05 с) */
const FIRE_COLL = [1.1, 1.5, 1.9, 2.6, 3.8, 3.9, 4.0, 4.2, 4.3, 4.35, 4.38, 4.4, 0, 0];
/** 36: размер коллайдера и паузы по кадрам FireRing21..34; урон до кадра 31 включительно */
const ICE_COLL = [1.25, 1.75, 2.3, 3.0, 4.3, 4.85, 5.15, 5.35, 5.6, 5.8, 6.0, 6.0, 6.0, 6.0];
const ICE_WAIT = [0.03, 0.03, 0.03, 0.03, 0.04, 0.04, 0.04, 0.04, 0.04, 0.05, 0.04, 0.03, 0.03, 0.03];

/** коллайдер: центр, угол, половины сторон; список задетых за импульс */
interface Coll { follow?: () => void; on: boolean; x: number; y: number; a: number; hl: number; hw: number; hits: Set<number>; dmg: number; img: Phaser.GameObjects.Image | null }

/**
 * #8 Область электротока — 1:1 по коду оригинала (docs/orig/spells/ezone.md, карточка tasks/ezone.md).
 * Зона включается сразу (КД нет). Масштаб Cul = 0.4·Area + 0.2 (Area ≥ 0.2); кольцо ElectricZone1A 676 px × Cul (230 px на ур.1);
 * хитбокс — КВАДРАТ 5.5·Cul по осям мира (187 px). Play_ElectricZone_Attack: список задетых очищается, коллайдер ON 0.03 с,
 * OFF, wait ADelay (0.25 с, ≥ 0.088) → период ≈ 0.28 с, каждый враг раз за импульс, отброса нет. Анимация: 3 кадра по 0.09 с.
 * 426 ЭМИ: у врага счётчик, 4-й удар — стан 0.2 с × StunRes, StunRes ×0.67. 427 Огненная аура: Cul ×1.33, цикл
 * «14 кадров по 0.05 с с ростом коллайдера 1.1 → 4.4, затем wait ADelay (×3)», раз на врага за цикл.
 * Слияния (по библии §8): 20 Отладка молний (4 «спицы», ADelay 0.05), 36 Ледяное сердце (кольцо штампуется у мага, n = 1..4,
 * заморозка 0.2 с), 37 Мейснер (квадрат 5.8, 4-й удар ×10 и сдвиг от центра зоны — решение Дениса, в оригинале баг),
 * 57 Разрушитель (квадрат 6, 3 с работы, затем 0.4 + 5 с пауза).
 */
class Ezone extends DataSpell {
  private co: Co[] = [];
  private mode = -1;
  private colls: Coll[] = [];
  /** счётчик ЭМИ и сопротивления стану/заморозке по врагам (id → значение) */
  private emp = new Map<number, number>();
  private stunRes = new Map<number, number>();
  private frzRes = new Map<number, number>();
  private aniT = 0;
  private aniF = 0;
  /** вид зоны: видна ли, кадр, масштаб */
  private zoneOn = true;
  private zoneTex = T.zone[0];
  /** 36: зона стоит в точке залпа */
  private park: { x: number; y: number } | null = null;

  // ———— числа (StartInformation_B) ————
  private get area(): number { return Math.max(0.2, Math.round(100 + this.pctOf('size') + W.stats.size * 100) / 100); }
  /** масштаб зоны (localScale корня) */
  private get cul(): number {
    const A = this.area;
    if (this.hasCombo(20)) return (0.4 * A + 0.2) * 1.35;
    if (this.hasCombo(36)) return 0.5 * A + 0.5;
    if (this.hasCombo(37)) return 0.55 * A + 0.55;
    if (this.hasCombo(57)) return 0.7 * A + 0.3;
    if (this.hasProp(427)) return (0.4 * A + 0.2) * 1.33;
    return 0.4 * A + 0.2;
  }
  /** сторона квадрата коллайдера в локальных ед. */
  private get box(): number { return this.hasCombo(37) ? 5.8 : this.hasCombo(57) ? 6 : 5.5; }
  /** ElectricZone_ADelay: 0.25 × множители (слияние 20: 0.02 × множители + 0.03) */
  private get aDelay(): number {
    const base = this.data.base.tick ?? 0.25;
    const k = this.tickSec / base;
    const bat = 1 - (W.stats.artFx[296] ?? 0) / 100;   // 130 Батарея: интервал −15 %
    if (this.hasCombo(20)) return 0.02 * k * bat + 0.03;
    return Math.max(0.088, base * k * bat);
  }
  private get kind(): number {
    for (const c of [20, 36, 57]) if (this.hasCombo(c)) return c;
    return this.hasProp(427) ? 427 : 0;
  }

  onChange() {
    super.onChange();
    textures();
    const k = this.kind;
    if (k === this.mode && this.co.length) return;
    this.mode = k;
    this.clearColls();
    this.park = null;
    this.zoneOn = true;
    if (k === 20) this.co = [0, 1, 2, 3].map((i) => new Co(this.spoke(i)));
    else if (k === 36) this.co = [new Co(this.heart())];
    else if (k === 57) this.co = [new Co(this.attack()), new Co(this.destroyer())];
    else if (k === 427) this.co = [new Co(this.fireRing())];
    else this.co = [new Co(this.attack())];
  }

  destroy() { this.clearColls(); this.co = []; }

  private clearColls() { for (const c of this.colls) c.img?.destroy(); this.colls = []; }

  private coll(withImg = true): Coll {
    const img = withImg ? W.scene.add.image(0, 0, T.zone[0]).setDepth(DEPTH.zone + 0.2).setBlendMode(Phaser.BlendModes.ADD) : null;
    const c: Coll = { on: false, x: 0, y: 0, a: 0, hl: 0, hw: 0, hits: new Set(), dmg: 0, img };
    this.colls.push(c);
    return c;
  }

  update(dt: number) {
    if (!this.co.length) this.onChange();
    if (this.emp.size > 2000) { this.emp.clear(); this.stunRes.clear(); this.frzRes.clear(); }
    for (const c of this.co) c.update(dt);
    // Play_ElectricZone_Animation: кадры A/B/C по AniDelay 0.09 с (независимо от ударов)
    this.aniT += dt;
    while (this.aniT >= 0.09) { this.aniT -= 0.09; this.aniF = (this.aniF + 1) % 3; }
    for (const c of this.colls) { c.follow?.(); this.collide(c); }
  }

  /** урон по квадрату/спице коллайдера: каждый враг — раз за импульс (List_EnemyUnitID_Damage) */
  private collide(c: Coll) {
    if (!c.on || c.hl <= 0) return;
    const cs = Math.cos(c.a), sn = Math.sin(c.a);
    W.enemies.grid.query(c.x, c.y, Math.hypot(c.hl, c.hw), (e) => {
      if (c.hits.has(e.id)) return;
      const dx = e.x - c.x, dy = e.y - c.y;
      const lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
      const qx = Math.max(-c.hl, Math.min(c.hl, lx)), qy = Math.max(-c.hw, Math.min(c.hw, ly));
      if ((lx - qx) ** 2 + (ly - qy) ** 2 > e.r * e.r) return;
      c.hits.add(e.id);
      this.hit(e, c.dmg);
    });
  }

  private hit(e: Enemy, dmg: number) {
    if (this.hasProp(426)) {
      // Unit_Damage, SV01 = 426: удары 1–3 копят счётчик, 4-й — стан 0.2 с × StunRes, StunRes ×0.67
      const n = this.emp.get(e.id) ?? 0;
      if (n <= 2) this.emp.set(e.id, n + 1);
      else {
        this.emp.set(e.id, 0);
        const r = this.stunRes.get(e.id) ?? 1;
        if (r > 0) W.enemies.stun(e, 0.2 * r);
        this.stunRes.set(e.id, r * 0.67);
        if (this.hasCombo(37)) { dmg *= 10; this.meissner(e); }
      }
    }
    W.enemies.damage(e, dmg, 0, 0, this.def.id);
    if (this.mode === 36) {
      const r = this.frzRes.get(e.id) ?? 1;
      if (r > 0) W.enemies.freeze(e, 0.2 * r);
      this.frzRes.set(e.id, r * 0.67);
    }
  }

  /**
   * 37 Мейснер: в оригинале сдвиг считается от точки (10037, 0) — баг (почти ноль). По решению Дениса (2026-11-26)
   * — «как задумано»: от центра зоны, формулой той же ветки: k = clamp(0.3 / Δ, ±1.2) ед. по каждой оси (Δ = 0 → 3 → 1.2),
   * один мгновенный сдвиг; сопротивление отбросу врага = 1.
   */
  private meissner(e: Enemy) {
    const P = W.player;
    const dx = (P.x - e.x) / U, dy = (P.y - e.y) / U;
    const k = (d: number) => Math.max(-1.2, Math.min(1.2, d === 0 ? 3 : 0.3 / d));
    e.x -= k(dx) * U; e.y -= k(dy) * U;
  }

  /** зона следует за магом: квадрат 5.5·Cul по осям мира */
  private placeZone(c: Coll, side: number, tex: string, texPx: number, scale: number, tint = 0xffffff) {
    const P = W.player, x = this.park ? this.park.x : P.x, y = this.park ? this.park.y : P.y;
    c.x = x; c.y = y; c.a = 0; c.hl = c.hw = side / 2 * U;
    c.img?.setTexture(tex).setPosition(x, y).setVisible(this.zoneOn).setTint(tint)
      .setDisplaySize(texPx * PX * scale, texPx * PX * scale);
  }

  // ———— Play_ElectricZone_Attack (база, 425, 426, 37, 57) ————
  private *attack(): Generator<number, void, unknown> {
    const c = this.coll();
    c.follow = () => this.zoneFrame(c);
    for (;;) {
      if (!this.zoneOn) { c.on = false; yield 0.03; continue; }
      c.hits.clear(); c.dmg = this.dmg; c.on = true;
      yield 0.03;
      c.on = false;
      yield this.aDelay;
    }
  }

  private zoneFrame(c: Coll) {
    const cul = this.cul;
    const tint = this.hasProp(426) ? 0x00ffc7 : this.hasCombo(57) ? 0xadf7ff : 0xffffff;
    this.placeZone(c, this.box * cul, T.zone[this.aniF], ZONE_PX, cul, tint);
  }

  // ———— Play_ElectricZone_Com04_Active (57 Разрушитель): N·(2·3 кадра по 0.075 + 0.03) работы, затем 0.4 + 5 с ————
  private *destroyer(): Generator<number, void, unknown> {
    for (;;) {
      const N = Math.floor(3 * W.stats.durMul * 4.25 * 0.5);
      this.zoneOn = true;
      yield N * (6 * 0.075 + 0.03);
      this.zoneOn = false;
      yield 0.4;
      yield 5 * this.cdGlobal;
    }
  }

  // ———— Play_FireRing_Animation (427) ————
  private *fireRing(): Generator<number, void, unknown> {
    const c = this.coll();
    c.follow = () => { c.x = W.player.x; c.y = W.player.y; c.img?.setPosition(c.x, c.y); };
    for (;;) {
      c.hits.clear(); c.dmg = this.dmg; c.on = true;
      for (let f = 0; f < 14; f++) {
        const cul = this.cul, P = W.player;
        c.x = P.x; c.y = P.y; c.a = 0; c.hl = c.hw = FIRE_COLL[f] * cul / 2 * U;
        // спрайт растёт из точки (FireRing1 ≈ 140 px) до полного к кадру 7, к кадру 14 гаснет
        const k = Math.min(1, (f + 1) / 7), a = f < 11 ? 1 : (14 - f) / 4;
        c.img?.setTexture(T.fire).setVisible(true).setPosition(P.x, P.y).setAlpha(a).clearTint()
          .setDisplaySize(FIRE_PX * PX * cul * k, FIRE_PX * PX * cul * k);
        yield 0.05;
      }
      c.on = false; c.hl = 0; c.img?.setVisible(false);
      yield this.aDelay;
    }
  }

  // ———— Play_ElectricZone_Com01_Animation (20 Отладка молний): 4 «спицы» ————
  private *spoke(i: number): Generator<number, void, unknown> {
    const c = this.coll();
    c.img?.setTexture(T.arc);
    const dir = i < 2 ? 1 : -1, sub = i >= 2 ? 0.6 : 1;
    let th = 0, r = 0;
    c.follow = () => { c.x = W.player.x - Math.sin(th) * r; c.y = W.player.y - Math.cos(th) * r; c.img?.setPosition(c.x, c.y); };
    yield 0.1 + this.aDelay * SPOKE_PHASE[i];
    for (;;) {
      c.hits.clear(); c.dmg = this.dmg; c.on = true;
      for (const deg of SPOKE_ANG) {
        const S = this.cul * sub;
        th = dir * deg * DEG;
        // BoxCollider (2.2, 0.35·Cul), центр (0, 2.45) в повёрнутом кадре; экран: y вниз
        r = 2.45 * S * U;
        c.follow!(); c.a = -th;
        c.hl = 2.2 * S / 2 * U; c.hw = 0.35 * this.cul * S / 2 * U;
        c.img?.setVisible(true).setRotation(c.a).setAlpha(0.925)
          .setDisplaySize(c.hl * 2, c.hl);
        yield this.aDelay;
      }
    }
  }

  // ———— Play_FrozenHeart_Animation (36 Ледяное сердце) ————
  private *heart(): Generator<number, void, unknown> {
    const c = this.coll();
    c.img?.setTexture(T.ice).setVisible(false);
    let n = 0;
    for (;;) {
      yield this.aDelay + 0.25;
      c.hits.clear(); c.on = true;
      this.park = { x: W.player.x, y: W.player.y };
      if (n > 3) n = 0;
      n++;
      c.dmg = this.dmg * n;
      const sc = this.cul + n * 0.225 - 0.1;
      for (let f = 0; f < 14; f++) {
        if (f === 11) c.on = false;
        c.x = this.park.x; c.y = this.park.y; c.a = 0; c.hl = c.hw = ICE_COLL[f] * sc / 2 * U;
        c.img?.setVisible(true).setPosition(c.x, c.y).setAlpha(f < 11 ? 1 : (14 - f) / 4)
          .setDisplaySize(ICE_COLL[f] * sc * U, ICE_COLL[f] * sc * U);
        yield ICE_WAIT[f];
      }
      c.on = false; c.hl = 0; c.img?.setVisible(false);
    }
  }
}

export const EZONE = defFromData(SPELL_BY_ID[8], (def) => new Ezone(def, SPELL_BY_ID[8]));
