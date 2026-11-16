import { GRID_CELL } from '../config';

export interface GridItem { x: number; y: number; r: number; alive: boolean; }

/** Пространственная сетка: быстрый поиск врагов рядом с точкой. Перестраивается каждый кадр. */
export class Grid<T extends GridItem> {
  private cells = new Map<number, T[]>();
  private used: T[][] = [];

  private key(cx: number, cy: number) { return (cx + 30000) * 65536 + (cy + 30000); }

  clear() {
    for (const arr of this.used) arr.length = 0;
    this.used.length = 0;
  }

  insert(item: T) {
    const cx = Math.floor(item.x / GRID_CELL), cy = Math.floor(item.y / GRID_CELL);
    const k = this.key(cx, cy);
    let arr = this.cells.get(k);
    if (!arr) { arr = []; this.cells.set(k, arr); }
    if (arr.length === 0) this.used.push(arr);
    arr.push(item);
  }

  /**
   * Без замыканий (для горячего цикла физики): кладёт в out до max живых объектов, чей круг
   * пересекается с кругом (x,y,r). Возвращает их число. out переиспользуется вызывающим.
   */
  near(x: number, y: number, r: number, out: T[], max: number): number {
    const pad = r + 40;
    const x0 = Math.floor((x - pad) / GRID_CELL), x1 = Math.floor((x + pad) / GRID_CELL);
    const y0 = Math.floor((y - pad) / GRID_CELL), y1 = Math.floor((y + pad) / GRID_CELL);
    let n = 0;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const it = arr[i];
          if (!it.alive) continue;
          const dx = it.x - x, dy = it.y - y, rr = r + it.r;
          if (dx * dx + dy * dy < rr * rr) { out[n++] = it; if (n >= max) return n; }
        }
      }
    }
    return n;
  }

  /** Вызывает cb для каждого живого объекта, чей круг пересекается с кругом (x,y,r). cb вернул true — стоп. */
  query(x: number, y: number, r: number, cb: (item: T) => boolean | void) {
    const pad = r + 40; // учёт радиуса самих врагов
    const x0 = Math.floor((x - pad) / GRID_CELL), x1 = Math.floor((x + pad) / GRID_CELL);
    const y0 = Math.floor((y - pad) / GRID_CELL), y1 = Math.floor((y + pad) / GRID_CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const it = arr[i];
          if (!it.alive) continue;
          const dx = it.x - x, dy = it.y - y, rr = r + it.r;
          if (dx * dx + dy * dy <= rr * rr) { if (cb(it)) return; }
        }
      }
    }
  }
}
