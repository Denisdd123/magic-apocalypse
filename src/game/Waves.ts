import {
  HP_BONUS_BY_GROUP, LATE_BLOCKS, PHASE_C, PHASE_LAST_WAVE, WAVE_BONUS, WAVE_HP, WAVE_SPAWN, WAVE_TIMES_25, WAVE_TIMES_30, ZONE,
} from '../data/orig';
import { W } from './World';

/**
 * Время забега и рост мобов — порт `C_Battle_Manager.EnemyLevelUp` (MoveNext @0x10d11b0) и волн-зачисток
 * (`C_Battle_AllyUnit.Play_Unit_Death` @0x10c56e8, `Play_EnenmyClearActive`, `Play_BossWave_Enforce`).
 * Библия: balance.md §4, spawn.md §1–§2. Поля названы как в оригинале (`Z_Database.EnemyUnitVar_*`).
 *
 * Партия 3: таймлайн зоны 1 (сундуки, проклятая руна, эпики, боссы, элитки, торговец — spawn.md §2), боссы с двойным
 * вызовом и закрытием зачистки по `ApplyBossNum`, победа (`Game_ClearON`), бесконечный круг после 30:02.
 */

/** Отметки EnemyLevelNum зоны 1 (так же зоны 2–11 и 15) — spawn.md §2 «Раскладка по времени, зона 1» (прогон absint) */
interface Ev { chest?: -5 | -6; rune?: 1; merchant?: 1; epic?: [id: number, num: number, firstDelay?: number]; boss?: [id: number, num: number]; elite?: [num: number, con: number, up: number] }
const EV1: Readonly<Record<number, Ev>> = {
  60: { chest: -5 }, 120: { rune: 1 }, 240: { rune: 1 }, 300: { merchant: 1 },
  390: { chest: -5, epic: [41, 2] }, 420: { rune: 1 }, 480: { epic: [41, 3] }, 570: { epic: [41, 2] }, 600: { rune: 1 },
  660: { merchant: 1, epic: [41, 3] }, 720: { boss: [41, 3] }, 750: { epic: [41, 3] }, 780: { chest: -6, rune: 1 },
  840: { epic: [46, 5] }, 900: { boss: [42, 3] }, 902: { elite: [20, 3, 3], epic: [41, 3, 5] }, 960: { epic: [41, 3] },
  1020: { merchant: 1, epic: [46, 5] }, 1080: { boss: [43, 2] }, 1082: { epic: [41, 3, 5] }, 1140: { chest: -6, epic: [41, 3] },
  1200: { epic: [46, 5] }, 1262: { epic: [41, 3] }, 1320: { epic: [41, 3] }, 1380: { merchant: 1, epic: [46, 5] },
  1440: { boss: [41, 3] }, 1442: { epic: [41, 3] }, 1500: { chest: -6, epic: [41, 3] }, 1560: { epic: [46, 5] },
  1620: { boss: [42, 3] }, 1622: { epic: [41, 3] }, 1680: { epic: [41, 3] }, 1740: { merchant: 1, epic: [46, 5] },
  1800: { boss: [43, 2] }, 1802: { elite: [20, 2, 4], epic: [41, 3, 6] },
};
/** Бесконечный круг после 30:02 (elu.asm @0x10dcae4): эпик состояния 1…5 */
const LOOP_EPIC: Readonly<Record<number, [number, number]>> = { 1: [46, 4], 2: [41, 3], 3: [46, 4], 4: [41, 4], 5: [46, 6] };

/** Волны-зачистки зон 1–11 (spawn.md §2, таблица «Раскладка по времени, зона 1»): индекс волны → убийств */
const CLEAR_WAVES: Readonly<Record<number, number>> = { 6: 1000, 13: 2000, 20: 3000, 27: 3000, 34: 3000, 41: 3000, 48: 3000, 55: 3000, 62: 3000, 69: 5000 };

/** EnemyCreateDelay_Min (C_Battle_Manager.Start, spawn.md §1) */
const DELAY_MIN = 0.05;

export class Waves {
  zone = 1;
  /** EnemyLevelNum — секунды забега по счёту корутины (стоит во время зачистки) */
  levelNum = 0;
  /** первый проход EnemyLevelUp — через 1 с: EnemyLevelNum = целые секунды забега (иначе на 12:00 Game_SurvivalTime < 720 и победы нет) */
  private tickT = 1;
  private running = true;

  // Z_Database.EnemyUnitVar_* (проценты)
  hpU = 0; atkU = 0; spdU = 0; sizeU = 0; hitD = 0;
  /** EnemyUnitVar_HpMaxRatio_Bonus по группе волны (0.2…1.0); _Special всегда 1 */
  hpBonus = 1;

  /** List_ApplyUnitEnemyDistribution[0] — ID моба текущей волны (Dictionary_UnitStat) */
  enemyId = 1;
  waveId = 1;
  createNum = 2;
  /** EnemyCreateDelay; до первой волны 0.75 с — C_Battle_Manager.Start (0x3f400000), совпадает с замером */
  createDelay = 0.75;
  /** ApplyEnemyCreateDelay = clamp(EnemyCreateDelay × (X + 100)%, 0.03, 10) */
  applyCreateDelay = 0.75;
  /** растёт при смене волны — Enemies перезапускает цикл Create_UnitEnemy */
  waveSerial = 0;

  // волна-зачистка
  clearOn = false;
  clearCond = 0;
  clearKills = 0;
  /** обычные мобы перестали идти (полоска заполнена) */
  spawnStopped = false;
  /** BossWave_EnforceVar = убито / нужно (0…1) */
  enforce = 0;
  /** C_Battle_Manager +0x1f8: зум камеры зачистки, 0…15 % */
  camZoom = 0;
  private clearPhase: 'none' | 'fill' | 'circle' = 'none';

  // элитки по таймеру (Create_UnitEnemySpecial): SuperEnemyCreateNum / _Con / UPCreateNum — до 15:02 нули
  superNum = 0; superCon = 0; superUp = 0;
  /** C_Battle_Manager.AreaChangeNum — смены карты (обелиски зон 12–14); в зоне 1 всегда 0 */
  areaChangeNum = 0;
  /** Z_Database.Game_BattleLoopON — бесконечный режим после победы */
  loopOn = false;
  /** ApplyBossNum — сколько боссов надо убить, чтобы закрыть зачистку */
  bossNum = 0;
  /** OnlyBossON: полоска заполнена, но боссы живы — обычные мобы не идут */
  onlyBoss = false;
  private victory = false;
  /** Game_ClearON на 12:00 (зоны 1–2) — окно победы после круга */
  onVictory: (() => void) | null = null;
  // поля отметки (сбрасываются каждый тик)
  private epicSet: [number, number, number] | null = null;
  private bossSet: [number, number] | null = null;
  private epicFirstDelay = 0;
  private circleT = 0;
  onClearCircle: ((step: number) => void) | null = null;

  constructor(zone = 1) {
    this.zone = zone;
    const z = ZONE[zone];
    // старт забега (IsEnemyStatON): шаги сложности Game_BattleLevel
    for (let k = 0; k < z.battleLevel; k++) {
      this.hpU += 1;
      if (k % 3 === 0) this.atkU += 1;
      if (k % 5 === 0) this.spdU = Math.min(360, this.spdU + 1);
    }
    if (zone === 6) this.hpU += 500;
    if (zone === 13) this.hitD += 10;
    if (zone === 14) { this.hitD += 10; this.hpU += 1000; }
    this.enemyId = z.enemies[0];
    this.applyTail(false);
  }

  get times() { return this.zone === 13 || this.zone === 14 ? WAVE_TIMES_25 : WAVE_TIMES_30; }

  /** StatRatio0k зоны для волны i (balance.md §4 «Фазы») */
  ratio(i: number): [number, number, number, number] {
    const base = ZONE[this.zone].coef;
    let k = PHASE_LAST_WAVE.findIndex((last) => i <= last);
    if (k < 0) k = PHASE_LAST_WAVE.length - 1;
    if (k === 0) return [base[0], base[1], base[2], base[3]];
    const c = PHASE_C[k];
    return [(base[0] - 1) * c + 1, (base[1] - 1) * c + 1, (base[2] - 1) * c + 1, 1];
  }

  /** Множитель скорости BossWave_SpeedRatio и размера BossWave_SizeRatio (%) — 15 × EnforceVar */
  get bossSpeed() { return this.clearOn ? 15 * this.enforce : 0; }
  get bossSize() { return this.clearOn ? 15 * this.enforce : 0; }
  /** BossWave_HitDamageRatio = 1 − 0.1 × EnforceVar */
  get bossHit() { return this.clearOn ? 1 - 0.1 * this.enforce : 1; }

  update(dt: number) {
    // зум камеры: Play_BossWaveEffect +0.5 / 0.03 с до 15, Play_BossWaveEffect_End −0.75 / 0.03 с
    const target = this.clearOn && this.clearPhase === 'fill' ? 15 : 0;
    if (this.camZoom < target) this.camZoom = Math.min(target, this.camZoom + (0.5 / 0.03) * dt);
    else if (this.camZoom > target) this.camZoom = Math.max(target, this.camZoom - (0.75 / 0.03) * dt);

    if (this.clearPhase === 'circle') { this.updateCircle(dt); return; }
    if (!this.running) return;
    this.tickT -= dt;
    if (this.tickT <= 0) { this.tickT += 1; this.tick(); }
  }

  /** Один проход корутины EnemyLevelUp: EnemyLevelNum += 1, блок волны, хвост */
  private tick() {
    const n = ++this.levelNum;
    const T = this.times;
    let changed = false;
    this.epicSet = null; this.bossSet = null;
    for (let i = 1; i < T.length; i++) if (T[i] === n) { this.waveBlock(i); changed = true; }
    if (this.zone <= 11 || this.zone === 15) this.timeline(n);
    if (n >= 1802 && !changed && this.loopBlock(n)) changed = true;
    // блоки «после списка» (бесконечный хвост)
    for (const b of LATE_BLOCKS) {
      if ((b.zone === 0 || b.zone === this.zone) && n >= b.from && n % 25 === 0) { this.hpU += b.hp; this.atkU += b.atk; }
    }
    this.applyTail(changed);
    // хвост: эпики (Create_UnitEnemyEpic) и боссы — первый вызов всегда, второй — если идёт зачистка (spawn.md §6)
    const ep = this.epicSet as [number, number, number] | null, bs = this.bossSet as [number, number] | null;
    if (ep) W.zone.queueEpic(ep[0], ep[1], ep[2]);
    if (bs) {
      let [id, num] = bs;
      if (id === 43 && Math.random() < 0.5) { id = 45; num = Math.round(num * 2.5); }   // Random(1,3) == 1
      if (id === 42 && Math.random() < 1 / 3) { id = 46; num = Math.round(num * 2); }   // Random(1,4) == 1
      this.bossNum = W.zone.spawnBosses(id, num);
      if (this.clearOn) this.bossNum = W.zone.spawnBosses(id, num);
    }
    if (this.clearOn) this.running = false; // корутина кончилась — таймер стоит до конца зачистки
  }

  /** События отметки зоны 1 (сундук, руна, торговец, эпик, босс, элитки) */
  private timeline(n: number) {
    const ev = EV1[n];
    if (!ev) return;
    if (ev.chest) W.pickups.chestAt(ev.chest);
    if (ev.rune) W.pickups.curse();
    if (ev.merchant) W.zone.merchant();
    if (ev.epic) { if (ev.epic[2] !== undefined) this.epicFirstDelay = ev.epic[2]; this.epicSet = [ev.epic[0], ev.epic[1], this.epicFirstDelay]; }
    if (ev.boss) this.bossSet = [ev.boss[0], ev.boss[1]];
    if (ev.elite) [this.superNum, this.superCon, this.superUp] = ev.elite;
  }

  /** После 30:02: круг из 7 состояний по 25 с (spawn.md §2 «После 30:02»). true — волна сменилась */
  private loopBlock(n: number): boolean {
    const z = ZONE[this.zone], ac = this.areaChangeNum;
    const R = this.ratio(76);
    let changed = false;
    if (this.waveId === 7) {
      this.waveId = 1; this.createNum = 150; this.createDelay = DELAY_MIN * 20;
      this.enemyId = z.enemies[1];
      this.hpU += R[0] * WAVE_HP[70]; this.atkU += R[2] * 10;
      this.superNum = 20; this.superCon = 2;
      this.superUp = ac >= 30 ? 15 : ac >= 25 ? 10 : ac >= 20 ? 8 : ac >= 15 ? 6 : 4;
      if (ac % 5 === 0) this.sizeU = Math.min(30, Math.max(0, this.sizeU + 5));
      this.epicFirstDelay = 6; this.epicSet = [41, 3, 6];
      changed = true;
    }
    if (n % 25 === 0 && this.waveId >= 1 && this.waveId <= 6) {
      const k = this.waveId;
      this.waveId = k + 1; this.createNum = 150;
      this.enemyId = z.enemies[k + 1];
      this.hpU += R[0] * WAVE_HP[70 + k];
      const ep = LOOP_EPIC[k];
      if (ep) this.epicSet = [ep[0], ep[1], this.epicFirstDelay];
      if (k === 2 && (ac === 10 || ac === 12)) W.pickups.chestAt(-6);
      if (k === 4 && ac % 2 === 1) W.zone.merchant();
      if (k === 6) {
        this.spdU += ac >= 19 ? 30 : R[1] * 12;
        if (this.hitD < 98) this.hitD = Math.min(this.hitD + 7, 98);
        else this.hitD += Math.min(100, Math.max(0, (100 - this.hitD) * 0.15));
        // хвост круга (@0x10dea94): зачистка 3000; боссы по AreaChangeNum % 5 (прочие зоны: 2 → 41×4, 3 → 42×4, 4 → 43×3)
        this.startClear(3000);
        const kk = ac % 5;
        const boss: [number, number] | null = kk === 2 ? [41, 4] : kk === 3 ? [42, 4] : kk === 4 ? [43, 3] : null;
        const [a, b] = ac >= 30 ? [1.5, 3] : ac >= 25 ? [1.4, 2.25] : ac >= 20 ? [1.3, 1.75] : ac >= 15 ? [1.2, 1.5] : [1.1, 1.25];
        if (this.epicSet) this.epicSet[1] = Math.round(Math.min(12, a * this.epicSet[1]));
        if (boss) this.bossSet = [boss[0], Math.round(Math.min(12, b * boss[1]))];
      }
      changed = true;
    }
    return changed;
  }

  private startClear(cond: number) {
    this.clearOn = true; this.clearPhase = 'fill';
    this.clearCond = Math.min(10000, Math.max(1000, cond)); this.clearKills = 0; this.enforce = 0;
    this.spawnStopped = false; this.onlyBoss = false;
  }

  private waveBlock(i: number) {
    const R = this.ratio(i);
    this.hpU += R[0] * WAVE_HP[i];
    const b = WAVE_BONUS[i];
    if (b) {
      if (i === 76) { this.spdU += R[1] * b[0]; if (this.hitD < 98) this.hitD = Math.min(this.hitD + 7, 98); }
      else { this.spdU += R[1] * b[0]; this.atkU += R[2] * b[1]; this.hitD += b[2]; }
    }
    if (i === 61 || i === 67) this.sizeU = Math.min(30, Math.max(0, this.sizeU + 5));
    const [wid, num, m] = WAVE_SPAWN[i];
    if (wid >= 1 && wid <= 7) {
      const id = ZONE[this.zone].enemies[wid];
      this.enemyId = id;
      this.waveId = wid;
    }
    this.createNum = num;
    this.createDelay = m === null ? Math.min(100, Math.max(DELAY_MIN, R[3] * 0.3)) : DELAY_MIN * m;
    // волны-зачистки (зоны 1–11 и 15; у 12–14 своё расписание боссов — партия 3)
    const cond = this.zone <= 11 ? CLEAR_WAVES[i] : undefined;
    if (cond) this.startClear(cond);
  }

  /** Хвост тика (spawn.md §2 «Хвост тика»): группа HP, ограничения, задержка */
  private applyTail(changed: boolean) {
    const g = HP_BONUS_BY_GROUP[this.waveId as 1];
    if (g !== undefined && g !== null) this.hpBonus = g;
    if (this.createNum < 1) { this.createNum = 150; this.createDelay = DELAY_MIN * 20; }
    this.createNum = Math.min(300, Math.max(0, this.createNum));
    // AllyUnitVar_EnemyCreateDelayRatio (эффект 133)
    const X = W.stats?.createDelayRatio ?? 0;
    this.applyCreateDelay = Math.min(10, Math.max(0.03, this.createDelay * (X + 100) * 0.01));
    if (changed) this.waveSerial++;
  }

  /** Смерть моба (Play_Unit_Death) — счёт зачистки */
  onKill() {
    if (!this.clearOn || this.clearPhase !== 'fill') return;
    this.clearKills++;
    const fill = (this.clearCond - this.clearKills) / this.clearCond;
    this.enforce = Math.min(1, 1 - fill);
    this.checkClear();
  }

  /** Смерть босса (UnitCreateID 9): ApplyBossNum −= 1, затем та же проверка */
  onBossDeath() {
    this.bossNum = Math.max(0, this.bossNum - 1);
    if (this.clearOn && this.clearPhase === 'fill') this.checkClear();
  }

  private checkClear() {
    if (this.clearKills < this.clearCond) return;
    // остались боссы — OnlyBossON, обычные мобы и элитки перестают идти (Create_UnitEnemy_Stop)
    if (this.bossNum > 0) { this.onlyBoss = true; this.spawnStopped = true; return; }
    this.onlyBoss = false;
    // Game_ClearON: победа зоны 1–2 на 12:00, 3–6 на 15:00, 7+ на 18:00; в бесконечном режиме — дальше
    if (!this.loopOn) {
      const need = this.zone < 3 ? 720 : this.zone < 7 ? 900 : 1080;
      if (W.time + 0.05 >= need) { this.victory = true; W.time = need + 1; }
    }
    this.spawnStopped = true;
    this.clearPhase = 'circle'; this.circleT = 0;
  }

  /** Доля оставшейся полоски зачистки (Obj_MonsterClearBar), null — зачистки нет */
  get clearFrac(): number | null { return this.clearOn ? Math.max(0, (this.clearCond - this.clearKills) / this.clearCond) : null; }

  /** Круг Obj_EnemyClearGround_Destroy: масштаб 0 → … → 5 шагами по 0.04 с, затем 0.2 с (+0.7 с в зонах ≤ 11) */
  private static CIRCLE = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1, 1.25, 1.8, 5];
  private updateCircle(dt: number) {
    const prev = this.circleT;
    this.circleT += dt;
    const C = Waves.CIRCLE;
    const s0 = Math.floor(prev / 0.04), s1 = Math.floor(this.circleT / 0.04);
    for (let s = s0 + 1; s <= Math.min(s1, C.length - 1); s++) this.onClearCircle?.(C[s]);
    const end = (C.length - 1) * 0.04 + 0.2 + (this.zone <= 11 ? 0.7 : 0);
    if (this.circleT >= end) {
      // Create_UnitEnemy_StartLoop: Play_Time, EnemyLevelUp заново; Game_SurvivalTime += 1
      this.clearOn = false; this.clearPhase = 'none'; this.spawnStopped = false;
      this.clearKills = 0; this.enforce = 0;
      this.running = true; this.tickT = 0;
      W.time += 1;
      this.waveSerial++;
      if (this.victory) { this.victory = false; this.onVictory?.(); }
    }
  }

  /** Таймер (Play_Time) стоит во время зачистки */
  get timeFrozen() { return this.clearOn; }
}
