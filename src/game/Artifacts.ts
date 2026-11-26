import type Phaser from 'phaser';
import type { Stats } from './Stats';
import { areaDamage } from './Projectiles';
import { W } from './World';
import type { RuneType } from './Pickups';
import type { Enemy } from './Enemies';
import { DEPTH, ORIG_U } from '../config';
import { ALL_SPELLS } from './spells/registry';
import { ART_DATA, SYN_DATA, type ArtData, type SynData } from '../data/artifacts_data';
import { SYNERGY } from '../data/orig/synergies';
import { ArtifactDeck, MERCHANT_BASE, VISIT_MUL, type ChestType } from './ArtifactDeck';

// Артефакты и синергии оригинала (182 + 63). Числа и тексты — из таблиц (src/data/artifacts_data.ts, генерируется),
// здесь — толкование ID эффектов и механика. Что требует хука в чужом коде — помечено todo (см. TODO_ART / TODO_SYN).

export type Rarity = 'common' | 'rare' | 'epic' | 'special' | 'legend';

/** Цвета по редкости (ui.md «Цвета контура и фона»): надпись, контур карточки, фон */
export const RARITY: Record<Rarity, { name: string; color: string; frame: string; bg: string }> = {
  common: { name: 'Обычный артефакт', color: '#d8d8d8', frame: '#858585', bg: '#030303' },
  rare: { name: 'Редкий артефакт', color: '#1ba9e3', frame: '#1a6691', bg: '#010204' },
  epic: { name: 'Героический артефакт', color: '#cd50ff', frame: '#9130ab', bg: '#040104' },
  special: { name: 'Особый артефакт', color: '#ff3c64', frame: '#c71a47', bg: '#040102' },
  legend: { name: 'Легендарный артефакт', color: '#e3851b', frame: '#99591f', bg: '#040301' },
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
  /** «요구레벨» 1…5 */
  grade: number;
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
    case 26: s.merchantCostRatio += v; break;
    case 127: s.chestCostRatio += v; break;
    case 133: s.createDelayRatio += v; break;
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
    case 143: s.eliteHpRatio *= (100 + v) / 100; break;
    default:
      if (id >= 700 && id <= 724) return; // служебные: 704 предел, 706 перезарядка, 708 % взрыва, 717/724 подписи
      s.artFx[id] = (s.artFx[id] ?? 0) + v;
  }
}

/** Что не реализовано (нужен код в заклинаниях / SpellBook / UI / волнах) */
const TODO_ART: Record<number, string> = {
  57: 'КД вдвое после 5-го применения (хук в Spell.ready)',
  95: 'время быстрее на 24%, золото +24%',
  107: 'размер персонажа −25% — уменьшен только хитбокс P.r, картинка прежняя',
  110: 'проход сквозь врагов — в нашей игре враги не толкают мага, эффекта нет',
  117: 'макс. уровень +5 (уровень +5 сделан)',
  120: 'экран не краснеет при низком HP (косметика UI)',
  122: 'уровень и макс. уровень обычных пассивок +1 (SpellBook)',
  152: 'обзор +10% (камера)',
  155: 'возврат маны всегда 100%, но на 1 раз меньше (SpellBook.refund)',
  168: 'слияний +1, макс. уровень +1 (SpellBook)',
  179: 'эффект очарования ×2 (SpellBook.enchant; s.artFx[729] = 2)',
  219: 'особая пассивка в выборе — выставлен флаг s.artFx.unicorn, подключить buildSpecialChoices',
  73: 'плод мирового древа — упрощён до 3 сфер жизни',
  83: 'вместо настоящих вихря/метеорита/цунами — взрыв 500% по врагу',
  202: 'выбор заклинания без окна: берётся атакующее с наибольшим уровнем',
  100: 'урон взрыва — оценка (2000% ATK, радиус 160)',
};

const TODO_SYN: Record<number, string> = {
  5: 'шире аура — радиус 90 → 120 (оценка)', 6: 'пассивки +25% (SpellBook)', 8: 'каждое 5-е применение +50% урона (Spell)',
  20: 'молнии Копья объединяются (сейчас без изменений)', 26: 'размер мага −9% только хитбокс',
  30: 'предел доп. уровня +10 (SpellBook)',
  // 35 «Брокер»: бесплатны только товары дешевле 84 (таких цен нет) и только со скидкой смены зоны — в зоне 1 не действует
  38: 'урон от стаков Гидры — оценка +1% за стак', 41: 'реген от доп. здоровья — оценка (1%/с × доля доп. HP)',
};

const GRADE: Rarity[] = ['common', 'common', 'rare', 'epic', 'special', 'legend'];
const P_RUNES: RuneType[] = ['fury', 'invuln', 'greed', 'cleanse'];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
function around(minR: number, maxR: number) {
  const a = Math.random() * Math.PI * 2, d = rnd(minR, maxR), P = W.player;
  return { x: P.x + Math.cos(a) * d, y: P.y + Math.sin(a) * d };
}
/** урон в % ATK оригинала */
const origDmg = (pct: number) => W.stats.spellDamage(pct);

function learnRandomSpells(n: number) {
  const pool = ALL_SPELLS.filter((d) => !W.book.spells.has(d.id) && !W.book.consumed.has(d.id));
  for (let i = 0; i < n && pool.length; i++) W.book.add(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
}
/** ApplyLevelUpNum += n: n экранов подряд, уровень растёт при каждом выборе (levelup.md §6a) */
function addLevels(n: number) { W.player.pendingLevels += n; }
function spawnChests(n: number, id: 5 | -6 | 7 = 5) { for (let i = 0; i < n; i++) W.pickups.chestAt(id); }
/** «Монета» 400 × k, «Гоблин» 777 × k, k — по MerchantNum */
function coins(base: number) { W.mana += Math.round(base * VISIT_MUL[Math.min(W.artifacts.merchantNum, 6)]); }

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
  66: () => { for (let i = 0; i < 50; i++) { const p = around(2 * ORIG_U, 10 * ORIG_U); W.orbs.drop(p.x, p.y, 'l'); } }, // Камень мудреца: CreateItem_Character(−3, 50)
  75: () => { spawnChests(3); spawnChests(1, 7); }, // Богатство: 3 сундука + Хранилище реликвий
  165: () => spawnChests(2, -6),           // Карта сокровищ
  69: () => learnRandomSpells(3),          // Карты таро
  182: () => learnRandomSpells(4),         // Магия ИИ
  117: () => addLevels(5),                 // Хроники Акаши
  217: () => addLevels(3),                 // Сова
  198: () => { W.artifacts.deck.roulette = true; },   // Золотая рулетка: сразу окно с одним легендарным (GameScene)
  202: () => W.artifacts.pickBond(),       // Связь
  218: () => coins(400),
  222: () => coins(777),
};

/** Особые эффекты синергий (сверх eff из таблицы) */
const SYN_EXTRA: Record<number, (s: Stats) => void> = {
  7: (s) => { s.revives += 1; },           // Архангел: возрождение +1
  28: (s) => { s.size += 0.2; },           // Андроид: дебафф Плазмы (−20% размера) снят; Киборг — в ArtifactSet
};

function makeArt(d: ArtData): ArtifactDef {
  const def: ArtifactDef = {
    id: d.key, num: d.num, name: d.name, en: d.en, emoji: '', icon: d.icon, rarity: GRADE[d.grade] ?? 'common', grade: d.grade, text: d.text,
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
const DYN_KEYS = ['atkPct', 'amp', 'crit', 'critMult', 'magicDmg', 'cdr', 'hpPct', 'comboDmg', 'xpGain', 'lifeOrbHeal', 'enemyHpRed', 'speed', 'regen'] as const;
type DynKey = typeof DYN_KEYS[number];
const COUNT_PCT_SPELLS = ['thunder', 'ebolt', 'blizzard'];

type CountedSpell = { count?: number; level: number; def: { id: string; kind: string; maxLevel: number }; onChange(): void };

/** Артефакты и синергии текущего забега */
// Номера, для которых нужны хуки (флаги ниже пересчитываются при каждом add — в горячем коде только проверка булева поля)
const HIT_ARTS = [60, 70, 74, 98, 102, 113, 123, 144, 147, 154, 158, 193, 196, 197, 210];
const HIT_SYNS = [32, 38];
const KILL_ARTS = [101, 172, 193, 211];
const KILL_SYNS = [2, 9, 36, 45];
const ORB_ARTS = [87, 100, 106, 160];
const HURT_ARTS = [54, 94, 106];
const SCAN_ARTS = [80, 88, 154, 162, 187];

// состояние по врагу: слот = id & MASK (id растут, живых ≤ 480 — коллизии практически исключены)
const MASK = 8191;

export class ArtifactSet {
  owned: string[] = [];
  /** колоды сундуков и торговца этого забега */
  deck = new ArtifactDeck();
  /** MerchantNum: сколько раз приходил торговец (растёт на отметке времени) */
  merchantNum = 0;
  synergies = new Set<string>();
  private timers = new Map<string, number>();
  onSynergy: ((s: SynergyDef) => void) | null = null;

  /** быстрые флаги для хуков в Enemies.damage/kill, Player.hurt, Orbs, Pickups */
  hitFx = false;
  killFx = false;
  orbFx = false;
  hurtFx = false;
  private scanFx = false;

  private nums = new Set<number>();
  private synNums = new Set<number>();
  private gotKills = new Map<number, number>(); // номер артефакта → W.kills при получении
  /** оставшееся время Десперадо */
  desperadoT = 0;
  /** доп. здоровье (Жизненный щит), поглощает урон раньше HP */
  extraHp = 0;
  private ffCd = 0;          // Силовое поле
  private potionCd = 0;      // Зелье здоровья
  private potionLeft = 0;    // сколько ещё вылечить
  private potionT = 0;
  private standT = 0;        // Военный флаг
  private lastKills = 0;
  private lastHp = -1;
  private wolfNext = 0;      // Оборотень: следующий порог убийств
  private gilNext = 0;       // Гильгамеш
  private dnaN = 0; private dnaAmp = 0; private dnaHp = 0;
  private bondKey: string | null = null;
  private bondPending = false;
  private dynT = 0;
  private scanT = 0;
  private dyn: Record<DynKey, number> = Object.fromEntries(DYN_KEYS.map((k) => [k, 0])) as Record<DynKey, number>;
  private dynSpell: Record<string, number> = {};
  private dynCount: Record<string, number> = {};
  private dynArmor = 0;
  // удары и убийства
  private hitN = 0;          // Клевер: общий счётчик ударов
  private underKills = 0;    // Загробный мир: убийств до заряда
  private underCharges = 0;  // сколько ещё врагов погибнут от удара
  private killedByUnder: Enemy | null = null;
  private reaped: Enemy | null = null;   // убит Косой жнеца (для Некроманта)
  private boomDepth = 0;
  private bellN = 0;         // Колокол смерти: собранные сферы
  private schemeN = 0;       // Схема маны: стаки
  private schemeT = 5;
  private auraR = 0; private auraR2 = 0; private auraK = 0;
  private aura: Phaser.GameObjects.Image | null = null;
  // по врагу
  private sId = new Int32Array(MASK + 1).fill(-1);
  private sBorn = new Float32Array(MASK + 1);
  private sFlags = new Uint8Array(MASK + 1);   // 1 — осмотрен, 2 — уже был заморожен, 4 — уже получал урон
  private sHydra = new Uint8Array(MASK + 1);
  private sSaw = new Uint8Array(MASK + 1);
  private sBurn = new Uint8Array(MASK + 1);

  has(id: string) { return this.nums.has(BY_ID.get(id)?.num ?? -1); }
  hasNum(n: number) { return this.nums.has(n); }
  synNum(n: number) { return this.synNums.has(n); }

  add(id: string) {
    if (this.has(id)) return;
    const def = artifactById(id);
    if (!def) return;
    const s = W.stats, P = W.player;
    this.owned.push(id);
    this.nums.add(def.num);
    this.gotKills.set(def.num, W.kills);
    if (def.num === 194) this.wolfNext = W.kills + 2500;
    if (def.num === 107) P.r *= 0.75;                       // Книга сказок: маг меньше (хитбокс)
    if (def.num === 219) s.artFx.unicorn = 1;               // Единорог: особая пассивка (подключает SpellBook)
    def.apply?.(s);
    const eff = ART_DATA.find((d) => d.num === def.num)!.eff;
    for (const [e, v] of eff) if (e === 51) this.deck.keys += v; // «Связка ключей»
    if (def.period && def.onTick) this.timers.set(id, def.num === 50 ? 0 : def.period * this.artCdMul());
    // ДНК: каждый полученный обелиск (легендарный артефакт) — +8% приумножения и здоровья, эффективность −15% за раз
    if (def.rarity === 'legend' && this.nums.has(118)) {
      const k = 0.08 * Math.pow(0.85, this.dnaN++);
      this.dnaAmp += k; this.dnaHp += k;
    }
    this.checkSynergies();
    this.refreshFlags();
    def.onGet?.();
    this.recompute();
    // лечение при взятии: сумма значений эффекта 20 этого артефакта, % макс. HP; заклинания пересчитывают число снарядов
    const heal = eff.reduce((t, [e, v]) => t + (e === 20 ? v : 0), 0);
    if (heal) P.heal(Math.round(heal * s.maxHp * 0.01));
    for (const sp of W.book.spells.values()) sp.onChange();
  }

  private refreshFlags() {
    const a = (l: number[]) => l.some((n) => this.nums.has(n)), y = (l: number[]) => l.some((n) => this.synNums.has(n));
    this.hitFx = a(HIT_ARTS) || y(HIT_SYNS);
    this.killFx = a(KILL_ARTS) || y(KILL_SYNS);
    this.orbFx = a(ORB_ARTS);
    this.hurtFx = a(HURT_ARTS) || this.synNums.has(34);
    this.scanFx = a(SCAN_ARTS) || this.synNums.has(26);
    // Экскалибур: аура (Авалон — ×1,5 и шире)
    if (this.nums.has(197)) {
      const av = this.synNums.has(5);
      this.auraR = av ? 120 : 90; this.auraR2 = this.auraR * this.auraR; this.auraK = av ? 0.375 : 0.25;
      if (!this.aura) this.aura = W.scene.add.image(W.player.x, W.player.y, 'ring').setDepth(DEPTH.zone).setAlpha(0.22).setTint(0xffe08a);
      this.aura.setDisplaySize(this.auraR * 2, this.auraR * 2);
    }
  }

  /** Button_Artifact_Select: пересчёт при каждом артефакте; нужно «개수» артефактов набора (Магнум Опус — на 1 меньше) */
  private checkSynergies() {
    let changed = true;
    while (changed) {
      changed = false;
      const relax = this.synNums.has(19) ? 1 : 0;
      for (const syn of SYNERGIES) {
        if (this.synergies.has(syn.id)) continue;
        const row = SYNERGY[syn.num];
        let have = 0;
        for (const n of row.artifacts) if (this.nums.has(n)) have++;
        if (have < row.count - relax) continue;
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
    if (num === 23) spawnChests(2, -6);                                      // Охотник за сокровищами
    if (num === 26) W.player.r *= 0.91;                                           // Вондерлэнд: маг меньше
    if (num === 31 && this.bondKey) s.addSpellDmg(this.bondKey, 1.2);             // Конфлюкс: Связь ×1,5
    if (num === 33) this.gilNext = W.kills + 2500;                                // Гильгамеш
    if (num === 40) this.potionCd = Math.max(0, this.potionCd - 20);              // Эликсир
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

  /** Create_Artifact: артефакты сундука из колоды `List_ArtifactDrop` */
  openChest(type: ChestType) {
    const r = this.deck.open(type, (n) => this.nums.has(n), W.player.level);
    return { ...r, items: r.ids.map((n) => BY_ID.get(KEY_BY_NUM.get(n)!)!) };
  }

  /** Create_Merchant: товары визита с ценами. Скидка 25 % по коду бывает только после смены зоны (зоны 12–14) */
  merchantGoods() {
    const mul = VISIT_MUL[Math.min(Math.max(this.merchantNum, 1), 7) - 1];
    const ratio = Math.max(0, 100 + W.stats.merchantCostRatio) * 0.01;
    return this.deck.merchantItems((n) => this.nums.has(n), W.player.level).map((n) => {
      const a = BY_ID.get(KEY_BY_NUM.get(n)!)!;
      const cost = 98 + Math.floor(Math.random() * 11); // Random(98, 109) %
      return { a, price: Math.round(cost * MERCHANT_BASE[a.grade] * ratio * 0.01 * mul) };
    });
  }

  /** Лимиты CreateItem_Character: легендарных ≥ 15 или артефактов > 119 — сундуков больше нет */
  chestsAllowed() {
    return this.owned.length <= 119 && this.owned.filter((id) => BY_ID.get(id)!.grade === 5).length < 15;
  }

  private artCdMul() { return Math.max(0.2, 1 - W.stats.artifactCdr); }

  /** слот состояния врага; новый враг — обнуляется */
  private slot(e: Enemy) {
    const i = e.id & MASK;
    if (this.sId[i] !== e.id) {
      this.sId[i] = e.id; this.sBorn[i] = W.time; this.sFlags[i] = 0;
      this.sHydra[i] = 0; this.sSaw[i] = 0; this.sBurn[i] = 0;
    }
    return i;
  }

  // ---------------- хуки ----------------
  /** Enemies.damage (только при hitFx): крит и все модификаторы урона артефактов. Возвращает итоговый урон. */
  onDamage(e: Enemy, amount: number, crit: boolean, src: string): number {
    const s = W.stats, n = this.nums, y = this.synNums;
    const i = this.slot(e), first = (this.sFlags[i] & 4) === 0;
    this.sFlags[i] |= 4;
    const boss = e.type.id === 'boss';
    if (!boss) {
      // Загробный мир: заряженные враги гибнут от удара
      if (this.underCharges > 0 && !e.elite) { this.underCharges--; this.killedByUnder = e; return e.hp + 1; }
      // Коса жнеца: мгновенная смерть при первом ударе
      if (first && n.has(98) && Math.random() < 0.08) { this.reaped = e; return e.hp + 1; }
    }
    if (!crit && src) { const sc = s.spellCrit[src]; if (sc && Math.random() < sc) crit = true; } // Сюрикен
    if (!crit && first && n.has(60)) crit = true;                                                // Убийство
    let clover = false;
    if (n.has(70) && ++this.hitN >= 5) { this.hitN = 0; clover = !crit; crit = true; }          // Клевер
    if (crit) {
      amount *= s.critMult;
      if (n.has(158) && ((clover && y.has(11)) || Math.random() < s.crit * 0.5)) amount *= s.critMult; // Джокер (Трикстер)
    } else if (n.has(123)) amount *= 1.2;                                                          // Таран
    let mul = 1;
    if (n.has(154)) { const fan = y.has(37); if (W.time - this.sBorn[i] > (fan ? 2.5 : 5)) mul += fan ? 0.3 : 0.15; } // Клеймо (Фанатик)
    if (n.has(196)) mul += 0.5 * (1 - e.hp / e.maxHp);                                            // Затмение
    if (this.auraR2) { const dx = e.x - W.player.x, dy = e.y - W.player.y; if (dx * dx + dy * dy < this.auraR2) mul += this.auraK; } // Экскалибур
    if (y.has(32) && W.zone.bossFight && !boss) mul += 0.15;                                      // Мясник
    if (n.has(102) && this.sHydra[i] < 25) { this.sHydra[i]++; amount += e.hp * 0.01; }           // Гидра
    if (y.has(38)) mul += 0.01 * this.sHydra[i];                                                  // Медуза (оценка)
    if (src === 'satellite') {
      if (n.has(147)) { mul += 0.005 * this.sSaw[i]; if (this.sSaw[i] < 100) this.sSaw[i]++; }   // Пильный диск
      if (n.has(113) && this.boomDepth === 0) {                                                  // Энергия ядра
        this.boomDepth++;
        areaDamage(e.x, e.y, 28, amount, 0, 'Энергия ядра');
        W.fx.burst(e.x, e.y, 28, 0x8fd8ff, 0.25);
        this.boomDepth--;
      }
    } else if (src === 'incinerate' && n.has(144)) { mul += 0.01 * this.sBurn[i]; if (this.sBurn[i] < 255) this.sBurn[i]++; } // Дыхание дракона
    amount *= mul;
    // Магический меч: казнь (Эгосворд — порог 25%)
    if (!boss && n.has(74) && e.hp - amount < e.maxHp * (y.has(1) ? 0.25 : 0.2)) return e.hp + 1;
    return amount;
  }

  /** Enemies.kill (только при killFx) */
  onKill(e: Enemy) {
    const n = this.nums, y = this.synNums, boss = e.type.id === 'boss';
    if (n.has(172)) W.player.gainXp((boss ? 500 : e.elite ? 10 : e.xp) * 0.2);                  // Экзорцизм
    if (n.has(193) && this.underCharges === 0 && ++this.underKills >= 100) { this.underKills = 0; this.underCharges = 50; } // Загробный мир
    if (this.killedByUnder === e) { this.killedByUnder = null; if (y.has(36) && n.has(87)) this.bell(1); } // Реквием
    if (y.has(45) && !e.elite && !boss && Math.random() < 0.01) W.orbs.drop(e.x, e.y, 'l', 1);   // Джинн
    if (this.boomDepth >= 2) return;
    // взрывы при убийстве: урон — доля макс. HP убитого
    let pct = 0, r = 0;
    if (n.has(101) && Math.random() < 0.15) {                                                     // Железная дева (Найтмэр)
      pct = 0.75; r = 40;
      if (y.has(2)) { r = 60; if (Math.random() < 0.15) pct *= 3; }
    }
    if (n.has(211) && e.elite) { pct = Math.max(pct, 0.3); r = Math.max(r, 70); }                 // Графиня
    if (this.reaped === e) { this.reaped = null; if (y.has(9)) { pct = Math.max(pct, 0.75); r = Math.max(r, 45); } } // Некромант
    if (!pct) return;
    this.boomDepth++;
    areaDamage(e.x, e.y, r, e.maxHp * pct, 60, 'Взрыв');
    W.fx.burst(e.x, e.y, r, 0xff6a3a, 0.35);
    this.boomDepth--;
  }

  /** Player.hurt (только при hurtFx): урон после брони → сколько дойдёт до HP (0 — заблокирован) */
  onHurt(d: number): number {
    const P = W.player, s = W.stats;
    if (this.nums.has(54) && this.ffCd <= 0) {                                                    // Силовое поле
      this.ffCd = 60 * this.artCdMul();
      P.invulnT = Math.max(P.invulnT, 3);
      W.fx.burst(P.x, P.y, 30, 0x8fd8ff, 0.4, 'ring');
      return 0;
    }
    if (this.nums.has(94)) d = Math.min(d, s.maxHp * 0.3);                                        // Барьер
    if (this.extraHp > 0) { const t = Math.min(this.extraHp, d); this.extraHp -= t; d -= t; }   // Жизненный щит
    return d;
  }

  /** Player.hurt: смертельный удар. true — спасён (Гомункул: 30%, если обычных возрождений нет) */
  saveFromDeath(): boolean {
    if (!this.synNums.has(34) || W.stats.revives > 0 || Math.random() >= 0.3) return false;
    const P = W.player;
    P.hp = W.stats.maxHp; P.invulnT = Math.max(P.invulnT, 3);
    W.fx.burst(P.x, P.y, 80, 0xffffff, 0.6, 'ring');
    return true;
  }

  /** Orbs: подобрана сфера жизни на v лечения (до лечения) */
  onLifeOrb(v: number) {
    const P = W.player, s = W.stats;
    if (this.nums.has(106)) { const over = P.hp + v - s.maxHp; if (over > 0) this.extraHp = Math.min(s.maxHp, this.extraHp + over); } // Жизненный щит
    if (this.nums.has(100)) {                                                                      // Глаз смотрящего (оценка 2000%)
      areaDamage(P.x, P.y, 160, origDmg(2000), 200, 'Глаз смотрящего');
      W.fx.burst(P.x, P.y, 160, 0xff4a6a, 0.5);
    }
  }

  /** Orbs: подобрана сфера маны (value — сколько слито в одну) */
  onManaOrb(value: number) {
    if (this.nums.has(160)) this.schemeN += value;                                               // Схема маны
    if (this.nums.has(87)) this.bell(value);                                                      // Колокол смерти
  }

  private bell(k: number) {
    this.bellN += k;
    if (this.bellN < 444) return;
    this.bellN = 0;
    const P = W.player;
    W.enemies.grid.query(P.x, P.y, 320, (e) => {
      if (e.type.id === 'boss') return;
      if (e.elite || e.type.id === 'big') W.enemies.damage(e, e.maxHp * 0.3); else W.enemies.kill(e);
    });
    W.fx.burst(P.x, P.y, 320, 0xcfc6ff, 0.6, 'ring');
  }

  /** Pickups: подобран сундук (Мимик: взрыв, уничтожающий врагов, и 10 предметов рядом) */
  onChestPick(x: number, y: number) {
    if (!this.nums.has(190)) return;
    const v = W.scene.cameras.main.worldView;
    for (const e of W.enemies.list) {
      if (!e.alive || !v.contains(e.x, e.y)) continue;
      if (e.type.id === 'boss') W.enemies.damage(e, e.maxHp * 0.05);
      else if (e.elite || e.type.id === 'big') W.enemies.damage(e, e.maxHp * 0.3);
      else W.enemies.kill(e);
    }
    W.fx.burst(x, y, 260, 0xffd36b, 0.6);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 50, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      const r = Math.random();
      if (r < 0.1) W.pickups.rune(W.pickups.randomRune(), px, py);
      else W.orbs.drop(px, py, r < 0.3 ? 'life' : r < 0.55 ? 'l' : 'm', r < 0.3 ? 0 : 1);
    }
  }

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
    if (this.nums.has(84)) P.manaGain(P.xpNeed * 0.01 * dt);                                        // Эфир: 1% маны в секунду
    if (this.nums.has(160)) { this.schemeT -= dt; if (this.schemeT <= 0) { this.schemeT = 5; this.schemeN = 0; } } // Схема маны
    if (this.aura) this.aura.setPosition(P.x, P.y);

    // счётчики убийств
    const dk = W.kills - this.lastKills;
    this.lastKills = W.kills;
    if (dk > 0) {
      if (this.synNums.has(10)) { const id = KEY_BY_NUM.get(50)!, t = this.timers.get(id); if (t !== undefined) this.timers.set(id, t - dk * 0.002 * 8); } // Дедай
      if (this.nums.has(194) && W.kills >= this.wolfNext) { this.wolfNext += 2500; W.pickups.activate('fury'); }   // Оборотень
      if (this.synNums.has(33) && W.kills >= this.gilNext) { this.gilNext += 2500; W.pickups.activate('greed'); }  // Гильгамеш
    }
    this.standT = P.moving ? 0 : this.standT + dt;

    // осмотр новых врагов (размер/HP при появлении, первая заморозка, время жизни для Клейма)
    if (this.scanFx) { this.scanT -= dt; if (this.scanT <= 0) { this.scanT = 0.2; this.scan(); } }

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
    this.lastHp = P.hp;
  }

  private scan() {
    const n = this.nums, y = this.synNums, boss = W.zone.bossFight;
    for (const e of W.enemies.list) {
      if (!e.alive) continue;
      const i = this.slot(e);
      const f = this.sFlags[i];
      if ((f & 1) === 0) {
        this.sFlags[i] = f | 1;
        if (e.type.id !== 'boss') {
          let k = 1;
          if (y.has(26)) k *= 0.91;                                        // Вондерлэнд: враги меньше
          if (n.has(162) && e.elite) k *= 0.85;                             // Игрушечный замок: элитки меньше
          if (k !== 1) { e.r *= k; e.unitSize *= k; e.img.setScale(e.img.scaleX * k); e.fl.setScale(e.img.scaleX); }
          let h = 1;
          if (n.has(88) && e.type.id === 'big') h *= 0.85;                  // Мутировавший ген
          if (n.has(187)) h *= boss ? 0.9 : 1.1;                            // Имп
          if (h !== 1) { e.hp *= h; e.maxHp *= h; }
        }
      }
      if (n.has(80) && e.freezeT > 0 && (this.sFlags[i] & 2) === 0) { this.sFlags[i] |= 2; e.speed *= 0.9; } // Лунный кристалл
    }
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
    if (syn(41) && this.extraHp > 0) this.add1('regen', 0.01 * this.extraHp / s.maxHp);  // Хилинг-Фактор (оценка)
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
    if (has(160)) this.add1('amp', 0.01 * this.schemeN);                             // Схема маны
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
    if (s.maxHp > maxHpBefore + 1e-6 && this.lastHp >= 0) P.heal(s.maxHp - maxHpBefore);
  }
}


/** Номер синергии → id (для UI/отладки) */
export const synergyIdByNum = (n: number) => SYN_KEY_BY_NUM.get(n);
