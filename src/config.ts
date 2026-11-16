// Глобальные константы баланса и экрана.
export const VIEW_W = 380;          // сколько игровых единиц видно по ширине экрана iPhone 19.5:9 (= 6.69 ед. оригинала)
/**
 * 1 единица мира оригинала (Unity) = ORIG_U наших единиц (≈56.8).
 * Камера оригинала: orthographicSize = UnitApply_Vision = 7.25 → по высоте видно 14.5 ед. (на 19.5:9 — 6.69 ед. по ширине).
 * Спрайты оригинала — 100 px на 1 ед. (Sprite.m_PixelsToUnits), т.е. 1 px спрайта оригинала = 0.568 наших ед.
 */
export const ORIG_U = VIEW_W / 6.69;
/** Видимая высота мира (как в оригинале: 2 × orthographicSize = 14.5 ед.) — по ней подгоняется зум камеры */
export const VIEW_H = 14.5 * ORIG_U;
export const MAX_DPR = 2;           // ограничение плотности пикселей (производительность)
/** общий предел живых (пул обычных мобов оригинала 450 + элитки/боссы/проклятые) */
export const MAX_ENEMIES = 520;
export const MAX_ORBS = 350;
export const GRID_CELL = 40;

export const PLAYER = {
  radius: 7,
  /** оригинал: UnitAlly_MoveSpeed = 2.56 ед/с при «скорости 100» (V_JoyStickController.FixedUpdate: вектор × скорость × dt) */
  speed: 2.56 * (VIEW_W / 6.69),
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
