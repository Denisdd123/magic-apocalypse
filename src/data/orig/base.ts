// АВТОГЕНЕРАЦИЯ — не править руками. Генератор: docs/orig/tools/gen_orig_ts.py
// C_Battle_AllyUnit.StartInformation_A — balance.md §9

/** UnitBase_* мага */
export const MAGE_BASE = {"attack":100,"criRan":3,"criMultiplier":200,"attackPowerRatio":0,"hpMax":200,"hitDamageRatio":1,"hpRegen":0,"evasion":0,"moveSpeed":80,"size":1,"itemObtainArea":1,"vision":7.25} as const;
/** ед./с = round(80 * бонусы) * 0.032; без бонусов 2.56 */
export const MAGE_MOVE_K = 0.032 as const;
/** UnitBase_<Заклинание>*; Damage — множитель атаки мага, PSpeed — перезарядка в секундах. Ключ = id заклинания. */
export const SPELL_BASE = {
  1: {"Damage":5,"Num":1,"ShotNum":1,"PSpeed":0.75,"DSpeed":0.2,"Size":100,"MSpeed":145,"Pierce":0,"TargetNum":1}, // Магическая пуля
  2: {"Damage":7,"Pierce":0,"Num":1,"Area":100,"Size":100,"MSpeed":80,"PSpeed":1.5,"SubNum":0}, // Огненный шар
  3: {"Damage":6.5,"Num":0,"BulletSize":100,"BulletMSpeed":180,"PSpeed":0.9,"DSpeed":0.135}, // Дух
  4: {"Damage":4.5,"Num":0,"Speed":0.03,"Size":92}, // Спутник
  5: {"Damage":12,"Time":0.8,"Area":100,"PSpeed":5.5,"FreezeTime":1}, // Ледяные иглы
  6: {"MaxNum":2,"PSpeed":33,"ProductNum":1,"DTime":20}, // Щит
  7: {"Damage":15,"Num":1,"Area":100,"PSpeed":2,"DSpeed":0.12}, // Молния
  8: {"Damage":1.25,"Area":100,"ADelay":0.25}, // Область электротока
  9: {"Damage":7,"Num":8,"Size":100,"PSpeed":8.5,"FlowSpeed":100}, // Цунами
  10: {"Damage":15,"Num":1,"Area":100,"PSpeed":4.5}, // Метеорит
  11: {"Time":2,"Speed":15,"PSpeed":45}, // Маскировка
  12: {"Damage":5,"Num":1,"Time":2,"Size":100,"SizeExpand":0.0075,"ADelay":0.3,"MoveSpeed":30,"PSpeed":3.5,"Delay":0.35}, // Вихрь
  13: {"Damage":5,"AttackNum":1,"Num":2,"Size":100,"PSpeed":2}, // Электрический удар
  14: {"Delay":0.33,"PSpeed":100}, // Армагеддон
  15: {"Damage":5,"FireNum":15,"ASpeed":0.07,"Size":100,"PSpeed":4,"BSpeed":62}, // Испепеление
  16: {"Damage":7.5,"Size":100,"FireNum":5,"Time":0.6,"MSpeed":110,"PSpeed":3.3,"ADelay":0.1,"DSpeed":0.07}, // Энергетическая пуля
  17: {"Damage":7,"Num":20,"ASpeed":0.083,"Area":100,"PSpeed":6}, // Метель
  18: {"Damage":9,"Num":1,"Time":0.8,"Size":50,"Speed":0,"PSpeed":3.5,"ASpeed":0.2}, // Таинственный луч
  19: {"EffectNum":25,"Time":5,"PSpeed":20,"ManaBallCreateNum":0}, // Магический круг
  20: {"Damage":10,"Num":1,"Time":6,"Size":100,"PSpeed":5}, // Лавовая область
  21: {"Damage":18,"Num":1,"Size":100,"PSpeed":10}, // Световая вспышка
} as const;
