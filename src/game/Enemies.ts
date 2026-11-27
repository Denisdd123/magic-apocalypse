import Phaser from 'phaser';
import { DEPTH, LOOT, MAX_ENEMIES, ORIG_U } from '../config';
import { MANA_BALL_KILLS, UNIT_STAT, type UnitStat } from '../data/orig';
import { Grid } from './Grid';
import { RUNE_BY_ID } from './Pickups';
import { ensureMobTextures, mobDeath, mobFrames, mobTex, mobTexScale, mobVisible, ucolor } from './mobLook';
import { W } from './World';

/**
 * Мобы 3.0 — по коду оригинала (`C_Battle_EnemyUnit.Start_Unit`, `Unit_Move`, `Unit_Attack`, `Unit_HitEffect`;
 * спавн — `C_Battle_Manager.Create_UnitEnemy`). Библия: balance.md §1–§2, spawn.md §1, visual.md §2, §3.2, §7.
 * Числа роста (Z_Database.EnemyUnitVar_*) ведёт Waves.ts (EnemyLevelUp).
 */

export interface EnemyType {
  /** 'boss' — босс, 'big' — Трупер (24), иначе 'u<ID>' (старые проверки 2.2 смотрят на 'boss'/'big') */
  id: string;
  /** ID строки Dictionary_UnitStat */
  uid: number;
  stat: UnitStat;
  /** префикс кадров текстуры (кадры `<tex>_0…`) */
  tex: string;
  hp: number;
  /** особая способность 1: бьёт мага при касании и гибнет без награды */
  kami: boolean;
}

/** 1 единица мира оригинала в наших единицах (≈56.8; см. config.ORIG_U) */
export const ORIG_UNIT = ORIG_U;
const U = ORIG_U;

/** Шаг и пауза ходьбы (Start_Unit @0x1098cfc): v — целое после Math.Round */
export function moveStep(v: number): [step: number, delay: number] {
  const step = Math.min(0.18, Math.max(1e-7, v * 0.00135 + 0.018));
  return [step, Math.max(0.033, 0.095 - 0.225 * step)];
}
/** Скорость моба в наших ед./с при множителях 1 (для заклинаний и отладки) */
export function origSpeed(v: number): number { const [s, d] = moveStep(v); return (s / d) * U; }

function unitType(uid: number): EnemyType {
  const stat = UNIT_STAT[uid];
  const boss = uid >= 41 && uid <= 46;
  return { id: boss ? 'boss' : uid === 24 ? 'big' : 'u' + uid, uid, stat, tex: mobTex(uid, 0).replace(/_0$/, ''), hp: stat.hp, kami: stat.abilities.includes(1) && !boss };
}
const TYPES = new Map<number, EnemyType>();
export function typeOf(uid: number): EnemyType {
  let t = TYPES.get(uid);
  if (!t) { t = unitType(uid); TYPES.set(uid, t); }
  return t;
}
/** Старые ключи 2.2 (руна-проклятие, галерея) → мобы оригинала */
export const ENEMY_TYPES: Record<string, EnemyType> = {
  basic: typeOf(7), red: typeOf(8), small: typeOf(1), white: typeOf(33), big: typeOf(24),
  w1: typeOf(1), w6: typeOf(6), w11: typeOf(11), w13: typeOf(13), w16: typeOf(16), w31: typeOf(31), w21: typeOf(21), w22: typeOf(22),
  boss0: typeOf(41), boss1: typeOf(42), boss2: typeOf(43), boss3: typeOf(44),
};

export class Enemy {
  x = 0; y = 0; r = 10; alive = false;
  hp = 1; maxHp = 1; dmg = 5; xp = 1;
  /** ед./с (для заклинаний, которые читают скорость) */
  speed = 30;
  /** шаг (наши px) и пауза ходьбы (с), таймер шага */
  stepLen = 0; stepDelay = 0.08; stepT = 0;
  /** UnitApply_HitDamageRatio — множитель получаемого урона */
  hitRatio = 1;
  /** откат удара по магу (Unit_AttackDelay 0.15 с) */
  atkT = 0;
  kx = 0; ky = 0;          // отбрасывание
  stunT = 0; flashT = 0;
  flashCrit = false;
  freezeT = 0; slowT = 0; slowK = 0;
  frame = 0; frames = 3;
  /** масштаб юнита UnitApply_UnitSize */
  unitSize = 1;
  elite = false;
  /** 0 обычный, 1 элитка (красная), 2 элитка UP (фиолетовая), 3 эпик (tag "100"), 4 босс (tag "109") */
  cat = 0;
  /** призван во время проклятой руны (Transition_EnemyMax ≥ 1): исчезает через 180 с */
  trans = false;
  transT = 0;
  /** полоска HP эпика/босса (Obj_MonsterHpBar под мобом) */
  bar?: Phaser.GameObjects.Image;
  barF?: Phaser.GameObjects.Image;
  pooled = false;
  mass = 1;
  type!: EnemyType;
  img!: Phaser.GameObjects.Image;
  /** вспышка попадания (SpriteHitFlash: FlashAmount 0.6) — белый силуэт поверх */
  fl!: Phaser.GameObjects.Image;
  ring?: Phaser.GameObjects.Image;
  id = 0;
}

let nextId = 1;

/** Пул обычных мобов (Create_UnitEnemy): AllEnemyNum 450, создавать при свободных > 30, шаг растёт при < 201 */
const POOL = { all: 450, keepFree: 30, slowFree: 201, slowAdd: 120 };
/** Удаление отставших: |dx| ≥ 12.25 или |dy| ≥ 13.4 ед. (C_DestroyArea_A); ±35 ед. — все (C_DestroyArea_B) */
const AREA = { killX: 12.25 * U, killY: 13.4 * U, killFar: 35 * U };
/** Таблица 0x6538a7: множитель дистанции m и пауза после моба */
function spawnRule(id: number, i: number): [m: number, pause: number] {
  const R = (a: number, b: number) => a + Math.random() * (b - a);
  switch (id) {
    case 17: return [R(0.6, 1), i % 3 === 0 ? 0.03 : 0];
    case 18: return [R(0.7, 1), i % 3 === 0 ? 0.03 : 0];
    case 19: return [R(0.8, 1), i % 3 === 0 ? 0.03 : 0];
    case 24: return [R(0.9, 1.2), i % 2 === 0 ? 0.03 : 0];
    case 29: case 33: return [R(0.7, 1.2), 0.08];
    case 31: return [R(0.8, 1), i % 3 === 0 ? 0.03 : 0];
    case 34: return [R(0.6, 1), i % 3 === 0 ? 0.03 : 0];
    case 35: case 36: case 37: case 38: case 39: return [R(1, 1.2), 0];
    default: return [1, 0];
  }
}

/** Камикадзе: кольцо смерти (DeathMotion 21) — вид пока 2.2 */
const KAMI = { ring: 1.81 * 0.75 * U, life: 0.18, tint: 0x8a1a1a };
/** SpriteHitFlash: FlashAmount 0.6, HitwaitTime 0.125 с; крит — (1, 0, 0) */
const FLASH = { amount: 0.6, t: 0.125, hit: 0xffffff, crit: 0xff0000, freeze: 0x5b86b0 };
/** Пул элиток (List_BattleUnitEnemySpecial): 80 объектов */
const POOL_SPECIAL = 80;
/** UnitApply_HpMax_Bonus боссов/эпиков по UnitID (Start_Unit, switch по ID @0x1096df4…; 41 — 300000 при AreaChangeNum < 1) */
const BOSS_HP_BONUS: Record<number, number> = { 41: 3000000, 42: 5000000, 43: 12000000, 44: 3000000, 45: 3000000, 46: 3000000 };
/** Контур элиток: LineColor красной #f20d1f, UP #8c40f2 */
const ELITE_LINE = [0, 0xf20d1f, 0x8c40f2];
/** Полоска HP эпика/босса: Front (1, .118, .078), Back (.118, 0, 0), y −2.7 ед. */
const BAR = { w: 1.12 * U, h: 0.1 * U, y: 2.7 * U, front: 0xff1e14, back: 0x1e0000 };

/** ApplyManaBallDropKillCondition по часам EnemyLevelUp (MANA_BALL_KILLS: [с отметки, убийств]) */
function orbKillsNeed() {
  const t = W.waves.levelNum;
  let n: number = MANA_BALL_KILLS[0][1];
  for (const [from, k] of MANA_BALL_KILLS) if (t >= from) n = k;
  return n;
}
/** Unit_AttackDelay (@0x11c7328): 0.15 с */
const ATTACK_DELAY = 0.15;

export class Enemies {
  list: Enemy[] = [];
  private free: Enemy[] = [];
  grid = new Grid<Enemy>();
  aliveCount = 0;
  /** занято объектов пула обычных мобов */
  poolUsed = 0;
  private orbKills = 0;
  private nb: Enemy[] = [];
  // корутина Create_UnitEnemy
  private csWait = 0.55 + 0.5;      // ApplyEnemyStatDelay + 0.5
  private csI = -1;
  private csSerial = -1;
  // корутина Create_UnitEnemySpecial: 5 с, счётчик SuperEnemyCreateDelay_Num
  private spWait = 5; private spNum = 0; private spLeft = 0; private spI = 0; private spGap = 0;
  // корутина Play_Create_UnitEnemy_Transition
  private trLeft = 0; private trI = 0; private trUp = 0; private trWait = 0; private trTypes: number[] = [];
  /** занято объектов пула элиток */
  specialUsed = 0;

  constructor(private scene: Phaser.Scene) {
    if (!scene.textures.exists('kami_ring')) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false), c = 64, R0 = 54;
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * Math.PI * 2 + Math.sin(i * 7.3) * 0.05, len = 0.06 + 0.07 * Math.abs(Math.sin(i * 3.1));
        g.lineStyle(3 + 3 * Math.abs(Math.sin(i * 1.7)), 0xffffff, 1);
        g.beginPath(); g.arc(c, c, R0 - 4 * Math.abs(Math.sin(i * 2.3)), a, a + len); g.strokePath();
      }
      g.generateTexture('kami_ring', 128, 128); g.destroy();
    }
  }

  /** HP моба при спавне (balance.md §2) */
  hpOf(stat: UnitStat): number {
    const Wv = W.waves, s = W.stats;
    return Math.round(stat.hp * Wv.hpBonus * 1 * ((Wv.hpU * 1 + 100) * 0.01) * 1 * (1 - s.enemyHpRed));
  }

  /** cat: 0 обычный, 1 / true элитка, 2 элитка UP, 3 эпик, 4 босс */
  spawn(type: EnemyType, x: number, y: number, catIn: number | boolean = 0, fixedHp = 0) {
    const cat = catIn === true ? 1 : catIn === false ? 0 : catIn;
    const elite = cat === 1 || cat === 2, boss = cat >= 3;
    const regular = cat === 0;
    if (regular && (this.poolUsed >= POOL.all || this.aliveCount >= MAX_ENEMIES)) return null;
    if (elite && this.specialUsed >= POOL_SPECIAL) return null;
    let e = this.free.pop();
    if (!e) {
      e = new Enemy();
      e.img = this.scene.add.image(0, 0, '__DEFAULT').setDepth(DEPTH.enemy);
      e.fl = this.scene.add.image(0, 0, '__DEFAULT').setDepth(DEPTH.enemy).setVisible(false);
      this.list.push(e);
    }
    e.id = nextId++;
    e.type = type; e.x = x; e.y = y; e.alive = true;
    e.elite = elite; e.cat = cat; e.pooled = regular;
    e.trans = false; e.transT = 0;
    if (regular) this.poolUsed++;
    if (elite) this.specialUsed++;
    const st = type.stat, s = W.stats, Wv = W.waves;
    // элитки (Start_Unit, tag "99", spawn.md §3): красная — скорость базы ×0.85, рост ×0.65, размер ×1.25;
    // UP — ×0.7, ×0.65, ×1.5; с эффектом 30: красная размер ×1.05, UP скорость ×0.95, рост ×0.95, размер ×1.1
    const has30 = st.abilities.includes(30);
    let baseMs = st.moveSpeed, kSpd = 1, kSize = 1, kSizeU = 1;
    if (cat === 1) { if (has30) kSize = 1.05; else { baseMs *= 0.85; kSpd = 0.65; kSize = 1.25; } }
    if (cat === 2) { if (has30) { baseMs *= 0.95; kSpd = 0.95; kSize = 1.1; } else { baseMs *= 0.7; kSpd = 0.65; kSize = 1.5; } }
    if (elite) kSizeU = 0.5;                      // ApplyUnitSizeRatioU × 0.5
    const bossId = BOSS_HP_BONUS[type.uid] !== undefined;
    if (bossId) kSizeU = 0.25;                    // боссы/эпики 41–46: ApplyUnitSizeRatioU × 0.25
    // HP (balance.md §2): база элитки (2·HP + 1500 | 4000) × ApplyEliteMonsterHpRatio, + HpMax_Bonus
    let baseHp = st.hp, bonus = 0;
    if (cat === 1) { baseHp = (2 * st.hp + 1500) * s.eliteHpRatio; bonus = 10000; }   // +10000 при AreaChangeNum ≥ 0 (дальше — смены карты)
    if (cat === 2) { baseHp = (2 * st.hp + 4000) * s.eliteHpRatio; bonus = 1000000; }
    if (bossId) bonus = type.uid === 41 && Wv.areaChangeNum < 1 ? 300000 : BOSS_HP_BONUS[type.uid];
    e.maxHp = e.hp = fixedHp ? fixedHp * (1 - s.enemyHpRed)
      : Math.round(baseHp * Wv.hpBonus * ((Wv.hpU + 100) * 0.01) * (1 - s.enemyHpRed)) + bonus;
    e.dmg = Math.round(st.attack * (Wv.atkU + 100) * 0.01);
    e.hitRatio = Wv.bossHit * Math.max(0, (100 - Wv.hitD) * 0.01);
    // шаговая ходьба
    const v = Math.round(baseMs * (Wv.spdU * kSpd + 100 + Wv.bossSpeed) * 0.01 * (1 - s.enemySlow));
    const [step, delay] = moveStep(v);
    e.stepLen = step * U; e.stepDelay = delay; e.stepT = Math.random() * delay;
    e.speed = (step / delay) * U;
    // размер: Math.Round(유닛크기 × (100 + SizeU + BossWave_Size)%) × 0.01
    const S = Math.round(st.size * kSize * (100 + Wv.sizeU * kSizeU + Wv.bossSize) * 0.01) * 0.01;
    e.unitSize = S;
    // хитбокс: BoxCollider 0.44×0.55 ед. (элитки 1.66, боссы/эпики 41–46 — 3×3) на объекте с масштабом S
    e.r = (bossId ? 1.5 : elite ? 0.83 : 0.25) * S * U;
    e.mass = boss ? 50 : elite ? 4 : 1;
    e.xp = st.mana;
    e.kx = e.ky = 0; e.flashT = 0; e.freezeT = 0; e.slowT = 0; e.slowK = 0; e.atkT = 0;
    e.stunT = 0;
    // вид: кадры по мерке оригинала × UColor (тинт умножением, как SpriteRenderer.color)
    ensureMobTextures(this.scene, type.uid);
    e.frames = mobFrames(type.uid); e.frame = (Math.random() * e.frames) | 0;
    const sc = (ORIG_U / 100) * S / mobTexScale(type.uid);
    e.img.setTexture(mobTex(type.uid, e.frame)).setVisible(true).setPosition(x, y).setAlpha(1).setRotation(0).setFlipX(false)
      .setScale(sc).setTint(ucolor(type.uid, Wv.zone));
    e.fl.setTexture(mobTex(type.uid, e.frame)).setScale(sc).setVisible(false);
    if (elite) {
      if (!e.ring) e.ring = this.scene.add.image(0, 0, 'elite_ring').setDepth(DEPTH.enemy);
      const d = mobVisible(type.uid) * (ORIG_U / 100) * S * 1.15;   // по видимому телу: холст оригинала шире
      e.ring.setVisible(true).setDisplaySize(d, d).setTint(ELITE_LINE[cat]);
      // идёт событие проклятой руны — любая созданная элитка помечается и исчезнет через 180 с (Play_Time_TransitionUnit)
      if (W.pickups && W.pickups.transMax >= 1) { e.trans = true; e.transT = 180; }
    } else if (e.ring) e.ring.setVisible(false);
    if (boss) {
      if (!e.bar) {
        e.bar = this.scene.add.image(0, 0, '__WHITE').setDepth(DEPTH.enemy + 0.1).setOrigin(0, 0.5);
        e.barF = this.scene.add.image(0, 0, '__WHITE').setDepth(DEPTH.enemy + 0.2).setOrigin(0, 0.5);
      }
      e.bar.setVisible(true).setTint(BAR.back).setDisplaySize(BAR.w, BAR.h * 1.6);
      e.barF!.setVisible(true).setTint(BAR.front).setDisplaySize(BAR.w, BAR.h);
    } else if (e.bar) { e.bar.setVisible(false); e.barF!.setVisible(false); }
    this.aliveCount++;
    return e;
  }

  /** Create_UnitEnemySpecial: раз в 5 с счётчик; на _Con — SuperEnemyCreateNum элиток (первые UP — фиолетовые), пауза 0.15 с */
  private updateSpecial(dt: number) {
    const Wv = W.waves;
    if (this.spLeft > 0) {
      this.spGap -= dt;
      while (this.spGap <= 0 && this.spLeft > 0) {
        if (POOL_SPECIAL - this.specialUsed < 6) { this.spLeft = 0; break; }
        const up = Wv.superUp > this.spI, a = Math.random() * Math.PI * 2, P = W.player;
        const x = P.x + Math.cos(a) * (up ? 6 + Math.random() * 6 : 4 + Math.random() * 8) * U;
        const y = P.y + Math.sin(a) * (up ? 7 + Math.random() * 7 : 5 + Math.random() * 9) * U;
        this.spawn(this.waveType(), x, y, up ? 2 : 1);
        this.spI++; this.spLeft--; this.spGap += 0.15;
      }
      return;
    }
    if (Wv.superCon <= 0 || Wv.spawnStopped) return;
    this.spWait -= dt;
    if (this.spWait > 0) return;
    this.spWait += 5;
    if (++this.spNum >= Wv.superCon) { this.spNum = 0; this.spLeft = Wv.superNum; this.spI = 0; this.spGap = 0; }
  }

  /** Play_Create_UnitEnemy_Transition: N элиток кольцом R(3|6, 9) × R(5|7, 11) ед., первые UP — фиолетовые; 0.3 с, затем 0.09 с */
  queueTransition(n: number, up: number) {
    const ids = new Set<number>([W.waves.enemyId]);
    ids.delete(1); ids.delete(31);
    this.trTypes = ids.size ? [...ids] : [11];
    this.trLeft = n; this.trI = 0; this.trUp = up; this.trWait = 0.3;
  }
  private updateTransition(dt: number) {
    if (this.trLeft <= 0) return;
    this.trWait -= dt;
    while (this.trWait <= 0 && this.trLeft > 0) {
      const i = this.trI++;
      this.trLeft--;
      if (POOL_SPECIAL - this.specialUsed < 4) continue;   // нет места в пуле — моб пропускается
      let id = this.trTypes[(Math.random() * this.trTypes.length) | 0];
      if (id === 0) id = 35 + ((Math.random() * 4) | 0);
      const up = this.trUp > i, a = Math.random() * Math.PI * 2, P = W.player;
      const x = P.x + Math.cos(a) * (up ? 6 + Math.random() * 3 : 3 + Math.random() * 6) * U;
      const y = P.y + Math.sin(a) * (up ? 7 + Math.random() * 4 : 5 + Math.random() * 6) * U;
      this.spawn(typeOf(id), x, y, up ? 2 : 1);
      this.trWait += 0.09;
    }
  }

  /** Точка спавна: эллипс вокруг мага (Create_UnitEnemy) */
  private spawnPoint(m = 1) {
    const a = Math.random() * Math.PI * 2;
    const P = W.player;
    this.sp.x = P.x + Math.cos(a) * (6.5 + Math.random() * 5) * m * U;
    this.sp.y = P.y + Math.sin(a) * (7.5 + Math.random() * 5) * m * U;
    return this.sp;
  }
  private sp = { x: 0, y: 0 };

  /** Тип текущей волны (List_ApplyUnitEnemyDistribution) */
  waveType(): EnemyType {
    let id = W.waves.enemyId;
    if (id === 0) id = 35 + ((Math.random() * 4) | 0);
    return typeOf(id);
  }

  /** Корутина Create_UnitEnemy (spawn.md §1, псевдокод) */
  updateSpawner(dt: number) {
    const Wv = W.waves;
    if (Wv.waveSerial !== this.csSerial) {
      // смена волны / конец зачистки — перезапуск корутины: ждёт ApplyEnemyStatDelay (0 после старта) + 0.5 с
      if (this.csSerial >= 0) { this.csWait = 0.5; this.csI = -1; }
      this.csSerial = Wv.waveSerial;
    }
    this.updateTransition(dt);
    if (Wv.spawnStopped) return;
    this.updateSpecial(dt);
    this.csWait -= dt;
    let guard = 0;
    while (this.csWait <= 0 && guard++ < 1000) {
      if (this.csI < 0) this.csI = 0;
      const num = Wv.createNum;
      let paused = false;
      while (this.csI < num) {
        const pc = POOL.all - this.poolUsed;
        let d = pc >= POOL.slowFree ? POOL.all / (pc > 0 ? Math.min(POOL.all, pc) : 1)
          : (POOL.all + POOL.slowAdd) / (pc - POOL.keepFree >= 1 ? Math.min(POOL.all, pc - POOL.keepFree) : 1);
        d = Math.min(num, Math.max(1, d));
        const i = this.csI;
        this.csI += d;
        if (pc > POOL.keepFree) {
          const type = this.waveType();
          const [m, pause] = spawnRule(type.uid, i);
          const p = this.spawnPoint(m);
          this.spawn(type, p.x, p.y);
          if (pause > 0) { this.csWait += pause; paused = true; break; }
        }
      }
      if (paused) continue;
      this.csI = -1;
      this.csWait += Wv.applyCreateDelay;
    }
  }

  /** Тихо убрать (Unit_Destroy_Simple): без опыта, сферы, счётчика */
  /** Unit_Destroy: убрать врага без маны и без счёта убийств (Щит) */
  remove(e: Enemy) { if (e.alive) this.despawn(e); }

  private despawn(e: Enemy) {
    e.alive = false;
    this.release(e);
  }

  /** Вернуть объект в пул и спрятать картинки */
  private release(e: Enemy) {
    if (e.pooled) { e.pooled = false; this.poolUsed--; }
    if (e.elite) this.specialUsed--;
    e.img.setVisible(false); e.fl.setVisible(false);
    if (e.ring) e.ring.setVisible(false);
    if (e.bar) { e.bar.setVisible(false); e.barF!.setVisible(false); }
    this.free.push(e);
    this.aliveCount--;
  }

  update(dt: number) {
    const P = W.player;
    const g = this.grid;
    g.clear();
    for (const e of this.list) if (e.alive) g.insert(e);
    const nb = this.nb;
    const bodyR = P.bodyR;

    for (const e of this.list) {
      if (!e.alive) continue;
      let dx = P.x - e.x, dy = P.y - e.y;
      const adx = dx < 0 ? -dx : dx, ady = dy < 0 ? -dy : dy;
      const boss = e.cat >= 3;
      // призванные проклятой руной: 180 с — Transition_EnemyMax = 0, сундука нет, моб исчезает
      if (e.trans && (e.transT -= dt) <= 0) {
        W.pickups.transMax = 0; W.pickups.transNum = 0;
        W.fx.burst(e.x, e.y, 40, 0xb8343f, 0.4);
        this.despawn(e); continue;
      }

      if (e.cat === 0 ? (adx >= AREA.killX || ady >= AREA.killY) : (adx >= AREA.killFar || ady >= AREA.killFar)) {
        // C_DestroyArea_B (±35 ед.) удаляет всех; эпиков и боссов переносим к магу, чтобы не сломать счёт ApplyBossNum
        if (boss) { const p = this.spawnPoint(); e.x = p.x; e.y = p.y; }
        // элитки проклятой руны (UnitCreateID 3) не удаляются (Unit_Destroy_Simple_All их пропускает) — иначе сундук не выпадет
        else if (!e.trans) { this.despawn(e); continue; }
        dx = P.x - e.x; dy = P.y - e.y;
      }
      const d = Math.sqrt(dx * dx + dy * dy) || 1;

      // Unit_Move: шаг → кадр → пауза
      if (e.freezeT > 0) { e.freezeT -= dt; if (e.freezeT <= 0 && e.flashT <= 0) e.fl.setVisible(false); }
      else if (e.stunT > 0) e.stunT -= dt;
      else {
        if (e.slowT > 0) e.slowT -= dt;
        e.stepT -= dt;
        if (e.stepT <= 0) {
          e.stepT += e.stepDelay;
          if (e.stepT < 0) e.stepT = 0;
          const sp = e.stepLen * (e.slowT > 0 ? 1 - e.slowK : 1);
          e.x += (dx / d) * sp; e.y += (dy / d) * sp;
          e.frame = (e.frame + 1) % e.frames;
          const tex = mobTex(e.type.uid, e.frame);
          e.img.setTexture(tex); e.fl.setTexture(tex);
        }
      }
      if (e.kx || e.ky) {
        e.x += e.kx * dt; e.y += e.ky * dt;
        e.kx *= 0.86; e.ky *= 0.86;
        if (Math.abs(e.kx) + Math.abs(e.ky) < 2) e.kx = e.ky = 0;
      }
      // расталкивание (Rigidbody mass 1, drag 1000)
      const n = this.grid.near(e.x, e.y, e.r, nb, 8);
      for (let i = 0; i < n; i++) {
        const o = nb[i];
        if (o === e) continue;
        let ox = e.x - o.x, oy = e.y - o.y;
        let od2 = ox * ox + oy * oy;
        if (od2 < 0.0001) { ox = Math.cos(e.id); oy = Math.sin(e.id); od2 = 1; }
        const od = Math.sqrt(od2), over = (e.r + o.r - od) * 0.5;
        if (over <= 0) continue;
        const k = over / od, we = o.mass / (e.mass + o.mass), wo = 1 - we;
        e.x += ox * k * we; e.y += oy * k * we;
        o.x -= ox * k * wo; o.y -= oy * k * wo;
      }

      // касание мага: OnCollisionStay → Unit_Attack (раз в 0.15 с у каждого моба)
      if (e.atkT > 0) e.atkT -= dt;
      dx = P.x - e.x; dy = P.y - e.y;
      const rr = e.r + bodyR, d2 = dx * dx + dy * dy;
      if (!P.ghost && d2 < rr * rr) {
        const pd = Math.sqrt(d2) || 0.01, over = rr - pd;
        const wp = boss ? 1 : e.elite ? 0.8 : 0.5;
        const nx = dx / pd, ny = dy / pd;
        P.pushX += nx * over * wp; P.pushY += ny * over * wp;
        e.x -= nx * over * (1 - wp); e.y -= ny * over * (1 - wp);
        if (e.atkT <= 0) {
          e.atkT = ATTACK_DELAY;
          P.hitBy = e; // Щит: кто коснулся (Unit_AttackShield)
          P.hurt(e.dmg);
          P.hitBy = null;
          if (!e.alive) continue; // щит уничтожил врага
          if (e.type.kami && !e.elite) {
            W.fx.burst(e.x, e.y, KAMI.ring * 0.5 * e.unitSize, KAMI.tint, KAMI.life, 'kami_ring');
            this.despawn(e);
            continue;
          }
        }
      }

      if (e.flashT > 0) { e.flashT -= dt; if (e.flashT <= 0) this.baseFlash(e); }
      e.img.setPosition(e.x, e.y);
      if (e.fl.visible) e.fl.setPosition(e.x, e.y);
      if (e.ring) e.ring.setPosition(e.x, e.y);
      if (e.bar) {
        const bx = e.x - BAR.w / 2, by = e.y + BAR.y;
        e.bar.setPosition(bx, by);
        e.barF!.setPosition(bx, by).setDisplaySize(BAR.w * Math.max(0, e.hp / e.maxHp), BAR.h);
      }
    }
  }

  /** Нанести урон врагу. Возвращает true, если враг погиб. */
  damage(e: Enemy, amount: number, kx = 0, ky = 0, src = ''): boolean {
    if (!e.alive) return false;
    const s = W.stats, A = W.artifacts;
    // крит: Random.Range(1, 101) ≤ CriRan (C_Battle_EnemyUnit.Unit_Damage @0x109a40c)
    const crit = Math.round(s.crit * 100) >= 1 + Math.floor(Math.random() * 100);
    if (A.hitFx) amount = A.onDamage(e, amount, crit, src);
    else if (crit) amount *= s.critMult;
    if (s.highHpBonus && e.hp > e.maxHp * 0.75) amount *= 1 + s.highHpBonus;
    amount *= e.hitRatio;
    if (src) W.dmgBy.set(src, (W.dmgBy.get(src) ?? 0) + Math.min(amount, e.hp));
    e.hp -= amount;
    // Unit_HitEffect / _Cri: заливка FlashColor с FlashAmount 0.6 на 0.125 с
    if (crit || !e.flashCrit || e.flashT <= 0) {
      e.flashCrit = crit;
      e.flashT = FLASH.t;
      e.fl.setVisible(true).setPosition(e.x, e.y).setTintFill(crit ? FLASH.crit : FLASH.hit).setAlpha(FLASH.amount);
    }
    if (kx || ky) { const k = e.type.id === 'boss' ? 0 : e.elite || e.type.id === 'big' ? 0.25 : 1; e.kx += kx * k; e.ky += ky * k; }
    if (e.hp <= 0) { this.kill(e); return true; }
    return false;
  }

  kill(e: Enemy) {
    if (!e.alive) return;
    e.alive = false;
    this.release(e);
    W.kills++;
    W.waves.onKill();
    W.pickups.onKill();
    // мана = «마나량» моба (UNIT_STAT, у элиток и боссов тоже) × бонусы, потолок 0.0035 × ManaCost (Play_Unit_Death)
    W.player.killMana(e.xp);
    if (W.artifacts.killFx) W.artifacts.onKill(e);
    if (e.cat >= 3) { W.zone.bossDied(e); return; }
    // DUnit-анимация смерти (Unit_DeathMotion), цвет DeathColor
    mobDeath(W.fx, e.type.uid, e.x, e.y, e.unitSize, e.type.stat.size, W.waves.zone);
    if (e.elite) {
      // Play_Unit_Death, tag "99": счёт проклятой руны, затем Random(1, 400): ≤270 средняя, ≤395 большая, 396–399 руны 31–34
      W.pickups.eliteKilled(e.x, e.y);
      const r = 1 + ((Math.random() * 399) | 0);
      if (r >= 396) W.pickups.rune(RUNE_BY_ID[31 + r - 396], e.x, e.y);
      else W.orbs.drop(e.x, e.y, r <= 270 ? 'm' : 'l');
      return;
    }
    // сфера маны за каждые N убийств: BaseManaBallDropKillCondition 12 → 20/22/24/26/28 по EnemyLevelNum (spawn.md §2)
    // «Завод маны» (эффект 142 −20): порог = round(база × (100 − 20) × 0.01) (StartInformation_B @0x11c68d8)
    if (++this.orbKills >= Math.round(orbKillsNeed() * Math.max(0, 1 - W.stats.orbRate))) {
      this.orbKills = 0;
      W.orbs.drop(e.x, e.y, Math.random() < LOOT.smallOrbChance ? 's' : 'm');
    }
  }

  /** Поле Obj_EnemyCrossGround_Destroy (руна очищения): прямоугольник ±hw × ±hh вокруг мага */
  clearBox(hw: number, hh: number) { this.clearCircle(hw, hh); }

  /** Круг зачистки (C_DestroyEnemy_Damage → Unit_Destroy_Damage): гибнут все, кроме иммунных (эффект 11 у боссов) */
  clearCircle(halfW: number, halfH: number) {
    const P = W.player;
    for (const e of this.list) {
      if (!e.alive || e.type.stat.abilities.includes(11)) continue;
      if (Math.abs(e.x - P.x) <= halfW + e.r && Math.abs(e.y - P.y) <= halfH + e.r) this.kill(e);
    }
  }

  freeze(e: Enemy, sec: number) {
    if (!e.alive || e.elite || e.type.id === 'boss') return;
    e.freezeT = Math.max(e.freezeT, sec);
    if (e.flashT <= 0) this.baseFlash(e);
  }

  /** Без вспышки: оверлей скрыт; заморозка — синяя подсветка (вид — партия 5) */
  private baseFlash(e: Enemy) {
    if (e.freezeT > 0) e.fl.setVisible(true).setPosition(e.x, e.y).setTintFill(FLASH.freeze).setAlpha(FLASH.amount);
    else e.fl.setVisible(false);
  }
  stun(e: Enemy, sec: number) { if (e.alive && e.type.id !== 'boss') e.stunT = Math.max(e.stunT, sec); }
  slow(e: Enemy, k: number, sec: number) { if (!e.alive) return; e.slowK = Math.max(e.slowT > 0 ? e.slowK : 0, k); e.slowT = Math.max(e.slowT, sec); }

  visible(pad = 0): Enemy[] {
    const v = this.scene.cameras.main.worldView, out: Enemy[] = [];
    for (const e of this.list) if (e.alive && e.x > v.x - pad && e.x < v.right + pad && e.y > v.y - pad && e.y < v.bottom + pad) out.push(e);
    return out;
  }

  nearestN(x: number, y: number, n: number, maxR = 9999): Enemy[] {
    const c: [number, Enemy][] = [];
    const r2 = maxR * maxR;
    for (const e of this.list) { if (!e.alive) continue; const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d <= r2) c.push([d, e]); }
    c.sort((a, b) => a[0] - b[0]);
    return c.slice(0, n).map((p) => p[1]);
  }

  nearest(x: number, y: number, maxR = 9999, skip?: Set<Enemy>): Enemy | null {
    let best: Enemy | null = null, bd = maxR * maxR;
    for (const e of this.list) {
      if (!e.alive || (skip && skip.has(e))) continue;
      const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  randomVisible(): Enemy | null {
    const v = this.scene.cameras.main.worldView;
    const cand: Enemy[] = [];
    for (const e of this.list) if (e.alive && v.contains(e.x, e.y)) cand.push(e);
    return cand.length ? cand[(Math.random() * cand.length) | 0] : null;
  }
}
