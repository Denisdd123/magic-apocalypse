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

/** Опыт на уровень — таблица оригинала (Dictionary_AllStat, «마나 요구량»): с уровня lvl на lvl+1 */
const XP_TABLE = [100,136,173,212,252,294,337,383,430,481,534,590,650,713,781,853,931,1015,1104,1201,1306,1420,1543,1678,1824,1984,2158,2349,2558,2994,3268,3570,3903,4269,4673,5118,5610,6153,6753,7417,8150,8962,9860,10854,11954,13173,14524,16020,17678,21178,23398,25859,28588,31615,34972,38695,42826,47407,52490,58130,64387,71329,79033,87581,97067,107593,119275,132238,146625,202809];
export function xpForLevel(lvl: number): number {
  const i = Math.max(0, lvl - 1);
  return i < XP_TABLE.length ? XP_TABLE[i] : Math.round(XP_TABLE[XP_TABLE.length - 1] * 1.11 ** (i - XP_TABLE.length + 1));
}

/** Как в оригинале (C_Battle_EnemyUnit.Play_Unit_Death / C_Battle_Item.Obtain_Item) */
export const LOOT = {
  /** сфера маны падает за каждые N убийств (BaseManaBallDropKillCondition) */
  orbEveryKills: 20,
  /** шанс, что сфера малая, иначе средняя (Random 1..110 <= SRan=98) */
  smallOrbChance: 98 / 110,
  /** сундук, когда убийств за забег столько (AllStat «상자 드랍 처치수»), дальше +50 000 */
  chestKills: [1000, 12000, 26000, 45000, 70000, 100000, 135000, 175000, 220000, 270000],
};
