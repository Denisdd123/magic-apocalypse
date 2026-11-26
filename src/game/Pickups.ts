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

  private arrow(tint: number) {
    return this.scene.add.image(0, 0, 'arrow').setDepth(DEPTH.top).setDisplaySize(12, 12).setTint(tint).setVisible(false);
  }

  chest(x: number, y: number, type: ChestType = 5) {
    const img = this.scene.add.image(x, y, 'chest').setDepth(DEPTH.orb).setDisplaySize(26, 23);
    // вид сундуков 6 / 7 (белый / каменный) — партия 7, пока оттенок
    if (type === 7) img.setTint(0xb9b4c8);
    this.items.push({ kind: 'chest', chest: type, x, y, t: 0, img, arrow: this.arrow(0xfffae1) });
  }

  /** CreateItem_Character(5 | −5 | −6 | 7): сундук у мага R(2.5, 3.5) / дальний R(35, 45) / R(45, 55) ед. */
  chestAt(id: 5 | -5 | -6 | 7) {
    if (!W.artifacts.chestsAllowed()) return;
    const [a, b] = id === -5 ? [35, 45] : id === -6 ? [45, 55] : [2.5, 3.5];
    const p = this.around(a * U, b * U);
    this.chest(p.x, p.y, id === 7 ? 7 : 5);
  }

  rune(type: RuneType, x: number, y: number, tile?: { x: number; y: number }) {
    const img = this.scene.add.image(x, y, 'rune').setDepth(DEPTH.orb).setDisplaySize(18, 18).setTint(RUNES[type].tint).setBlendMode(Phaser.BlendModes.ADD);
    // стрелка — только у предметов пула ItemSpecial (не у слотов поля)
    this.items.push({ kind: 'rune', rune: type, x, y, t: 0, img, tile, arrow: tile ? undefined : this.arrow(RUNES[type].tint) });
  }

  /** CreateItem_Character(18, 1): проклятая руна в R(3.25, 3.5) ед. от мага */
  curse() {
    const p = this.around(3.25 * U, 3.5 * U);
    const img = this.scene.add.image(p.x, p.y, 'rune').setDepth(DEPTH.orb).setDisplaySize(20, 20).setTint(0xb8343f);
    this.items.push({ kind: 'curse', x: p.x, y: p.y, t: 0, img, arrow: this.arrow(0xb8343f) });
  }

  /** Плод Мирового Древа (тип 17) — дроп боссов 42–45 */
  tree(x: number, y: number) {
    const img = this.scene.add.image(x, y, 'orb_l').setDepth(DEPTH.orb).setDisplaySize(22, 22).setTint(0x6dff8a);
    this.items.push({ kind: 'tree', x, y, t: 0, img, arrow: this.arrow(0x6dff8a) });
  }

  /** Убрать руны слотов поля, чья плитка ушла из окна 3×3 (C_LandChange) */
  dropTiles(tx: number, ty: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.tile && (Math.abs(it.tile.x - tx) > 1 || Math.abs(it.tile.y - ty) > 1)) { it.img.destroy(); it.arrow?.destroy(); this.items.splice(i, 1); }
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
      if (it.kind === 'rune' || it.kind === 'curse') it.img.setAlpha(0.75 + 0.25 * Math.sin(it.t * 5));
      if (it.arrow) {
        // C_Battle_ItemPosCamera: стрелка у края (вьюпорт 0.1…0.9), если предмет не виден
        const inView = view.contains(it.x, it.y);
        it.arrow.setVisible(!inView);
        if (!inView) {
          const ax = Phaser.Math.Clamp(it.x, view.x + view.width * 0.1, view.right - view.width * 0.1);
          const ay = Phaser.Math.Clamp(it.y, view.y + view.height * 0.1, view.bottom - view.height * 0.1);
          it.arrow.setPosition(ax, ay).setRotation(Math.atan2(it.y - P.y, it.x - P.x));
        }
      }
      const pr = it.kind === 'chest' ? 16 : 14;
      const touch = Math.hypot(P.x - it.x, P.y - it.y) < pr + P.r;
      if (touch) {
        it.img.destroy(); it.arrow?.destroy();
        this.items.splice(i, 1);
        if (it.kind === 'chest') { W.artifacts.onChestPick(it.x, it.y); this.onChest?.(it.chest!); } // Мимик
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
