import Phaser from 'phaser';
import { DEPTH, LOOT, MAX_ENEMIES, ORIG_U } from '../config';
import { Grid } from './Grid';
import { W } from './World';

export interface EnemyType {
  id: string; tex: string; r: number; size: number;
  /** speed — «이동속도» оригинала (Dictionary_UnitStat, напр. 34); в ед/с переводит origSpeed() */
  hp: number; speed: number; dmg: number; xp: number;
  /** xp — опыт сразу за убийство («마나량» моба в оригинале); drop не используется */
  drop: number;
  /** «유닛크기» оригинала, % (масштаб объекта моба) */
  pct: number;
  /** особая способность 1 оригинала: при касании мага бьёт его и сам погибает (без награды) — «взрыв» */
  kami: boolean;
}

/** 1 единица мира оригинала в наших единицах (≈56.8; см. config.ORIG_U) */
export const ORIG_UNIT = ORIG_U;
const U = ORIG_U;

/**
 * Скорость моба как в оригинале (C_Battle_EnemyUnit.Start_Unit + корутина Unit_Move):
 * S = round(«이동속도» × множители роста); моб шагает на step = S·0.00135 + 0.018 ед. (≤ 0.18)
 * раз в delay = 0.095 − 0.225·step с (≥ 0.033) → скорость step/delay ед/с.
 * Пример: S 34 (Рой малый) → 0.79 ед/с ≈ 45 наших; маг 2.56 ед/с — в 3.2 раза быстрее.
 */
export function origSpeed(S: number): number {
  const st = Math.min(0.18, Math.max(1e-7, S * 0.00135 + 0.018));
  const delay = Math.min(1, Math.max(0.033, 0.095 - 0.225 * st));
  return (st / delay) * U;
}

/**
 * Типы мобов. РАЗМЕРЫ — из кода/ассетов оригинала: спрайты 100 px на 1 ед., объект моба масштабируется на
 * «유닛크기»/100 → видимый размер = px спрайта /100 × %/100 ед. ХИТБОКС — BoxCollider 0.44×0.55 ед. на том же
 * масштабированном объекте (r ≈ 0.25 ед. × %/100); у элиток/боссов BoxCollider 1.66 (r ≈ 0.83 ед. × %/100).
 * Поле tex не трогать (картинки наши). HP ×0.14, урон ×0.55 к оригиналу (наш баланс урона).
 */
function mob(id: string, tex: string, px: number, pct: number, speed: number, hp: number, dmg: number, xp: number, drop: number, kami: boolean, boss = false): EnemyType {
  return { id, tex, px, pct, size: (px / 100) * (pct / 100) * U * (boss ? 0.6 : 1), /* у спрайтов боссов оригинала много пустых полей, наши текстуры заполняют квадрат */ r: (boss ? 0.83 : 0.25) * (pct / 100) * U, speed, hp, dmg, xp, drop, kami } as EnemyType;
}
export const ENEMY_TYPES: Record<string, EnemyType> = {
  // старые типы (сундук-проклятие, свита, мини-волна) — по ближайшему мобу оригинала
  basic: mob('basic', 'en_minion',  75, 105, 32, 14, 6, 3, 0.12, true),   // Миньон (7)
  red:   mob('red',   'en_stinger', 100, 125, 29, 42, 9, 4, 0.35, true),  // Стингер (8)
  small: mob('small', 'en_swarm_s', 46, 125, 34, 8, 5, 3, 0.12, false),   // Рой малый (1)
  white: mob('white', 'en_seraph',  230, 120, 18, 95, 12, 5, 0.4, false), // Серафим (33)
  big:   mob('big',   'en_assault', 237, 85, 30, 650, 18, 10, 1, true),   // Штурмовик/Трупер (24)
  // мобы волн зоны 1 (Dictionary_UnitStat): px спрайта, «유닛크기», «이동속도», особая способность 1
  w1:  mob('w1',  'en_swarm_s',     46, 125, 34, 14, 6, 3, 0.12, false), // Рой малый
  w6:  mob('w6',  'en_swarm_m',     86, 100, 32, 28, 8, 4, 0.15, false), // Рой средний
  w11: mob('w11', 'en_swarm_l',     108, 90, 32, 42, 11, 5, 0.2, false), // Рой большой
  w13: mob('w13', 'en_interceptor', 125, 75, 32, 42, 22, 5, 0.2, true),  // Перехватчик
  w16: mob('w16', 'en_hive',        145, 80, 28, 70, 11, 6, 0.25, false), // Улей
  w31: mob('w31', 'en_scarab',      99, 85, 29, 21, 16, 5, 0.15, true),   // Скарабей
  w21: mob('w21', 'en_mine',        185, 55, 30, 56, 27, 8, 0.3, true),   // Мина
  w22: mob('w22', 'en_oculus',      206, 50, 30, 56, 27, 8, 0.3, true),   // Вой (Howling)
  // боссы зоны (HP задаётся в Zone.ts); спрайт босса 512 px на холсте (видимо ~511)
  boss0: mob('boss', 'en_citadel',     511, 105, 14, 1, 22, 0, 0, false, true), // Цитадель (41)
  boss1: mob('boss', 'en_nemesis',     511, 110, 9, 1, 28, 0, 0, false, true),  // Немезида (42)
  boss2: mob('boss', 'en_apostle',     511, 115, 9, 1, 34, 0, 0, false, true),  // Апостол (43)
  boss3: mob('boss', 'en_apostle_red', 511, 120, 9, 1, 40, 0, 0, false, true),  // финал (размер Амадея 44 — оценка)
};

export class Enemy {
  x = 0; y = 0; r = 10; alive = false;
  hp = 1; maxHp = 1; speed = 30; dmg = 5; xp = 1;
  kx = 0; ky = 0;          // отбрасывание
  stunT = 0; flashT = 0;
  /** текущая вспышка — от крита (красная), её не перебивает обычная */
  flashCrit = false;
  /** заморозка (стоит, синий), замедление: доля скорости slowK на slowT с */
  freezeT = 0; slowT = 0; slowK = 0;
  /** кадр «дрожащей линии» (старые 3-кадровые текстуры); -1 — картинка 2.0, дрожание покачиванием */
  frame = 0;
  /** базовый масштаб картинки (для покачивания) */
  sc = 1;
  elite = false;
  cursed = false;
  /** занимает место в пуле обычных мобов (POOL) */
  pooled = false;
  /** «масса» для расталкивания: обычный 1, элитка 4, босс 50 */
  mass = 1;
  type!: EnemyType;
  img!: Phaser.GameObjects.Image;
  ring?: Phaser.GameObjects.Image;
  id = 0;
}

let nextId = 1;

/**
 * Спавн как в оригинале (замер из памяти Magic Survival, зона 1, research/source_findings.md):
 * волна = один тип моба на 30 с, по кругу; каждые delay с создаётся num мобов (ограничение — пул, см. POOL).
 * Рост статов мобов — проценты к базе по стадии зоны (сколько боссов убито) и времени.
 */
export const ORIG = {
  /** типы волн до первого босса (0:00, 0:30, 1:00 …), затем цикл после каждого босса */
  firstCycle: ['w1', 'w6', 'w11', 'w13', 'w16', 'w31'],
  cycle: ['w6', 'w11', 'w13', 'w16', 'w31', 'w21'],
  bossWave: ['w21', 'w22', 'w22', 'w22'],
  /** [время с, мобов за раз, интервал с] — до первого босса; 0:30 — оценка (не замерено) */
  rate0: [[0, 2, 0.75], [30, 3, 0.5], [60, 3, 0.3], [90, 10, 0.75], [150, 15, 0.75]] as [number, number, number][],
  rateBoss: [[30, 0.75], [80, 1], [120, 1], [120, 1]] as [number, number][],
  /** после боссов: [время с, мобов, интервал] */
  rateAfter: [[180, 40, 0.75], [300, 60, 1], [330, 70, 1], [360, 80, 1], [540, 120, 1]] as [number, number, number][],
  /** HP %: во время босса k, после босса k — база + шаг за каждые 30 с (стадия 3 — оценка) */
  hpBoss: [27.6, 398.5, 2112, 6000],
  hpAfter: [[43.88, 16.28], [473.9, 75.4], [2400, 350], [6000, 0]] as [number, number][],
  spdBoss: [60, 95, 130, 165],
  spdAfter: [80, 115, 150, 185],
  atkBoss: [80, 150, 220, 290],
  atkAfter: [90, 160, 230, 300],
};

/**
 * Пул обычных мобов как в оригинале (C_Battle_Manager.Create_UnitEnemy, корутина):
 * всего AllEnemyNum = 450 объектов (List_BattleUnitEnemy_Empty — свободные). За тик (раз в ApplyEnemyCreateDelay)
 * счётчик c идёт от 0 до EnemyCreateNum; моб создаётся, только если свободных > 30; шаг счётчика
 *   свободных ≥ 201: 1 (создаются все num);
 *   свободных < 201: (450 + 120) / clamp(свободных − 30, 1, 450) — чем меньше свободных, тем реже (≥1 моб за тик).
 * Живых обычных максимум 420, при > 249 живых поток резко редеет — на замере держалось ~150–310.
 * Первый тик — через ApplyEnemyStatDelay + 0.5 с.
 */
const POOL = { all: 450, keepFree: 30, slowFree: 201, slowAdd: 120 };

/**
 * Удаление/спавн как в оригинале (сцена: объект мага → DestroyArea, C_Battle_Manager.Create_UnitEnemy):
 * обычный моб тихо удаляется (без опыта/сферы/счётчика), когда |dx| ≥ 12.25 ед. или |dy| ≥ 13.4 ед. от мага
 * (прямоугольник, стены C_DestroyArea_A); элитки — на ±33 ед. (C_DestroyArea_B). Новые — на эллипсе вокруг мага:
 * x = cos a · U(6.5, 11.5) · m, y = sin a · U(7.5, 12.5) · m, m = U(1, 1.2) — в том числе впереди бегущего мага.
 */
const AREA = { killX: 12.25 * U, killY: 13.4 * U, killFar: 33 * U };

/**
 * «Взрыв» моба-камикадзе (особая способность 1: C_Battle_EnemyUnit.Unit_Attack → AllyUnit.Unit_Damage(атака моба)
 * → Unit_Destroy; в Play_Unit_Death при IsDestroy нет ни опыта, ни сферы, ни счётчика убийств).
 * Анимация смерти — DeathMotion 21 (кольцо из осколков 1.81 ед. × «제거 모션 크기» 70–85%, 4 кадра 0.06/0.05/0.04/0.03 с),
 * у оригинала окрашена цветом моба; у нас — тёмно-красное штриховое кольцо. Урона по площади нет — бьёт только касание.
 */
const KAMI = { ring: 1.81 * 0.75 * U, life: 0.18, tint: 0x8a1a1a };

/**
 * Элитки (Create_UnitEnemySpecial: усиленная версия моба текущей волны, крупный коллайдер 1.66 ед.).
 * Точные задержки в оригинале задаются в EnemyLevelUp и не сняты — время/число ОЦЕНОЧНО по видео
 * (первые элитки ~2:00 группой, research/screens/13_boss/overview_02.jpg). HP-множитель Special в коде = 1.0,
 * т.е. элитка не «стена HP» — берём ×4 к мобу волны (оценка).
 */
/** Вспышки урона и подсветка заморозки (setTintFill по почти чёрному телу; цвета приглушены) */
const FLASH = { hit: 0xb8b4ac, hitT: 0.035, crit: 0xc0392b, critT: 0.07, alpha: 0.8, freeze: 0x5b86b0, freezeAlpha: 0.85 };

export const ELITE = { first: 120, every: 60, group: 3, hp: 4, scale: 1.5, r: 28 };

const step = (t: number, from: number) => Math.max(0, Math.floor((t - from) / 30));

export class Enemies {
  list: Enemy[] = [];
  private free: Enemy[] = [];
  grid = new Grid<Enemy>();
  aliveCount = 0;
  /** занято объектов пула обычных мобов (не элитки, не боссы) — как 450 − свободных в оригинале */
  poolUsed = 0;
  private spawnAcc = 0.5;
  /** счётчик убийств до следующей сферы маны */
  private orbKills = 0;
  private nextElite = ELITE.first;
  /** переиспользуемый буфер соседей для расталкивания (без аллокаций в цикле) */
  private nb: Enemy[] = [];

  constructor(private scene: Phaser.Scene) {
    // текстура «взрыва» камикадзе: кольцо из рваных штрихов (как кадры DeathMotion 21 оригинала)
    if (!scene.textures.exists('kami_ring')) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false), c = 64, R0 = 54;
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * Math.PI * 2 + Math.sin(i * 7.3) * 0.05, len = 0.06 + 0.07 * Math.abs(Math.sin(i * 3.1));
        g.lineStyle(3 + 3 * Math.abs(Math.sin(i * 1.7)), 0xffffff, 1);
        g.beginPath(); g.arc(c, c, R0 - 4 * Math.abs(Math.sin(i * 2.3)), a, a + len); g.strokePath();
      }
      for (let i = 0; i < 14; i++) { // осколки внутри кольца
        const a = i * 2.39, d = R0 * (0.55 + 0.3 * Math.abs(Math.sin(i * 5.1)));
        g.fillStyle(0xffffff, 1); g.fillCircle(c + Math.cos(a) * d, c + Math.sin(a) * d, 2 + (i % 3));
      }
      g.generateTexture('kami_ring', 128, 128); g.destroy();
    }
  }

  /** Проценты роста статов мобов (как Z_Database.EnemyUnitVar_*RatioU в оригинале) */
  growth(): { hp: number; spd: number; atk: number } {
    const t = W.time, z = W.zone, st = z.stage, bossAt = 180 * st;
    if (z.bossFight) { const k = Math.min(st, 3); return { hp: ORIG.hpBoss[k], spd: ORIG.spdBoss[k], atk: ORIG.atkBoss[k] }; }
    if (st === 0) {
      const w = step(t, 0);
      return { hp: 0, spd: Math.min(10 * w, 60), atk: w <= 4 ? 10 * w : 60 };
    }
    const k = Math.min(st, 4) - 1, n = step(t, bossAt);
    const [h0, hs] = ORIG.hpAfter[k];
    return { hp: h0 + hs * n, spd: ORIG.spdAfter[k] + n, atk: ORIG.atkAfter[k] + 10 * n };
  }
  hpMul() { return 1 + this.growth().hp / 100; }

  spawn(type: EnemyType, x: number, y: number, elite = false, fixedHp = 0, wave = false) {
    const boss = type.id === 'boss';
    const regular = !elite && !boss;
    if (regular && (this.poolUsed >= POOL.all || this.aliveCount >= MAX_ENEMIES)) return null;
    let e = this.free.pop();
    if (!e) {
      e = new Enemy();
      e.img = this.scene.add.image(0, 0, '__DEFAULT').setDepth(DEPTH.enemy);
      this.list.push(e);
    }
    e.id = nextId++;
    e.type = type; e.x = x; e.y = y; e.alive = true;
    e.elite = elite; e.cursed = false; e.pooled = regular;
    if (regular) this.poolUsed++;
    const scale = elite ? ELITE.scale : 1;
    // элитка: BoxCollider 1.66 ед. на объекте с масштабом «유닛크기» (Obj_UnitEnemySpecial)
    e.r = elite ? 0.83 * (type.pct / 100) * U : type.r;
    e.mass = boss ? 50 : elite ? 4 : 1;
    const s = W.stats;
    const g = this.growth();
    e.maxHp = e.hp = type.hp * (1 + g.hp / 100) * (1 - s.enemyHpRed) * (elite ? ELITE.hp * (1 - s.eliteHpRed) : 1);
    if (fixedHp) e.maxHp = e.hp = fixedHp * (1 - s.enemyHpRed);
    // скорость — формула оригинала от целого S = round(«이동속도» × (1 + рост%) × (1 − замедление врагов))
    e.speed = origSpeed(Math.round(type.speed * (boss ? 1 : 1 + g.spd / 100) * (1 - s.enemySlow)));
    e.dmg = type.dmg * (1 + g.atk / 100) * (elite ? 1.5 : 1);
    e.xp = type.xp; e.kx = e.ky = 0; e.flashT = 0; e.freezeT = 0; e.slowT = 0; e.slowK = 0;
    e.stunT = W.pickups?.timeStop ? (W.pickups.active.get('timestop') ?? 0) : 0;
    // отрисовка: картинка 2.0 (один кадр, стоит прямо) или старая 3-кадровая клякса (случайный поворот)
    const multi = this.scene.textures.exists(type.tex + '_0');
    e.frame = multi ? (Math.random() * 3) | 0 : -1;
    e.img.setTexture(multi ? type.tex + '_' + e.frame : type.tex).setVisible(true).setPosition(x, y).clearTint().setAlpha(1)
      .setRotation(multi && !boss ? Math.random() * 6.28 : 0).setFlipX(false);
    e.img.setDisplaySize(type.size * scale, type.size * scale);
    e.sc = e.img.scaleX;
    if (elite) {
      if (!e.ring) e.ring = this.scene.add.image(0, 0, 'elite_ring').setDepth(DEPTH.enemy);
      e.ring.setVisible(true).setDisplaySize(type.size * scale * 1.15, type.size * scale * 1.15);
    } else if (e.ring) e.ring.setVisible(false);
    this.aliveCount++;
    return e;
  }

  /** Точка спавна как в оригинале: эллипс вокруг мага (см. AREA); за краем экрана, со всех сторон */
  private spawnPoint() {
    const a = Math.random() * Math.PI * 2, m = 1 + Math.random() * 0.2;
    const P = W.player;
    this.sp.x = P.x + Math.cos(a) * (6.5 + Math.random() * 5) * m * U;
    this.sp.y = P.y + Math.sin(a) * (7.5 + Math.random() * 5) * m * U;
    return this.sp;
  }
  private sp = { x: 0, y: 0 };

  /** Тип текущей волны (один на 30 с) */
  waveType(): EnemyType {
    const t = W.time, z = W.zone, st = z.stage;
    if (z.bossFight) return ENEMY_TYPES[ORIG.bossWave[Math.min(st, 3)]];
    const id = st === 0 ? ORIG.firstCycle[Math.min(step(t, 0), 5)] : ORIG.cycle[step(t, 180 * st) % 6];
    return ENEMY_TYPES[id];
  }

  /** [мобов за раз, интервал с] */
  waveRate(): [number, number] {
    const t = W.time, z = W.zone;
    if (z.bossFight) return ORIG.rateBoss[Math.min(z.stage, 3)];
    const tab = z.stage === 0 ? ORIG.rate0 : ORIG.rateAfter;
    let r = tab[0];
    for (const x of tab) if (t >= x[0]) r = x;
    return [r[1], r[2]];
  }

  updateSpawner(dt: number) {
    const t = W.time;
    this.spawnAcc -= dt;
    if (this.spawnAcc <= 0) {
      const [num, delay] = this.waveRate();
      this.spawnAcc += delay;
      const type = this.waveType();
      // цикл Create_UnitEnemy: шаг счётчика растёт, когда свободных в пуле мало (см. POOL)
      for (let c = 0; c < num;) {
        const free = POOL.all - this.poolUsed;
        if (free <= POOL.keepFree) break;
        const inc = free >= POOL.slowFree ? 1 : (POOL.all + POOL.slowAdd) / Math.min(POOL.all, Math.max(1, free - POOL.keepFree));
        c += Math.min(num, Math.max(1, inc));
        const p = this.spawnPoint();
        if (!this.spawn(type, p.x, p.y, false, 0, true)) break;
      }
    }
    // элитки: группа усиленных мобов текущей волны (оценка времени — см. ELITE); во время босса не идут
    if (t >= this.nextElite && !W.zone.bossFight) {
      this.nextElite = t + ELITE.every;
      const type = this.waveType(), p = this.spawnPoint(), px = p.x, py = p.y;
      const n = ELITE.group + Math.min(W.zone.stage, 3);
      for (let i = 0; i < n; i++) this.spawn(type, px + (Math.random() - 0.5) * 90, py + (Math.random() - 0.5) * 90, true);
    }
  }

  /** Тихо убрать моба (ушёл далеко за экран): без опыта, сферы, счётчика убийств — как Unit_Destroy_Simple */
  private despawn(e: Enemy) {
    e.alive = false;
    if (e.pooled) { e.pooled = false; this.poolUsed--; }
    e.img.setVisible(false);
    if (e.ring) e.ring.setVisible(false);
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
      const boss = e.type.id === 'boss';

      // ушёл далеко за экран: обычный — тихо удаляется (спавнер создаст новых вокруг мага, в т.ч. впереди),
      // элитка — на ±33 ед.; босса и «проклятых» не удаляем, а переносим к магу (на них держатся Zone/Pickups)
      if (!e.elite && !boss ? (adx >= AREA.killX - e.r || ady >= AREA.killY - e.r) : (adx >= AREA.killFar || ady >= AREA.killFar)) {
        if (boss || e.cursed) { const p = this.spawnPoint(); e.x = p.x; e.y = p.y; }
        else { this.despawn(e); continue; }
        dx = P.x - e.x; dy = P.y - e.y;
      }
      const d = Math.sqrt(dx * dx + dy * dy) || 1;

      if (e.freezeT > 0) { e.freezeT -= dt; if (e.freezeT <= 0 && e.flashT <= 0) this.baseTint(e); }
      else if (e.stunT > 0) e.stunT -= dt;
      else {
        let sp = e.speed;
        if (e.slowT > 0) { e.slowT -= dt; sp *= 1 - e.slowK; }
        e.x += (dx / d) * sp * dt;
        e.y += (dy / d) * sp * dt;
      }
      // отбрасывание
      if (e.kx || e.ky) {
        e.x += e.kx * dt; e.y += e.ky * dt;
        e.kx *= 0.86; e.ky *= 0.86;
        if (Math.abs(e.kx) + Math.abs(e.ky) < 2) e.kx = e.ky = 0;
      }
      // физика как в оригинале (у мобов и мага Rigidbody mass 1, drag 1000, твёрдые коллайдеры):
      // перекрывшиеся тела расходятся пропорционально массам — толпа не слипается в точку.
      // Каждая пара встречается дважды (от e и от o), поэтому за проход снимаем половину перекрытия.
      const n = this.grid.near(e.x, e.y, e.r, nb, 8);
      for (let i = 0; i < n; i++) {
        const o = nb[i];
        if (o === e) continue;
        let ox = e.x - o.x, oy = e.y - o.y;
        let od2 = ox * ox + oy * oy;
        if (od2 < 0.0001) { ox = Math.cos(e.id); oy = Math.sin(e.id); od2 = 1; } // совпали — разводим по «случайной» оси
        const od = Math.sqrt(od2), over = (e.r + o.r - od) * 0.5;
        if (over <= 0) continue;
        const k = over / od, we = o.mass / (e.mass + o.mass), wo = 1 - we;
        e.x += ox * k * we; e.y += oy * k * we;
        o.x -= ox * k * wo; o.y -= oy * k * wo;
      }

      // маг и моб тоже твёрдые: моб упирается, маг получает толчок (накопится и применится в Player.move,
      // ограничен скоростью мага) — сквозь толпу не пройти без сопротивления
      dx = P.x - e.x; dy = P.y - e.y;
      const rr = e.r + bodyR, d2 = dx * dx + dy * dy;
      if (d2 < rr * rr) {
        const pd = Math.sqrt(d2) || 0.01, over = rr - pd;
        const wp = boss ? 1 : e.elite ? 0.8 : 0.5; // доля перекрытия, которую «отдаёт» маг (массы 1:1 у обычных)
        const nx = dx / pd, ny = dy / pd;
        P.pushX += nx * over * wp; P.pushY += ny * over * wp;
        e.x -= nx * over * (1 - wp); e.y -= ny * over * (1 - wp);
        P.hurt(e.dmg);
        // камикадзе (особая способность 1): ударил — и погиб с «взрывом», без награды
        if (e.type.kami && !boss) {
          W.fx.burst(e.x, e.y, KAMI.ring * 0.5, KAMI.tint, KAMI.life, 'kami_ring');
          this.despawn(e);
          continue;
        }
      }

      if (e.flashT > 0) { e.flashT -= dt; if (e.flashT <= 0) this.baseTint(e); }
      if (e.frame >= 0) {
        // «дрожащая линия» старых текстур: ~4 смены кадра в секунду, у каждого моба со своим сдвигом
        const fr = Math.floor(W.scene.time.now / 250 + e.id * 0.37) % 3;
        if (fr !== e.frame) { e.frame = fr; e.img.setTexture(e.type.tex + '_' + fr); }
      } else {
        // картинка 2.0: «дыхание» (сжатие/растяжение) и лёгкое покачивание, смотрит в сторону мага
        const ph = W.scene.time.now * 0.009 + e.id * 1.7;
        const k = Math.sin(ph) * (e.type.id === 'boss' ? 0.03 : 0.055);
        e.img.setScale(e.sc * (1 + k), e.sc * (1 - k)).setRotation(Math.sin(ph * 0.5) * 0.07);
        if (e.freezeT <= 0 && e.stunT <= 0) e.img.setFlipX(dx < 0);
      }
      e.img.setPosition(e.x, e.y);
      if (e.ring) e.ring.setPosition(e.x, e.y);
    }
  }

  /** Нанести урон врагу. Возвращает true, если враг погиб. */
  damage(e: Enemy, amount: number, kx = 0, ky = 0, src = ''): boolean {
    if (!e.alive) return false;
    const s = W.stats, A = W.artifacts;
    const crit = Math.random() < s.crit;
    // артефакты (крит при первом ударе, казнь, Гидра, Клеймо…) — только если есть хоть один такой
    if (A.hitFx) amount = A.onDamage(e, amount, crit, src);
    else if (crit) amount *= s.critMult;
    if (s.highHpBonus && e.hp > e.maxHp * 0.75) amount *= 1 + s.highHpBonus;
    if (src) W.dmgBy.set(src, (W.dmgBy.get(src) ?? 0) + Math.min(amount, e.hp));
    e.hp -= amount;
    // вспышка урона (тела мобов почти чёрные — поэтому заливка setTintFill, приглушённая альфой):
    // обычный удар — очень короткая неяркая светлая, крит — красная и чуть дольше; крит не перебивается обычным
    if (crit) { e.img.setTintFill(FLASH.crit).setAlpha(FLASH.alpha); e.flashT = FLASH.critT; e.flashCrit = true; }
    else if (e.flashT <= 0 || !e.flashCrit) { e.img.setTintFill(FLASH.hit).setAlpha(FLASH.alpha); e.flashT = Math.max(e.flashT, FLASH.hitT); e.flashCrit = false; }
    if (kx || ky) { const k = e.type.id === 'boss' ? 0 : e.elite || e.type.id === 'big' ? 0.25 : 1; e.kx += kx * k; e.ky += ky * k; }
    if (e.hp <= 0) { this.kill(e); return true; }
    return false;
  }

  kill(e: Enemy) {
    if (!e.alive) return;
    e.alive = false;
    if (e.pooled) { e.pooled = false; this.poolUsed--; }
    e.img.setVisible(false);
    if (e.ring) e.ring.setVisible(false);
    this.free.push(e);
    this.aliveCount--;
    W.kills++;
    W.pickups.onKill();
    // опыт даёт само убийство (оригинал: ManaGain(«마나량» моба)); элитка — 10, босс — 500
    W.player.gainXp(e.type.id === 'boss' ? 500 : e.elite ? 10 : e.xp);
    if (W.artifacts.killFx) W.artifacts.onKill(e); // взрывы, Экзорцизм, Загробный мир…
    if (e.type.id === 'boss') { W.zone.bossDied(e); return; }
    if (e.cursed) W.pickups.cursedKilled(e.x, e.y);
    if (e.elite) {
      // элитка роняет одно из: средняя сфера / большая / сфера жизни / руна
      const r = (Math.random() * 4) | 0;
      if (r === 3) W.pickups.rune(W.pickups.randomRune(), e.x, e.y);
      else W.orbs.drop(e.x, e.y, r === 0 ? 'm' : r === 1 ? 'l' : 'life');
      W.fx.burst(e.x, e.y, 60, 0xff2d8a, 0.5);
    }
    // сфера маны — не по шансу, а за каждые 20 убийств (общий счётчик)
    if (++this.orbKills >= LOOT.orbEveryKills / (1 + W.stats.orbRate)) {
      this.orbKills = 0;
      W.orbs.drop(e.x, e.y, Math.random() < LOOT.smallOrbChance ? 's' : 'm');
    }
  }

  /** Боссы и элитки к заморозке невосприимчивы (как в оригинале) */
  freeze(e: Enemy, sec: number) {
    if (!e.alive || e.elite || e.type.id === 'boss') return;
    e.freezeT = Math.max(e.freezeT, sec);
    if (e.flashT <= 0) this.baseTint(e);
  }

  /** Обычный вид моба: без заливки; замороженный — просто подсвечен приглушённым синим (без эффектов) */
  private baseTint(e: Enemy) {
    if (e.freezeT > 0) e.img.setTintFill(FLASH.freeze).setAlpha(FLASH.freezeAlpha);
    else e.img.clearTint().setAlpha(1);
  }
  stun(e: Enemy, sec: number) { if (e.alive && e.type.id !== 'boss') e.stunT = Math.max(e.stunT, sec); }
  slow(e: Enemy, k: number, sec: number) { if (!e.alive) return; e.slowK = Math.max(e.slowT > 0 ? e.slowK : 0, k); e.slowT = Math.max(e.slowT, sec); }

  /** Все живые враги в видимой области (с запасом pad) */
  visible(pad = 0): Enemy[] {
    const v = this.scene.cameras.main.worldView, out: Enemy[] = [];
    for (const e of this.list) if (e.alive && e.x > v.x - pad && e.x < v.right + pad && e.y > v.y - pad && e.y < v.bottom + pad) out.push(e);
    return out;
  }

  /** n ближайших к точке (разные) */
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

  /** Случайный враг среди видимых (для заклинаний «по случайной цели») */
  randomVisible(): Enemy | null {
    const v = this.scene.cameras.main.worldView;
    const cand: Enemy[] = [];
    for (const e of this.list) if (e.alive && v.contains(e.x, e.y)) cand.push(e);
    return cand.length ? cand[(Math.random() * cand.length) | 0] : null;
  }
}
