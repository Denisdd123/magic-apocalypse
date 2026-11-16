import Phaser from 'phaser';
import { DEPTH, MAX_ENEMIES } from '../config';
import { Grid } from './Grid';
import { W } from './World';

export interface EnemyType {
  id: string; tex: string; r: number; size: number;
  hp: number; speed: number; dmg: number; xp: number;
  /** шанс выпадения кристалла при смерти (в оригинале кристаллы падают редко, основная мана лежит на поле) */
  drop: number;
}

/** Множитель скорости всех врагов (калибровка по видео оригинала) */
export const ENEMY_SPEED = 0.85;

export const ENEMY_TYPES: Record<string, EnemyType> = {
  basic: { id: 'basic', tex: 'enemy_basic', r: 10, size: 26, hp: 14, speed: 33, dmg: 6, xp: 1, drop: 0.12 },
  red:   { id: 'red',   tex: 'enemy_red',   r: 11, size: 29, hp: 42, speed: 38, dmg: 9, xp: 3, drop: 0.35 },
  small: { id: 'small', tex: 'enemy_small', r: 6,  size: 16, hp: 8,  speed: 66, dmg: 5, xp: 1, drop: 0.12 },
  white: { id: 'white', tex: 'enemy_white', r: 12, size: 31, hp: 95, speed: 42, dmg: 12, xp: 4, drop: 0.4 },
  big:   { id: 'big',   tex: 'enemy_big',   r: 22, size: 56, hp: 650, speed: 25, dmg: 18, xp: 20, drop: 1 },
  // Мобы волн оригинала (Dictionary_UnitStat): HP ×0.14, урон ×0.55, скорость ×0.97 к оригиналу (наш масштаб)
  w1:  { id: 'w1',  tex: 'enemy_basic', r: 9,  size: 24, hp: 14, speed: 33, dmg: 6,  xp: 1, drop: 0.12 }, // Рой малый
  w6:  { id: 'w6',  tex: 'enemy_basic', r: 10, size: 27, hp: 28, speed: 31, dmg: 8,  xp: 1, drop: 0.15 }, // Рой средний
  w11: { id: 'w11', tex: 'enemy_red',   r: 11, size: 29, hp: 42, speed: 31, dmg: 11, xp: 2, drop: 0.2 },  // Рой большой
  w13: { id: 'w13', tex: 'enemy_red',   r: 10, size: 27, hp: 42, speed: 31, dmg: 22, xp: 2, drop: 0.2 },  // Перехватчик
  w16: { id: 'w16', tex: 'enemy_white', r: 12, size: 31, hp: 70, speed: 27, dmg: 11, xp: 3, drop: 0.25 }, // Улей
  w31: { id: 'w31', tex: 'enemy_small', r: 7,  size: 18, hp: 21, speed: 28, dmg: 16, xp: 1, drop: 0.15 }, // Скарабей
  w21: { id: 'w21', tex: 'enemy_white', r: 12, size: 31, hp: 56, speed: 29, dmg: 27, xp: 3, drop: 0.3 },  // Мина
  w22: { id: 'w22', tex: 'enemy_white', r: 13, size: 33, hp: 56, speed: 29, dmg: 27, xp: 3, drop: 0.3 },  // Вой
  // боссы зоны (HP задаётся в Zone.ts)
  boss0: { id: 'boss', tex: 'boss_0', r: 30, size: 84, hp: 1, speed: 30, dmg: 22, xp: 0, drop: 0 },
  boss1: { id: 'boss', tex: 'boss_1', r: 32, size: 90, hp: 1, speed: 32, dmg: 28, xp: 0, drop: 0 },
  boss2: { id: 'boss', tex: 'boss_2', r: 34, size: 96, hp: 1, speed: 34, dmg: 34, xp: 0, drop: 0 },
  boss3: { id: 'boss', tex: 'boss_3', r: 36, size: 104, hp: 1, speed: 36, dmg: 40, xp: 0, drop: 0 },
};

export class Enemy {
  x = 0; y = 0; r = 10; alive = false;
  hp = 1; maxHp = 1; speed = 30; dmg = 5; xp = 1;
  kx = 0; ky = 0;          // отбрасывание
  stunT = 0; flashT = 0;
  frame = 0;
  elite = false;
  cursed = false;
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

const step = (t: number, from: number) => Math.max(0, Math.floor((t - from) / 30));

export class Enemies {
  list: Enemy[] = [];
  private free: Enemy[] = [];
  grid = new Grid<Enemy>();
  aliveCount = 0;
  private spawnAcc = 0;
  private nextElite = 60;
  private nextSwarm = 150;

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
      e.img = this.scene.add.image(0, 0, type.tex + '_0').setDepth(DEPTH.enemy);
      this.list.push(e);
    }
    e.id = nextId++;
    e.type = type; e.x = x; e.y = y; e.alive = true;
    e.elite = elite; e.cursed = false;
    const scale = elite ? 1.7 : 1;
    e.r = type.r * scale;
    const s = W.stats;
    const g = this.growth();
    e.maxHp = e.hp = type.hp * (1 + g.hp / 100) * (1 - s.enemyHpRed) * (elite ? 18 * (1 - s.eliteHpRed) : 1);
    if (fixedHp) e.maxHp = e.hp = fixedHp * (1 - s.enemyHpRed);
    e.speed = type.speed * ENEMY_SPEED * (0.9 + Math.random() * 0.2) * (elite ? 0.85 : 1) * (1 - s.enemySlow) * (boss ? 1 : 1 + g.spd / 100);
    e.dmg = type.dmg * (1 + g.atk / 100) * (elite ? 1.5 : 1);
    e.xp = type.xp; e.kx = e.ky = 0; e.flashT = 0;
    e.stunT = W.pickups?.timeStop ? (W.pickups.active.get('timestop') ?? 0) : 0;
    e.frame = (Math.random() * 3) | 0;
    e.img.setTexture(type.tex + '_' + e.frame).setVisible(true).setPosition(x, y).clearTint().setRotation(boss ? 0 : Math.random() * 6.28);
    e.img.setDisplaySize(type.size * scale, type.size * scale);
    if (elite) {
      if (!e.ring) e.ring = this.scene.add.image(0, 0, 'elite_ring').setDepth(DEPTH.enemy);
      e.ring.setVisible(true).setDisplaySize(type.size * scale * 1.15, type.size * scale * 1.15);
    } else if (e.ring) e.ring.setVisible(false);
    this.aliveCount++;
    return e;
  }

  private spawnPoint(extra = 30) {
    const v = this.scene.cameras.main.worldView;
    const R = Math.hypot(v.width, v.height) / 2 + extra;
    const a = Math.random() * Math.PI * 2;
    return { x: W.player.x + Math.cos(a) * R, y: W.player.y + Math.sin(a) * R, a };
  }

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
        const p = this.spawnPoint(20 + Math.random() * 60);
        this.spawn(type, p.x, p.y, false, 0, true);
      }
    }
    // элитка раз в минуту
    if (t >= this.nextElite) {
      this.nextElite += 60;
      const p = this.spawnPoint();
      this.spawn(t > 240 ? ENEMY_TYPES.white : t > 120 ? ENEMY_TYPES.red : ENEMY_TYPES.basic, p.x, p.y, true);
    }
    // рой мелких с одной стороны
    if (t >= this.nextSwarm) {
      this.nextSwarm += 45 + Math.random() * 30;
      const p = this.spawnPoint(60);
      const n = 14 + Math.floor(t / 30);
      for (let i = 0; i < n; i++) {
        this.spawn(ENEMY_TYPES.small, p.x + (Math.random() - 0.5) * 70, p.y + (Math.random() - 0.5) * 70);
      }
    }
  }

  update(dt: number) {
    const P = W.player;
    const g = this.grid;
    g.clear();
    for (const e of this.list) if (e.alive) g.insert(e);

    const view = this.scene.cameras.main.worldView;
    const farR = Math.hypot(view.width, view.height) * 0.75;

    for (const e of this.list) {
      if (!e.alive) continue;
      let dx = P.x - e.x, dy = P.y - e.y;
      const d = Math.hypot(dx, dy) || 1;

      // слишком далеко — переносим на противоположную сторону (как в жанре)
      if (d > farR) {
        e.x = P.x + (dx / d) * farR * 0.9;
        e.y = P.y + (dy / d) * farR * 0.9;
        continue;
      }

      if (e.stunT > 0) e.stunT -= dt;
      else {
        e.x += (dx / d) * e.speed * dt;
        e.y += (dy / d) * e.speed * dt;
      }
      // отбрасывание
      if (e.kx || e.ky) {
        e.x += e.kx * dt; e.y += e.ky * dt;
        e.kx *= 0.86; e.ky *= 0.86;
        if (Math.abs(e.kx) + Math.abs(e.ky) < 2) e.kx = e.ky = 0;
      }
      // расталкивание соседей (ограничено, чтобы было быстро)
      let n = 0;
      g.query(e.x, e.y, e.r * 0.9, (o) => {
        if (o === e) return;
        const ox = e.x - o.x, oy = e.y - o.y;
        const od = Math.hypot(ox, oy) || 0.01;
        const push = (e.r + o.r - od) * 0.5;
        if (push > 0) { e.x += (ox / od) * push * 0.6; e.y += (oy / od) * push * 0.6; }
        return ++n > 5;
      });

      // контакт с магом
      dx = P.x - e.x; dy = P.y - e.y;
      const rr = e.r + P.r;
      if (dx * dx + dy * dy < rr * rr) P.hurt(e.dmg);

      if (e.flashT > 0) { e.flashT -= dt; if (e.flashT <= 0) e.img.clearTint(); }
      // «дрожащая линия»: кадры сменяются ~8 раз в секунду, у каждого моба со своим сдвигом
      const fr = Math.floor(W.scene.time.now / 250 + e.id * 0.37) % 3; // ~4 смены в секунду
      if (fr !== e.frame) { e.frame = fr; e.img.setTexture(e.type.tex + '_' + fr); }
      e.img.setPosition(e.x, e.y);
      if (e.ring) e.ring.setPosition(e.x, e.y);
    }
  }

  /** Нанести урон врагу. Возвращает true, если враг погиб. */
  damage(e: Enemy, amount: number, kx = 0, ky = 0, src = ''): boolean {
    if (!e.alive) return false;
    const s = W.stats;
    if (Math.random() < s.crit) amount *= s.critMult;
    if (s.highHpBonus && e.hp > e.maxHp * 0.75) amount *= 1 + s.highHpBonus;
    if (src) W.dmgBy.set(src, (W.dmgBy.get(src) ?? 0) + Math.min(amount, e.hp));
    e.hp -= amount;
    if (e.flashT <= 0) e.img.setTintFill(0x6a2a30); // мягкая тёмно-красная вспышка вместо белой
    e.flashT = 0.06;
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
    if (e.type.id === 'boss') { W.zone.bossDied(e); return; }
    if (e.cursed) W.pickups.cursedKilled(e.x, e.y);
    if (e.elite) {
      W.orbs.drop(e.x, e.y, 'l', 25);
      W.orbs.drop(e.x + 10, e.y, 'life', 0);
      W.fx.burst(e.x, e.y, 60, 0xff2d8a, 0.5);
    } else {
      const xp = e.xp;
      if (Math.random() < e.type.drop) W.orbs.drop(e.x, e.y, xp >= 15 ? 'l' : xp >= 3 ? 'm' : 's', xp);
      if (Math.random() < 0.006) W.orbs.drop(e.x + 6, e.y, 'life', 0);
    }
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
