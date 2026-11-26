import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID, type Mod } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { ensureOrigTextures, OT, OT_PX, PX, TICK, U } from './_orig';

/** колонки 02 Спутника (эффект 306 +20) действуют уже при изучении — как у Духа (долг партии 2) */
const LEARN_BONUS: Mod = { stat: 'dmg', op: 'pct', v: 20, text: 'Урон спутников +20%' };

const DEG = Math.PI / 180;
/** SatelliteRotationVar: градусов за тик */
const VAR0 = 2.88;
/** UnitBase_SatelliteSpeed — пауза тика вращения, с */
const PAUSE0 = 0.03;
/** ApplySatelliteGroup: localPosition спутника (−2.25, 0) ед.; 390 — кольца 1.6 / 2.7; 62 — 1.8 / 3.6 */
const R_BASE = 2.25, R_WISP: [number, number] = [1.6, 2.7], R_BLADE: [number, number] = [1.8, 3.6];

interface Sat {
  img: Phaser.GameObjects.Image;
  /** List_EnemyUnitID_Damage — у базы не очищается никогда */
  hits: Set<number>;
  ring: 0 | 1;
  /** номер в кольце (поворот центра 360/n·k) */
  k: number;
  x: number; y: number; a: number;
  /** Гиперион: второе солнце (−20 % урона, заморозка при первом попадании) */
  frost: boolean;
}

/**
 * #4 Спутник — 1:1 по коду оригинала (docs/orig/spells/satellite.md):
 * общий центр крутится по часовой: угол −= SatelliteRotationVar (2.88°) раз в UnitApply_SatelliteSpeed (0.03 с) = 96°/с;
 * спутник на радиусе 2.25 ед., масштаб Size = 0.92, коллайдер 0.3×0.3 × Size.
 * OnCollisionEnter: каждый спутник бьёт каждого врага ОДИН раз (список не очищается; повтор 0.33 с — только 391 и слияние 32).
 * Свойства: 389 Антигравитация (Var ×0.5 + «пила» Add 0 → 4.32 по +0.015, вниз до 1.44 по −0.02),
 * 390 Блуждающие огоньки (два кольца по Num на 1.6 / 2.7 ед., второе — навстречу, коллайдер 0.19),
 * 391 Термоядерная реакция (одно солнце: урон ×Num, масштаб Num·Size·0.09 + 0.2, радиус 0.35·S + 2.55, коллайдер 3.5, Var ×0.5).
 * Слияния (основа): 32 Гиперион, 45 Генерация магнитного поля, 62 Соул Блейд — по числам библии (ульты не входят в 3.0).
 */
class Satellite extends DataSpell {
  private sats: Sat[] = [];
  /** списки попаданий живут дольше объектов (в оригинале объекты не пересоздаются) */
  private hitStore = new Map<string, Set<number>>();
  private key0 = '';
  /** SatellitePosition_Z прямого и обратного центров, град. */
  private rotA = 0;
  private rotB = 0;
  private acc = 0;
  /** Антигравитация: SatelliteRotationVar_Add и направление */
  private agAdd = 0;
  private agUp = true;
  /** AttackDelay (391 / 32): цикл 0.03 с коллайдер ВКЛ + 0.3 с ВЫКЛ */
  private adT = 0;
  private trailT = 0;
  private t = 0;
  /** Гиперион: заморожен ли враг вторым солнцем (только первое попадание) */
  private frozen = new Set<number>();

  private modSrc: Mod[] | null = null;
  private modOut: Mod[] = [];
  mods(): Mod[] {
    const src = super.mods();
    if (src === this.modSrc) return this.modOut;
    this.modSrc = src;
    // «Множитель урона/размера +1 за спутник» (391) и «число ×2» (390) — в коде это отдельные формулы ниже
    const m = src.filter((x) => !((x.stat === 'dmg' || x.stat === 'size') && x.op === 'add') && !(x.stat === 'count' && x.op === 'mul'));
    if (this.level >= 1) m.unshift(LEARN_BONUS);
    return (this.modOut = m);
  }

  onChange() { super.onChange(); this.key0 = ''; }

  // ———————— числа (StartInformation_B) ————————
  /** UnitApply_SatelliteNum: +1 за уровень */
  private get num(): number {
    let n = this.data.base.count ?? 1;
    for (const l of this.data.levels) if (l.level <= this.level) for (const m of l.mods) if (m.stat === 'count' && m.op === 'add') n += m.v;
    return Math.max(1, Math.round(n + W.stats.sc(this.def.id)));
  }
  private upDown(s: 'size' | 'speed'): [number, number] {
    let u = 0, d = 0;
    for (const m of this.mods()) if (m.stat === s && m.op === 'pct') { if (m.v >= 0) u += m.v; else d -= m.v; }
    return [u, d];
  }
  /** UnitApply_SatelliteSize = round(92·(100 + U + MSizeU)%·clamp((100 − D)%))·0.01 */
  private get size(): number {
    const [u, d] = this.upDown('size');
    return Math.round(92 * (100 + u + W.stats.size * 100) * 0.01 * Math.max(0.01, (100 - d) * 0.01)) * 0.01;
  }
  /** [пауза тика, k] : пауза = 0.03 / (100 + U)% × (100 + D)%; ниже 0.03 — ускорение уходит в градусы (не больше +0.02) */
  private get tick(): [number, number] {
    const [u, d] = this.upDown('speed');
    let p = PAUSE0 / ((100 + u) * 0.01) * Math.max(0.01, (100 + d) * 0.01);
    let k = 1;
    if (p < PAUSE0) { k = 1 + Math.min(PAUSE0 - p, 0.02) / PAUSE0; p = PAUSE0; }
    return [p, k];
  }
  /** шанс крита спутника, % (UnitApply_Satellite_CriRan) */
  private get criRan() { return Math.round(W.stats.crit * 100); }

  private get fusion391() { return this.hasProp(391); }
  private get wisp() { return this.hasProp(390); }

  /** Пересобрать спутники под текущее число/форму */
  private rebuild() {
    const n = this.num;
    const fused = this.fusion391;
    const two = this.wisp || this.hasCombo(62);
    const cnt = fused ? (this.hasCombo(32) ? 2 : 1) : two ? n * 2 : n;
    const tex = this.texKey;
    const key = `${cnt}|${tex}|${fused}|${two}`;
    if (key === this.key0) return;
    this.key0 = key;
    while (this.sats.length < cnt) {
      this.sats.push({ img: W.scene.add.image(0, 0, tex).setDepth(DEPTH.projectile), hits: new Set(), ring: 0, k: 0, x: 0, y: 0, a: 0, frost: false });
    }
    while (this.sats.length > cnt) this.sats.pop()!.img.destroy();
    this.sats.forEach((s, i) => {
      s.ring = two && !fused && i >= n ? 1 : 0;
      s.k = fused ? i : s.ring ? i - n : i;
      s.frost = fused && i === 1;
      const id = `${fused ? 'F' : 'S'}${s.ring}:${s.k}`;
      let h = this.hitStore.get(id);
      if (!h) this.hitStore.set(id, (h = new Set()));
      s.hits = h;
      s.img.setTexture(tex).setBlendMode(Phaser.BlendModes.ADD);
      if (s.frost) s.img.setTint(0x9fd8ff); else s.img.clearTint();
    });
  }

  private get texKey(): string {
    if (this.fusion391) return this.hasCombo(32) ? OT.satHyp : OT.satSun;
    if (this.hasCombo(45)) return OT.satMag;
    if (this.hasCombo(62)) return OT.satBlade;
    if (this.wisp) return OT.satWisp;
    return OT.sat;
  }

  destroy() { this.sats.forEach((s) => s.img.destroy()); this.sats = []; this.key0 = ''; }

  /** один тик корутины вращения */
  private step(k: number) {
    if (this.hasCombo(45)) {
      // Com02_A и Com02_B — две копии на одном угле: за тик угол уменьшается дважды; Var = k·2.88·1.25
      this.rotA -= 2 * k * VAR0 * 1.25;
      return;
    }
    let v = k * VAR0;
    if (this.hasCombo(62)) v = k * VAR0 * (1 + this.criRan * 0.002);
    if (this.fusion391) v *= 0.5;
    if (this.hasProp(389)) {
      v *= 0.5;
      if (this.agUp) { this.agAdd += 0.015; if (this.agAdd >= 4.32) this.agUp = false; }
      else { this.agAdd -= 0.02; if (this.agAdd <= 1.44) this.agUp = true; }
      v += this.agAdd;
    }
    this.rotA -= v;
    this.rotB += v;
    if (this.rotA <= -3600000) this.rotA = 0;
    if (this.rotB >= 3600000) this.rotB = 0;
  }

  update(dt: number) {
    ensureOrigTextures();
    this.rebuild();
    this.t += dt;
    const [pause, k] = this.tick;
    this.acc += dt;
    for (let i = 0; i < 20 && this.acc >= pause; i++) { this.acc -= pause; this.step(k); }
    if (this.acc > pause) this.acc = 0;

    const P = W.player, n = this.num, size = this.size, fused = this.fusion391;
    // ———— форма и урон ————
    let r0 = R_BASE * U, r1 = R_BASE * U;
    let scX = size, scY = size;          // масштаб спутника
    let hl = 0.15 * size * U, hw = hl;   // половины коллайдера (0.3 × масштаб)
    let dmg = this.dmg;
    let delay = false;                   // AttackDelay 0.33 с
    if (fused) {
      const S = n * size * 0.09 + 0.2;
      scX = scY = S;
      r0 = (0.35 * S + 2.55) * U;
      hl = hw = 1.75 * S * U;
      dmg = Math.round(n * dmg);
      delay = true;
      if (this.hasCombo(32)) {
        // Гиперион: 2 солнца, масштаб S·0.8 + 0.25, коллайдер 3.2; урон = Num·1.5·4.5·(100 + U + Size·20000/92)%·Attack
        const S2 = S * 0.8 + 0.25;
        scX = scY = S2;
        hl = hw = 1.6 * S2 * U;
        dmg = n * 1.5 * this.dmgOf(this.data.base.dmgPct ?? 450, size * 20000 / 92);
      }
    } else if (this.hasCombo(45)) {
      scX = scY = 0.25;
      hl = hw = 0.8 * 0.25 * U;
      dmg *= 7;
    } else if (this.hasCombo(62)) {
      [r0, r1] = [R_BLADE[0] * U, R_BLADE[1] * U];
      scY = size + 0.5;
      hl = 0.175 * size * U; hw = 0.09 * scY * U;
      dmg *= 6 * (1 + 0.04 * this.criRan);
    } else if (this.wisp) {
      [r0, r1] = [R_WISP[0] * U, R_WISP[1] * U];
      hl = hw = 0.095 * size * U;
    }

    // AttackDelay: в начале цикла список очищается, коллайдер включён 0.03 с, затем 0.3 с выключен
    let active = true;
    if (delay) {
      this.adT += dt;
      if (this.adT >= TICK + 0.3) { this.adT -= TICK + 0.3; for (const s of this.sats) s.hits.clear(); }
      active = this.adT < TICK;
    }

    const [pxW, pxT] = OT_PX[this.texKey];
    const texScale = PX * pxW / pxT;
    let per0 = 0;
    for (const s of this.sats) if (s.ring === 0) per0++;
    const per1 = this.sats.length - per0;
    this.trailT -= dt;
    const trail = this.hasCombo(62) && this.trailT <= 0;
    if (trail) this.trailT += 0.045;

    for (const s of this.sats) {
      // угол центра (Unity, град.): 360/n·k + общий поворот; спутник в (−R, 0) локально; экран — y вниз
      let deg: number, R: number;
      if (fused) { deg = this.rotA + (s.frost ? 180 : 0); R = r0; }
      else if (s.ring === 0) { deg = this.rotA + (360 / per0) * s.k; R = r0; }
      else { deg = this.rotB + (360 / per1) * s.k; R = r1; }
      const th = deg * DEG;
      const ux = -Math.cos(th), uy = Math.sin(th); // направление от мага к спутнику на экране
      s.x = P.x + ux * R; s.y = P.y + uy * R;
      s.a = Math.atan2(uy, ux);
      s.img.setPosition(s.x, s.y).setRotation(s.a).setScale(texScale * scX, texScale * scY);
      if (trail) W.fx.puff(s.x, s.y, (size + 0.8) * 128 * PX, 0xffffff, 0.12, OT.satBlade, s.a, 0.6);
      if (active) this.collide(s, hl, hw, s.frost ? dmg * 0.8 : dmg);
    }
  }

  /** коллайдер-прямоугольник спутника (поворачивается с центром) против круга врага; каждый враг — раз за список */
  private collide(s: Sat, hl: number, hw: number, dmg: number) {
    const c = Math.cos(s.a), sn = Math.sin(s.a);
    W.enemies.grid.query(s.x, s.y, Math.hypot(hl, hw), (e: Enemy) => {
      if (s.hits.has(e.id) || !e.alive) return;
      const dx = e.x - s.x, dy = e.y - s.y;
      const lx = dx * c + dy * sn, ly = -dx * sn + dy * c;
      const qx = Math.max(-hl, Math.min(hl, lx)), qy = Math.max(-hw, Math.min(hw, ly));
      if ((lx - qx) ** 2 + (ly - qy) ** 2 > e.r * e.r) return;
      s.hits.add(e.id);
      W.enemies.damage(e, dmg, 0, 0, this.def.id);
      if (s.frost && !this.frozen.has(e.id)) { this.frozen.add(e.id); W.enemies.freeze(e, 1); }
    });
  }
}

export const SATELLITE = defFromData(SPELL_BY_ID[4], (def) => new Satellite(def, SPELL_BY_ID[4]));
