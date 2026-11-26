import Phaser from 'phaser';
import { DEPTH, ORIG_U } from '../../../config';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';

/**
 * Снаряды «как в оригинале» (C_Battle_AllyBullet): коллайдер — прямоугольник по направлению полёта
 * (BoxCollider в локальных ед. × localScale), каждый враг получает удар один раз (List_EnemyUnitID_Damage),
 * пробой PierceNum, прозрачность по формуле корутины. Все размеры здесь — в ед. оригинала × U.
 * Источники чисел — docs/orig/spells/bolt.md, spirit.md.
 */

/** 1 ед. оригинала в наших единицах (56.8) */
export const U = ORIG_U;
/** тик корутин WaitForSeconds(0.03) */
export const TICK = 0.03;
const DEG = Math.PI / 180;
/** 1 px спрайта оригинала (PPU 100) в наших единицах */
export const PX = U / 100;

/** Приоритет цели List_TargetPriority_ObjEGUnit: 0.5 у UnitID 41–46 (боссы/эпики), иначе 1 */
const prio = (e: Enemy) => (e.type.uid >= 41 && e.type.uid <= 46 ? 0.5 : 1);

/**
 * Выбор цели Unit_DistanceAttack / Play_Spirit_Attack: d = (|dx| + |dy|)·приоритет (ед. оригинала).
 * Стрельба только если лучшая цель d ≤ range. Вторая и третья цели — следующие минимумы без проверки дальности;
 * при нехватке врагов повторяются (dist += 99999: 1 враг → [a, a, a], 2 → [a, b, a]).
 */
export function origTargets(x: number, y: number, range: number): Enemy[] | null {
  let a: Enemy | null = null, b: Enemy | null = null, c: Enemy | null = null;
  let da = Infinity, db = Infinity, dc = Infinity;
  for (const e of W.enemies.list) {
    if (!e.alive) continue;
    const d = ((Math.abs(e.x - x) + Math.abs(e.y - y)) / U) * prio(e);
    if (d < da) { c = b; dc = db; b = a; db = da; a = e; da = d; }
    else if (d < db) { c = b; dc = db; b = e; db = d; }
    else if (d < dc) { c = e; dc = d; }
  }
  if (!a || da > range) return null;
  return [a, b ?? a, c ?? a];
}

// ———————————— текстуры (по меркам спрайтов оригинала, docs/orig/assets/spells; рисуем вместе с Денисом позже) ————————————
export const OT = {
  bolt: 'ob_bolt', arrow: 'ob_arrow', cracker: 'ob_b8', split: 'ob_b10', shot: 'ob_shot',
  blade: 'ob_blade', smoke: 'ob_smoke', wisp: 'ob_wisp', glow: 'ob_glow',
  sat: 'ob_sat4', satWisp: 'ob_sat6', satSun: 'ob_sat7', satBlade: 'ob_sat18', satMag: 'ob_sat14', satHyp: 'ob_sat10',
};
/** реальный размер спрайта оригинала (px) для текстур, нарисованных в другом размере: scaleX = мерка / ширина текстуры */
export const OT_PX: Record<string, [number, number]> = {
  ob_sat4: [61, 61], ob_sat6: [59, 59], ob_sat7: [512, 128], ob_sat18: [128, 64], ob_sat14: [256, 64], ob_sat10: [128, 64],
};

type G = Phaser.GameObjects.Graphics;
function tex(key: string, w: number, h: number, draw: (g: G) => void) {
  const tx = W.scene.textures;
  if (tx.exists(key)) return;
  const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}
/** «Стрела» из слоёв: ореол-эллипс, средний слой, белая сердцевина (как на кадрах Incinerate/Bullet) */
function streak(g: G, w: number, h: number, core: [number, number, number, number]) {
  const cx = w / 2, cy = h / 2;
  g.fillStyle(0xffffff, 0.14); g.fillEllipse(cx, cy, w * 0.95, h * 0.62);
  g.fillStyle(0xffffff, 0.3); g.fillEllipse(cx, cy, w * 0.82, h * 0.36);
  g.fillStyle(0xffffff, 1); g.fillRoundedRect(core[0], core[1], core[2], core[3], Math.min(core[3] / 2, 3));
}

export function ensureOrigTextures() {
  // Bullet1_01: видимая часть 28×12 px, белая капсула с мягкой кромкой 1–2 px
  tex(OT.bolt, 32, 17, (g) => {
    g.fillStyle(0xffffff, 0.22); g.fillRoundedRect(3, 4, 26, 10, 5);
    g.fillStyle(0xffffff, 0.55); g.fillRoundedRect(5, 5, 23, 8, 4);
    g.fillStyle(0xffffff, 1); g.fillRoundedRect(7, 6, 20, 6, 3);
  });
  // Incinerate3_0x (стрела): 176×57, тонкая длинная сердцевина
  tex(OT.arrow, 176, 57, (g) => streak(g, 176, 57, [28, 26, 140, 4]));
  // Bullet8_01 (петарда): 71×41, сердцевина ~50×5
  tex(OT.cracker, 71, 41, (g) => streak(g, 71, 41, [12, 18, 50, 5]));
  // Bullet10_01 (раскол): 59×20, линза ~46×4
  tex(OT.split, 59, 20, (g) => {
    g.fillStyle(0xffffff, 0.25); g.fillEllipse(29, 10, 52, 9);
    g.fillStyle(0xffffff, 1); g.fillEllipse(28, 9.5, 44, 4.5);
  });
  // Incinerate5_00 (снаряд духа): 77×32, сердцевина ~46×4 в мягком овале
  tex(OT.shot, 77, 32, (g) => streak(g, 77, 32, [12, 14, 46, 4]));
  // Incinerate18 (клинок духа): 217×38, длинный тонкий разрез
  tex(OT.blade, 217, 38, (g) => streak(g, 217, 38, [8, 17, 196, 3]));
  // BulletSmoke1: точка ~10 px
  tex(OT.smoke, 12, 12, (g) => { g.fillStyle(0xffffff, 0.35); g.fillCircle(6, 6, 5.5); g.fillStyle(0xffffff, 1); g.fillCircle(6, 6, 4); });
  // UnitSpirit1MotionA: белый огонёк 22×28 с лучиками (капля вверх)
  tex(OT.wisp, 28, 28, (g) => {
    g.fillStyle(0xffffff, 0.35); g.fillCircle(13, 15, 8);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(13, 15, 5.5);
    g.fillTriangle(8, 13, 18, 13, 14, 4);
    g.fillTriangle(9, 18, 12, 18, 9, 25); g.fillTriangle(14, 19, 17, 18, 16, 26);
    g.fillRect(14, 4, 1, 3); g.fillRect(8, 7, 1, 2); g.fillRect(18, 7, 1, 2);
  });
  // UnitSpirit4MotionA (спутник): 61×60, белое ядро Ø30 с зубчиками, мягкий ореол до Ø56
  tex(OT.sat, 61, 61, (g) => {
    for (let i = 0; i < 5; i++) { g.fillStyle(0xffffff, 0.05 + i * 0.04); g.fillCircle(30.5, 30.5, 28 - i * 2.6); }
    g.fillStyle(0xffffff, 1); g.fillCircle(30.5, 30.5, 15);
    for (const [x, y, w, h] of [[13, 21, 4, 1], [44, 31, 5, 1], [27, 13, 1, 4], [33, 44, 1, 5], [42, 18, 2, 2], [17, 41, 2, 2]]) g.fillRect(x, y, w, h);
  });
  // UnitSpirit6MotionA (огонёк 390): 59×58, голубое ядро ~16 px, широкий бледный ореол
  tex(OT.satWisp, 59, 59, (g) => {
    for (let i = 0; i < 6; i++) { g.fillStyle(0x9fdfe6, 0.04 + i * 0.025); g.fillCircle(29.5, 29.5, 28 - i * 3.5); }
    g.fillStyle(0x5fe3ff, 1); g.fillCircle(29.5, 29.5, 8);
    g.fillTriangle(20, 29, 30, 25, 30, 33); g.fillTriangle(30, 21, 34, 29, 27, 28);
    g.fillStyle(0xffffff, 1); g.fillCircle(30.5, 29.5, 4);
  });
  // UnitSpirit7MotionA (солнце 391): 512 px (рисуем 128 и тянем ×4): ядро Ø~85 % — светлое, к краю оранжевое и красное, розовый ореол
  tex(OT.satSun, 128, 128, (g) => {
    g.fillStyle(0xff3030, 0.12); g.fillCircle(64, 64, 63);
    g.fillStyle(0xff4a3a, 0.2); g.fillCircle(64, 64, 52);
    g.fillStyle(0xf22a10, 1); g.fillCircle(64, 64, 43);
    g.fillStyle(0xff8a1a, 1); g.fillCircle(64, 64, 38);
    g.fillStyle(0xffc860, 1); g.fillCircle(64, 64, 31);
    g.fillStyle(0xffe9b0, 1); g.fillCircle(64, 64, 22);
    g.fillStyle(0xfff4ea, 1); g.fillCircle(64, 64, 13);
  });
  // UnitSpirit18 (клинок 62): 128 px, узкий белый клинок вдоль оси x (рисуем 64)
  tex(OT.satBlade, 64, 64, (g) => streak(g, 64, 64, [8, 30, 48, 4]));
  // UnitSpirit14 (магнитное поле 45): 256 px, рисуем 64: кольцо-сфера
  tex(OT.satMag, 64, 64, (g) => {
    for (let i = 0; i < 5; i++) { g.fillStyle(0xbfe8ff, 0.06 + i * 0.05); g.fillCircle(32, 32, 30 - i * 3); }
    g.fillStyle(0xffffff, 1); g.fillCircle(32, 32, 11);
  });
  // UnitSpirit10/11 (Гиперион 32): 128 px, рисуем 64: солнце
  tex(OT.satHyp, 64, 64, (g) => {
    g.fillStyle(0xff4a3a, 0.2); g.fillCircle(32, 32, 31);
    g.fillStyle(0xff8a1a, 1); g.fillCircle(32, 32, 22);
    g.fillStyle(0xffe9b0, 1); g.fillCircle(32, 32, 14);
  });
  // UnitSpirit1MotionD (кадр выстрела): мягкий круг 56 px
  tex(OT.glow, 59, 59, (g) => {
    for (let i = 0; i < 6; i++) { g.fillStyle(0xffffff, 0.09 + i * 0.05); g.fillCircle(29.5, 29.5, 27 - i * 3.6); }
  });
}

// ———————————— снаряд ————————————
export interface OBullet {
  alive: boolean;
  x: number; y: number; ang: number;
  /** скорость, наших ед./с (0 — стоит) */
  sp: number;
  t: number; life: number;
  /** до этого времени снаряд стоит на месте (рост стрелы) */
  moveAt: number;
  dmg: number; pierce: number; hitN: number;
  /** коллайдер: половины длины/ширины и сдвиг центра вдоль направления (наших ед.); hl = 0 — выключен */
  hl: number; hw: number; cx: number;
  hits: Set<number>;
  img: Phaser.GameObjects.Image;
  /** прозрачность от времени полёта (null — 1) */
  alpha: ((b: OBullet) => number) | null;
  /** дымок BulletSmoke: раз в smokeDt с */
  smokeDt: number; smokeT: number; smokeTint: number;
  src: string;
  /** своя логика каждый кадр (кадры роста, коллайдер по кадрам) */
  step?: (b: OBullet, dt: number) => void;
  /** попадание: по умолчанию — урон dmg; true — снаряд обработал сам */
  onHit?: (b: OBullet, e: Enemy) => boolean | void;
  onEnd?: (b: OBullet) => void;
  data?: any;
}

export type OBulletInit = Partial<OBullet> & { x: number; y: number; ang: number; tex: string; scaleX: number; scaleY?: number; tint?: number };

/** Пул снарядов одного заклинания */
export class OrigBullets {
  private list: OBullet[] = [];
  private free: OBullet[] = [];

  fire(o: OBulletInit): OBullet {
    let b = this.free.pop();
    if (!b) {
      b = { img: W.scene.add.image(0, 0, o.tex).setDepth(DEPTH.projectile), hits: new Set() } as OBullet;
      this.list.push(b);
    }
    b.alive = true; b.x = o.x; b.y = o.y; b.ang = o.ang; b.sp = o.sp ?? 0; b.t = 0; b.life = o.life ?? 1;
    b.moveAt = o.moveAt ?? 0; b.dmg = o.dmg ?? 0; b.pierce = o.pierce ?? 0; b.hitN = 0;
    b.hl = o.hl ?? 0; b.hw = o.hw ?? 0; b.cx = o.cx ?? 0; b.hits.clear();
    b.alpha = o.alpha ?? null; b.smokeDt = o.smokeDt ?? 0; b.smokeT = b.smokeDt; b.smokeTint = o.smokeTint ?? 0xffffff;
    b.src = o.src ?? ''; b.step = o.step; b.onHit = o.onHit; b.onEnd = o.onEnd; b.data = o.data;
    b.img.setTexture(o.tex).setVisible(true).setAlpha(1).setPosition(b.x, b.y).setRotation(b.ang)
      .setScale(PX * o.scaleX, PX * (o.scaleY ?? o.scaleX)).setBlendMode(Phaser.BlendModes.ADD);
    if (o.tint !== undefined) b.img.setTint(o.tint); else b.img.clearTint();
    return b;
  }

  end(b: OBullet) {
    if (!b.alive) return;
    b.alive = false; b.img.setVisible(false); this.free.push(b);
    b.onEnd?.(b);
  }

  clear() { for (const b of this.list) if (b.alive) { b.alive = false; b.img.setVisible(false); this.free.push(b); } }
  destroy() { for (const b of this.list) b.img.destroy(); this.list = []; this.free = []; }

  update(dt: number) {
    for (const b of this.list) {
      if (!b.alive) continue;
      b.t += dt;
      b.step?.(b, dt);
      if (!b.alive) continue;
      const c = Math.cos(b.ang), s = Math.sin(b.ang);
      if (b.sp && b.t >= b.moveAt) { b.x += c * b.sp * dt; b.y += s * b.sp * dt; }
      b.img.setPosition(b.x, b.y);
      if (b.alpha) b.img.setAlpha(Math.max(0, Math.min(1, b.alpha(b))));
      if (b.smokeDt > 0) {
        b.smokeT -= dt;
        if (b.smokeT <= 0) { b.smokeT += b.smokeDt; smoke(b.x, b.y, b.smokeTint); }
      }
      if (b.hl > 0) this.collide(b, c, s);
      if (b.alive && b.t >= b.life) this.end(b);
    }
  }

  /** прямоугольник (центр сдвинут на cx вдоль полёта) против круга врага */
  private collide(b: OBullet, c: number, s: number) {
    const ox = b.x + c * b.cx, oy = b.y + s * b.cx;
    W.enemies.grid.query(ox, oy, Math.hypot(b.hl, b.hw), (e) => {
      if (b.hits.has(e.id)) return;
      const dx = e.x - ox, dy = e.y - oy;
      const lx = dx * c + dy * s, ly = -dx * s + dy * c;
      const qx = Math.max(-b.hl, Math.min(b.hl, lx)), qy = Math.max(-b.hw, Math.min(b.hw, ly));
      if ((lx - qx) ** 2 + (ly - qy) ** 2 > e.r * e.r) return;
      b.hits.add(e.id);
      if (!b.onHit?.(b, e)) W.enemies.damage(e, b.dmg, 0, 0, b.src);
      b.hitN++;
      if (b.hitN > b.pierce) { this.end(b); return true; }
    });
  }
}

/** Урон по прямоугольнику (взрывы): центр (x, y), угол a, половины hl × hw; каждый враг — раз */
export function boxDamage(x: number, y: number, a: number, hl: number, hw: number, dmg: number, src: string, hit?: Set<number>): number {
  const c = Math.cos(a), s = Math.sin(a);
  let n = 0;
  W.enemies.grid.query(x, y, Math.hypot(hl, hw), (e) => {
    if (hit?.has(e.id)) return;
    const dx = e.x - x, dy = e.y - y;
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    const qx = Math.max(-hl, Math.min(hl, lx)), qy = Math.max(-hw, Math.min(hw, ly));
    if ((lx - qx) ** 2 + (ly - qy) ** 2 > e.r * e.r) return;
    hit?.add(e.id);
    W.enemies.damage(e, dmg, 0, 0, src);
    n++;
  });
  return n;
}

/** BulletSmoke: 3 кадра по 0.05 с = 0.15 с (размер спрайта ~10 px оригинала) */
export function smoke(x: number, y: number, tint = 0xffffff) {
  W.fx.puff(x, y, 10 * PX, tint, 0.15, OT.smoke);
}

/** угол выстрела BulletAttack: atan2 к точке + Random(−Aim, Aim)·0.2° */
export function aimAngle(fx: number, fy: number, tx: number, ty: number, aim: number) {
  return Math.atan2(ty - fy, tx - fx) + (Math.random() * 2 - 1) * aim * 0.2 * DEG;
}

/**
 * Корутина как в Unity: генератор отдаёт паузы WaitForSeconds (с). yield 0 — «следующий кадр».
 * За кадр выполняется не больше 64 шагов (защита от бесконечного цикла при нулевых паузах).
 */
export class Co {
  private wait = 0;
  constructor(private g: Generator<number, void, unknown>) {}
  update(dt: number) {
    this.wait -= dt;
    for (let i = 0; i < 64 && this.wait <= 0; i++) {
      const r = this.g.next();
      if (r.done) { this.wait = Infinity; return; }
      if (r.value <= 0) { this.wait = 0; break; }
      this.wait += r.value;
    }
  }
}
