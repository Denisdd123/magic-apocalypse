// Колоды артефактов — порт `C_Battle_Manager.Start` (@0x10a356c…0x10a4fc0) и выбор `V_Artifact_Manager.Create_Artifact`
// / `Create_Merchant`. Библия: spawn.md §8 «Ассортимент», §9. Числа здесь — номера артефактов (41…222).
import { ART_DATA } from '../data/artifacts_data';

/** тип сундука: 5 — Сундук с сокровищами, 6 — Чёрный ящик, 7 — Хранилище реликвий */
export type ChestType = 5 | 6 | 7;

const COPIES = 5;
/** Random.Range(a, b) целых: b не входит */
const rint = (a: number, b: number) => a + Math.floor(Math.random() * (b - a));

/** пулы по «요구레벨» 1…5 (C, B, A, P, S), каждый артефакт — 5 копий */
function gradePools(): number[][] {
  const pools: number[][] = [[], [], [], [], []];
  for (const a of ART_DATA) for (let i = 0; i < COPIES; i++) pools[a.grade - 1].push(a.num);
  return pools;
}

/** List.Remove(id) × n: по одной копии с начала */
function remove(list: number[], id: number, n = 1) {
  for (let i = 0; i < n; i++) {
    const k = list.indexOf(id);
    if (k < 0) return;
    list.splice(k, 1);
  }
}
const distinct = (l: number[]) => [...new Set(l)];

/** Одна обычная фаза колоды: `rolls` выборов по шансам редкостей, выпавший «остывает» `cool` выборов */
function fill(pools: number[][], limits: number[], max: number, cool: number): number[] {
  const out: number[] = [], recent: number[] = [];
  let cand: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const r = rint(1, max);
    let g = limits.findIndex((lim) => r <= lim);
    if (g < 0) g = 3;
    while (g < 3 && !pools[g].length) g++;
    if (pools[g].length) cand = pools[g];
    const x = cand.slice();
    for (let h = 0; h < recent.length; h++) {
      const id = recent[h];
      if (x.includes(id)) { remove(x, id, 5); remove(recent, id); }
    }
    if (!x.length) continue;
    const id = x[rint(0, x.length)];
    for (let k = 0; k < cool; k++) recent.push(id);
    for (let k = 0; k < 2; k++) {
      const p = pools.find((q) => q.includes(id));
      if (!p) break;
      remove(p, id);
      if (!p.includes(id)) p.push(id); // последняя копия остаётся
    }
    out.push(id);
  }
  return out;
}

export class ArtifactDeck {
  /** List_ArtifactDrop: ≈1000 обычных + 153 легендарных в хвосте */
  drop: number[] = [];
  /** List_MerchantItem */
  merchant: number[] = [];
  /** RelicBoxDropID: какой по счёту сундук за убийства станет «Хранилищем реликвий» (−1 — уже был) */
  relicDropId = rint(2, 8);
  /** ArtifactPossibleNum_P01…P03 и P04…P06 — отложенные артефакты для Хранилища реликвий */
  private reservedA: number[] = [];
  private reservedB: number[] = [];
  /** KeyChestChangeNum («Связка ключей») */
  keys = 0;
  /** ApplyLegendaryArtifactRanObtain_ON («Золотая рулетка») */
  roulette = false;

  constructor() {
    // ---- колода сундуков ----
    const pools = gradePools();
    const [, , A, P, S] = pools;
    remove(P, 66, 2); remove(P, 116); remove(P, 162); remove(P, 168, 8); remove(P, 193, 3);
    remove(P, 214, 2); remove(P, 222, 2); remove(A, 218);
    const reserved: number[] = [];
    for (let i = 0; i < 6; i++) { const id = P[rint(0, P.length)]; reserved.push(id); remove(P, id, 8); }
    this.reservedA = reserved.slice(0, 3);
    this.reservedB = reserved.slice(3, 6);
    for (let i = 0; i < 8; i++) P.push(168);
    this.drop = fill(pools, [52, 105, 123, 127], 128, 9);

    // легендарные: 51 раз по 3; последние 3 не повторяются, предыдущие — с шансом 20 % / 60 %
    const leg: number[] = [], r1: number[] = [], r2: number[] = [], r3: number[] = [];
    for (let i = 0; i < 51; i++) {
      const d = distinct(S);
      for (let k = 0; k < 3; k++) {
        if (r3.length >= 1 && r3.length - 3 === r2.length) { const v = r3[0]; if (rint(0, 10) <= 3) remove(d, v); remove(r3, v); }
        if (r2.length >= 1 && r2.length - 3 === r1.length) { const v = r2[0]; if (rint(0, 10) <= 7) remove(d, v); remove(r2, v); }
        if (r1.length >= 1) { const v = r1[0]; remove(d, v); remove(r1, v); }
      }
      for (let k = 0; k < 3 && d.length; k++) {
        const v = d[rint(0, d.length)];
        leg.push(v); remove(d, v); r1.push(v); r2.push(v); r3.push(v);
      }
    }
    for (let j = leg.length - 1; j >= 0; j--) this.drop.push(leg[j]);

    // ---- колода торговца ---- (легендарных у него нет)
    const m = gradePools();
    const [, mB, mA, mP] = m;
    remove(mP, 66, 2); remove(mP, 116); remove(mP, 162, 2); remove(mP, 168, 4); remove(mP, 193, 4);
    remove(mA, 69, 8); remove(mP, 182, 8); remove(mP, 198, 8); remove(mP, 214, 8); remove(mP, 222, 8);
    remove(mB, 217, 8); remove(mA, 218, 8); remove(mA, 219, 8);
    for (const id of reserved) remove(mP, id, 8);
    this.merchant = fill(m.slice(0, 4), [15, 32, 60, 71], 72, 12);
  }

  /** Есть ли ещё отложенные артефакты для «Хранилища реликвий» (P01) */
  get hasRelic() { return this.reservedA.length > 0; }

  /**
   * Create_Artifact: что показать в сундуке. `legend` — берутся легендарные из хвоста колоды.
   * Показанные артефакты уходят из колоды, даже если их не взяли.
   */
  open(type: ChestType, owned: (id: number) => boolean, level: number): { ids: number[]; legend: boolean; roulette: boolean } {
    const free = (id: number) => !owned(id);
    const a = distinct(this.drop).filter(free);
    const b = distinct(this.drop.slice(-99)).filter(free);
    remove(b, 168);
    if (level >= 100) remove(a, 168); // Global_LevelMax
    const roulette = this.roulette;
    if (type === 6 || roulette) {
      this.roulette = false;
      const ids = (roulette ? [b[3] ?? b[0]] : b.slice(0, 3)).filter((x) => x !== undefined);
      for (const id of ids) { const k = this.drop.lastIndexOf(id); if (k >= 0) this.drop.splice(k, 1); }
      return { ids, legend: true, roulette };
    }
    let list = a;
    if (type === 7) {
      const res = this.reservedB.length ? this.reservedB.splice(0) : this.reservedA.splice(0);
      const got = res.filter(free);
      if (got.length) list = got;
    }
    const ids = list.slice(0, 3);
    for (const id of ids) remove(this.drop, id);
    return { ids, legend: false, roulette: false };
  }

  /** Distinct(List_MerchantItem).Count — торговец приходит, только если товаров ≥ 11 */
  get merchantStock() { return distinct(this.merchant).length; }

  /** Create_Merchant: до 8 первых неполученных товаров (пока в списке ≥ 3); показанные уходят из колоды */
  merchantItems(owned: (id: number) => boolean, level: number): number[] {
    const items = distinct(this.merchant).filter((id) => !owned(id));
    if (level >= 100) remove(items, 168);
    const out: number[] = [];
    while (out.length < 8 && items.length >= 3) {
      const id = items.shift()!;
      out.push(id);
      remove(this.merchant, id);
    }
    return out;
  }
}

/** Цены торговца: база по редкости 1…4 */
export const MERCHANT_BASE = [0, 220, 260, 360, 520];
/** Множитель по визиту ApplyMerchantNum 1…7+ (он же k у «Монеты»/«Гоблина» по MerchantNum 0…6+) */
export const VISIT_MUL = [1, 1.25, 1.6, 2.2, 2.8, 3.5, 3.75];
