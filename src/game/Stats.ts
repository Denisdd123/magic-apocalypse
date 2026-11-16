import { BASE_ATK, PLAYER } from '../config';

/** Характеристики мага в текущем забеге. Все проценты — доли (0.1 = 10%). */
export class Stats {
  atkPct = 0;        // +% к силе
  amp = 0;           // приумножение атаки (отдельный множитель)
  tempAmp = 0;       // временное приумножение от Руны силы (пересчитывается каждый кадр)
  runeAmp = 0;       // приумножение от руны Ярости
  magicDmg = 0;      // +% урона всей магии
  cdr = 0;           // сокращение перезарядки (асимптотически)
  size = 0;
  duration = 0;
  crit = 0;
  critMult = 2;
  hpPct = 0;
  regen = 0;         // доля макс. HP в секунду
  dmgTaken = 0;      // снижение получаемого урона
  evasion = 0;       // шанс уклониться от удара
  speed = 0;
  runeSpeed = 0;     // ускорение от руны Ярости
  pickup = 0;
  runePickup = 0;    // радиус от руны Жадности
  xpGain = 0;
  lifeOrbHeal = 0;
  cdSpeedBonus = 0;  // временное ускорение перезарядки (Высвобождение)
  runeDur = 0;       // длительность рун
  chestRate = 0;     // частота сундуков
  revives = 0;       // воскрешения
  comboDmg = 0;      // +% урона слияний (Продвинутая магия)
  orbRate = 0;       // сферы маны чаще (Завод маны)
  shopDiscount = 0;  // скидка у торговца
  extraCardChance = 0; // шанс 4-й карточки, %
  /** Исследование «Поддержка» (278): стартовых кристаллов маны больше на долю (0.1…0.6) — AllyUnitVar_StartManaBallCreateNumRatio */
  startOrbs = 0;
  /** Исследование «Удача» (279): предметы на поле появляются чаще на долю — AllyUnitVar_FieldItemCreateRatio */
  fieldItemRate = 0;

  // по врагам
  enemyHpRed = 0;    // снижение макс. HP всех врагов
  eliteHpRed = 0;    // снижение HP элиток
  enemySlow = 0;     // замедление всех врагов
  highHpBonus = 0;   // доп. урон по врагам с HP > 75%

  // по заклинаниям (id заклинания -> бонус)
  spellDmg: Record<string, number> = {};
  spellCount: Record<string, number> = {};
  spellCdr: Record<string, number> = {};   // доп. сокращение перезарядки (усиление заклинания)
  enhanced: Record<string, number> = {};   // сколько раз заклинание усилено

  // ---- артефакты оригинала ----
  artifactCdr = 0;   // сокращение перезарядки артефактов (Шестерёнки, Стимпанк), доля
  /** Доп. шанс крита конкретного заклинания (Сюрикен), доля. todo: учесть в DataSpell/Enemies.damage */
  spellCrit: Record<string, number> = {};
  /** Параметры механик артефактов, которым нужен хук в чужом коде (урон/убийство/снаряды/UI).
   *  Ключ — ID эффекта оригинала (строкой, напр. '116' = крит при первом ударе) или имя; значение — число из таблицы.
   *  Список ключей и смысл — в Artifacts.ts (TODO_FX). Пока никем не читаются. */
  artFx: Record<string, number> = {};

  get atk() { return BASE_ATK * (1 + this.atkPct); }
  get maxHp() { return PLAYER.hp * (1 + this.hpPct); }
  get sizeMul() { return 1 + this.size; }
  get durMul() { return 1 + this.duration; }
  get cdMul() { return (1 - this.cdr) * (1 - this.cdSpeedBonus); }
  get moveSpeed() { return PLAYER.speed * (1 + this.speed + this.runeSpeed); }
  get pickupRadius() { return PLAYER.pickupRadius * (1 + this.pickup + this.runePickup); }

  /** Сокращение перезарядки с убывающей отдачей: каждое новое считается от оставшейся части */
  addCdr(x: number) { this.cdr = this.cdr + (1 - this.cdr) * x; }
  /** То же для снижения получаемого урона */
  addArmor(x: number) { this.dmgTaken = this.dmgTaken + (1 - this.dmgTaken) * x; }

  /** Множитель урона конкретного заклинания от артефактов */
  sd(id: string) { return 1 + (this.spellDmg[id] ?? 0); }
  /** Доп. количество для заклинания от артефактов */
  sc(id: string) { return this.spellCount[id] ?? 0; }
  addSpellDmg(id: string, v: number) { this.spellDmg[id] = (this.spellDmg[id] ?? 0) + v; }
  addSpellCount(id: string, v: number) { this.spellCount[id] = (this.spellCount[id] ?? 0) + v; }

  /** Урон заклинания: pct — множитель заклинания в процентах от силы */
  spellDamage(pct: number, spellMul = 1) {
    return this.atk * (pct / 100) * (1 + this.amp + this.tempAmp + this.runeAmp) * (1 + this.magicDmg) * spellMul;
  }
}
