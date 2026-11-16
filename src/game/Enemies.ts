import Phaser from 'phaser';
import { DEPTH, LOOT, MAX_ENEMIES, VIEW_W } from '../config';
import { Grid } from './Grid';
import { W } from './World';

export interface EnemyType {
  id: string; tex: string; r: number; size: number;
  hp: number; speed: number; dmg: number; xp: number;
  /** xp — опыт сразу за убийство («마나량» моба в оригинале); drop не используется */
  drop: number;
}

/** Множитель скорости всех врагов (калибровка по видео оригинала) */
export const ENEMY_SPEED = 0.85;

// tex: 'en_*' — картинки мобов (mobArt.ts: кадры en_<имя>_0.._2); старые процедурные тоже поддерживаются.
// РАЗМЕРЫ — по оригиналу (research/orig_sprites + Dictionary_UnitStat «유닛크기»): видимый размер =
// размер спрайта оригинала, px × «유닛크기»/100 × (наш маг 31 ед. / маг оригинала 63 px) ≈ px × %/100 × 0.49.
// ХИТБОКС — в оригинале у всех обычных мобов одинаковый BoxCollider 0.44×0.55 ед. (префаб Obj_UnitEnemy,
// размер мага 0.21×0.5) → r ≈ 0.25 ед. × 49 ≈ 12 у всех; разный только рисунок.
export const ENEMY_TYPES: Record<string, EnemyType> = {
  // старые типы (сундук-проклятие, свита, мини-волна): размеры по ближайшему мобу оригинала
  basic: { id: 'basic', tex: 'en_minion',  r: 12, size: 39, hp: 14, speed: 33, dmg: 6, xp: 3, drop: 0.12 },  // Миньон (75 px × 105%)
  red:   { id: 'red',   tex: 'en_stinger', r: 12, size: 46, hp: 42, speed: 38, dmg: 9, xp: 4, drop: 0.35 },  // Стингер (ориг. 61 — ужато, он же элитка-проклятие)
  small: { id: 'small', tex: 'en_swarm_s', r: 10, size: 24, hp: 8,  speed: 66, dmg: 5, xp: 3, drop: 0.12 },  // мелочь роя
  white: { id: 'white', tex: 'en_seraph',  r: 14, size: 64, hp: 95, speed: 42, dmg: 12, xp: 5, drop: 0.4 },  // Серафим (ориг. 135 — ужато)
  big:   { id: 'big',   tex: 'en_assault', r: 22, size: 99, hp: 650, speed: 25, dmg: 18, xp: 10, drop: 1 },  // Штурмовик (237 px × 85%)
  // Мобы волн оригинала (Dictionary_UnitStat): HP ×0.14, урон ×0.55, скорость ×0.97 к оригиналу (наш масштаб)
  w1:  { id: 'w1',  tex: 'en_swarm_s',     r: 12, size: 28, hp: 14, speed: 33, dmg: 6,  xp: 3, drop: 0.12 }, // Рой малый (46 px × 125%)
  w6:  { id: 'w6',  tex: 'en_swarm_m',     r: 12, size: 42, hp: 28, speed: 31, dmg: 8,  xp: 4, drop: 0.15 }, // Рой средний (86 × 100%)
  w11: { id: 'w11', tex: 'en_swarm_l',     r: 12, size: 48, hp: 42, speed: 31, dmg: 11, xp: 5, drop: 0.2 },  // Рой большой (108 × 90%)
  w13: { id: 'w13', tex: 'en_interceptor', r: 12, size: 46, hp: 42, speed: 31, dmg: 22, xp: 5, drop: 0.2 },  // Перехватчик (125 × 75%)
  w16: { id: 'w16', tex: 'en_hive',        r: 12, size: 57, hp: 70, speed: 27, dmg: 11, xp: 6, drop: 0.25 }, // Улей (145 × 80%)
  w31: { id: 'w31', tex: 'en_scarab',      r: 12, size: 41, hp: 21, speed: 28, dmg: 16, xp: 5, drop: 0.15 }, // Скарабей (99 × 85%)
  w21: { id: 'w21', tex: 'en_mine',        r: 12, size: 50, hp: 56, speed: 29, dmg: 27, xp: 8, drop: 0.3 },  // Мина (185 × 55%)
  w22: { id: 'w22', tex: 'en_oculus',      r: 12, size: 51, hp: 56, speed: 29, dmg: 27, xp: 8, drop: 0.3 },  // Вой (206 × 50%)
  // боссы зоны (HP задаётся в Zone.ts)
  boss0: { id: 'boss', tex: 'en_citadel',     r: 30, size: 69, hp: 1, speed: 30, dmg: 22, xp: 0, drop: 0 },  // Цитадель
  boss1: { id: 'boss', tex: 'en_nemesis',     r: 32, size: 77, hp: 1, speed: 32, dmg: 28, xp: 0, drop: 0 },  // Немезида
  boss2: { id: 'boss', tex: 'en_apostle',     r: 34, size: 83, hp: 1, speed: 34, dmg: 34, xp: 0, drop: 0 }, // Апостол
  boss3: { id: 'boss', tex: 'en_apostle_red', r: 36, size: 91, hp: 1, speed: 36, dmg: 40, xp: 0, drop: 0 }, // Апостол (финал, багровый)
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
 * волна = один тип моба на 30 с, по кругу; каждые delay с создаётся num мобов; живых не больше ALIVE_CAP.
 * Рост статов мобов — проценты к базе по стадии зоны (сколько боссов убито) и времени.
 */
export const ORIG = {
  aliveCap: 300,
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

/** 1 единица мира оригинала в наших единицах: камера оригинала видит 6.69 ед. по ширине (orthographicSize 7.25, 19.5:9) */
export const ORIG_UNIT = VIEW_W / 6.69;
const U = ORIG_UNIT;

/**
 * Удаление/спавн как в оригинале (сцена: объект мага → DestroyArea, C_Battle_Manager.Create_UnitEnemy):
 * обычный моб тихо удаляется (без опыта/сферы/счётчика), когда |dx| ≥ 12.25 ед. или |dy| ≥ 13.4 ед. от мага
 * (прямоугольник, стены C_DestroyArea_A); элитки — на ±33 ед. (C_DestroyArea_B). Новые — на эллипсе вокруг мага:
 * x = cos a · U(6.5, 11.5) · m, y = sin a · U(7.5, 12.5) · m, m = U(1, 1.2) — в том числе впереди бегущего мага.
 */
const AREA = { killX: 12.25 * U, killY: 13.4 * U, killFar: 33 * U };

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
  private spawnAcc = 0;
  /** счётчик убийств до следующей сферы маны */
  private orbKills = 0;
  private nextElite = ELITE.first;
  /** переиспользуемый буфер соседей для расталкивания (без аллокаций в цикле) */
  private nb: Enemy[] = [];

  constructor(private scene: Phaser.Scene) {}

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
    if (this.aliveCount >= (wave ? ORIG.aliveCap : MAX_ENEMIES) && !elite && !boss) return null;
    let e = this.free.pop();
    if (!e) {
      e = new Enemy();
      e.img = this.scene.add.image(0, 0, '__DEFAULT').setDepth(DEPTH.enemy);
      this.list.push(e);
    }
    e.id = nextId++;
    e.type = type; e.x = x; e.y = y; e.alive = true;
    e.elite = elite; e.cursed = false;
    const scale = elite ? ELITE.scale : 1;
    e.r = elite ? Math.max(ELITE.r, type.r * scale) : type.r;
    e.mass = boss ? 50 : elite ? 4 : 1;
    const s = W.stats;
    const g = this.growth();
    e.maxHp = e.hp = type.hp * (1 + g.hp / 100) * (1 - s.enemyHpRed) * (elite ? ELITE.hp * (1 - s.eliteHpRed) : 1);
    if (fixedHp) e.maxHp = e.hp = fixedHp * (1 - s.enemyHpRed);
    e.speed = type.speed * ENEMY_SPEED * (0.9 + Math.random() * 0.2) * (1 - s.enemySlow) * (boss ? 1 : 1 + g.spd / 100);
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
      for (let i = 0; i < num && this.aliveCount < ORIG.aliveCap; i++) {
        const p = this.spawnPoint();
        this.spawn(type, p.x, p.y, false, 0, true);
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
      if (!e.elite && !boss ? (adx >= AREA.killX + e.r || ady >= AREA.killY + e.r) : (adx >= AREA.killFar || ady >= AREA.killFar)) {
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
