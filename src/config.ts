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
export const MAX_ENEMIES = 560; // пулы 450 обычных + 80 элиток + 15 эпиков + 15 боссов
export const MAX_ORBS = 350;
export const GRID_CELL = 40;

export const PLAYER = {
  radius: 7,
  /** оригинал: UnitAlly_MoveSpeed = 2.56 ед/с при «скорости 100» (V_JoyStickController.FixedUpdate: вектор × скорость × dt) */
  speed: 2.56 * (VIEW_W / 6.69),
  /** UnitBase_HpMax */
  hp: 200,
  hurtCooldown: 0.35,
  pickupRadius: 38,
};

/** UnitBase_Attack мага (C_Battle_AllyUnit.StartInformation_A) — урон заклинания = база × Attack, без масштабов */
export const BASE_ATK = 100;

export const DEPTH = {
  ground: 0, zone: 1, orb: 2, enemy: 3, player: 4, projectile: 5, fx: 6, top: 7,
};

/** Global_LevelMax = 100 (Z_Database.ResetInformation @0x114c4f8). Мана на уровень — MANA_COST (data/orig). */
export const LEVEL_MAX = 100;

/** Как в оригинале (C_Battle_EnemyUnit.Play_Unit_Death / C_Battle_Item.Obtain_Item) */
export const LOOT = {
  /** шанс, что сфера малая, иначе средняя (Random 1..110 <= SRan=98) */
  smallOrbChance: 98 / 110,
  /** сундук, когда убийств за забег столько (AllStat «상자 드랍 처치수»), дальше +50 000 */
  chestKills: [1000, 12000, 26000, 45000, 70000, 100000, 135000, 175000, 220000, 270000],
};
