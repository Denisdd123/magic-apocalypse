import Phaser from 'phaser';
import { DEPTH, ORIG_U } from '../config';

/**
 * Земля, виньетка мага, арена босса — 3.0, карточка «локация» (visual.md §6.1, §6.3).
 * Земля: тайлы Land{1,31,32}Deco{A..D} 512 px (PPU 100 → 5.12 ед. = 291 px), шаг решётки 5.0 ед. (284 px) —
 * соседи перекрываются на 7 px, швов нет. Центры тайлов (x = 5k + 2.5, y = 5m + 2.5 ед.) — как в C_Battle_Manager.Start:
 * (j·5 − 7.5) внутри группы, группы с шагом 20 ед. Тип зоны 1 — Random.Range(1,4) → 1 / 31 / 32 один раз на забег,
 * вид A–D — случайно на клетку (здесь — детерминированный хэш клетки и зерна забега, чтобы клетка не «мигала»).
 * Бесконечная решётка вместо 3×3 групп по 4×4 с перекладкой (C_LandChange.LandChange, сдвиг ±20/±40 ед.) — визуально то же.
 * Рисуются только клетки в кадре камеры (≈12 спрайтов на телефоне), пересчёт — когда сменился набор клеток.
 */
const TYPES = [1, 31, 32];
const VARS = ['A', 'B', 'C', 'D'];
export const LOCATION_LOAD: [string, string][] = [
  ...TYPES.flatMap((t) => VARS.map((v) => [`land${t}${v}`, `art/location/Land${t}Deco${v}.png`] as [string, string])),
  ['vision01', 'art/location/Vision01.png'],
];

const PX = ORIG_U / 100;
const STEP = 5 * ORIG_U;            // шаг решётки, 284 px
const HALF = 256 * PX;              // половина тайла, 145.5 px

function hash(i: number, j: number, seed: number) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export class Ground {
  private cells = new Map<number, Phaser.GameObjects.Image>();
  private free: Phaser.GameObjects.Image[] = [];
  private all = new Set<Phaser.GameObjects.GameObject>();
  private vision: Phaser.GameObjects.Image;
  private type = 1;
  private seed = 1;
  private range = '';

  constructor(private scene: Phaser.Scene) {
    this.vision = scene.add.image(0, 0, 'vision01').setScale(6 * PX).setDepth(DEPTH.top + 1).setVisible(false);
    this.all.add(this.vision);
  }

  owns(o: Phaser.GameObjects.GameObject) { return this.all.has(o); }

  /** Новый забег: тип земли Random.Range(1,4) → 1 / 31 / 32, новое зерно видов */
  newRun() {
    this.type = TYPES[(Math.random() * 3) | 0];
    this.seed = (Math.random() * 0x7fffffff) | 0;
    for (const im of this.cells.values()) { im.setVisible(false); this.free.push(im); }
    this.cells.clear(); this.range = '';
    this.vision.setVisible(false);
  }

  /** Каждый кадр: клетки в кадре камеры */
  update(v: Phaser.Geom.Rectangle) {
    const k0 = Math.floor((v.x - HALF) / STEP - 0.5), k1 = Math.ceil((v.right + HALF) / STEP - 0.5);
    const m0 = Math.floor((v.y - HALF) / STEP - 0.5), m1 = Math.ceil((v.bottom + HALF) / STEP - 0.5);
    const r = `${k0},${k1},${m0},${m1}`;
    if (r !== this.range) {
      this.range = r;
      for (const [key, im] of this.cells) {
        const k = (key >> 16) << 16 >> 16, m = (key << 16) >> 16; // распаковка (знаковые 16 бит)
        if (k < k0 || k > k1 || m < m0 || m > m1) { im.setVisible(false); this.free.push(im); this.cells.delete(key); }
      }
      for (let m = m0; m <= m1; m++) for (let k = k0; k <= k1; k++) {
        const key = ((k & 0xffff) << 16) | (m & 0xffff);
        if (this.cells.has(key)) continue;
        let im = this.free.pop();
        const tex = `land${this.type}${VARS[hash(k, m, this.seed) & 3]}`;
        if (!im) { im = this.scene.add.image(0, 0, tex).setScale(PX).setDepth(DEPTH.ground); this.all.add(im); }
        else im.setTexture(tex).setVisible(true);
        im.setPosition(Math.round((k + 0.5) * STEP), Math.round((m + 0.5) * STEP));
        this.cells.set(key, im);
      }
    }
  }

  /** Виньетка Vision01 ×6 на маге; null — боя нет */
  vignette(px: number | null, py = 0) {
    if (px === null) this.vision.setVisible(false);
    else this.vision.setPosition(px, py).setVisible(true);
  }
}
