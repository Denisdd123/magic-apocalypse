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
const TX_BALL = 'cl_e18ball', TX_RING = 'cl_e18ring';

function textures() {
  const tx = W.scene.textures;
  if (!tx.exists(TX_BALL)) {
    // Explosion18_01: белый шар ~221 px
    const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
    for (let i = 0; i < 6; i++) { g.fillStyle(0xffffff, 0.12 + i * 0.12); g.fillCircle(112, 112, 110 - i * 12); }
    g.generateTexture(TX_BALL, 224, 224); g.destroy();
  }
  if (!tx.exists(TX_RING)) {
    // Explosion18_02..08: белое кольцо с шипами, видимая часть ~353×398 в 500 px
    const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
    const c = 250;
    g.lineStyle(6, 0xffffff, 1); g.strokeEllipse(c, c, 340, 384);
    g.fillStyle(0xffffff, 1);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const r0x = 170, r0y = 192, l = i % 2 ? 14 : 24;
      const x = c + ca * r0x, y = c + sa * r0y;
      g.fillTriangle(x + ca * l, y + sa * l, x - sa * 4, y + ca * 4, x + sa * 4, y - ca * 4);
    }
    g.generateTexture(TX_RING, 500, 500); g.destroy();
  }
}

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
  private ground: Phaser.GameObjects.Rectangle | null = null;
  private killsAt = 0;
  private manaOn = false;
  private booms: { ball: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Image; x: number; y: number; t: number; hits: Set<number>; dmg: number; half: number; area: number; small: boolean }[] = [];

  /** GhostDelay = PSpeed + 0.5 (PSpeed 45 с × свои проценты × общий множитель) */
  get cdTotal() {
    let p = this.cdOrig(this.data.base.cd ?? 45) * this.cdGlobal;
    if (this.hasCombo(40)) p = Math.max(3, p - 0.3);
    return p + 0.5;
  }

  onChange() {
    super.onChange();
    textures();
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
      this.boom(P.x, P.y, true, r * 3);
      this.active = (n - i) * 0.12 + 0.01;
      yield 0.12;
    }
  }

  private setGhost(on: boolean) {
    const P = W.player;
    P.ghost = on;
    P.speedBuff = on ? 0.15 : 0;
    this.ground?.setVisible(on);
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
    let b = this.booms.find((o) => o.t < 0);
    if (!b) {
      b = { ball: W.scene.add.image(0, 0, TX_BALL).setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD),
        ring: W.scene.add.image(0, 0, TX_RING).setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD),
        x: 0, y: 0, t: 0, hits: new Set(), dmg: 0, half: 0, area: 1, small };
      this.booms.push(b);
    }
    Object.assign(b, { x, y, t: 0, dmg, half, area, small });
    b.hits.clear();
    b.ball.setVisible(true).setPosition(x, y).setTint(small ? 0x73d6ff : 0xffffff);
    b.ring.setVisible(false).setPosition(x, y).setTint(small ? 0x73d6ff : 0xffffff);
  }

  update(dt: number) {
    const P = W.player;
    if (!this.ground) {
      this.ground = W.scene.add.rectangle(0, 0, 10, 10, 0xffffff, 0.07).setOrigin(0).setDepth(DEPTH.zone).setVisible(false);
    }
    this.co?.update(dt);
    if (P.ghost) {
      const v = W.scene.cameras.main.worldView;
      this.ground.setPosition(v.x, v.y).setSize(v.width, v.height);
      if (this.hasProp(454)) {
        const k = W.kills - this.killsAt;
        if (k > 0) { this.killsAt = W.kills; P.heal(W.stats.maxHp * 0.001 * k); }
      }
    }
    // Explosion18_Animation: 15 кадров по 0.06 с (видимы 8), коллайдер выкл. перед 8-м
    for (const b of this.booms) {
      if (b.t < 0) continue;
      b.t += dt;
      const f = Math.floor(b.t / 0.06);
      const sc = (b.small ? 0.35 : 1.8) * b.area * PX;
      if (f < 7) boxDamage(b.x, b.y, 0, b.half, b.half, b.dmg, this.def.id, b.hits);
      b.ball.setVisible(f === 0).setScale(sc);
      b.ring.setVisible(f >= 1 && f < 8).setScale(sc * (0.75 + 0.25 * Math.min(1, f / 7))).setAlpha(1 - Math.max(0, f - 3) / 5);
      if (f >= 15) { b.t = -1; b.ball.setVisible(false); b.ring.setVisible(false); }
    }
  }

  destroy() {
    if (W.player.ghost) this.setGhost(false);
    this.co = null;
    this.ground?.destroy(); this.ground = null;
    for (const b of this.booms) { b.ball.destroy(); b.ring.destroy(); }
    this.booms = [];
  }
}

export const CLOAK = defFromData(SPELL_BY_ID[11], (def) => new Cloak(def, SPELL_BY_ID[11]));
