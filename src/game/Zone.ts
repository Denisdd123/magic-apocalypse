import Phaser from 'phaser';
import { DEPTH } from '../config';
import { ORIG_UNIT, typeOf, type Enemy } from './Enemies';
import { W } from './World';

/**
 * Эпики, боссы, арена, торговец — 3.0, партия 3 (spawn.md §5, §6; отметки — Waves.EV1).
 * - Эпики: `Create_UnitEnemyEpic` — 12 точек по кругу R(10, 15), задержки ApplyCreateEpicEnemyDelay = 0 (все сразу),
 *   пул 15 (создание, пока свободных ≥ 2).
 * - Боссы: `Create_UnitEnemyBoss(ID, Num)` — Num точек по кругу R(10, 18) (у 44 — 9 / 10), пул 15, свободных ≥ 2.
 *   Вызывается дважды (Waves), зачистка закрывается на смерти Num-го (`ApplyBossNum`).
 * - Дроп по UnitID (Play_Unit_Death, и у эпиков, и у боссов): 41 — 6 больших сфер, 42–45 — плод Мирового Древа, 46 — 5 больших.
 * - Арена (`Play_BossLimitGround_Damage`) ставится вместе с обелиском (`CreateItem_Character(9|10|11)`) и снимается,
 *   когда обелиск подобран (Pickups.obelisk).
 */

const U = ORIG_UNIT;
const R = (a: number, b: number) => a + Math.random() * (b - a);
const POOL_EPIC = 15, POOL_BOSS = 15, MERCHANT_TIME = 40;

interface EpicJob { id: number; left: number; wait: number; pos: { x: number; y: number }[] }

export class Zone {
  /** сколько боссов убито — для оттенка пола (2.2) */
  stage = 0;
  private jobs: EpicJob[] = [];

  onBossKilled: ((idx: number, x: number, y: number) => void) | null = null;
  onMerchant: (() => void) | null = null;
  /** ApplyMerchantTime: полоска Obj_MerchantBar (40 с); null — торговец не идёт */
  private merchantT: number | null = null;
  get merchantFrac() { return this.merchantT === null ? null : Math.min(1, this.merchantT / MERCHANT_TIME); }

  /** Идёт бой с боссами: ApplyBossNum > 0 или босс ещё на поле */
  get bossFight() { return W.waves.bossNum > 0 || this.count(4) > 0; }
  /** Таймер стоит во время волны-зачистки (Play_Time остановлен) */
  get timeFrozen() { return W.waves.timeFrozen; }

  /** Арена босса: ApplyBossGround_X/Y, стена √145, урон за √138 — 10 % макс. HP (или −1 заряд щита) раз в 0.8 с */
  arena: { x: number; y: number; objs: Phaser.GameObjects.GameObject[]; haze: Phaser.GameObjects.Rectangle } | null = null;
  private arenaHurtT = 0;
  /**
   * Вид (Play_BossWaveEffect_Start, visual.md §6.3): Vision01 ×5 с центром на маге, альфа 0.85, + 4 чёрных прямоугольника
   * (0,0,0,0.851) снаружи (внутренние края на ±5.12×5 ед. от центра); багровая дымка (0.5,0.1,0) альфа 0→0.1 за 1.05 с
   * (21 шаг по 0.005 каждые 0.05 с). Покраска пола зоны 2 (×#ff665c) здесь не делается — зона 2 не в 3.0.
   */
  startArena(x: number, y: number) {
    this.endArena();
    const sc = W.scene, hs = 5.12 * 5 * U, big = 400 * U, D = DEPTH.ground + 1;
    const img = sc.add.image(x, y, 'vision01').setDepth(D).setScale(5 * U / 100).setAlpha(0.85);
    const objs: Phaser.GameObjects.GameObject[] = [img];
    const rect = (cx: number, cy: number, w: number, h: number) =>
      objs.push(sc.add.rectangle(cx, cy, w, h, 0x000000, 0.851).setDepth(D));
    rect(x - hs - big / 2, y, big, big * 2 + hs * 2); rect(x + hs + big / 2, y, big, big * 2 + hs * 2);
    rect(x, y - hs - big / 2, hs * 2, big); rect(x, y + hs + big / 2, hs * 2, big);
    const haze = sc.add.rectangle(x, y, 10, 10, 0x7f1900, 0).setDepth(D);
    objs.push(haze);
    this.arena = { x, y, objs, haze }; this.hazeT = 0;
  }
  private hazeT = 0;
  endArena() { this.arena?.objs.forEach((o) => o.destroy()); this.arena = null; }
  arenaClamp(P: { x: number; y: number }, dt: number) {
    const a = this.arena; if (!a) return;
    const Rw = Math.sqrt(145) * U, Rd = Math.sqrt(138) * U;
    const dx = P.x - a.x, dy = P.y - a.y, d = Math.hypot(dx, dy);
    if (d > Rw) { P.x = a.x + (dx / d) * Rw; P.y = a.y + (dy / d) * Rw; }
    this.arenaHurtT -= dt;
    if (d > Rd && this.arenaHurtT <= 0) { this.arenaHurtT = 0.8; W.player.hurt(W.stats.maxHp * 0.1); }
  }

  /** CreateItem_Character(12): подходить не надо — через 40 с окно открывается само (Play_MerchantTime) */
  merchant() {
    W.artifacts.merchantNum++;
    if (W.artifacts.deck.merchantStock >= 11) this.merchantT = 0;
  }

  private count(cat: number) { let n = 0; for (const e of W.enemies.list) if (e.alive && e.cat === cat) n++; return n; }

  /** Create_UnitEnemyEpic: точки считаются при старте корутины */
  queueEpic(id: number, num: number, firstDelay: number) {
    const P = W.player, pos: { x: number; y: number }[] = [];
    for (let k = 0; k < 12; k++) { const a = (k * Math.PI) / 6, r = R(10, 15) * U; pos.push({ x: P.x + Math.cos(a) * r, y: P.y + Math.sin(a) * r }); }
    this.jobs.push({ id, left: num, wait: firstDelay, pos });
  }

  /** Create_UnitEnemyBoss: возвращает, сколько создано (ApplyBossNum этого вызова) */
  spawnBosses(id: number, num: number): number {
    const P = W.player, t = typeOf(id);
    const rDef = num < 11 ? 9 : 10, step = (Math.PI * 2) / Math.max(1, num);
    let made = 0;
    for (let k = 0; k < num; k++) {
      if (POOL_BOSS - this.count(4) < 2) break;
      const r = (id === 44 ? rDef : R(10, 18)) * U;
      if (W.enemies.spawn(t, P.x + Math.cos(step * k) * r, P.y + Math.sin(step * k) * r, 4)) made++;
    }
    return made;
  }

  update(dt: number) {
    const ar = this.arena;
    if (ar) { // дымка: шаг 0.005 каждые 0.05 с до 0.1; покрывает кадр камеры
      this.hazeT += dt;
      const v = W.scene.cameras.main.worldView;
      ar.haze.setPosition(v.centerX, v.centerY).setSize(v.width + 4, v.height + 4).setFillStyle(0x7f1900, Math.min(20, Math.floor(this.hazeT / 0.05)) * 0.005);
    }
    if (this.merchantT !== null && (this.merchantT += dt) >= MERCHANT_TIME) { this.merchantT = null; this.onMerchant?.(); }
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const j = this.jobs[i];
      j.wait -= dt;
      while (j.wait <= 0 && j.left > 0) {
        if (POOL_EPIC - this.count(3) < 2) { j.left = 0; break; }
        const p = j.pos[(Math.random() * 12) | 0];
        W.enemies.spawn(typeOf(j.id), p.x, p.y, 3);
        j.left--;
        // ApplyCreateEpicEnemyDelay = 0 (C_Battle_Manager.Start, @line 16114 decomp) — следующий сразу
      }
      if (j.left <= 0) this.jobs.splice(i, 1);
    }
  }

  /** Смерть эпика или босса (из Enemies.kill) */
  bossDied(e: Enemy) {
    const uid = e.type.uid;
    if (uid === 41 || uid === 46) {
      // CreateItem_Position(−3, 6 | 5): большие сферы, смещение угол R(0,1)·2π, по x и y × R(0.5, 3) ед.
      const n = uid === 41 ? 6 : 5;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        W.orbs.drop(e.x + Math.cos(a) * R(0.5, 3) * U, e.y + Math.sin(a) * R(0.5, 3) * U, 'l');
      }
    } else if (uid >= 42 && uid <= 45) W.pickups.tree(e.x, e.y);
    if (e.cat !== 4) return;
    W.waves.onBossDeath();
    W.fx.burst(e.x, e.y, 160, 0xff3040, 0.7);
    this.onBossKilled?.(this.stage++, e.x, e.y);
  }
}
