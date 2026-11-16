import type { Stats } from './Stats';
import { areaDamage } from './Projectiles';
import { W } from './World';
import type { RuneType } from './Pickups';
import { ALL_SPELLS } from './spells/registry';
import { DMG_SCALE } from './spells/DataSpell';
import { ART_DATA, SYN_DATA, type ArtData, type SynData } from '../data/artifacts_data';

// Артефакты и синергии оригинала (182 + 63). Числа и тексты — из таблиц (src/data/artifacts_data.ts, генерируется),
// здесь — толкование ID эффектов и механика. Что требует хука в чужом коде — помечено todo (см. TODO_ART / TODO_SYN).

export type Rarity = 'common' | 'rare' | 'epic' | 'special' | 'legend';

/** weight — шанс выбрать эту редкость в сундуке (внутри редкости все равновероятны, как в оригинале: каждый артефакт по 5 копий).
 *  Настоящие проценты (List_ArtifactDrop) в коде не досчитаны — ОЦЕНКА. price — база цены у торговца (из кода оригинала). */
export const RARITY: Record<Rarity, { name: string; color: string; weight: number; price: number }> = {
  common: { name: 'Обычный артефакт', color: '#d9dde6', weight: 34, price: 220 },
  rare: { name: 'Редкий артефакт', color: '#4aa8ff', weight: 30, price: 260 },
  epic: { name: 'Героический артефакт', color: '#c06bff', weight: 26, price: 360 },
  special: { name: 'Особый артефакт', color: '#3ee08f', weight: 10, price: 520 },
  legend: { name: 'Легендарный артефакт', color: '#ff9a2e', weight: 0, price: 0 }, // только с обелиска после босса
};

export interface ArtifactDef {
  id: string;
  /** номер в таблице оригинала (41–222) */
  num: number;
  name: string;
  en: string;
  /** устарело, UI переходит на icon */
  emoji: string;
  /** ключ текстуры/картинки: public/v2/artifacts/<icon>.webp */
  icon: string;
  rarity: Rarity;
  text: string[];
  apply?(s: Stats): void;
  /** Периодический эффект: раз в period сек. (сокращается artifactCdr) */
  period?: number;
  onTick?(): void;
  /** Разовый эффект при получении */
  onGet?(): void;
  /** что из механики не реализовано (нужен хук в чужом коде) */
  todo?: string;
}

export interface SynergyDef {
  id: string; num: number; name: string; en: string;
  emoji: string;
  /** ключ картинки: public/v2/synergies/<icon>.webp */
  icon: string;
  parts: string[];
  text: string[];
  apply(s: Stats): void;
  todo?: string;
}

// ---------------- толкование ID эффектов ----------------
type SpellOp = 'dmg' | 'count' | 'cd' | 'crit' | 'countPct';
/** ID эффекта → [заклинание, что меняет] (ID = номер свойства заклинания в таблице Ability) */
const SPELL_EFF: Record<number, [string, SpellOp]> = {
  151: ['bolt', 'dmg'], 153: ['bolt', 'count'], 158: ['bolt', 'cd'], 170: ['bolt', 'crit'],
  181: ['fireball', 'dmg'], 184: ['fireball', 'count'], 194: ['fireball', 'cd'],
  211: ['thunder', 'dmg'], 214: ['thunder', 'countPct'], 219: ['thunder', 'cd'],
  251: ['tsunami', 'dmg'], 259: ['tsunami', 'cd'],
  271: ['spirit', 'dmg'], 273: ['spirit', 'count'], 281: ['spirit', 'cd'], 287: ['spirit', 'crit'],
  291: ['ezone', 'dmg'],
  306: ['satellite', 'dmg'], 308: ['satellite', 'count'],
  321: ['meteor', 'dmg'], 323: ['meteor', 'count'], 327: ['meteor', 'cd'],
  371: ['frostnova', 'dmg'], 378: ['frostnova', 'cd'],
  391: ['cyclone', 'dmg'], 406: ['cyclone', 'cd'],
  421: ['eshock', 'dmg'], 424: ['eshock', 'count'], 431: ['eshock', 'cd'],
  461: ['incinerate', 'dmg'], 463: ['incinerate', 'count'], 472: ['incinerate', 'cd'],
  481: ['ebolt', 'dmg'], 485: ['ebolt', 'count'], 486: ['ebolt', 'countPct'],
  511: ['blizzard', 'dmg'], 514: ['blizzard', 'countPct'], 519: ['blizzard', 'cd'],
  531: ['ray', 'dmg'], 533: ['ray', 'count'], 542: ['ray', 'cd'],
  566: ['mcircle', 'cd'],
  581: ['lava', 'dmg'], 583: ['lava', 'count'], 590: ['lava', 'cd'],
  601: ['flash', 'dmg'], 609: ['flash', 'cd'],
};

/** Статовая часть эффекта. Всё, что не стат и не обрабатывается в ArtifactSet, кладётся в s.artFx[ID] (для будущих хуков). */
function applyEff(s: Stats, id: number, v: number) {
  const sp = SPELL_EFF[id];
  if (sp) {
    const [k, op] = sp;
    if (op === 'dmg') s.addSpellDmg(k, v / 100);
    else if (op === 'count') s.addSpellCount(k, v);
    else if (op === 'cd') s.spellCdr[k] = (s.spellCdr[k] ?? 0) + v / 100;
    else if (op === 'crit') s.spellCrit[k] = (s.spellCrit[k] ?? 0) + v / 100;
    else s.artFx['countPct:' + k] = (s.artFx['countPct:' + k] ?? 0) + v / 100; // применяет ArtifactSet через spellCount
    return;
  }
  switch (id) {
    case 4: s.atkPct += v / 100; break;
    case 6: s.addCdr(v / 100); break;
    case 8: s.size += v / 100; break;
    case 9: s.size -= v / 100; break;          // Плазма: размер −20%
    case 10: s.duration += v / 100; break;
    case 14: s.crit += v / 100; break;
    case 15: s.critMult += v / 100; break;
    case 16: s.amp += v / 100; break;
    case 17: s.magicDmg += v / 100; break;
    case 20: s.hpPct += v / 100; break;
    case 21: s.hpPct -= v / 100; break;        // Нежить: здоровье −25%
    case 23: s.addArmor(v / 100); break;
    case 24: s.regen += v / 10000; break;      // 30 → 0,3%/с
    case 25: s.evasion += v / 100; break;
    case 26: s.shopDiscount += -v / 100; break;
    case 30: s.speed += v / 100; break;
    case 36: s.lifeOrbHeal += v / 100; break;
    case 38: s.xpGain += v / 100; break;
    case 40: s.pickup += v / 100; break;
    case 49: s.revives += v; break;
    case 54: s.enemyHpRed += -v / 100; break;
    case 55: s.enemySlow += -v / 100; break;
    case 58: s.extraCardChance += v; break;
    case 76: s.amp += v / 100; break;          // Сердце дракона «×1,3» — как +30% приумножения
    case 90: s.comboDmg += v / 100; break;
    case 93: s.highHpBonus += v / 100; break;
    case 110: s.artifactCdr += -v / 100; break;
    case 135: s.runeDur += v / 100; break;
    case 143: s.eliteHpRed += -v / 100; break;
    default:
      if (id >= 700 && id <= 724) return; // служебные: 704 предел, 706 перезарядка, 708 % взрыва, 717/724 подписи
      s.artFx[id] = (s.artFx[id] ?? 0) + v;
  }
}

/** Что не реализовано (нужен хук в Enemies.damage / kill / Orbs / SpellBook / UI) */
const TODO_ART: Record<number, string> = {
  57: 'КД вдвое после 5-го применения (хук в Spell.ready)',
  60: 'крит при первом ударе (Enemies.damage)',
  70: 'каждый 5-й удар — крит (Enemies.damage)',
  74: 'казнь врагов <20% HP (Enemies.damage)',
  80: 'замедление −10% при первой заморозке (Enemies.freeze)',
  87: 'после 444 сфер маны враги рядом исчезают (Orbs)',
  88: 'HP крупных монстров −15% (Enemies.spawn)',
  92: 'мана от крупиц +10% (Orbs; отдельно от убийств)',
  95: 'время быстрее на 24%, золото +24%',
  96: 'перевыбор артефактов сундука 3 раза (ui/chest)',
  98: 'мгновенная смерть 8% при первом ударе (Enemies.damage)',
  100: 'взрыв при подборе сферы жизни (Orbs)',
  101: 'взрыв 15% при убийстве (Enemies.kill)',
  102: 'Гидра: −1% текущего HP за удар, до 25 раз (Enemies.damage)',
  106: 'излишек лечения сферой → доп. здоровье (Orbs/Player)',
  107: 'размер персонажа −25% (Player)',
  110: 'проход сквозь врагов (Enemies контакт)',
  113: 'взрыв при каждом ударе спутника (Satellite)',
  116: 'малые сферы маны → средние (Orbs)',
  117: 'макс. уровень +5 (уровень +5 сделан)',
  120: 'экран не краснеет при низком HP (косметика UI)',
  122: 'уровень и макс. уровень обычных пассивок +1 (SpellBook)',
  123: '+20% урона при не-крите (Enemies.damage)',
  129: 'каждый 4-й метеорит ×1,5 (Meteor)',
  130: 'интервал урона области электротока −15% (EZone; s.artFx[296])',
  131: 'энергопуля делится на 2 с шансом 22% (EBolt)',
  138: 'прямое попадание огн. шара +50%, пробивание +1 (Fireball)',
  140: 'доп. метеорит с шансом 20% (Meteor)',
  141: 'каждый 6-й вихрь ×2 урон и размер (Cyclone)',
  144: 'испепеление: +1% урона за удар по цели (Incinerate)',
  146: 'цунами: +12% урона и −12% КД за запуск, сброс после 4 (Tsunami)',
  147: 'спутник: +0,5% урона по той же цели, до 50% (Satellite)',
  148: 'лавовая область растёт на 2%/с (Lava)',
  152: 'обзор +10% (камера)',
  154: '+15% урона по врагам, живущим >5 с (Enemies.damage)',
  155: 'возврат маны всегда 100%, но на 1 раз меньше (SpellBook.refund)',
  158: 'Джокер: двойной крит с половинным шансом (Enemies.damage)',
  160: '+1% приумножения за сферу маны, сброс каждые 5 с (Orbs)',
  162: 'размер элиток −15% (Enemies.spawn)',
  168: 'слияний +1, макс. уровень +1 (SpellBook)',
  172: 'мана за убийство +20% (Enemies.kill)',
  179: 'эффект очарования ×2 (SpellBook.enchant)',
  187: 'HP волны босса −10%, обычной волны +10% (Zone)',
  190: 'взрыв и 10 предметов при подборе сундука (Pickups)',
  193: 'после 100 убийств следующие 50 погибают от удара (Enemies.damage)',
  196: 'до +50% урона по потерянному HP цели (Enemies.damage)',
  197: 'аура +25% урона вокруг мага (Enemies.damage)',
  206: 'мана от крупиц +20% (Orbs)',
  210: 'крит пули/духов +15% — записан в s.spellCrit, нужен учёт в уроне',
  211: 'взрыв при убийстве элитки (Enemies.kill); приумножение +30% сделано',
  219: 'особая пассивка в выборе (SpellBook)',
  73: 'плод мирового древа — упрощён до 3 сфер жизни',
  83: 'вместо настоящих вихря/метеорита/цунами — взрыв 500% по врагу',
  202: 'выбор заклинания без окна: берётся атакующее с наибольшим уровнем',
  218: 'количество маны — оценка (300)',
  222: 'количество маны — оценка (1000)',
};

const TODO_SYN: Record<number, string> = {
  1: 'порог казни Магического меча 25%', 2: 'больший взрыв Железной девы', 5: 'Экскалибур ×1,5 и шире',
  6: 'пассивки +25%', 8: 'каждое 5-е применение +50% урона', 9: 'взрыв при казни Косой',
  11: 'крит Клевера включает Джокер', 20: 'молнии Копья объединяются', 26: 'размер врагов и мага −9%',
  30: 'предел доп. уровня +10', 32: '+15% урона по волне босса', 34: 'воскрешение с шансом 30%',
  35: 'товар со скидкой бесплатный', 36: 'Реквием', 37: 'Клеймо ×2', 38: 'Медуза',
  41: 'доп. здоровье даёт реген', 45: 'большая сфера маны с обычных врагов',
};

const GRADE: Rarity[] = ['common', 'common', 'rare', 'epic', 'special', 'legend'];
const P_RUNES: RuneType[] = ['invuln', 'fury', 'greed', 'timestop', 'cleanse'];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
function around(minR: number, maxR: number) {
  const a = Math.random() * Math.PI * 2, d = rnd(minR, maxR), P = W.player;
  return { x: P.x + Math.cos(a) * d, y: P.y + Math.sin(a) * d };
}
/** урон в % ATK оригинала */
const origDmg = (pct: number) => W.stats.spellDamage(pct * DMG_SCALE);

function learnRandomSpells(n: number) {
  const pool = ALL_SPELLS.filter((d) => !W.book.spells.has(d.id) && !W.book.consumed.has(d.id));
  for (let i = 0; i < n && pool.length; i++) W.book.add(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
}
function addLevels(n: number) { W.player.level += n; W.player.pendingLevels += n; }
function spawnChests(n: number, minR: number, maxR: number) { for (let i = 0; i < n; i++) { const p = around(minR, maxR); W.pickups.chest(p.x, p.y); } }

/** Периодические эффекты (перезарядка — из таблицы, ID 706) */
const TICK: Record<number, () => void> = {
  47: () => { const p = around(20, 40); W.orbs.drop(p.x, p.y, 'life', 0); },                 // Мясо
  50: () => { W.artifacts.desperadoT = 8; },                                                 // Десперадо
  72: () => {                                                                               // Сфера тяжести
    const P = W.player, R = W.artifacts.synNum(29) ? 260 : 150;
    W.enemies.grid.query(P.x, P.y, R, (e) => W.enemies.slow(e, 0.5, 3));
    W.fx.burst(P.x, P.y, R, 0x9b7bff, 0.5, 'ring');
  },
  73: () => { for (let i = 0; i < 3; i++) { const p = around(20, 50); W.orbs.drop(p.x, p.y, 'life', 0); } }, // Лист мирового древа
  83: () => {                                                                               // Ящик Пандоры
    const e = W.enemies.randomVisible(); if (!e) return;
    const k = (Math.random() * 3) | 0, mul = W.artifacts.synNum(44) ? 2 : 1;
    const r = k === 0 ? 55 : k === 1 ? 60 : 80, tint = k === 0 ? 0xcfe8ff : k === 1 ? 0xff7a2e : 0x4aa8ff;
    areaDamage(e.x, e.y, r, origDmg(500 * mul), 120, 'Ящик Пандоры');
    W.fx.burst(e.x, e.y, r, tint, 0.45);
  },
  85: () => {                                                                               // Часовой механизм
    const P = W.player;
    W.enemies.grid.query(P.x, P.y, 150, (e) => W.enemies.stun(e, 2));
    W.fx.burst(P.x, P.y, 150, 0xffe08a, 0.5, 'ring');
  },
  176: () => { W.pickups.activate(P_RUNES[(Math.random() * P_RUNES.length) | 0]); },          // Ковчег Завета
  201: () => {                                                                              // Копьё Лонгина
    const e = W.enemies.randomVisible(); if (!e) return;
    areaDamage(e.x, e.y, 45, origDmg(900), 0, 'Копьё Лонгина');
    W.fx.burst(e.x, e.y, 45, 0xbfe8ff, 0.35);
    W.fx.sparks(e.x, e.y, 10, 0xdff4ff, 140);
  },
};

/** Разовые эффекты при получении */
const ON_GET: Record<number, () => void> = {
  66: () => { for (let i = 0; i < 24; i++) { const p = around(40, 170); W.orbs.drop(p.x, p.y, i < 6 ? 'l' : 'm', 1); } }, // Камень мудреца
  75: () => spawnChests(4, 90, 200),       // Богатство: 3 сундука + 1 сундук с артефактами
  165: () => spawnChests(2, 350, 700),     // Карта сокровищ
  69: () => learnRandomSpells(3),          // Карты таро
  182: () => learnRandomSpells(4),         // Магия ИИ
  117: () => addLevels(5),                 // Хроники Акаши
  217: () => addLevels(3),                 // Сова
  145: () => {                             // Золотая рулетка
    const pool = ARTIFACTS.filter((a) => a.rarity === 'legend' && !W.artifacts.has(a.id));
    if (pool.length) W.artifacts.add(pool[(Math.random() * pool.length) | 0].id);
  },
  202: () => W.artifacts.pickBond(),       // Связь
  218: () => { W.mana += 300; },           // Монета (оценка)
  222: () => { W.mana += 1000; },          // Гоблин (оценка)
};

/** Особые эффекты синергий (сверх eff из таблицы) */
const SYN_EXTRA: Record<number, (s: Stats) => void> = {
  7: (s) => { s.revives += 1; },           // Архангел: возрождение +1
  28: (s) => { s.size += 0.2; },           // Андроид: дебафф Плазмы (−20% размера) снят; Киборг — в ArtifactSet
};

function makeArt(d: ArtData): ArtifactDef {
  const def: ArtifactDef = {
    id: d.key, num: d.num, name: d.name, en: d.en, emoji: '', icon: d.icon, rarity: GRADE[d.grade] ?? 'common', text: d.text,
    apply: (s) => { for (const [e, v] of d.eff) applyEff(s, e, v); },
  };
  const period = d.eff.find((e) => e[0] === 706)?.[1];
  if (TICK[d.num] && period) { def.period = period; def.onTick = TICK[d.num]; }
  if (ON_GET[d.num]) def.onGet = ON_GET[d.num];
  if (TODO_ART[d.num]) def.todo = TODO_ART[d.num];
  return def;
}

export const ARTIFACTS: ArtifactDef[] = ART_DATA.map(makeArt);
const BY_ID = new Map(ARTIFACTS.map((a) => [a.id, a]));
const KEY_BY_NUM = new Map(ARTIFACTS.map((a) => [a.num, a.id]));

function makeSyn(d: SynData): SynergyDef {
  const def: SynergyDef = {
    id: d.key, num: d.num, name: d.name, en: d.en, emoji: '', icon: d.icon,
    parts: d.parts.map((n) => KEY_BY_NUM.get(n)!).filter(Boolean), text: d.text,
    apply: (s) => { for (const [e, v] of d.eff) applyEff(s, e, v); SYN_EXTRA[d.num]?.(s); },
  };
  if (TODO_SYN[d.num]) def.todo = TODO_SYN[d.num];
  return def;
}

export const SYNERGIES: SynergyDef[] = SYN_DATA.map(makeSyn);
const SYN_KEY_BY_NUM = new Map(SYNERGIES.map((s) => [s.num, s.id]));

export const artifactById = (id: string) => BY_ID.get(id)!;
export const synergiesOf = (id: string) => SYNERGIES.filter((s) => s.parts.includes(id));

// поля Stats, которые меняются «на лету» (зависят от других статов, HP, маны, убийств…)
const DYN_KEYS = ['atkPct', 'amp', 'crit', 'critMult', 'magicDmg', 'cdr', 'hpPct', 'comboDmg', 'xpGain', 'lifeOrbHeal', 'enemyHpRed', 'speed'] as const;
type DynKey = typeof DYN_KEYS[number];
const COUNT_PCT_SPELLS = ['thunder', 'ebolt', 'blizzard'];

type CountedSpell = { count?: number; level: number; def: { id: string; kind: string; maxLevel: number }; onChange(): void };

/** Артефакты и синергии текущего забега */
export class ArtifactSet {
  owned: string[] = [];
  synergies = new Set<string>();
  private timers = new Map<string, number>();
  onSynergy: ((s: SynergyDef) => void) | null = null;

  private nums = new Set<number>();
  private synNums = new Set<number>();
  private gotKills = new Map<number, number>(); // номер артефакта → W.kills при получении
  /** оставшееся время Десперадо */
  desperadoT = 0;
  private ffCd = 0;          // Силовое поле
  private potionCd = 0;      // Зелье здоровья
  private potionLeft = 0;    // сколько ещё вылечить
  private potionT = 0;
  private standT = 0;        // Военный флаг
  private lastHp = -1;
  private lastMaxHp = 0;
  private lastKills = 0;
  private wolfNext = 0;      // Оборотень: следующий порог убийств
  private gilNext = 0;       // Гильгамеш
  private dnaN = 0; private dnaAmp = 0; private dnaHp = 0;
  private bondKey: string | null = null;
  private bondPending = false;
  private dynT = 0;
  private dyn: Record<DynKey, number> = Object.fromEntries(DYN_KEYS.map((k) => [k, 0])) as Record<DynKey, number>;
  private dynSpell: Record<string, number> = {};
  private dynCount: Record<string, number> = {};
  private dynArmor = 0;

  has(id: string) { return this.nums.has(BY_ID.get(id)?.num ?? -1) || this.owned.includes(id); }
  hasNum(n: number) { return this.nums.has(n); }
  synNum(n: number) { return this.synNums.has(n); }

  add(id: string) {
    if (this.has(id)) return;
    const def = artifactById(id);
    if (!def) return;
    const s = W.stats;
    this.owned.push(id);
    this.nums.add(def.num);
    this.gotKills.set(def.num, W.kills);
    if (def.num === 194) this.wolfNext = W.kills + 2500;
    const hpBefore = s.maxHp;
    def.apply?.(s);
    if (def.period && def.onTick) this.timers.set(id, def.num === 50 ? 0 : def.period * this.artCdMul());
    // ДНК: каждый полученный обелиск (легендарный артефакт) — +8% приумножения и здоровья, эффективность −15% за раз
    if (def.rarity === 'legend' && this.nums.has(118)) {
      const k = 0.08 * Math.pow(0.85, this.dnaN++);
      this.dnaAmp += k; this.dnaHp += k;
    }
    this.checkSynergies();
    def.onGet?.();
    this.recompute();
    // новые HP сразу добавляются к текущему здоровью; заклинания пересчитывают число снарядов
    W.player.heal(Math.max(0, s.maxHp - hpBefore));
    for (const sp of W.book.spells.values()) sp.onChange();
  }

  /** Активирует все собранные синергии (Магнум Опус: каждой синергии нужно на 1 артефакт меньше) */
  private checkSynergies() {
    let changed = true;
    while (changed) {
      changed = false;
      const relax = this.synNums.has(19) ? 1 : 0;
      for (const syn of SYNERGIES) {
        if (this.synergies.has(syn.id)) continue;
        let have = 0;
        for (const p of syn.parts) if (this.has(p)) have++;
        if (have === 0 || have < syn.parts.length - relax) continue;
        this.synergies.add(syn.id);
        this.synNums.add(syn.num);
        syn.apply(W.stats);
        this.onSynergyGot(syn.num);
        this.onSynergy?.(syn);
        changed = true;
      }
    }
  }

  private onSynergyGot(num: number) {
    const s = W.stats;
    if (num === 23) spawnChests(2, 350, 700);                                     // Охотник за сокровищами
    if (num === 31 && this.bondKey) s.addSpellDmg(this.bondKey, 1.2);             // Конфлюкс: Связь ×1,5
    if (num === 33) this.gilNext = W.kills + 2500;                                // Гильгамеш
    if (num === 40) this.potionCd = Math.max(0, this.potionCd - 20);              // Эликсир
    if (TODO_SYN[num]) s.artFx['syn' + num] = 1; // флаг для будущих хуков
  }

  /** Связь: +240% урона одному атакующему заклинанию (todo: окно выбора; пока — с наибольшим уровнем) */
  pickBond() {
    let best: CountedSpell | null = null;
    for (const sp of W.book.spells.values()) {
      const c = sp as unknown as CountedSpell;
      if (c.def.kind !== 'attack') continue;
      if (!best || c.level > best.level) best = c;
    }
    if (!best) { this.bondPending = true; return; }
    this.bondPending = false;
    this.bondKey = best.def.id;
    W.stats.addSpellDmg(this.bondKey, 2.4 + (this.synNums.has(31) ? 1.2 : 0));
  }

  /** 3 случайных разных артефакта, которых ещё нет: сначала редкость по весу, внутри редкости — равновероятно */
  roll(n = 3): ArtifactDef[] {
    const pool = ARTIFACTS.filter((a) => !this.has(a.id) && RARITY[a.rarity].weight > 0);
    const out: ArtifactDef[] = [];
    while (out.length < n && pool.length) {
      // с небольшим шансом подсовываем недостающую часть начатой синергии
      let pick: ArtifactDef | undefined;
      if (Math.random() < 0.2) {
        const want = SYNERGIES.filter((s) => !this.synergies.has(s.id) && s.parts.some((p) => this.has(p)))
          .flatMap((s) => s.parts).filter((p) => pool.some((a) => a.id === p));
        if (want.length) pick = pool.find((a) => a.id === want[(Math.random() * want.length) | 0]);
      }
      if (!pick) {
        const avail = (Object.keys(RARITY) as Rarity[]).filter((r) => RARITY[r].weight > 0 && pool.some((a) => a.rarity === r));
        const total = avail.reduce((t, r) => t + RARITY[r].weight, 0);
        let x = Math.random() * total;
        const rar = avail.find((r) => (x -= RARITY[r].weight) <= 0) ?? avail[avail.length - 1];
        const sub = pool.filter((a) => a.rarity === rar);
        pick = sub[(Math.random() * sub.length) | 0];
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

  private artCdMul() { return Math.max(0.2, 1 - W.stats.artifactCdr); }

  update(dt: number) {
    const P = W.player, s = W.stats;
    // периодические артефакты
    for (const [id, t] of this.timers) {
      const nt = t - dt;
      if (nt <= 0) {
        const def = artifactById(id);
        def.onTick?.();
        this.timers.set(id, nt + (def.period ?? 30) * this.artCdMul());
      } else this.timers.set(id, nt);
    }
    if (this.desperadoT > 0) this.desperadoT -= dt;
    if (this.ffCd > 0) this.ffCd -= dt;
    if (this.potionCd > 0) this.potionCd -= dt;
    if (this.bondPending) this.pickBond();

    // счётчики убийств
    const dk = W.kills - this.lastKills;
    this.lastKills = W.kills;
    if (dk > 0) {
      if (this.synNums.has(10)) { const id = KEY_BY_NUM.get(50)!, t = this.timers.get(id); if (t !== undefined) this.timers.set(id, t - dk * 0.002 * 8); } // Дедай
      if (this.nums.has(194) && W.kills >= this.wolfNext) { this.wolfNext += 2500; W.pickups.activate('fury'); }   // Оборотень
      if (this.synNums.has(33) && W.kills >= this.gilNext) { this.gilNext += 2500; W.pickups.activate('greed'); }  // Гильгамеш
    }
    this.standT = P.moving ? 0 : this.standT + dt;

    // перехват удара: Силовое поле (блок + 3 с неуязвимости), Барьер (не больше 30% макс. HP за раз)
    if (this.lastHp >= 0 && s.maxHp === this.lastMaxHp && P.hp < this.lastHp - 1e-6) {
      if (this.nums.has(54) && this.ffCd <= 0) {
        P.hp = this.lastHp; P.dead = false; P.invulnT = Math.max(P.invulnT, 3);
        this.ffCd = 60 * this.artCdMul();
        W.fx.burst(P.x, P.y, 30, 0x8fd8ff, 0.4, 'ring');
      } else if (this.nums.has(94) && this.lastHp - P.hp > s.maxHp * 0.3) {
        P.hp = this.lastHp - s.maxHp * 0.3;
        if (P.hp > 0) P.dead = false;
      }
    }
    // Зелье здоровья: при HP < 25% — 50% HP за 3 с (Эликсир — сразу)
    if (this.nums.has(65) && !P.dead && this.potionCd <= 0 && P.hp < s.maxHp * 0.25) {
      this.potionCd = 50 * this.artCdMul();
      if (this.synNums.has(40)) P.heal(s.maxHp * 0.5);
      else { this.potionLeft = s.maxHp * 0.5; this.potionT = 3; }
      W.fx.burst(P.x, P.y, 26, 0x6bff8a, 0.5, 'ring');
    }
    if (this.potionT > 0 && !P.dead) {
      const step = Math.min(dt, this.potionT);
      P.heal(this.potionLeft * step / this.potionT);
      this.potionLeft -= this.potionLeft * step / this.potionT;
      this.potionT -= step;
    }

    this.dynT -= dt;
    if (this.dynT <= 0 && this.owned.length) { this.dynT = 0.1; this.recompute(); }

    // Некрономикон: HP не выше 50% (снимает Космический ужас)
    if (this.nums.has(115) && !this.synNums.has(27)) P.hp = Math.min(P.hp, s.maxHp * 0.5);
    if (P.hp > s.maxHp) P.hp = s.maxHp;
    this.lastHp = P.hp; this.lastMaxHp = s.maxHp;
  }

  private add1(k: DynKey, v: number) { if (v) { W.stats[k] += v; this.dyn[k] += v; } }
  private addSpell(k: string, v: number) { if (v) { W.stats.addSpellDmg(k, v); this.dynSpell[k] = (this.dynSpell[k] ?? 0) + v; } }
  private spellOf(k: string) { return W.book.spells.get(k) as unknown as CountedSpell | undefined; }

  /** Пересчёт «живых» бонусов: снять прошлые → посчитать от базовых статов → наложить */
  private recompute() {
    const s = W.stats, P = W.player, has = (n: number) => this.nums.has(n), syn = (n: number) => this.synNums.has(n);
    const maxHpBefore = s.maxHp;
    // 1. снять прошлые
    for (const k of DYN_KEYS) { s[k] -= this.dyn[k]; this.dyn[k] = 0; }
    for (const k in this.dynSpell) { s.addSpellDmg(k, -this.dynSpell[k]); this.dynSpell[k] = 0; }
    if (this.dynArmor) { s.dmgTaken = (s.dmgTaken - this.dynArmor) / (1 - this.dynArmor); this.dynArmor = 0; }

    const manaRatio = P.xpNeed > 0 ? Math.min(1, P.xp / P.xpNeed) : 0;
    // 2. враги, здоровье
    if (syn(4)) this.add1('enemyHpRed', s.enemyHpRed * 0.15);                      // Веном ×1,15
    if (has(216)) this.add1('hpPct', s.enemyHpRed);                                // Оккультный
    if (has(118)) { this.add1('hpPct', this.dnaHp); this.add1('amp', this.dnaAmp); } // ДНК
    if (has(166) && !syn(28)) this.add1('lifeOrbHeal', -(1 + s.lifeOrbHeal));      // Киборг: лечения сферой нет
    if (has(104)) { const x = 0.5 * manaRatio; if (x > 0 && x < 1) { s.addArmor(x); this.dynArmor = x; } } // Магический щит
    if (has(195)) { const half = s.xpGain / 2; this.add1('atkPct', half); if (!syn(27)) this.add1('xpGain', -half); } // Бездна
    // 3. перезарядка
    if (has(78)) this.add1('cdr', Math.floor(s.speed / 0.03 + 1e-6) * 0.01 * (1 - s.cdr)); // Акселератор
    // 4. крит
    if (has(48)) this.add1('crit', Math.floor((s.pickup + s.runePickup) / 0.3 + 1e-6) * 0.01); // Окулус
    if (has(49)) this.add1('crit', Math.floor(s.evasion / 0.03 + 1e-6) * 0.01);    // Карнавал
    if (has(213)) this.add1('critMult', s.crit);                                     // Вдова-мейкер
    if (syn(25)) this.add1('critMult', s.critMult * 0.25);                          // Разбиватель сердец ×1,25
    // 5. приумножение и атака
    if (has(50) && this.desperadoT > 0) this.add1('amp', 0.5);                      // Десперадо
    if (has(108)) this.add1('amp', Math.floor(s.dmgTaken / 0.1 + 1e-6) * 0.03);     // Эгида
    if (has(109)) this.add1('amp', 0.25 * manaRatio);                                // Мантия Мерлина
    if (has(117)) this.add1('amp', Math.floor(P.level / 2) * 0.01);                  // Хроники Акаши
    if (has(153) && P.hp >= s.maxHp * 0.75) this.add1('amp', 0.75);                  // Неприкосновенность
    if (has(164)) this.add1('amp', (Math.floor((W.kills - (this.gotKills.get(164) ?? 0)) / 100) % 25) * 0.01); // Охотник
    if (has(167)) this.add1('amp', 0.03 * this.synNums.size);                        // Пирамида
    if (has(171)) this.add1('amp', syn(46) ? 0.2 : Math.min(0.2, Math.floor(this.standT) * 0.02)); // Военный флаг
    if (has(177)) {                                                                  // Корона
      let ep = 0, sp = 0;
      for (const id of this.owned) { const r = BY_ID.get(id)!.rarity; if (r === 'epic') ep++; else if (r === 'special') sp++; }
      this.add1('amp', ep * 0.01 + sp * 0.05);
    }
    if (has(199) && P.moving) this.add1('amp', 0.2 * (syn(14) ? 3 : 1));             // Реактивный двигатель (Зеробэк ×3)
    if (has(207)) this.add1('amp', Math.min(0.2, Math.floor(W.mana / 200) * 0.01));  // Магический источник
    if (syn(16)) this.add1('amp', Math.floor(s.cdr / 0.03 + 1e-6) * 0.01);           // Хронос
    if (syn(21) && P.invulnT > 0) this.add1('amp', 1);                               // Паладин
    if (syn(24)) { if (s.runeAmp > 0) this.add1('amp', 0.25); else { this.add1('amp', 0.5); this.add1('speed', 0.25); } } // Кровавая луна
    if (has(200)) this.add1('atkPct', Math.floor(s.cdr / 0.02 + 1e-6) * 0.01);       // Шляпа чародея
    if (syn(13)) this.add1('atkPct', Math.max(0, Math.floor(s.size / 0.03 + 1e-6)) * 0.01); // Нуклеар
    if (syn(17)) {                                                                   // Монарх
      let c = 0, r = 0;
      for (const id of this.owned) { const q = BY_ID.get(id)!.rarity; if (q === 'common') c++; else if (q === 'rare') r++; }
      this.add1('atkPct', c * 0.01 + r * 0.03);
    }
    if (has(163)) this.add1('atkPct', Math.floor(s.maxHp / 20) * 0.03);              // Гея
    // 6. урон магии
    let matrix = 0;
    if (has(204)) { matrix = (Math.max(0, s.size) + s.duration + s.cdr) * 0.2; this.add1('magicDmg', matrix); } // Матрица
    if (syn(22)) { this.add1('atkPct', matrix); this.add1('amp', matrix); }          // AGI
    if (has(79)) {                                                                   // Превосходная форма
      let n = 0;
      for (const sp of W.book.spells.values()) if (sp.level >= sp.def.maxLevel) n++;
      this.add1('magicDmg', 0.15 * n);
    }
    if (syn(15)) this.add1('magicDmg', (1 + s.magicDmg) * 0.25);                     // Арбитр ×1,25
    if (syn(39)) this.add1('comboDmg', 0.25 * W.book.fusions.size);                  // Доминус
    if (has(159)) this.add1('atkPct', s.atkPct * 0.5);                               // Власть Титана ×1,5 (последним)
    // 7. по заклинаниям
    if (has(93)) this.addSpell('spirit', 0.1 * (this.spellOf('spirit')?.count ?? 0));        // Волшебная палочка
    if (has(119)) this.addSpell('ray', 0.08 * (this.spellOf('ray')?.count ?? 0));            // Щупальца
    if (has(145)) this.addSpell('blizzard', 0.01 * (this.spellOf('blizzard')?.count ?? 0));  // Снежная корона
    if (has(205)) this.addSpell('ezone', 0.005 * P.level);                                   // Робот
    // число снарядов «+N%» (Мьёльнир, Механическая рука, Снежная корона)
    for (const k of COUNT_PCT_SPELLS) {
      const pct = s.artFx['countPct:' + k]; if (!pct) continue;
      const sp = this.spellOf(k); if (!sp || sp.count === undefined) continue;
      const old = this.dynCount[k] ?? 0;
      const want = Math.round((sp.count - old) * pct);
      if (want !== old) { s.addSpellCount(k, want - old); this.dynCount[k] = want; sp.onChange(); }
    }
    // прирост макс. HP сразу лечит
    if (s.maxHp > maxHpBefore + 1e-6 && this.lastHp >= 0) { P.heal(s.maxHp - maxHpBefore); this.lastHp = P.hp; }
    this.lastMaxHp = s.maxHp;
  }
}

/** Номер синергии → id (для UI/отладки) */
export const synergyIdByNum = (n: number) => SYN_KEY_BY_NUM.get(n);
