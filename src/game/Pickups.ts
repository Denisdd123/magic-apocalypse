import Phaser from 'phaser';
import { DEPTH, ORIG_U } from '../config';
import { CHEST_DROP } from '../data/orig';
import { W } from './World';
import type { ChestType } from './ArtifactDeck';

/**
 * Предметы забега 3.0 — по коду оригинала (spawn.md §3, §4, §7):
 * руны 31–34 (`Start_Rune_Attack` / `Unit_Rune_DefenceDivine` / `Start_Rune_Obtain` / `Start_Rune_Clear`),
 * проклятая руна — предмет 18 (`Play_Create_UnitEnemy_Transition`), сундуки (`CreateItem_Character(5 | −5 | −6)`,
 * счётчик убийств `상자 드랍 처치수`), плод Мирового Древа (17, дроп боссов 42–45).
 * Своего таймера у рун 31–34 нет: только поле, дроп элиток, артефакты.
 */

const U = ORIG_U;
/** Obj_Item / Transform_ObjItem localScale 0.8 (C_BattleField.unity, TreasureBox.Play_CreateItem_EffectA), PPU 100: полный холст × 0.8 × ORIG_U/100 */
const PXI = ORIG_U / 100 * 0.8;

/** Кадры оригинала sprite_ui: Item5/6/7 (сундуки) + ItemEffect5/6/7 (белый силуэт), Item17/18/31–34, ItemArrow, ItemPos5/6/7/18 */
export const PICKUPS_LOAD: [string, string][] = [
  ...[5, 6, 7].flatMap((n): [string, string][] => [['pkChest' + n, `art/pickups/Item${n}.png`], ['pkFx' + n, `art/pickups/ItemEffect${n}.png`], ['pkPos' + n, `art/pickups/ItemPos${n}.png`]]),
  ...[31, 32, 33, 34].map((n): [string, string] => ['pkRune' + n, `art/pickups/Item${n}.png`]),
  ['pkTree', 'art/pickups/Item17.png'], ['pkCurse', 'art/pickups/Item18.png'], ['pkPos18', 'art/pickups/ItemPos18.png'],
  ['pkArrow', 'art/pickups/ItemArrow.png'],
  // обелиски 10 / 11 (после волны-зачистки)
  ...[10, 11].flatMap((n): [string, string][] => [['pkChest' + n, `art/pickups/Item${n}.png`], ['pkFx' + n, `art/pickups/ItemEffect${n}.png`]]),
];
/** Цвет стрелки-указателя: предмет / сундук (Obj_ItemPos) */
const ARROW_ITEM = 0xfffae1;
/** Play_CreateItem_EffectA сундука: белый силуэт, альфа 1 − 0.05·i, шаг 0.035 с, 21 шаг */
const FX_STEP = 0.035, FX_N = 21;
/** Play_ItemDuration: время жизни рун и плода Древа (Type_ObjItem 2/3 → ItemDuration 90 с, Start_ItemType) */
const ITEM_LIFE = 90;
const R = (a: number, b: number) => a + Math.random() * (b - a);

/** 31 атака, 32 неуязвимость, 33 притяжение, 34 очищение */
export type RuneType = 'fury' | 'invuln' | 'greed' | 'cleanse';

/** Длительности — StartInformation_B: (9, 9, 3) × (RuneTimeRatio + 100)%; тексты — Dictionary_Name «전투 기록» 21/22/23 */
export const RUNES: Record<RuneType, { id: number; name: string; tint: number; dur: number; text: string }> = {
  fury:    { id: 31, name: 'Руна атаки',         tint: 0xff4a4a, dur: 9, text: 'Усиление атаки, ускорение движения' },
  invuln:  { id: 32, name: 'Руна неуязвимости',  tint: 0xffffff, dur: 9, text: 'Продолжительная неуязвимость' },
  greed:   { id: 33, name: 'Руна притяжения',    tint: 0xffd84a, dur: 3, text: 'Притяжение предметов' },
  cleanse: { id: 34, name: 'Руна очищения',      tint: 0x8fd8ff, dur: 0, text: 'Очищение' },
};
export const RUNE_BY_ID: Record<number, RuneType> = { 31: 'fury', 32: 'invuln', 33: 'greed', 34: 'cleanse' };

interface Item {
  kind: 'chest' | 'rune' | 'curse' | 'tree';
  rune?: RuneType;
  chest?: ChestType;
  x: number; y: number; t: number;
  /** предмет слота поля (CreateItem_Field) — исчезает вместе с плиткой */
  tile?: { x: number; y: number };
  img: Phaser.GameObjects.Image;
  arrow?: Phaser.GameObjects.Image;
  /** портрет в круге указателя (ItemPos<N>) */
  port?: Phaser.GameObjects.Image;
  /** белый силуэт сундука (ItemEffect) — вспышка при появлении */
  fx?: Phaser.GameObjects.Image;
  /** Play_ItemDuration: белый силуэт (ItemFlash, FlashColor = белый) поверх предмета; next — следующая проверка / конец паузы */
  dur?: { fl: Phaser.GameObjects.Image; next: number; d: number; t0: number };
}

/** Проклятая руна: (EnemyLevelNum ≥, всего, из них UP) — пары 0x636558 … 0x636fc0 */
const TRANSITION: [from: number, n: number, up: number][] = [[0, 15, 0], [270, 25, 0], [362, 40, 3], [542, 50, 4], [1802, 60, 5]];
/** Руна очищения: Obj_EnemyCrossGround_Destroy — Box 7.2×12.8 × масштаб (6, 5) = 43.2×64 ед., активен 1.25 с */
const CROSS = { hw: 3.6 * 6 * U, hh: 6.4 * 5 * U, t: 1.25 };

export class Pickups {
  items: Item[] = [];
  /** действующие руны: оставшееся время */
  active = new Map<RuneType, number>();
  /** Transition_EnemyMax / Transition_EnemyNum (C_Battle_Manager) */
  transMax = 0;
  transNum = 0;
  /** ArtifactDropNum и ApplyChestDropCostNum (Play_Unit_Death @0x10c5b48) */
  private chestNum = 0;
  private chestNeed = Math.round(CHEST_DROP[0][0] * (100 + (W.stats?.chestCostRatio ?? 0)) * 0.01);
  /** руна очищения: сколько ещё активно поле */
  private crossT = 0;
  /** плод Мирового Древа: осталось порций маны (25 × 0.03 с) */
  private treeN = 0; private treeT = 0;
  onChest: ((type: ChestType) => void) | null = null;
  onRune: ((r: RuneType) => void) | null = null;
  onCurse: ((n: number, up: number) => void) | null = null;

  constructor(private scene: Phaser.Scene) {}

  private around(minR: number, maxR: number) {
    const a = Math.random() * Math.PI * 2, d = R(minR, maxR);
    return { x: W.player.x + Math.cos(a) * d, y: W.player.y + Math.sin(a) * d };
  }

  /** Obj_ItemPos: масштаб 1.25, круг со стрелкой ItemArrow ×1.5, портрет ×0.78 */
  private arrow(tint: number, portrait?: string): Pick<Item, 'arrow' | 'port'> {
    const k = ORIG_U / 100 * 1.25;
    const arrow = this.scene.add.image(0, 0, 'pkArrow').setDepth(DEPTH.top).setScale(k * 1.5).setTint(tint).setVisible(false);
    const port = portrait ? this.scene.add.image(0, 0, portrait).setDepth(DEPTH.top).setScale(k * 0.78).setVisible(false) : undefined;
    return { arrow, port };
  }

  private kill(it: Item) { it.dur?.fl.destroy(); it.img.destroy(); it.arrow?.destroy(); it.port?.destroy(); it.fx?.destroy(); }

  chest(x: number, y: number, type: ChestType = 5) {
    const img = this.scene.add.image(x, y, 'pkChest' + type).setDepth(DEPTH.orb).setScale(PXI);
    const fx = this.scene.add.image(x, y, 'pkFx' + type).setDepth(DEPTH.orb + 0.1).setScale(PXI);
    // тени у сундуков 5/6/7 нет: TreasureBox.Play_CreateItem_EffectA гасит Obj_ItemShadow, включает только у 9–11
    this.items.push({ kind: 'chest', chest: type, x, y, t: 0, img, fx, ...this.arrow(ARROW_ITEM, type < 9 ? 'pkPos' + type : undefined) });
  }

  /** Play_BossWaveEffect_End → CreateItem_Character(10; с 30:05 — 11 «Сломанный»): обелиск в 2.5 ед. над магом и арена вокруг него */
  obelisk() {
    const P = W.player, x = P.x, y = P.y - 2.5 * U;
    this.chest(x, y, W.time >= 1805 ? 11 : 10);
    W.zone.startArena(x, y);
  }

  /** CreateItem_Character(5 | −5 | −6 | 7): сундук у мага R(2.5, 3.5) / дальний R(35, 45) / R(45, 55) ед. */
  chestAt(id: 5 | -5 | -6 | 7) {
    if (!W.artifacts.chestsAllowed()) return;
    const [a, b] = id === -5 ? [35, 45] : id === -6 ? [45, 55] : [2.5, 3.5];
    const p = this.around(a * U, b * U);
    this.chest(p.x, p.y, id === 7 ? 7 : 5);
  }

  rune(type: RuneType, x: number, y: number, tile?: { x: number; y: number }) {
    const img = this.scene.add.image(x, y, 'pkRune' + RUNES[type].id).setDepth(DEPTH.orb).setScale(PXI);
    // стрелка — только у предметов пула ItemSpecial (не у слотов поля); портрета ItemPos для рун в выгрузке нет
    this.items.push({ kind: 'rune', rune: type, x, y, t: 0, img, tile, dur: this.dur(img), ...(tile ? {} : this.arrow(ARROW_ITEM)) });
  }

  /** CreateItem_Character(18, 1): проклятая руна в R(3.25, 3.5) ед. от мага */
  curse() {
    const p = this.around(3.25 * U, 3.5 * U);
    const img = this.scene.add.image(p.x, p.y, 'pkCurse').setDepth(DEPTH.orb).setScale(PXI);
    this.items.push({ kind: 'curse', x: p.x, y: p.y, t: 0, img, ...this.arrow(ARROW_ITEM, 'pkPos18') });
  }

  /** Плод Мирового Древа (тип 17) — дроп боссов 42–45 */
  tree(x: number, y: number) {
    const img = this.scene.add.image(x, y, 'pkTree').setDepth(DEPTH.orb).setScale(PXI);
    this.items.push({ kind: 'tree', x, y, t: 0, img, dur: this.dur(img), ...this.arrow(ARROW_ITEM) });
  }

  private dur(img: Phaser.GameObjects.Image) {
    const fl = this.scene.add.image(img.x, img.y, img.texture.key).setDepth(DEPTH.orb + 0.1).setScale(img.scaleX).setTintFill(0xffffff).setVisible(false);
    return { fl, next: 1, d: 0, t0: -1 };
  }

  /** Play_ItemDuration (C_Battle_Item @0x11cdb50). L = 90, fade = 1, flashStart = 0.75·L.
   *  До flashStart — проверка раз в 1 с. Дальше импульсы: p = ((t − flashStart)/(L − fade − flashStart))², d = 0.35 − 0.2·p;
   *  вспышка 2d (FlashAmount = 0.7·(1 − |τ/d − 1|)), затем пауза d. Последняя секунда: FlashAmount 1, альфа = остаток/fade.
   *  Вспышка = lerp(цвет, белый, w) — у нас белый силуэт поверх с альфой w. Возвращает true, когда время вышло. */
  private tickDur(it: Item): boolean {
    const D = it.dur!, t = it.t, L = ITEM_LIFE, fade = 1, fs = L * 0.75;
    const rem = L - t;
    if (rem <= 0) return true;
    if (rem <= fade) { it.img.setVisible(false); D.fl.setVisible(true).setAlpha(rem / fade); return false; }
    if (D.t0 < 0) {                       // ждём импульса
      if (t < D.next) return false;
      if (t < fs) { D.next = t + 1; return false; }
      const p = Math.min(1, Math.max(0, (t - fs) / (L - fade - fs)) ** 2);
      D.d = 0.35 - 0.2 * p; D.t0 = t;
    }
    const tau = t - D.t0;
    if (tau < 2 * D.d) { D.fl.setVisible(true).setAlpha(Math.max(0, 1 - Math.abs(tau / D.d - 1)) * 0.7); return false; }
    D.fl.setVisible(false);
    if (tau >= 3 * D.d) { D.t0 = -1; D.next = t; }   // пауза interval = d
    return false;
  }

  /** Убрать руны слотов поля, чья плитка ушла из окна 3×3 (C_LandChange) */
  dropTiles(tx: number, ty: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.tile && (Math.abs(it.tile.x - tx) > 1 || Math.abs(it.tile.y - ty) > 1)) { this.kill(it); this.items.splice(i, 1); }
    }
  }

  /** Сундук по счётчику убийств: Game_KillMonsterNum == ApplyChestDropCostNum, ArtifactDropNum ≤ 67 */
  onKill() {
    if (this.chestNum > 67 || W.kills < this.chestNeed) return;
    this.chestNum++;
    const row = CHEST_DROP[Math.min(this.chestNum, CHEST_DROP.length - 1)];
    this.chestNeed = Math.round(row[0] * (100 + W.stats.chestCostRatio) * 0.01);
    // RelicBoxDropID: один из сундуков 2…7 — «Хранилище реликвий»
    const deck = W.artifacts.deck;
    const relic = deck.relicDropId === this.chestNum && deck.hasRelic;
    if (relic) deck.relicDropId = -1;
    this.chestAt(relic ? 7 : 5);
  }

  randomRune(): RuneType {
    const t: RuneType[] = ['fury', 'invuln', 'greed', 'cleanse'];
    return t[(Math.random() * 4) | 0];
  }

  update(dt: number) {
    const P = W.player;
    const view = this.scene.cameras.main.worldView;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.img.setPosition(it.x, it.y + Math.sin(it.t * 3) * 2);
      if (it.dur) {
        if (this.tickDur(it)) { this.kill(it); this.items.splice(i, 1); continue; }
        it.dur.fl.setPosition(it.img.x, it.img.y);
      }
      if (it.fx) {
        // вспышка силуэта при появлении сундука (альфа 1 − 0.05·i, i по 0.035 с)
        const i = Math.floor(it.t / FX_STEP);
        if (i >= FX_N) { it.fx.destroy(); it.fx = undefined; } else it.fx.setPosition(it.x, it.y + Math.sin(it.t * 3) * 2).setAlpha(1 - 0.05 * i);
      }
      if (it.arrow) {
        // C_Battle_ItemPosCamera: стрелка у края (вьюпорт 0.1…0.9), если предмет не виден
        const inView = view.contains(it.x, it.y);
        it.arrow.setVisible(!inView); it.port?.setVisible(!inView);
        if (!inView) {
          const ax = Phaser.Math.Clamp(it.x, view.x + view.width * 0.1, view.right - view.width * 0.1);
          const ay = Phaser.Math.Clamp(it.y, view.y + view.height * 0.1, view.bottom - view.height * 0.1);
          it.arrow.setPosition(ax, ay).setRotation(Math.atan2(it.y - P.y, it.x - P.x));
          it.port?.setPosition(ax, ay);
        }
      }
      const obelisk = it.kind === 'chest' && it.chest! >= 10;
      const pr = obelisk ? 30 : it.kind === 'chest' ? 16 : 14;
      const touch = Math.hypot(P.x - it.x, P.y - it.y) < pr + P.r;
      if (touch) {
        this.kill(it);
        this.items.splice(i, 1);
        if (it.kind === 'chest') { if (obelisk) W.zone.endArena(); W.artifacts.onChestPick(it.x, it.y); this.onChest?.(it.chest!); } // Мимик
        else if (it.kind === 'curse') this.transition();
        else if (it.kind === 'tree') this.obtainTree();
        else this.activate(it.rune!);
      }
    }

    // действующие руны (Play_Rune_* тикают по 0.5 с — здесь непрерывно)
    for (const [r, t] of this.active) {
      const nt = t - dt;
      if (nt <= 0) { this.active.delete(r); this.end(r); } else this.active.set(r, nt);
    }
    if (this.crossT > 0) { this.crossT -= dt; W.enemies.clearBox(CROSS.hw, CROSS.hh); }
    if (this.treeN > 0) {
      this.treeT -= dt;
      while (this.treeT <= 0 && this.treeN > 0) {
        this.treeT += 0.03; this.treeN--;
        const Pl = W.player, k = Math.min(1, Math.max(0.01, (100 - 0.75 * Pl.level) / 100));
        Pl.manaGain((Pl.xpNeed * 0.01 + 3) * k);
      }
    }
  }

  /** Подбор руны 31–34 */
  activate(r: RuneType) {
    const P = W.player, s = W.stats;
    const dur = RUNES[r].dur * (1 + s.runeDur);
    W.fx.burst(P.x, P.y, 60, RUNES[r].tint, 0.5, 'ring');
    switch (r) {
      // Unit_StatBuff: атака +0.5 к сумме множителя, скорость +25
      case 'fury': s.runeAmp = 0.5; s.runeSpeed = 0.25; break;
      // Unit_Rune_DefenceDivine: IsDivine
      case 'invuln': P.invulnT = Math.max(P.invulnT, dur); break;
      // масштаб зоны подбора 7 + ItemObtainArea (вместо 0 + …) и Play_Rune_Obtain_AllManaBall
      case 'greed': s.runePickup = 7; W.orbs.magnetAll(); break;
      // Play_Rune_Clear_Active: Obj_EnemyCrossGround_Destroy на 1.25 с — гибнут все, кроме иммунных (эффект 11)
      case 'cleanse': this.crossT = CROSS.t; W.enemies.clearBox(CROSS.hw, CROSS.hh); W.fx.burst(P.x, P.y, 320, 0xffffff, 0.6); break;
    }
    if (dur > 0) this.active.set(r, dur);
    this.onRune?.(r);
  }

  private end(r: RuneType) {
    const s = W.stats;
    if (r === 'fury') { s.runeAmp = 0; s.runeSpeed = 0; }
    if (r === 'greed') s.runePickup = 0;
  }

  /** Play_Create_UnitEnemy_Transition: кольцо элиток вокруг мага, число — по EnemyLevelNum в момент подбора */
  private transition() {
    const n = W.waves.levelNum;
    let N = 15, UP = 0;
    for (const [from, a, b] of TRANSITION) if (n >= from) { N = a; UP = b; }
    this.transMax = N; this.transNum = 0;
    W.enemies.queueTransition(N, UP);
    W.fx.burst(W.player.x, W.player.y, 140, 0xb8343f, 0.6, 'ring');
    this.onCurse?.(N, UP);
  }

  /** Play_Unit_Death, элитка: счёт события руны; последняя оставляет сундук (CreateItem_Position(5)) */
  eliteKilled(x: number, y: number) {
    if (this.transMax < 1) return;
    if (++this.transNum >= this.transMax) {
      this.transMax = 0; this.transNum = 0;
      this.chest(x, y);
    }
  }

  /** Obtain_WorldTreeOrb: полное лечение + 25 порций маны (ManaCost·0.01 + 3)·k раз в 0.03 с */
  private obtainTree() {
    const P = W.player;
    P.hp = W.stats.maxHp;
    this.treeN += 25; this.treeT = 0;
    W.fx.burst(P.x, P.y, 80, 0x6dff8a, 0.5, 'ring');
  }
}
