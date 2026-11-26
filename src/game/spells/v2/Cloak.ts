import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { boxDamage, Co, PX, U } from './_orig';

/** Play_GhostEffect_Com01 (слияние 40): смещения прыжков, ед. (сетка 3×4 без центра) */
const HOPS: [number, number][] = [
  [3.25, 6], [0, 6], [-3.25, 6], [3.25, 3.25], [0, 3.25], [-3.25, 3.25],
  [3.25, -3.25], [0, -3.25], [-3.25, -3.25], [3.25, -6], [0, -6], [-3.25, -6],
];
const O = 'vfx/cloak/orig/';
const seq = (pre: string, n: number) => Array.from({ length: n }, (_, i) => `${pre}_${String(i + 1).padStart(2, '0')}`);
/** кадры оригинала: Explosion18_01..08 (холст 500²; 9–15 пустые), Explosion96_01..11 (холст 520²) */
const EX18 = seq('Explosion18', 8), EX96 = seq('Explosion96', 11);
const GROUND = 'GhostEffectGround', FLASH = 'UI_WhiteGround';
export const CLOAK_LOAD: [string, string][] = [
  ...[...EX18, ...EX96, GROUND, FLASH].map((k): [string, string] => [k, `${O}${k}.png`]),
];

/**
 * #11 Маскировка — 1:1 по коду оригинала (docs/orig/spells/cloak.md):
 * САМА по таймеру: Play_Ghost ждёт GhostPSpeed + 0.5 = 45.5 с (шаг 0.1), затем Play_GhostEffect:
 * IsGhostProgress — тело мага уходит из плоскости (мобы и снаряды проходят сквозь), маг α 0.3,
 * скорость +GhostSpeed (15 %), бледная подложка на весь экран; длится GhostTime (2 с, ур. 2–4 +30 %) шагами 0.1 с + 0.25 с.
 * Свойства: 452 Мираж (+80 % времени — мод), 453 Искажение пространства — в конце взрыв ID 18:
 * 500·Attack, квадрат 4 × 1.8 = 7.2 ед., урон пока видны 7 кадров по 0.06 с (каждому раз);
 * 454 Жатва душ — только во время маскировки: +33 к получению маны и +0.1 % HP за убийство.
 * Слияние 40 «Телепорт»: floor(r·1.25) + 7 прыжков по сетке через 0.12 с (r = Time/2), в каждой точке взрыв 96, последний — домой.
 */
class Cloak extends DataSpell {
  /** осталось маскировки, с (для HUD) */
  active = 0;
  /** осталось перезарядки, с (для HUD) */
  cdLeft = 0;
  private co: Co | null = null;
  private ground: Phaser.GameObjects.Image | null = null;
  private flash: Phaser.GameObjects.Image | null = null;
  /** время вспышки земли GhostExplosionA_Animation, -1 = нет */
  private flashT = -1;
  private killsAt = 0;
  private manaOn = false;
  private booms: { x: number; y: number; t: number; hits: Set<number>; dmg: number; half: number }[] = [];

  /** GhostDelay = PSpeed + 0.5 (PSpeed 45 с × свои проценты × общий множитель) */
  get cdTotal() {
    let p = this.cdOrig(this.data.base.cd ?? 45) * this.cdGlobal;
    if (this.hasCombo(40)) p = Math.max(3, p - 0.3);
    return p + 0.5;
  }

  onChange() {
    super.onChange();
    // StartInformation_B: при изучении — StartCoroutine("Play_Ghost") (один раз)
    if (!this.co) this.co = new Co(this.run());
  }

  private *run(): Generator<number, void, unknown> {
    for (;;) {
      // Play_Ghost: перезарядка шагами 0.1 с
      const delay = this.cdTotal;
      for (let i = 0; i < delay; i += 0.1) { this.cdLeft = delay - i; yield 0.1; }
      this.cdLeft = 0;
      yield* this.effect();
    }
  }

  /** Play_GhostEffect */
  private *effect(): Generator<number, void, unknown> {
    const P = W.player;
    const T = this.durSec;
    this.setGhost(true);
    if (this.hasCombo(40)) {
      yield* this.teleport(T);
    } else {
      // while (i <= T) { i += 0.1; wait 0.1 }  → T, округлённое вверх до 0.1
      const n = Math.max(1, Math.ceil(T / 0.1 - 1e-4));
      for (let i = 0; i < n; i++) { this.active = (n - i) * 0.1 + 0.25; yield 0.1; }
      this.active = 0.25;
      yield 0.25;
    }
    this.setGhost(false);
    if (!this.hasCombo(40) && this.hasProp(453)) this.boom(P.x, P.y, false);
    this.active = 0;
  }

  /** Play_GhostEffect_Com01: прыжки по сетке без повтора подряд; в каждой точке взрыв 96 */
  private *teleport(T: number): Generator<number, void, unknown> {
    const P = W.player;
    const r = T / 2;
    const n = Math.floor(r * 1.25) + 7;
    const sx = P.x, sy = P.y;
    let bag: number[] = [], loc = -1;
    for (let i = 1; i <= n; i++) {
      if (bag.length < 2) { bag = HOPS.map((_, k) => k).filter((k) => k !== loc); }
      loc = bag.splice((Math.random() * bag.length) | 0, 1)[0];
      if (i === n) { P.x = sx; P.y = sy; }
      else {
        const [ox, oy] = HOPS[loc];
        P.x = sx + (ox + Math.random() - 0.5) * U;
        P.y = sy - (oy + Math.random() - 0.5) * U;
      }
      // GhostDamage ×= r·3 (@0x11dddb0); «×3» уже в модах слияния (эффект 1062) — здесь только r
      this.boom(P.x, P.y, true, r);
      this.active = (n - i) * 0.12 + 0.01;
      yield 0.12;
    }
  }

  private setGhost(on: boolean) {
    const P = W.player;
    P.ghost = on;
    P.speedBuff = on ? 0.15 : 0;
    this.ground?.setVisible(on && !this.hasCombo(40));
    const harvest = on && this.hasProp(454);
    if (harvest !== this.manaOn) { W.stats.xpGain += harvest ? 0.33 : -0.33; this.manaOn = harvest; }
    this.killsAt = W.kills;
  }

  /** взрыв 18 (453) или 96 (Телепорт): урон 500·Attack × множитель, Area = 1 */
  private boom(x: number, y: number, small: boolean, mul = 1) {
    const area = 1;
    const dmg = this.dmgOf(50000) * mul;
    // 18: коллайдер 4 × 1.8·Area = 7.2 ед.; 96: 4.25 × 0.35 × Random(0.85, 1.25)·0.9
    const half = small ? 4.25 * 0.35 * (0.85 + Math.random() * 0.4) * 0.9 * area * U / 2 : 4 * 1.8 * area * U / 2;
    this.booms.push({ x, y, t: 0, hits: new Set(), dmg, half });
    if (small) {
      // Explosion96_Animation (вариант A): 11 кадров по 0.035 с, 1-й белый, со 2-го цвет (0.45, 0.84, 1);
      // localScale = Plus + Area·0.35, Plus = Random(0.85, 1.25)·0.9
      const sc = (0.35 * area + (0.85 + Math.random() * 0.4) * 0.9) * PX;
      W.fx.anim(x, y, EX96, 0.035, 0.035, sc, sc, { hook: (img, _t, n) => { if (n >= 1) img.setTint(0x73d6ff); else img.clearTint(); } });
    } else {
      // Explosion18_Animation: 8 кадров по 0.06 с (9–15 пустые), localScale Area·1.8; GhostExplosionA — вспышка земли
      const sc = 1.8 * area * PX;
      W.fx.anim(x, y, EX18, 0.06, 0.06, sc, sc);
      this.flashT = 0;
    }
  }

  update(dt: number) {
    const P = W.player;
    if (!this.ground) {
      this.ground = W.scene.add.image(0, 0, GROUND).setOrigin(0).setDepth(DEPTH.zone).setVisible(false);
      this.flash = W.scene.add.image(0, 0, FLASH).setOrigin(0).setDepth(DEPTH.zone).setVisible(false);
    }
    this.co?.update(dt);
    if (P.ghost) {
      const v = W.scene.cameras.main.worldView;
      this.ground.setPosition(v.x, v.y).setDisplaySize(v.width, v.height);
      if (this.hasProp(454)) {
        const k = W.kills - this.killsAt;
        if (k > 0) { this.killsAt = W.kills; P.heal(W.stats.maxHp * 0.001 * k); }
      }
    }
    // коллайдер Explosion18: активен кадры 1–7 по 0.06 с (урон каждому 1 раз)
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      b.t += dt;
      if (b.t < 7 * 0.06) boxDamage(b.x, b.y, 0, b.half, b.half, b.dmg, this.def.id, b.hits);
      else { this.booms[i] = this.booms[this.booms.length - 1]; this.booms.pop(); }
    }
    // GhostExplosionA_Animation: 11 шагов по 0.03 с, альфа 0.25 − 0.025·i, белый спрайт на весь экран (scale 2.0)
    if (this.flash) {
      if (this.flashT >= 0) {
        this.flashT += dt;
        const i = Math.floor(this.flashT / 0.03);
        if (i > 10) { this.flashT = -1; this.flash.setVisible(false); }
        else {
          const v = W.scene.cameras.main.worldView;
          this.flash.setVisible(true).setPosition(v.x, v.y).setDisplaySize(v.width, v.height).setAlpha(0.25 - 0.025 * i);
        }
      }
    }
  }

  destroy() {
    if (W.player.ghost) this.setGhost(false);
    this.co = null;
    this.ground?.destroy(); this.ground = null;
    this.flash?.destroy(); this.flash = null;
    this.booms = [];
  }
}

export const CLOAK = defFromData(SPELL_BY_ID[11], (def) => new Cloak(def, SPELL_BY_ID[11]));
