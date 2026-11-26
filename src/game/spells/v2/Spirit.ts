import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID, type Mod } from '../../../data/spells_data';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { aimAngle, Co, ensureOrigTextures, OrigBullets, OT, origTargets, PX, TICK, U, type OBullet } from './_orig';

/**
 * Раскладки духов вокруг мага (StartInformation_B, switch по UnitApply_SpiritNum, @0x11d08b0…0x11d7cbc;
 * сняты трассировкой ветвей, ед., y вверх). Индекс = порядок стрельбы (List_Transform_ObjSpirit[1..N]).
 */
const LAYOUT: Record<number, [number, number][]> = {
  1: [[0, 0.55]],
  2: [[-0.38, 0.075], [0.38, 0.075]],
  3: [[-0.38, 0.075], [0.38, 0.075], [0, 0.55]],
  4: [[-0.38, 0.075], [0.38, 0.075], [-0.3, 0.34], [0.3, 0.34]],
  5: [[-0.38, 0.075], [0.38, 0.075], [-0.24, 0.343], [0.24, 0.343], [0, 0.55]],
  6: [[-0.38, 0.075], [0.38, 0.075], [-0.24, 0.343], [0.24, 0.343], [-0.125, 0.55], [0.125, 0.55]],
  7: [[-0.3, -0.19], [0.3, -0.19], [-0.38, 0.075], [0.38, 0.075], [-0.24, 0.343], [0.24, 0.343], [0, 0.55]],
  8: [[-0.3, -0.3], [0.3, -0.3], [-0.4, 0], [0.4, 0], [-0.33, 0.31], [0.33, 0.31], [-0.14, 0.56], [0.14, 0.56]],
  9: [[-0.24, -0.47], [0.24, -0.47], [-0.42, -0.2], [0.42, -0.2], [-0.5, 0.109], [0.5, 0.109], [-0.4, 0.42], [0.4, 0.42], [-0.18, 0.65]],
  10: [[-0.26, -0.48], [0.26, -0.48], [-0.45, -0.215], [0.45, -0.215], [-0.55, 0.09], [0.55, 0.09], [-0.46, 0.4], [0.46, 0.4], [-0.275, 0.633], [0.275, 0.633]],
};
/** больше 10 духов: венок по кругу (раскладки 11–14 в коде есть, но не выписаны — до них не доходит) */
function layout(n: number): [number, number][] {
  if (LAYOUT[n]) return LAYOUT[n];
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI * 2;
    return [Math.cos(a) * 0.6, Math.sin(a) * 0.6 + 0.1] as [number, number];
  });
}

/** колонки 02 Духа (эффект 271 +20) применяются уже при изучении — у Духа нет проверки «первое изучение» */
const LEARN_BONUS: Mod = { stat: 'dmg', op: 'pct', v: 20, text: 'Урон духов +20%' };

/** Копьё 99 (SpiritBullet99_Animation @0x12878f4): центр и длина коллайдера по кадрам (ед. × 1.35), y = 1.4 */
const SPEAR_C = [-2.9, -2.28, -1.17, 0, 0.3, 0.8, 1.55];
const SPEAR_L = [1, 2.2, 4.5, 6.1, 5.5, 4.5, 3.0];
const SPEAR_TINT = [0xffffff, 0xffffff, 0xe6f2ff, 0xcce6ff, 0xb3d9ff, 0x80ccff, 0x80ccff, 0x80ccff, 0x80ccff, 0x80ccff];
/** пауза кадров копья: BulletSpeed 0.042, кадр 3 — 0.03 */
const SPEAR_W = [0.042, 0.042, 0.03, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042, 0.042];
const SPEAR_END = SPEAR_W.map((_, i) => SPEAR_W.slice(0, i + 1).reduce((a, b) => a + b, 0));
/** Мечи 22 (SpiritBulletE_Animation @0x11892cc): 5 шагов по 0.03 с; центр / длина коллайдера (× 0.12), шаг 5 — OFF */
const SWORD_C = [-0.76, 0, 0, 0.3];
const SWORD_L = [0.5, 2.05, 2.15, 1.5];
/** Сверхновая 107 (SpiritBullet107_Moving @0x1186ab0): коллайдер (x, y) по тикам 0..6, дальше не меняется; центр x 0.4 */
const NOVA_COL: [number, number][] = [[0.4, 0.01], [0.4, 0.01], [0.5, 0.02], [0.5, 0.02], [1, 0.03], [1, 0.03], [1, 0.04]];

interface Unit { img: Phaser.GameObjects.Image; flash: Phaser.GameObjects.Image; ox: number; oy: number; shotT: number }

/**
 * #3 Дух (Spirit) — 1:1 по коду оригинала (docs/orig/spells/spirit.md):
 * духи стоят «венком» у мага (раскладка из кода), стреляют ПО ОЧЕРЕДИ одним циклом Play_Spirit_Attack:
 * цель заново на каждый выстрел (d = (|dx|+|dy|)·приоритет ≤ 23 ед.; нет цели — ждать 0.1 с),
 * после каждого духа пауза DSpeed = 0.135·15/(N+14), после круга — max(0.9·КД − DSpeed, 0.05).
 * Снаряд (кейс 19): 0.36 с, 14 ед/с, пробой 999, первый шаг 0.36 ед. назад.
 * Свойства: 380 Заколдованная ракета (ровный поток, кейс 31), 381 Магический клинок (взмах на цели, кейс 56),
 * 382 Фамильяр (один дух, 15·N выстрелов во все стороны, кейс 43).
 * Слияния (партия 6, StartInformation_B @0x11d96e4 / @0x11de0bc / @0x11ded40):
 * 2 Парящие мечи — снаряд 22 (взмахи с прыжками), урон ×⌊(1−КД)·6.65+3⌋, взмахов ⌊(1−КД)·6.65+1⌋, дальность 17;
 * 43 Магическое копьё — снаряд 99 (луч Incinerate20 на 4.6 ед. впереди, 10 кадров по 0.042 с), обычный ритм духов, дальность 20;
 * 53 Сверхновая — Play_SuperNova_Attack: ⌊15·N·0.25⌋ лучей 107 ровным кругом, затем пауза КД (×2 — мод слияния).
 */
class Spirit extends DataSpell {
  private bullets = new OrigBullets();
  private units: Unit[] = [];
  private co: Co | null = null;
  private famCo: Co | null = null;
  private famNova = false;

  mods(): Mod[] {
    const m = super.mods();
    if (this.level >= 1 && !m.includes(LEARN_BONUS)) m.unshift(LEARN_BONUS);
    return m;
  }

  // ———————— числа (StartInformation_B @0x11c82f4, ограничения @0x11cbaa8) ————————
  /** UnitApply_SpiritNum: +1 за уровень (Фамильяр «+15 за духа» — это выстрелы, не духи) */
  private get num(): number {
    let n = this.data.base.count ?? 1;
    for (const l of this.data.levels) if (l.level <= this.level) for (const m of l.mods) if (m.stat === 'count' && m.op === 'add') n += m.v;
    return Math.max(1, Math.round(n + W.stats.sc(this.def.id)));
  }
  private get familiar() { return this.hasProp(382); }
  private get missile() { return this.hasProp(380); }
  private get blade() { return this.hasProp(381); }
  /** дальность выбора цели: 23, Клинок 17, Копьё 20 */
  private get range() { return this.hasCombo(43) ? 20 : this.blade ? 17 : 23; }
  /** размер снаряда: (100 + U + MSizeU)% */
  private get bSize() { return Math.max(0.01, Math.round(100 + this.pctOf('size') + W.stats.size * 100) / 100); }
  /** скорость (×0.1): 18 */
  private get mSpeed() { return Math.max(0.0001, 18 * Math.max(0, 1 + this.pctOf('speed') / 100)); }
  /** [DSpeed, пауза после круга] */
  private get rhythm(): [number, number] {
    const N = this.num;
    let D = Math.max(0.01, 0.135 * 15 / (N + 14));
    // ×5 Фамильяра в данных (мод cd mul 5) — в коде он после ограничений, поэтому снимаем его тут и умножаем ниже
    const P0 = (this.cdOrig(0.9) / (this.familiar ? 5 : 1)) * this.cdGlobal;
    let P = Math.max(P0 - D, 0.05);
    // Копьё (43): «стандартные КД и интервал стрельбы духов возвращаются»
    if (this.missile && !this.hasCombo(43)) { D = Math.max(0.02, (P + D) / (N * 0.388 + 3.88)); P = 0; }
    if (this.familiar) { D *= 0.168; P *= 5; }
    return [D, P];
  }
  private get shotDmg() { return this.dmg; }
  /** UnitApply_SpiritPSpeed для формул слияния 2: КД духов до вычета DSpeed (множитель от бега k = 1) */
  private get pSpeed() { return (this.cdOrig(0.9) / (this.familiar ? 5 : 1)) * this.cdGlobal; }
  /** Парящие мечи: ⌊(1 − k·PSpeed)·6.65 + 3⌋ (6.65 = const 0x635c0c; k = 1 без MoveSpeedMCooltimeRatio) */
  private get swordMul() { return Math.floor((1 - this.pSpeed) * 6.65 + 3); }
  /** SpiritAttackPlus = ⌊(1 − k·PSpeed)·6.65 + 1⌋ — число взмахов (Round(SpecialVar01)) */
  private get swordSwings() { return Math.max(1, Math.floor((1 - this.pSpeed) * 6.65 + 1)); }

  // ———————— жизненный цикл ————————
  onChange() {
    super.onChange();
    ensureOrigTextures();
    const N = this.num, L = layout(N);
    const need = this.familiar ? 1 : N;
    while (this.units.length < need) {
      this.units.push({
        img: W.scene.add.image(0, 0, OT.wisp).setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD),
        flash: W.scene.add.image(0, 0, OT.glow).setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
        ox: 0, oy: 0, shotT: 9,
      });
    }
    while (this.units.length > need) { const u = this.units.pop()!; u.img.destroy(); u.flash.destroy(); }
    // Unit_Spirit: scale 0.95 (спрайт 64 px, видимая часть ~22×28); Фамильяр — набор 3 (крупнее кадр D)
    this.units.forEach((u, i) => {
      const [x, y] = L[i];
      u.ox = x * U; u.oy = -y * U;
      u.img.setScale(PX * 0.95).setTint(this.blade ? 0xbff8ee : this.familiar ? 0xffe2a8 : this.missile ? 0xd8e8ff : 0xffffff);
    });
    if (!this.co) this.co = new Co(this.attackLoop());
    if (this.familiar && (!this.famCo || this.famNova !== this.hasCombo(53))) {
      this.famNova = this.hasCombo(53);
      this.famCo = new Co(this.famNova ? this.novaLoop() : this.familiarLoop());
    }
  }

  destroy() {
    this.bullets.destroy();
    for (const u of this.units) { u.img.destroy(); u.flash.destroy(); }
    this.units = []; this.co = null; this.famCo = null;
  }

  update(dt: number) {
    if (!this.co) this.onChange();
    if (this.familiar) this.famCo?.update(dt); else this.co!.update(dt);
    const P = W.player;
    for (const u of this.units) {
      // духи — дочерние объекты мага: стоят на месте относительно него, лёгкое покачивание кадров A–C (0.2 с)
      const x = P.x + u.ox, y = P.y + u.oy;
      u.img.setPosition(x, y);
      u.shotT += dt;
      // кадр D (выстрел) — мягкий круг ~0.2 с
      const on = u.shotT < 0.2;
      u.flash.setVisible(on);
      if (on) u.flash.setPosition(x, y).setScale(PX * 0.95 * (this.familiar ? 1.4 : 0.8)).setAlpha(1 - u.shotT / 0.2);
      u.img.setAlpha(on ? 0.4 : 1);
    }
    this.bullets.update(dt);
  }

  private pos(i: number) { const u = this.units[i], P = W.player; return { x: P.x + u.ox, y: P.y + u.oy }; }

  // ———————— корутины ————————
  /** Play_Spirit_Attack: духи по очереди, цель заново на каждый выстрел */
  private *attackLoop(): Generator<number, void, unknown> {
    for (;;) {
      if (this.familiar) { yield 0.1; continue; }
      const N = Math.min(this.num, this.units.length);
      for (let s = 0; s < N; s++) {
        let T = origTargets(W.player.x, W.player.y, this.range);
        while (!T) {
          yield 0.1; // нет цели — ждать и пробовать того же духа
          T = origTargets(W.player.x, W.player.y, this.range);
        }
        if (s >= this.units.length) break;
        this.fire(s, T[0].x, T[0].y);
        yield this.rhythm[0];
      }
      yield this.rhythm[1];
    }
  }

  /** Play_Familiar_Attack: SpiritNum × 15 выстрелов в случайные стороны (AccuracyAim 900), затем пауза ×5 */
  private *familiarLoop(): Generator<number, void, unknown> {
    for (;;) {
      if (!this.familiar) { yield 0.1; continue; }
      const shots = this.num * 15;
      for (let k = 0; k < shots; k++) {
        const o = this.pos(0);
        this.units[0].shotT = 0;
        this.familiarShot(o.x, o.y, Math.random() * Math.PI * 2);
        yield this.rhythm[0];
      }
      yield this.rhythm[1];
    }
  }

  /** Play_SuperNova_Attack: Rotation = Random(0,180), шаг 360/FireNum; эффект, wait 0.06, круг лучей 107, wait 0.15, wait PSpeed */
  private *novaLoop(): Generator<number, void, unknown> {
    for (;;) {
      if (!this.familiar || !this.hasCombo(53)) { yield 0.1; continue; }
      const n = Math.max(1, Math.floor(this.num * 15 * 0.25));
      let rot = Math.random() * 180;
      const step = 360 / n;
      this.units[0].shotT = 0;
      const o0 = this.pos(0);
      W.fx.burst(o0.x, o0.y, 1.85 * 64 * PX, 0xffe2a8, this.pSpeed <= 0.65 ? 0.33 : 0.63, 'ring');
      yield 0.06;
      const o = this.pos(0);
      for (let k = 0; k < n; k++) {
        rot += step;
        this.novaRay(o.x, o.y, (-rot * Math.PI) / 180); // Unity: угол против часовой, экран y вниз
      }
      yield 0.15;
      yield Math.max(0.05, this.rhythm[1]);
    }
  }

  /** Снаряд 107: скорость BulletSpeed·Random(0.01, 0.025) за тик, масштаб Size·0.3 + 0.6, 34 тика, с 30-го — без коллайдера и гаснет */
  private novaRay(x: number, y: number, ang: number) {
    const sc = this.bSize * 0.3 + 0.6;
    const v = (this.mSpeed * (0.01 + Math.random() * 0.015) / TICK) * U;
    this.bullets.fire({
      x, y, ang, tex: OT.shot, scaleX: sc, tint: 0xffe2a8, sp: v, life: 34 * TICK, dmg: this.shotDmg, pierce: 999,
      hl: 0.2 * sc * U, hw: 0.005 * sc * U, cx: 0.4 * sc * U, smokeDt: TICK, smokeTint: 0xffe2a8, src: this.def.id,
      step: (b) => {
        const i = Math.floor(b.t / TICK);
        if (i >= 30) { b.hl = 0; b.img.setAlpha(Math.max(0, 3.3 - 0.1 * i)); return; }
        const [cx, cy] = NOVA_COL[Math.min(i, 6)];
        b.hl = (cx / 2) * sc * U; b.hw = (cy / 2) * sc * U;
      },
    });
  }

  // ———————— снаряды ————————
  private fire(i: number, tx: number, ty: number) {
    const o = this.pos(i);
    this.units[i].shotT = 0;
    if (this.blade && this.hasCombo(2)) { this.swordsAt(tx, ty); return; }
    if (this.blade) { this.bladeAt(o, tx, ty); return; }
    const ang = aimAngle(o.x, o.y, tx, ty, 10);
    const S = this.bSize, cs = Math.cos(ang), sn = Math.sin(ang);
    if (this.missile && this.hasCombo(43)) { this.spear(o.x, o.y, Math.atan2(ty - o.y, tx - o.x)); return; }
    if (this.missile) {
      // кейс 31: ×1.35, старт +0.66 ед., 17 тиков, alpha 4 − 0.235·i, шаг BulletSpeed·0.02 (12 ед/с)
      this.bullets.fire({
        x: o.x + cs * 0.66 * U, y: o.y + sn * 0.66 * U, ang, tex: OT.shot, scaleX: S * 1.35, sp: (this.mSpeed * 0.02 / TICK) * U,
        life: 17 * TICK, dmg: this.shotDmg, pierce: 999, hl: 0.25 * S * 1.35 * U, hw: 0.06 * S * 1.35 * U, smokeDt: TICK, src: this.def.id,
        alpha: (b) => 4 - 0.235 * Math.floor(b.t / TICK + 1),
      });
      return;
    }
    // кейс 19: старт +0.33 ед., первый шаг −0.36 ед.; шаг 18·0.0234 ед. за тик (14 ед/с); 12 тиков, гаснет в последние 2
    this.bullets.fire({
      x: o.x - cs * 0.03 * U, y: o.y - sn * 0.03 * U, ang, tex: OT.shot, scaleX: S, sp: (this.mSpeed * 0.0234 / TICK) * U,
      life: 12 * TICK, dmg: this.shotDmg, pierce: 999, hl: 0.25 * S * U, hw: 0.06 * S * U, smokeDt: TICK, src: this.def.id,
      alpha: (b) => 3 - 0.2 * Math.floor(b.t / TICK + 1),
    });
  }

  /** кейс 43: Incinerate10, старт +0.45 − 0.36 ед., 12 ед/с, 10 кадров по 0.09 с; цвет (1, 1 − 0.08i, 1 − 0.22i, 3 − 0.3i) */
  private familiarShot(x: number, y: number, ang: number) {
    const S = this.bSize, f = 0.09 * U, cs = Math.cos(ang), sn = Math.sin(ang);
    const sz = 1;
    this.bullets.fire({
      x: x + cs * f, y: y + sn * f, ang, tex: OT.shot, scaleX: S * sz, sp: (this.mSpeed * 0.02 / TICK) * U,
      life: 10 * 0.09, dmg: this.shotDmg, pierce: 999, hl: 0.25 * S * sz * U, hw: 0.06 * S * sz * U, smokeDt: 0.09, smokeTint: 0xffe2a8, src: this.def.id,
      step: (b) => {
        const i = Math.min(10, Math.floor(b.t / 0.09) + 1);
        const g = Math.max(0, 1 - 0.08 * i), bl = Math.max(0, 1 - 0.22 * i);
        b.img.setTint(Phaser.Display.Color.GetColor(255, (g * 255) | 0, (bl * 255) | 0)).setAlpha(Math.min(1, 3 - 0.3 * i));
      },
    });
  }

  /**
   * Кейс 56 «Магический клинок»: взмах на месте В ТОЧКЕ ЦЕЛИ (Bullet_Create кейс 56 ставит позицию в (EGx, EGy)),
   * повёрнут от духа к цели; масштаб 1.5·Size + 0.15; 8 кадров, коллайдер × 0.12 ед. (центр/длина по кадрам);
   * пауза кадров 2–6 = BulletSpeed = 0.035 с.
   */
  private bladeAt(o: { x: number; y: number }, tx: number, ty: number) {
    const ang = Math.atan2(ty - o.y, tx - o.x), sc = 1.5 * this.bSize + 0.15;
    const mult = 1;
    const fr = [0.03, 0.035, 0.035, 0.035, 0.035, 0.035, 0.03, 0.03];
    const cen = [-0.76, 0, 0, 0.3, 0.55, 0.72, 0.93], len = [0.5, 2.05, 2.05, 1.5, 1.0, 0.7, 0.3];
    const ends = fr.map((_, i) => fr.slice(0, i + 1).reduce((a, b) => a + b, 0));
    const fire = (x: number, y: number, a: number) => this.bullets.fire({
      x, y, ang: a, tex: OT.blade, scaleX: sc, tint: 0xbff8ee, life: ends[7], dmg: this.shotDmg * mult, pierce: 999,
      hw: 0.06 * sc * U, src: this.def.id,
      step: (b: OBullet) => {
        const f = ends.findIndex((e) => b.t < e);
        if (f < 0 || f >= 7) { b.hl = 0; } else { b.hl = (len[f] / 2) * sc * U; b.cx = cen[f] * sc * U; }
        b.img.setScale(PX * sc * (f <= 0 ? 0.3 : 1), PX * sc).setAlpha(f >= 6 ? 0.5 : 1);
      },
    });
    fire(tx, ty, ang);
  }

  /**
   * Снаряд 22 «Парящие мечи»: в точке цели (как клинок 56), масштаб (Size+0.5, Size+0.2); взмах = 5 шагов по 0.03 с
   * (коллайдер × 0.12 по кадрам, 5-й — OFF), затем прыжок (cos a·Random(1,1.5), sin a·Random(1,1.5)) ед. и случайный поворот;
   * всего ⌊(1−КД)·6.65+1⌋ взмахов; список поражённых чистится один раз — каждый враг получает урон от снаряда 1 раз.
   * Урон: мод слияния ×3 → итог ×⌊(1−КД)·6.65+3⌋ (код умножает на это число; при КД ≥ 0.85 с это и есть ×3 текста).
   */
  private swordsAt(tx: number, ty: number) {
    const S = this.bSize, sx = S + 0.5, sy = S + 0.2, n = this.swordSwings, sw = 5 * TICK;
    const dmg = this.shotDmg * (this.swordMul / 3);
    this.bullets.fire({
      x: tx, y: ty, ang: Math.random() * Math.PI * 2, tex: OT.blade, scaleX: sx, scaleY: sy, tint: 0xbff8ee, life: n * sw, dmg, pierce: 999,
      hw: 0.06 * sy * U, src: this.def.id, data: { k: 0 },
      step: (b: OBullet) => {
        const k = Math.floor(b.t / sw);
        if (k > b.data.k) {
          b.data.k = k;
          const a = Math.random() * Math.PI * 2;
          b.x += Math.cos(a) * (1 + Math.random() * 0.5) * U;
          b.y += Math.sin(a) * (1 + Math.random() * 0.5) * U;
          b.ang = Math.random() * Math.PI * 2;
        }
        const f = Math.floor((b.t - k * sw) / TICK);
        if (f < 4) { b.hl = (SWORD_L[f] / 2) * sx * U; b.cx = SWORD_C[f] * sx * U; } else b.hl = 0;
        b.img.setScale(PX * sx * (f === 0 ? 0.3 : 1), PX * sy).setAlpha(f >= 4 ? 0.5 : 1);
      },
    });
  }

  /**
   * Снаряд 99 «Магическое копьё»: центр на 4.6 ед. впереди духа, масштаб (1.35, Size·0.5 + 0.3); 10 кадров (пауза 0.042, кадр 3 — 0.03),
   * каждый кадр > 1 сдвигает копьё вперёд на 0.132 ед. (кадр 3 — 0.15432); коллайдер кадров 1–7 по таблице, 8–10 — OFF.
   */
  private spear(x: number, y: number, ang: number) {
    const sx = 1.35, sy = this.bSize * 0.5 + 0.3, cs = Math.cos(ang), sn = Math.sin(ang);
    const x0 = x + cs * 4.6 * U, y0 = y + sn * 4.6 * U;
    this.bullets.fire({
      x: x0, y: y0, ang, tex: OT.arrow, scaleX: (sx * 848) / 176, scaleY: (sy * 400 * 0.35) / 57, tint: 0xffffff,
      life: SPEAR_END[9], dmg: this.shotDmg, pierce: 999, hw: 0.7 * sy * U, src: this.def.id,
      step: (b: OBullet) => {
        let f = SPEAR_END.findIndex((e) => b.t < e);
        if (f < 0) f = 9;
        let shift = 0;
        for (let k = 1; k <= f; k++) shift += k === 2 ? 0.15432 : 0.132;
        b.x = x0 + cs * shift * U; b.y = y0 + sn * shift * U;
        if (f < 7) { b.hl = (SPEAR_L[f] / 2) * sx * U; b.cx = SPEAR_C[f] * sx * U; } else b.hl = 0;
        b.img.setTint(SPEAR_TINT[f]).setAlpha(f >= 7 ? 1 - (f - 6) * 0.25 : 1);
      },
    });
  }
}

export const SPIRIT = defFromData(SPELL_BY_ID[3], (def) => new Spirit(def, SPELL_BY_ID[3]));
