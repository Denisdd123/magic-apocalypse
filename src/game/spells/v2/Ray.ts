import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { aimR } from './_proj';
import { HitGate, ImgPool, forSegment, viewHalfDiag } from './_zoneKit';

/** Картинка fx_ray_beam: луч горизонтальный, видимая часть x 9..197, ось y≈133, толщина ≈18 px */
const TEX = 'fx_ray_beam', TX0 = 9, TLEN = 188, TY = 133, TTH = 18;

interface Beam {
  ang: number; spin: number; t: number; life: number;
  both: boolean;        // 515 Отражение: луч и в противоположную сторону
  reAim: number;        // C4: смена направления каждые 0.5 с
  img: Phaser.GameObjects.Image; img2: Phaser.GameObjects.Image | null;
}

/**
 * #18 Таинственный луч → «Луч бездны». Луч из мага до края экрана в ближайшего врага, пробивает всё; до свойств неподвижен.
 * Лучи выходят по одному с интервалом (stat interval). Урон одному врагу — один раз за луч
 * (EM-излучение — раз в 0.5 с, Плазменный луч — раз в 0.25 с); ворота урона общие для заклинания.
 * Свойства: 515 Отражение (второй луч назад), 516 Разрушительный (быстрое вращение), 517 Электромагнитное
 * (случайные направления, тик 0.5 с, длит. ×4).
 * Слияния (основа): C4 Поток Теры, C16 Плазменный луч, C30 Призменная лихорадка, C38 Энерг. насыщенность, C58 Геноцид.
 */
class Ray extends DataSpell {
  private beams: Beam[] = [];
  private pool = new ImgPool();
  private gate = new HitGate();
  private clock = 0;
  private queue: number[] = [];   // задержки до выхода следующих лучей
  private volleys: number[] = []; // C30: задержки залпов
  private plasmaN = 0;            // C16: сколько постоянных лучей сейчас
  private aimIdx = 0;             // номер луча в текущем залпе (в какого по близости врага целиться)
  // параметры текущего удара (без замыканий в цикле)
  private hDmg = 0; private hEvery = 0; private hUx = 0; private hUy = 0;
  private onHit = (e: Enemy) => {
    if (this.gate.ok(e.id, this.clock, this.hEvery)) W.enemies.damage(e, this.hDmg, this.hUx * 6, this.hUy * 6, this.def.id);
  };

  onChange() {
    super.onChange();
    // смена режима — убрать постоянные лучи, их пересоздаст update
    if (!this.hasCombo(16) && this.plasmaN) { this.clearBeams(); this.plasmaN = 0; }
  }

  destroy() { this.clearBeams(); this.pool.destroy(); }

  private clearBeams() {
    for (const b of this.beams) { this.pool.put(b.img); if (b.img2) this.pool.put(b.img2); }
    this.beams.length = 0;
  }

  /** интервал урона по одному врагу */
  private get hitEvery(): number {
    if (this.hasCombo(16)) return 0.25;
    if (this.hasProp(517)) return 0.5;
    return this.durSec + 0.05; // обычный луч — один удар за время жизни
  }

  private get halfW(): number {
    let w = 5 * this.sizeMul;
    if (this.hasCombo(4)) w *= 2.2; // радиус атаки увеличен
    return w;
  }

  /** Множитель урона слияний (то, что «конвертируется» в урон) */
  private get comboMul(): number {
    const durK = this.durSec / 0.8; // длительность относительно базовой
    if (this.hasCombo(4)) return Math.max(1, this.durSec);          // +1 к множителю за секунду длительности
    if (this.hasCombo(16)) return Math.max(1, this.sizeMul * durK); // размер и длительность → урон
    if (this.hasCombo(30)) return Math.max(1, durK);
    if (this.hasCombo(58)) return Math.max(1, this.sizeMul) * this.count; // всё в один луч
    return 1;
  }

  update(dt: number) {
    this.clock += dt;
    const P = W.player;

    if (this.hasCombo(16)) {
      // Плазменный луч: 4 постоянных луча + 1 за каждую секунду сокращения КД ниже 4 с
      const effCd = this.cdSec * W.stats.cdMul;
      const n = 4 + Math.max(0, Math.floor(4 - effCd));
      if (n !== this.plasmaN) {
        this.clearBeams();
        for (let i = 0; i < n; i++) this.spawn((i / n) * Math.PI * 2, 1.2, Infinity, false);
        this.plasmaN = n;
      }
    } else if (this.readyData(dt)) {
      const n = this.count;
      if (this.hasCombo(30)) {
        for (let v = 0; v < 5; v++) this.volleys.push(v * 0.3);
      } else if (this.hasCombo(38) || this.hasCombo(58)) {
        this.aimIdx = 0;
        this.queue.push(0);
      } else {
        // лучи по одному: интервал появления (у Отражения −50%)
        const gap = this.stat('interval', 0.25);
        this.aimIdx = 0;
        const k = this.hasProp(517) ? 1 + Math.floor(Math.random() * n) : n; // EM: от 1 до числа лучей
        for (let i = 0; i < k; i++) this.queue.push(i * gap);
      }
    }

    // очередь одиночных выстрелов
    for (let i = this.queue.length - 1; i >= 0; i--) {
      this.queue[i] -= dt;
      if (this.queue[i] > 0) continue;
      this.queue[i] = this.queue[this.queue.length - 1]; this.queue.pop();
      this.fireOne();
    }
    // C30: залпы во все хаотичные стороны
    for (let i = this.volleys.length - 1; i >= 0; i--) {
      this.volleys[i] -= dt;
      if (this.volleys[i] > 0) continue;
      this.volleys[i] = this.volleys[this.volleys.length - 1]; this.volleys.pop();
      const n = this.count;
      for (let j = 0; j < n; j++) this.spawn(Math.random() * Math.PI * 2, 0, 0.35, false);
    }

    // движение и урон
    if (!this.beams.length) return;
    const len = viewHalfDiag() + 20;
    const hw = this.halfW;
    const dmg = this.dmg * this.comboMul;
    const every = this.hitEvery;
    const now = this.clock;
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      if (b.t >= b.life) {
        this.pool.put(b.img); if (b.img2) this.pool.put(b.img2);
        this.beams[i] = this.beams[this.beams.length - 1]; this.beams.pop();
        continue;
      }
      b.ang += b.spin * dt;
      if (this.hasCombo(4)) { b.reAim -= dt; if (b.reAim <= 0) { b.reAim = 0.5; b.ang = Math.random() * Math.PI * 2; } }
      const ux = Math.cos(b.ang), uy = Math.sin(b.ang);
      this.hDmg = dmg; this.hEvery = every; this.hUx = ux; this.hUy = uy;
      const hit = this.onHit;
      if (b.both) forSegment(P.x - ux * len, P.y - uy * len, ux, uy, len * 2, hw, hit);
      else forSegment(P.x, P.y, ux, uy, len, hw, hit);
      // картинка: вспыхивает и гаснет
      const k = b.life === Infinity ? 1 : b.t / b.life;
      const a = b.life === Infinity ? 0.85 + Math.sin(now * 20 + i) * 0.1 : k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.7) / 0.3);
      const th = (hw * 2.6) / TTH * (0.8 + 0.2 * Math.sin(now * 30 + i));
      this.place(b.img, P.x, P.y, b.ang, len, th, a);
      if (b.img2) this.place(b.img2, P.x, P.y, b.ang + Math.PI, len, th, a);
    }
    if ((this.clock * 10 | 0) % 50 === 0) this.gate.prune(now, 5);
  }

  private place(img: Phaser.GameObjects.Image, x: number, y: number, ang: number, len: number, th: number, a: number) {
    img.setPosition(x, y).setRotation(ang).setScale(len / TLEN, th).setAlpha(a);
  }

  /** обычный выстрел одного луча */
  private fireOne() {
    const life = this.durSec;
    // наведение: каждый следующий луч залпа — в следующего по близости врага на экране; врагов нет — случайно
    const P = W.player;
    const ts = W.enemies.nearestN(P.x, P.y, this.aimIdx + 1, aimR());
    const e = ts.length ? ts[Math.min(this.aimIdx, ts.length - 1)] : null;
    this.aimIdx++;
    const ang = e ? Math.atan2(e.y - P.y, e.x - P.x) : Math.random() * Math.PI * 2;
    if (this.hasCombo(38)) {
      // все лучи разом в хаотичных направлениях, без вращения
      const n = this.count;
      for (let j = 0; j < n; j++) this.spawn(Math.random() * Math.PI * 2, 0, life, false);
      return;
    }
    if (this.hasCombo(58)) { this.spawn(ang, 0, life, false, 6); return; }
    if (this.hasProp(517)) { this.spawn(Math.random() * Math.PI * 2, 0, life, false); return; } // EM: случайные стороны
    const both = this.hasProp(515) && !this.hasCombo(30);
    this.spawn(ang, 0, life, both);
  }

  private spawn(ang: number, spinOverride: number, life: number, both: boolean, spinAbs = 0) {
    // до свойств луч статичен (не крутится); вращается только у «Разрушительного» и в слияниях
    let spin = spinAbs || (this.hasProp(516) ? 3.2 : 0);
    if (spinOverride) spin = spinOverride;
    if (this.hasProp(517) && !this.hasCombo(16)) spin = 0;
    if (this.hasCombo(38) || this.hasCombo(30)) spin = 0;
    if (Math.random() < 0.5) spin = -spin;
    const tint = this.hasCombo(16) ? 0xc8a0ff : this.hasProp(516) ? 0xff9a8a : this.hasProp(515) ? 0xffe7a0 : this.hasProp(517) ? 0x9ad8ff : 0xe8eaff;
    const mk = () => this.pool.get(TEX, DEPTH.projectile).setOrigin(TX0 / 256, TY / 256).setTint(tint).setAlpha(0);
    this.beams.push({ ang, spin, t: 0, life, both, reAim: 0.5, img: mk(), img2: both ? mk() : null });
  }
}

export const RAY = defFromData(SPELL_BY_ID[18], (def) => new Ray(def, SPELL_BY_ID[18]));
