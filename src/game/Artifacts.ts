import type { Stats } from './Stats';
import { areaDamage } from './Projectiles';
import { W } from './World';

export type Rarity = 'common' | 'rare' | 'epic' | 'legend';

export const RARITY: Record<Rarity, { name: string; color: string; weight: number }> = {
  common: { name: 'Обычный артефакт', color: '#d9dde6', weight: 60 },
  rare: { name: 'Редкий артефакт', color: '#4aa8ff', weight: 30 },
  epic: { name: 'Героический артефакт', color: '#c06bff', weight: 10 },
  legend: { name: 'Легендарный артефакт', color: '#ff9a2e', weight: 0 }, // только с обелиска после босса
};

export interface ArtifactDef {
  id: string;
  name: string;
  emoji: string;
  rarity: Rarity;
  text: string[];
  apply?(s: Stats): void;
  /** Периодический эффект: раз в period сек. */
  period?: number;
  onTick?(): void;
}

const A = (d: ArtifactDef) => d;

// Свои артефакты: те же категории эффектов, что в жанре, но свои названия.
export const ARTIFACTS: ArtifactDef[] = [
  // ---- обычные ----
  A({ id: 'bloodvial', name: 'Кровавый флакон', emoji: '🩸', rarity: 'common', text: ['Макс. здоровье +30%', 'Исцеление в сек +0.3%'], apply: (s) => { s.hpPct += 0.3; s.regen += 0.003; } }),
  A({ id: 'shadowcloak', name: 'Теневой плащ', emoji: '🧥', rarity: 'common', text: ['Уклонение +10%'], apply: (s) => { s.evasion += 0.1; } }),
  A({ id: 'powder', name: 'Порох', emoji: '🧨', rarity: 'common', text: ['Размер всех заклинаний +10%'], apply: (s) => { s.size += 0.1; } }),
  A({ id: 'bag', name: 'Сумка чародея', emoji: '👝', rarity: 'common', text: ['Радиус сбора предметов +50%'], apply: (s) => { s.pickup += 0.5; } }),
  A({ id: 'sample', name: 'Образец', emoji: '🧫', rarity: 'common', text: ['Макс. здоровье всех врагов -3%'], apply: (s) => { s.enemyHpRed += 0.03; } }),
  A({ id: 'ruby', name: 'Рубин', emoji: '🔴', rarity: 'common', text: ['Сила атаки +12%'], apply: (s) => { s.atkPct += 0.12; } }),
  A({ id: 'target', name: 'Мишень', emoji: '🎯', rarity: 'common', text: ['Шанс крит. удара +6%'], apply: (s) => { s.crit += 0.06; } }),
  A({ id: 'broom', name: 'Метла', emoji: '🧹', rarity: 'common', text: ['Скорость движения +10%'], apply: (s) => { s.speed += 0.1; } }),
  A({ id: 'mandrake', name: 'Мандрагора', emoji: '🌱', rarity: 'common', text: ['Исцеление от сфер жизни +50%'], apply: (s) => { s.lifeOrbHeal += 0.5; } }),
  A({ id: 'scroll', name: 'Магический свиток', emoji: '📜', rarity: 'common', text: ['Сила атаки +10%', 'Перезарядка всех заклинаний -3%'], apply: (s) => { s.atkPct += 0.1; s.addCdr(0.03); } }),
  A({ id: 'rainbow', name: 'Радуга', emoji: '🌈', rarity: 'common', text: ['Усиление крит. удара +30%'], apply: (s) => { s.critMult += 0.3; } }),
  A({ id: 'sapphire', name: 'Сапфир', emoji: '🔷', rarity: 'common', text: ['Получение маны +12%'], apply: (s) => { s.xpGain += 0.12; } }),
  A({ id: 'harp', name: 'Арфа', emoji: '🪕', rarity: 'common', text: ['Длительность всех заклинаний +12%'], apply: (s) => { s.duration += 0.12; } }),
  A({ id: 'grimoire', name: 'Гримуар', emoji: '📕', rarity: 'common', text: ['Перезарядка всех заклинаний -5%'], apply: (s) => s.addCdr(0.05) }),
  A({ id: 'torch', name: 'Факел', emoji: '🔥', rarity: 'common', text: ['Урон Пламенного ядра +25%'], apply: (s) => s.addSpellDmg('fireball', 0.25) }),

  // ---- редкие ----
  A({ id: 'virus', name: 'Вирус', emoji: '🦠', rarity: 'rare', text: ['Макс. здоровье элитных монстров -10%'], apply: (s) => { s.eliteHpRed += 0.1; } }),
  A({ id: 'hourglass', name: 'Песочные часы', emoji: '⏳', rarity: 'rare', text: ['Перезарядка всех заклинаний -6%'], apply: (s) => s.addCdr(0.06) }),
  A({ id: 'cross', name: 'Крест', emoji: '✝️', rarity: 'rare', text: ['Получаемый урон -12%', 'Исцеление в сек +0.3%'], apply: (s) => { s.addArmor(0.12); s.regen += 0.003; } }),
  A({ id: 'scale', name: 'Драконья чешуя', emoji: '🐉', rarity: 'rare', text: ['Получаемый урон -20%'], apply: (s) => s.addArmor(0.2) }),
  A({ id: 'cape', name: 'Плащ чар', emoji: '🦹', rarity: 'rare', text: ['Сила атаки +18%'], apply: (s) => { s.atkPct += 0.18; } }),
  A({ id: 'breeze', name: 'Бриз', emoji: '🍃', rarity: 'rare', text: ['Уклонение +8%', 'Скорость движения +8%'], apply: (s) => { s.evasion += 0.08; s.speed += 0.08; } }),
  A({ id: 'bomb', name: 'Бомба', emoji: '💣', rarity: 'rare', text: ['Сила атаки +8%', 'Размер всех заклинаний +8%'], apply: (s) => { s.atkPct += 0.08; s.size += 0.08; } }),
  A({ id: 'radar', name: 'Радар', emoji: '📡', rarity: 'rare', text: ['Шанс крит. удара +9%'], apply: (s) => { s.crit += 0.09; } }),
  A({ id: 'grail', name: 'Святой Грааль', emoji: '🏆', rarity: 'rare', text: ['Исцеление в сек +0.5%'], apply: (s) => { s.regen += 0.005; } }),
  A({ id: 'quiver', name: 'Звёздный колчан', emoji: '🏹', rarity: 'rare', text: ['Урон Звёздной иглы +30%', 'Число игл +1'], apply: (s) => { s.addSpellDmg('bolt', 0.3); s.addSpellCount('bolt', 1); } }),
  A({ id: 'firefly', name: 'Светлячок', emoji: '✨', rarity: 'rare', text: ['Число духов-стражей +2'], apply: (s) => s.addSpellCount('spirit', 2) }),
  A({ id: 'glassorb', name: 'Стеклянный шар', emoji: '🔮', rarity: 'rare', text: ['Число сфер в Кольце +2'], apply: (s) => s.addSpellCount('satellite', 2) }),
  A({ id: 'heartroot', name: 'Сердце земли', emoji: '🍖', rarity: 'rare', text: ['Каждые 30 сек. рядом появляется сфера жизни'], period: 30, onTick: () => { const P = W.player; W.orbs.drop(P.x + 30, P.y - 20, 'life', 0); } }),
  A({ id: 'mask', name: 'Маска маскарада', emoji: '🎭', rarity: 'rare', text: ['Шанс крит. удара +5%', 'Уклонение +5%'], apply: (s) => { s.crit += 0.05; s.evasion += 0.05; } }),
  A({ id: 'stainedglass', name: 'Витраж', emoji: '🪟', rarity: 'rare', text: ['Длительность рун +25%'], apply: (s) => { s.runeDur += 0.25; } }),

  // ---- героические ----
  A({ id: 'diamond', name: 'Алмаз', emoji: '💎', rarity: 'epic', text: ['Сила атаки +10%', 'Макс. здоровье +20%', 'Перезарядка -3%'], apply: (s) => { s.atkPct += 0.1; s.hpPct += 0.2; s.addCdr(0.03); } }),
  A({ id: 'guillotine', name: 'Гильотина', emoji: '🪓', rarity: 'epic', text: ['+15% урона по врагам, у которых больше 75% здоровья'], apply: (s) => { s.highHpBonus += 0.15; } }),
  A({ id: 'manaore', name: 'Руда маны', emoji: '🪨', rarity: 'epic', text: ['Сила атаки +25%'], apply: (s) => { s.atkPct += 0.25; } }),
  A({ id: 'gravity', name: 'Гравитационная сфера', emoji: '🌑', rarity: 'epic', text: ['Каждые 20 сек. отталкивает врагов рядом'], period: 20, onTick: () => { const P = W.player; areaDamage(P.x, P.y, 110, 1, 380); W.fx.burst(P.x, P.y, 110, 0x9b7bff, 0.45, 'ring'); } }),
  A({ id: 'clockwork', name: 'Часовой механизм', emoji: '⚙️', rarity: 'epic', text: ['Каждые 18 сек. останавливает врагов рядом на 2 сек.'], period: 18, onTick: () => { const P = W.player; W.enemies.grid.query(P.x, P.y, 140, (e) => { e.stunT = Math.max(e.stunT, 2); }); W.fx.burst(P.x, P.y, 140, 0xffe08a, 0.5, 'ring'); } }),
  A({ id: 'web', name: 'Паутина', emoji: '🕸️', rarity: 'epic', text: ['Скорость всех врагов -10%'], apply: (s) => { s.enemySlow += 0.1; } }),
  A({ id: 'secondheart', name: 'Второе сердце', emoji: '❤️‍🔥', rarity: 'epic', text: ['Воскрешение +1', 'Макс. здоровье +50%'], apply: (s) => { s.revives += 1; s.hpPct += 0.5; } }),
  A({ id: 'aegis', name: 'Эгида', emoji: '🛡️', rarity: 'epic', text: ['Получаемый урон -10%', 'Приумножение атаки +10%'], apply: (s) => { s.addArmor(0.1); s.amp += 0.1; } }),
  A({ id: 'cauldron', name: 'Котёл', emoji: '🫕', rarity: 'epic', text: ['Урон Пламенного ядра +50%'], apply: (s) => s.addSpellDmg('fireball', 0.5) }),
  A({ id: 'magnet', name: 'Электромагнит', emoji: '🧲', rarity: 'epic', text: ['Урон Кольца сфер +50%'], apply: (s) => s.addSpellDmg('satellite', 0.5) }),
  A({ id: 'wand', name: 'Волшебная палочка', emoji: '🪄', rarity: 'epic', text: ['Число духов-стражей +2', 'Урон духов +30%'], apply: (s) => { s.addSpellCount('spirit', 2); s.addSpellDmg('spirit', 0.3); } }),
  A({ id: 'blackcat', name: 'Чёрная кошка', emoji: '🐈‍⬛', rarity: 'epic', text: ['Перезарядка всех заклинаний -9%'], apply: (s) => s.addCdr(0.09) }),
  // ---- легендарные (обелиск после босса) ----
  A({ id: 'abysscrown', name: 'Корона бездны', emoji: '👑', rarity: 'legend', text: ['Сила атаки +40%', 'Приумножение атаки +10%'], apply: (s) => { s.atkPct += 0.4; s.amp += 0.1; } }),
  A({ id: 'sandheart', name: 'Песочное сердце', emoji: '⌛', rarity: 'legend', text: ['Перезарядка всех заклинаний -15%', 'Длительность всех заклинаний +20%'], apply: (s) => { s.addCdr(0.15); s.duration += 0.2; } }),
  A({ id: 'stormeye', name: 'Око бури', emoji: '🌩️', rarity: 'legend', text: ['Каждые 5 сек. молнии бьют 6 случайных врагов (300% силы)'], period: 5, onTick: () => {
    for (let i = 0; i < 6; i++) { const e = W.enemies.randomVisible(); if (!e) break; areaDamage(e.x, e.y, 26, W.stats.spellDamage(300), 0, 'Око бури'); W.fx.burst(e.x, e.y, 26, 0xbfe8ff, 0.25); }
  } }),
  A({ id: 'phoenix', name: 'Перо феникса', emoji: '🪶', rarity: 'legend', text: ['Воскрешение +1', 'Макс. здоровье +50%'], apply: (s) => { s.revives += 1; s.hpPct += 0.5; } }),
  A({ id: 'prism', name: 'Призма', emoji: '🔺', rarity: 'legend', text: ['Размер всех заклинаний +25%', 'Шанс крит. удара +10%'], apply: (s) => { s.size += 0.25; s.crit += 0.1; } }),
  A({ id: 'stardust', name: 'Звёздная пыль', emoji: '🌌', rarity: 'legend', text: ['Получение маны +30%', 'Радиус сбора предметов +60%'], apply: (s) => { s.xpGain += 0.3; s.pickup += 0.6; } }),
  A({ id: 'blacksun', name: 'Чёрное солнце', emoji: '🌑', rarity: 'legend', text: ['Каждые 8 сек. волна вокруг мага (400% силы)'], period: 8, onTick: () => { const P = W.player; areaDamage(P.x, P.y, 150, W.stats.spellDamage(400), 300, 'Чёрное солнце'); W.fx.burst(P.x, P.y, 150, 0xff9a2e, 0.5, 'ring'); } }),
  A({ id: 'perpetuum', name: 'Вечный двигатель', emoji: '♾️', rarity: 'legend', text: ['Скорость движения +20%', 'Уклонение +12%', 'Исцеление в сек +0.5%'], apply: (s) => { s.speed += 0.2; s.evasion += 0.12; s.regen += 0.005; } }),
  A({ id: 'chaosdice', name: 'Кости хаоса', emoji: '🎲', rarity: 'legend', text: ['Шанс крит. удара +12%', 'Усиление крит. удара +60%'], apply: (s) => { s.crit += 0.12; s.critMult += 0.6; } }),
  A({ id: 'freeshot', name: 'Вольный стрелок', emoji: '🌠', rarity: 'epic', text: ['Урон Звёздной иглы +100%'], apply: (s) => s.addSpellDmg('bolt', 1) }),
];

export interface SynergyDef {
  id: string; name: string; emoji: string;
  parts: string[];
  text: string[];
  apply(s: Stats): void;
}

// Синергии — «комбинации предметов»: собрал все части — получил бонус.
export const SYNERGIES: SynergyDef[] = [
  { id: 'plague', name: 'Мор', emoji: '☠️', parts: ['sample', 'virus', 'web'], text: ['Макс. здоровье всех врагов ещё -10%'], apply: (s) => { s.enemyHpRed += 0.1; } },
  { id: 'clockmaker', name: 'Часовщик', emoji: '🕰️', parts: ['hourglass', 'clockwork', 'grimoire'], text: ['Перезарядка -8%', 'Длительность заклинаний +12%'], apply: (s) => { s.addCdr(0.08); s.duration += 0.12; } },
  { id: 'dragonblood', name: 'Кровь дракона', emoji: '🐲', parts: ['scale', 'manaore', 'ruby'], text: ['Сила атаки +25%', 'Приумножение атаки +15%'], apply: (s) => { s.atkPct += 0.25; s.amp += 0.15; } },
  { id: 'hunter', name: 'Охотник', emoji: '🏹', parts: ['target', 'radar', 'rainbow'], text: ['Шанс крит. удара +7%', 'Усиление крит. удара +40%'], apply: (s) => { s.crit += 0.07; s.critMult += 0.4; } },
  { id: 'wanderer', name: 'Странник', emoji: '🥾', parts: ['broom', 'breeze', 'shadowcloak'], text: ['Скорость движения +10%', 'Уклонение +10%'], apply: (s) => { s.speed += 0.1; s.evasion += 0.1; } },
  { id: 'healer', name: 'Целитель', emoji: '🌿', parts: ['bloodvial', 'mandrake', 'grail', 'heartroot'], text: ['Макс. здоровье +50%', 'Исцеление в сек +0.5%'], apply: (s) => { s.hpPct += 0.5; s.regen += 0.005; } },
  { id: 'spiritlord', name: 'Повелитель духов', emoji: '👻', parts: ['firefly', 'wand', 'quiver'], text: ['Урон духов-стражей и Звёздной иглы +50%'], apply: (s) => { s.addSpellDmg('spirit', 0.5); s.addSpellDmg('bolt', 0.5); } },
  { id: 'treasury', name: 'Сокровищница', emoji: '💰', parts: ['bag', 'sapphire', 'diamond'], text: ['Сундуки появляются на 30% чаще', 'Получение маны +15%'], apply: (s) => { s.chestRate += 0.3; s.xpGain += 0.15; } },
  { id: 'fortress', name: 'Крепость', emoji: '🏰', parts: ['cross', 'aegis', 'secondheart'], text: ['Получаемый урон -15%', 'Воскрешение +1'], apply: (s) => { s.addArmor(0.15); s.revives += 1; } },
  { id: 'pyro', name: 'Пиромант', emoji: '🌋', parts: ['torch', 'cauldron', 'powder', 'bomb'], text: ['Урон Пламенного ядра +60%', 'Размер заклинаний +10%'], apply: (s) => { s.addSpellDmg('fireball', 0.6); s.size += 0.1; } },
];

export const artifactById = (id: string) => ARTIFACTS.find((a) => a.id === id)!;
export const synergiesOf = (id: string) => SYNERGIES.filter((s) => s.parts.includes(id));

/** Артефакты и синергии текущего забега */
export class ArtifactSet {
  owned: string[] = [];
  synergies = new Set<string>();
  private timers = new Map<string, number>();
  onSynergy: ((s: SynergyDef) => void) | null = null;

  has(id: string) { return this.owned.includes(id); }

  add(id: string) {
    if (this.has(id)) return;
    const def = artifactById(id);
    this.owned.push(id);
    const hpBefore = W.stats.maxHp;
    def.apply?.(W.stats);
    if (def.period) this.timers.set(id, def.period);
    for (const syn of SYNERGIES) {
      if (!this.synergies.has(syn.id) && syn.parts.every((p) => this.has(p))) {
        this.synergies.add(syn.id);
        syn.apply(W.stats);
        this.onSynergy?.(syn);
      }
    }
    // новые HP сразу добавляются к текущему здоровью; заклинания пересчитывают число снарядов
    W.player.heal(Math.max(0, W.stats.maxHp - hpBefore));
    for (const sp of W.book.spells.values()) sp.onChange();
  }

  /** 3 случайных разных артефакта, которых ещё нет; редкость по весам */
  roll(n = 3): ArtifactDef[] {
    const pool = ARTIFACTS.filter((a) => !this.has(a.id) && a.rarity !== 'legend');
    const out: ArtifactDef[] = [];
    while (out.length < n && pool.length) {
      // с небольшим шансом подсовываем недостающую часть начатой синергии
      let pick: ArtifactDef | undefined;
      if (Math.random() < 0.25) {
        const want = SYNERGIES.filter((s) => !this.synergies.has(s.id) && s.parts.some((p) => this.has(p)))
          .flatMap((s) => s.parts).filter((p) => pool.some((a) => a.id === p));
        if (want.length) pick = pool.find((a) => a.id === want[(Math.random() * want.length) | 0]);
      }
      if (!pick) {
        const total = pool.reduce((t, a) => t + RARITY[a.rarity].weight, 0);
        let r = Math.random() * total;
        pick = pool.find((a) => (r -= RARITY[a.rarity].weight) <= 0) ?? pool[pool.length - 1];
      }
      out.push(pick);
      pool.splice(pool.indexOf(pick), 1);
    }
    return out;
  }

  /** n случайных легендарных артефактов (обелиск) */
  rollLegend(n = 3): ArtifactDef[] {
    const pool = ARTIFACTS.filter((a) => a.rarity === 'legend' && !this.has(a.id));
    const out: ArtifactDef[] = [];
    while (out.length < n && pool.length) out.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
    return out;
  }

  update(dt: number) {
    for (const [id, t] of this.timers) {
      const nt = t - dt;
      if (nt <= 0) {
        const def = artifactById(id);
        def.onTick?.();
        this.timers.set(id, nt + (def.period ?? 30));
      } else this.timers.set(id, nt);
    }
  }
}
