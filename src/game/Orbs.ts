import Phaser from 'phaser';
import { DEPTH, MAX_ORBS, VIEW_W, ORIG_U } from '../config';

/** Кадры оригинала sprite_ui/Item1/2/3/15 (тип предмета = номер спрайта) */
export const ORBS_LOAD: [string, string][] = [
  ['orbItem1', 'art/orbs/Item1.png'], ['orbItem2', 'art/orbs/Item2.png'],
  ['orbItem3', 'art/orbs/Item3.png'], ['orbItem15', 'art/orbs/Item15.png'],
];

/** Опыт со сферы, как в оригинале: от «стоимости» текущего уровня, с уровнем чуть падает */
export function orbXp(kind: OrbKind): number {
  const P = W.player, mc = P.xpNeed;
  const mul = Math.min(1, Math.max(0.01, (100 - 0.75 * P.level) / 100));
  const base = kind === 's' ? 0.008 * mc + 8 : kind === 'm' ? 0.01 * mc + 10 : 0.03 * mc + 50;
  return base * mul;
}
import { W } from './World';

export type OrbKind = 's' | 'm' | 'l' | 'life';

export interface Orb {
  /** value — сколько сфер слилось в одну (при переполнении) */
  x: number; y: number; kind: OrbKind; value: number;
  alive: boolean; magnet: boolean; v: number;
  /** кристалл «плитки поля» (tile=true): исчезает, когда его плитка уходит из окна 3×3 вокруг мага */
  tile: boolean; tx: number; ty: number;
  img: Phaser.GameObjects.Image;
}

const TEX: Record<OrbKind, string> = { s: 'orbItem1', m: 'orbItem2', l: 'orbItem3', life: 'orbItem15' };
/** Obj_Item localScale 0.8 (C_BattleField.unity), PPU 100: полный холст спрайта × 0.8 × ORIG_U/100 */
const PXO = ORIG_U / 100 * 0.8;
const CANVAS: Record<OrbKind, number> = { s: 48, m: 48, l: 128, life: 80 };
/** 1 ед. мира оригинала в наших единицах (камера оригинала — 6.69 ед. по ширине) */
const U = VIEW_W / 6.69;
/**
 * Кристаллы на поле — как в оригинале (C_LandChange + C_Battle_Item.CreateItem_Field):
 * земля — сетка 3×3 плиток 20×20 ед., «едет» за магом; у каждой плитки 20 мест под предмет.
 * При появлении плитки каждое место с шансом 100·86/195 % (≈44%, × «Удача») получает кристалл в случайной
 * точке плитки (±10 ед.); вид: Random(1..188) = 1 → большой, 2..18 → средний, иначе малый.
 * Когда плитка уходит из окна, её несобранные кристаллы исчезают, у новой — генерируются заново.
 * (Число «мест под ману» из 20 в префабе не снято — считаем все 20; руны/особые предметы мест типа 3 — не здесь.)
 */
/** CreateItem_Field: на тайл 20×20 ед. — 17 слотов сфер (непуст с шансом Ran·86/195 %) и 3 слота «руна / сердце» (Ran·21/195 %) */
const FIELD = { tile: 20 * U, slots: 17, chance: 86 / 195, slots3: 3, chance3: 21 / 195, spread: 10 * U };
/**
 * Стартовые кристаллы (C_Battle_Manager.CreateItem_StartItem): floor(50 × (1 + «Поддержка»)) штук,
 * x = cos a · U(2.8, 11) ед., y = sin a · U(2.8, 11) ед. от мага; 80% малые, 20% средние.
 */
const START = { num: 50, rMin: 2.8 * U, rMax: 11 * U, smallPct: 80 };
/** Половина размера на экране: полный холст × 0.8 × PX (коллайдер предмета BoxCollider 0.25 × 0.8 = 0.2 ед.) */
const SIZE: Record<OrbKind, number> = { s: CANVAS.s * PXO / 2, m: CANVAS.m * PXO / 2, l: CANVAS.l * PXO / 2, life: CANVAS.life * PXO / 2 };

/** Сферы эссенции (опыт) и сферы жизни */
export class Orbs {
  private list: Orb[] = [];
  private free: Orb[] = [];
  private count = 0;
  constructor(private scene: Phaser.Scene) {}

  drop(x: number, y: number, kind: OrbKind, value = 1): Orb | null {
    // слишком много сфер — добавляем ценность к случайной существующей (без потерь опыта)
    if (this.count >= MAX_ORBS && kind !== 'life') {
      const o = this.list[(Math.random() * this.list.length) | 0];
      if (o && o.alive && o.kind === kind && !o.tile) { o.value += value; return null; }
    }
    let o = this.free.pop();
    if (!o) {
      o = { x, y, kind, value, alive: true, magnet: false, v: 0, tile: false, tx: 0, ty: 0, img: this.scene.add.image(x, y, TEX[kind]).setDepth(DEPTH.orb) };
      this.list.push(o);
    }
    o.x = x; o.y = y; o.kind = kind; o.value = value; o.alive = true; o.magnet = false; o.v = 0; o.tile = false;
    o.img.setTexture(TEX[kind]).setPosition(x, y).setVisible(true).setDisplaySize(SIZE[kind] * 2, SIZE[kind] * 2);
    this.count++;
    return o;
  }

  /** Притянуть все сферы (руна Жадности и т.п.) */
  magnetAll() { for (const o of this.list) if (o.alive && o.kind !== 'life') o.magnet = true; }

  /** Старт забега: кристаллы вокруг мага + заполнение плиток поля 3×3 (вызывать после создания мага) */
  startField() {
    const P = W.player, n = Math.floor(START.num * (1 + W.stats.startOrbs));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const rx = START.rMin + Math.random() * (START.rMax - START.rMin), ry = START.rMin + Math.random() * (START.rMax - START.rMin);
      this.drop(P.x + Math.cos(a) * rx, P.y + Math.sin(a) * ry, 1 + ((Math.random() * 100) | 0) <= START.smallPct ? 's' : 'm', 1);
    }
    this.tileX = this.tileY = NaN;
    this.updateTiles();
  }

  private tileX = NaN; private tileY = NaN;

  /** Плитки поля едут за магом: ушедшие из окна 3×3 теряют кристаллы, пришедшие — получают новые */
  private updateTiles() {
    const P = W.player, T = FIELD.tile;
    const tx = Math.round(P.x / T), ty = Math.round(P.y / T);
    if (tx === this.tileX && ty === this.tileY) return;
    const ox = this.tileX, oy = this.tileY, first = Number.isNaN(ox);
    this.tileX = tx; this.tileY = ty;
    if (!first) {
      for (const o of this.list) {
        if (!o.alive || !o.tile || o.magnet) continue;
        if (Math.abs(o.tx - tx) > 1 || Math.abs(o.ty - ty) > 1) this.remove(o);
      }
      W.pickups.dropTiles(tx, ty);
    }
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const cx = tx + i, cy = ty + j;
      if (first || Math.abs(cx - ox) > 1 || Math.abs(cy - oy) > 1) this.fillTile(cx, cy);
    }
  }

  private fillTile(cx: number, cy: number) {
    const T = FIELD.tile, ch = FIELD.chance * (1 + W.stats.fieldItemRate);
    for (let i = 0; i < FIELD.slots; i++) {
      if (Math.random() >= ch) continue;
      const r = 1 + ((Math.random() * 188) | 0);
      const kind: OrbKind = r === 1 ? 'l' : r <= 18 ? 'm' : 's';
      const o = this.drop(cx * T + (Math.random() * 2 - 1) * FIELD.spread, cy * T + (Math.random() * 2 - 1) * FIELD.spread, kind, 1);
      if (o) { o.tile = true; o.tx = cx; o.ty = cy; }
    }
    // слот типа 3: Random(1, 3001) — клетки 21–23 (валюта вне забега, не переносим), руны 31–34, сердце 15
    const ch3 = FIELD.chance3 * (1 + W.stats.fieldItemRate);
    for (let i = 0; i < FIELD.slots3; i++) {
      if (Math.random() >= ch3) continue;
      const r = 1 + ((Math.random() * 3000) | 0);
      const x = cx * T + (Math.random() * 2 - 1) * FIELD.spread, y = cy * T + (Math.random() * 2 - 1) * FIELD.spread;
      if (r < 751) continue;
      if (r < 1101) { W.pickups.rune(r < 851 ? 'fury' : r < 951 ? 'invuln' : r < 1001 ? 'greed' : 'cleanse', x, y, { x: cx, y: cy }); continue; }
      if (r < 2601) { const o = this.drop(x, y, 'life', 0); if (o) { o.tile = true; o.tx = cx; o.ty = cy; } }
    }
  }

  /** Убрать без сбора */
  private remove(o: Orb) {
    o.alive = false;
    o.img.setVisible(false);
    this.free.push(o);
    this.count--;
  }

  update(dt: number) {
    this.updateTiles();
    const P = W.player;
    const pr = W.stats.pickupRadius;
    for (const o of this.list) {
      if (!o.alive) continue;
      const dx = P.x - o.x, dy = P.y - o.y;
      const d = Math.hypot(dx, dy);
      if (!o.magnet && d < pr) o.magnet = true;
      if (o.magnet) {
        o.v = Math.min(o.v + 900 * dt, 520);
        const step = Math.min(d, o.v * dt);
        o.x += (dx / (d || 1)) * step; o.y += (dy / (d || 1)) * step;
        o.img.setPosition(o.x, o.y);
        if (d < P.r + 4) this.collect(o);
      }
    }
  }

  private collect(o: Orb) {
    o.alive = false;
    o.img.setVisible(false);
    this.free.push(o);
    this.count--;
    const A = W.artifacts, s = W.stats;
    if (o.kind === 'life') {
      // сердце (тип 15): HpMax × (100 + HpRecoveryU − D) × 15 × 0.0001 = 15 %
      const v = s.maxHp * 0.15 * (1 + s.lifeOrbHeal);
      if (A.orbFx) A.onLifeOrb(v); // Жизненный щит, Глаз смотрящего
      W.player.heal(v);
    } else {
      // Специфика (artFx[63]): малые сферы считаются средними; Фонарь/Ртуть (artFx[45]): опыт от сфер +N%
      const kind = o.kind === 's' && s.artFx[63] ? 'm' : o.kind;
      // мана-валюта (торговец): малая/средняя +1, большая +5; опыт — по формуле оригинала
      W.mana += (kind === 'l' ? 5 : 1) * o.value;
      W.player.gainXp(orbXp(kind) * o.value * (1 + (s.artFx[45] ?? 0) / 100));
      if (A.orbFx) A.onManaOrb(o.value); // Схема маны, Колокол смерти
    }
  }
}
