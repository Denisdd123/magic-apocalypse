import { BASE_ATK, PLAYER } from '../config';

/** Характеристики мага в текущем забеге. Все проценты — доли (0.1 = 10%). */
export class Stats {
  atkPct = 0;        // +% к силе
  amp = 0;           // усиление (отдельный множитель)
  tempAmp = 0;       // временное усиление (Руна силы и т.п.), пересчитывается каждый кадр
  magicDmg = 0;      // +% урона всей магии
  cdr = 0;           // сокращение перезарядки (асимптотически)
  size = 0;
  duration = 0;
  crit = 0;
  critMult = 1.5;
  hpPct = 0;
  regen = 0;         // доля макс. HP в секунду
  dmgTaken = 0;      // снижение получаемого урона
  speed = 0;
  pickup = 0;
  xpGain = 0;
  lifeOrbHeal = 0;
  cdSpeedBonus = 0;  // временное ускорение перезарядки (Высвобождение)

  get atk() { return BASE_ATK * (1 + this.atkPct); }
  get maxHp() { return PLAYER.hp * (1 + this.hpPct); }
  get sizeMul() { return 1 + this.size; }
  get durMul() { return 1 + this.duration; }
  get cdMul() { return (1 - this.cdr) * (1 - this.cdSpeedBonus); }
  get moveSpeed() { return PLAYER.speed * (1 + this.speed); }
  get pickupRadius() { return PLAYER.pickupRadius * (1 + this.pickup); }

  /** Сокращение перезарядки с убывающей отдачей: каждое новое считается от оставшейся части */
  addCdr(x: number) { this.cdr = this.cdr + (1 - this.cdr) * x; }

  /** Урон заклинания: pct — множитель заклинания в процентах от силы */
  spellDamage(pct: number, spellMul = 1) {
    return this.atk * (pct / 100) * (1 + this.amp + this.tempAmp) * (1 + this.magicDmg) * spellMul;
  }
}
