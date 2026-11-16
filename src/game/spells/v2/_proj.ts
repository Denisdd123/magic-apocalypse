import type { Enemy } from '../../Enemies';
import type { Projectile } from '../../Projectiles';
import { W } from '../../World';

/**
 * Общие мелочи для снарядных заклинаний v2 (Fireball, Spirit, Eshock, Ebolt, Bolt).
 * Картинки fx_* нарисованы в своей ориентации — поворот к скорости со сдвигом делаем через update-колбэк
 * (функции созданы один раз, без аллокаций на каждый выстрел).
 */

const faceCache = new Map<number, (p: Projectile) => void>();

/** update-колбэк: картинка смотрит по скорости, со сдвигом off (рад). Использовать с rotateToVel: false. */
export function faceVel(off: number): (p: Projectile) => void {
  let f = faceCache.get(off);
  if (!f) {
    f = (p: Projectile) => { if (p.vx || p.vy) p.img.setRotation(Math.atan2(p.vy, p.vx) + off); };
    faceCache.set(off, f);
  }
  return f;
}

/** Сдвиги поворота текстур (относительно «смотрит вправо») */
export const ROT = {
  /** fx_spirit_shot / fx_bolt_proj: остриё слева, шлейф справа */
  tipLeft: Math.PI,
  /** fx_spirit_blade: клинок по диагонали, остриё внизу справа (~0.95 рад) */
  blade: -0.95,
  /** fx_eshock_proj: разряд чуть наклонён вверх-вправо (~-0.21 рад) */
  eshock: 0.21,
};

/** Случайное число в [a, b) */
export const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Дальность наведения «как в оригинале»: вся видимая область (полудиагональ экрана от мага) + запас.
 * Заклинания целятся в ближайшего врага на экране, без короткого предела.
 */
export function aimR(pad = 30): number {
  const v = W.scene.cameras.main.worldView;
  return Math.hypot(v.width, v.height) * 0.5 + pad;
}

/** Время жизни снаряда, чтобы он долетел до края экрана (и чуть дальше) при скорости sp */
export function lifeToEdge(sp: number, min = 0.3): number {
  return Math.max(min, (aimR(60)) / Math.max(1, sp));
}

/**
 * Удержание цели: если прежняя цель жива и в пределах экрана — оставляем её (без «дёрганья» между врагами),
 * иначе берём ближайшего к точке (x, y).
 */
export function keepTarget(cur: Enemy | null, x: number, y: number): Enemy | null {
  if (cur && cur.alive) {
    const P = W.player, R = aimR();
    if ((cur.x - P.x) ** 2 + (cur.y - P.y) ** 2 <= R * R) return cur;
  }
  return W.enemies.nearest(x, y, aimR());
}
