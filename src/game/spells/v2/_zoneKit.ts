import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';

/**
 * Общие помощники для зон, лучей и волн (Вихрь, Лава, Луч, Вспышка, Цунами, Испепеление).
 * Без аллокаций в горячих циклах: пул картинок, ворота урона по id врага, проверка попадания в отрезок.
 */

/** «Ворота» урона: один враг получает урон от источника не чаще interval секунд (Map id→время). */
export class HitGate {
  private m = new Map<number, number>();
  /** now — собственные часы заклинания */
  ok(id: number, now: number, interval: number): boolean {
    const t = this.m.get(id);
    if (t !== undefined && now - t < interval) return false;
    this.m.set(id, now);
    return true;
  }
  /** чистка устаревших записей (вызывать редко) */
  prune(now: number, olderThan: number) {
    if (this.m.size < 400) return;
    for (const [k, t] of this.m) if (now - t > olderThan) this.m.delete(k);
  }
  clear() { this.m.clear(); }
}

/** Пул картинок одного заклинания: get/put, destroy убирает всё. */
export class ImgPool {
  private free: Phaser.GameObjects.Image[] = [];
  private all: Phaser.GameObjects.Image[] = [];
  get(tex: string, depth = DEPTH.fx, add = true): Phaser.GameObjects.Image {
    let img = this.free.pop();
    if (!img) { img = W.scene.add.image(0, 0, tex); this.all.push(img); }
    img.setTexture(tex).setDepth(depth).setVisible(true).setAlpha(1).setRotation(0).setScale(1).clearTint().setOrigin(0.5, 0.5)
      .setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    return img;
  }
  put(img: Phaser.GameObjects.Image) { img.setVisible(false); this.free.push(img); }
  destroy() { for (const i of this.all) i.destroy(); this.all = []; this.free = []; }
}

/**
 * Перебор живых врагов, задетых отрезком (x,y) → (x+ux*len, y+uy*len) шириной 2*halfW.
 * ux,uy — единичный вектор. cb получает врага и расстояние от оси (для «центра» луча).
 */
export function forSegment(x: number, y: number, ux: number, uy: number, len: number, halfW: number, cb: (e: Enemy, perp: number) => void) {
  const list = W.enemies.list;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.alive) continue;
    const dx = e.x - x, dy = e.y - y;
    const along = dx * ux + dy * uy;
    if (along < -e.r || along > len + e.r) continue;
    const perp = Math.abs(dx * uy - dy * ux);
    if (perp <= halfW + e.r) cb(e, perp);
  }
}

/** Половина диагонали видимой области — «до края экрана» из центра */
export function viewHalfDiag(): number {
  const v = W.scene.cameras.main.worldView;
  return Math.hypot(v.width, v.height) * 0.5;
}

/** Случайная точка в видимой области (с отступом от края) */
export function randomViewPoint(pad = 20): { x: number; y: number } {
  const v = W.scene.cameras.main.worldView;
  return { x: v.x + pad + Math.random() * Math.max(1, v.width - pad * 2), y: v.y + pad + Math.random() * Math.max(1, v.height - pad * 2) };
}

/** Направление движения мага (угол) */
export function faceAngle(): number { return Math.atan2(W.player.faceY, W.player.faceX); }
