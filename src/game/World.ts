import type Phaser from 'phaser';
import type { Stats } from './Stats';
import type { Player } from './Player';
import type { Enemies } from './Enemies';
import type { Orbs } from './Orbs';
import type { Projectiles } from './Projectiles';
import type { Effects } from './Effects';
import type { SpellBook } from './SpellBook';

/** Общий контейнер состояния забега — чтобы системы видели друг друга без лишней передачи ссылок. */
export interface World {
  scene: Phaser.Scene;
  stats: Stats;
  player: Player;
  enemies: Enemies;
  orbs: Orbs;
  projectiles: Projectiles;
  fx: Effects;
  book: SpellBook;
  time: number;      // секунд с начала забега
  kills: number;
}

export const W = {} as World;
