import { ENEMY_TYPES, ORIG_UNIT, type Enemy } from './Enemies';
import { W } from './World';

/**
 * Ход зоны, как в оригинале (видео полного забега): зона длится 12 минут,
 * боссы на 3:00 / 6:00 / 9:00 / 12:00 (таймер стоит, пока босс жив),
 * после каждого — обелиск с легендарками (усиление заклинания — редкая карточка в выборе, SpellBook),
 * перед 6:00 и 12:00 — мини-волна мелких и торговец. После 12:00 — зона пройдена.
 */
export const ZONE = {
  bossAt: [180, 360, 540, 720],
  bossHp: [2600, 7000, 15000, 28000],
  waveAt: [312, 672],      // мини-волна перед торговцем
  merchantAt: [325, 685],
};

export class Zone {
  /** сколько боссов убито (0..4) — «стадия» зоны */
  stage = 0;
  boss: Enemy | null = null;
  private waves = 0;
  private merchants = 0;

  onBossKilled: ((idx: number, x: number, y: number) => void) | null = null;
  onMerchant: (() => void) | null = null;
  onMerchantGone: (() => void) | null = null;

  get bossFight() { return !!this.boss; }
  /** Таймер стоит во время боя с боссом */
  get timeFrozen() { return !!this.boss; }

  update() {
    const t = W.time;
    if (!this.boss && this.stage < ZONE.bossAt.length && t >= ZONE.bossAt[this.stage]) this.startBoss();
    if (this.waves < ZONE.waveAt.length && t >= ZONE.waveAt[this.waves]) { this.waves++; this.miniWave(); }
    if (this.merchants < ZONE.merchantAt.length && t >= ZONE.merchantAt[this.merchants]) { this.merchants++; this.onMerchant?.(); }
  }

  private startBoss() {
    const P = W.player, idx = this.stage;
    this.onMerchantGone?.();
    const type = ENEMY_TYPES['boss' + idx] ?? ENEMY_TYPES.boss0;
    // босс крупный (спрайт ~5 ед. оригинала) — появляется за верхним краем экрана (место — оценка)
    const b = W.enemies.spawn(type, P.x, P.y - 9.5 * ORIG_UNIT, false, ZONE.bossHp[idx]);
    if (!b) return;
    this.boss = b;
    // свиты-кольца в оригинале нет: во время босса просто идёт волна «마인/하울링» обычным спавнером
    // (Enemies.waveType/waveRate при bossFight — 30 мобов за 0.75 с и т.д.)
  }

  /** Вызывается из Enemies.kill */
  bossDied(e: Enemy) {
    if (e !== this.boss) return;
    this.boss = null;
    const idx = this.stage++;
    // поле усыпано кристаллами
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 230;
      W.orbs.drop(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, i % 6 ? 'm' : 'l');
    }
    W.orbs.drop(e.x + 12, e.y, 'life', 0);
    W.fx.burst(e.x, e.y, 160, 0xff3040, 0.7);
    this.onBossKilled?.(idx, e.x, e.y);
  }

  /** «Мини-босс»: толпа мелких мобов сходится к магу со всех сторон */
  private miniWave() {
    const P = W.player;
    const n = 70;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, d = 240 + Math.random() * 50;
      W.enemies.spawn(ENEMY_TYPES.small, P.x + Math.cos(a) * d, P.y + Math.sin(a) * d);
    }
  }
}
