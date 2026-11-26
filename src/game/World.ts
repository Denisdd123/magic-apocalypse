import type Phaser from 'phaser';
import type { Stats } from './Stats';
import type { Player } from './Player';
import type { Enemies } from './Enemies';
import type { Orbs } from './Orbs';
import type { Projectiles } from './Projectiles';
import type { Effects } from './Effects';
import type { SpellBook } from './SpellBook';
import type { ArtifactSet } from './Artifacts';
import type { Pickups } from './Pickups';
import type { Zone } from './Zone';
import type { Waves } from './Waves';

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
  artifacts: ArtifactSet;
  pickups: Pickups;
  zone: Zone;
  /** EnemyLevelUp: волны, рост мобов, зачистки */
  waves: Waves;
  time: number;      // секунд с начала забега
  kills: number;
  mana: number;      // кошелёк маны (собранные кристаллы минус покупки у торговца)
  dmgBy: Map<string, number>; // урон по заклинаниям (история боя)
}

export const W = {} as World;
