// Глобальные константы баланса и экрана.
export const VIEW_W = 380;          // сколько игровых единиц видно по ширине экрана
export const MAX_DPR = 2;           // ограничение плотности пикселей (производительность)
export const MAX_ENEMIES = 480;
export const MAX_ORBS = 350;
export const GRID_CELL = 40;

export const PLAYER = {
  radius: 7,
  speed: 95,           // ≈ четверть ширины экрана в секунду, как в оригинале
  hp: 100,
  hurtCooldown: 0.35,
  pickupRadius: 38,
};

export const BASE_ATK = 10;

export const DEPTH = {
  ground: 0, zone: 1, orb: 2, enemy: 3, player: 4, projectile: 5, fx: 6, top: 7,
};

/** Сколько эссенции нужно для перехода с уровня lvl на lvl+1 */
export function xpForLevel(lvl: number): number {
  return Math.round(6 + lvl * 5 + lvl * lvl * 0.12);
}
