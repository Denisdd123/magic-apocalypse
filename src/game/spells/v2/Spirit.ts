import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { aimR, faceVel, lifeToEdge, ROT } from './_proj';

/** Свои текстуры: плоский мрачный дух в капюшоне и белый крестик-вспышка выстрела */
const WRAITH = 'v2_spirit_wraith';
const CROSS = 'v2_spirit_cross';
function ensureTextures() {
  const tx = W.scene.textures;
  if (!tx.exists(WRAITH)) {
    const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
    // силуэт: капюшон и рваный подол
    g.fillStyle(0x8a80a8, 1);
    g.fillPoints([
      { x: 12, y: 0 }, { x: 20, y: 6 }, { x: 23, y: 15 }, { x: 22, y: 25 }, { x: 18, y: 21 }, { x: 15, y: 28 },
      { x: 12, y: 22 }, { x: 8, y: 28 }, { x: 5, y: 21 }, { x: 1, y: 25 }, { x: 1, y: 15 }, { x: 4, y: 6 },
    ] as Phaser.Types.Math.Vector2Like[], true);
    // тёмное тело (по краю остаётся тусклая кайма)
    g.fillStyle(0x2b2638, 1);
    g.fillPoints([
      { x: 12, y: 2 }, { x: 19, y: 7 }, { x: 21, y: 15 }, { x: 20, y: 22 }, { x: 18, y: 19 }, { x: 15, y: 25 },
      { x: 12, y: 20 }, { x: 8, y: 25 }, { x: 6, y: 19 }, { x: 3, y: 22 }, { x: 3, y: 15 }, { x: 5, y: 7 },
    ] as Phaser.Types.Math.Vector2Like[], true);
    // провал под капюшоном: тьма со слабым тусклым свечением в глубине (без «глаз»)
    g.fillStyle(0x0b0910, 1); g.fillEllipse(12, 11, 11, 8);
    g.fillStyle(0x3a3452, 0.6); g.fillEllipse(12, 12, 5, 3);
    g.generateTexture(WRAITH, 24, 28);
    g.destroy();
  }
  if (!tx.exists(CROSS)) {
    const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1); g.fillRect(6, 0, 4, 16); g.fillRect(0, 6, 16, 4);
    g.generateTexture(CROSS, 16, 16);
    g.destroy();
  }
}

/** Один дух: своя картинка, свой крестик-вспышка и СВОЯ перезарядка */
interface Unit { img: Phaser.GameObjects.Image; cross: Phaser.GameObjects.Image; cd: number; full: number; flash: number }

/** длительность вспышки-крестика, с */
const FLASH = 0.2;

/**
 * #3 Дух → «Духи-стражи». Духи парят вокруг мага, у каждого своя перезарядка: готов — стреляет пробивающим
 * снарядом в ближайшего врага на экране (нет врагов — ждёт заряженным). Пока перезаряжается — темнеет;
 * при выстреле — белый крестик раздувается и гаснет (без ADD-бленда).
 * Свойства: 380 Заколдованная ракета (КД ускоряется от числа духов, стреляют разом), 381 Магический клинок
 * (мгновенный разрез прямо на враге), 382 Фамильяр (один большой дух, веер выстрелов во все стороны, 15 за духа).
 * Слияния (основа): 2 Парящие мечи, 43 Магическое копьё, 53 Сверхновая.
 */
class Spirit extends DataSpell {
  private units: Unit[] = [];
  private angle = 0;
  private burst: { t: number; shots: number; done: number; dur: number } | null = null;
  /** основной цвет духов (по свойству) */
  private baseTint = 0xffffff;

  /** Число духов: база + прибавки «+N» (без %-множителей количества — те относятся к выстрелам) */
  private get spirits(): number {
    let n = this.data.base.count ?? 1;
    for (const m of this.mods()) if (m.stat === 'count' && m.op === 'add') n += m.v;
    n += W.stats.sc(this.def.id);
    if (this.hasProp(382)) n -= 15; // «+15 выстрелов за духа» — это не духи
    return Math.max(1, Math.round(n));
  }

  /** Фактический КД одного духа (с общими сокращениями, как Spell.ready) */
  private cdOf(base: number) {
    return Math.max(0.05, base * W.stats.cdMul * (1 - (W.stats.spellCdr[this.def.id] ?? 0)));
  }
  private get realCd() { return this.cdOf(this.cdSec); }

  private get missile() { return this.hasProp(380) && !this.hasCombo(43); }

  onChange() {
    super.onChange();
    ensureTextures();
    const familiar = this.hasProp(382);
    const need = familiar ? 1 : this.spirits;
    const full = this.realCd;
    while (this.units.length < need) {
      const i = this.units.length;
      this.units.push({
        img: W.scene.add.image(0, 0, WRAITH).setDepth(DEPTH.projectile),
        cross: W.scene.add.image(0, 0, CROSS).setDepth(DEPTH.projectile).setVisible(false),
        // новые духи стартуют вразнобой — у каждого своя фаза перезарядки
        cd: full * (i / Math.max(1, need)), full, flash: 0,
      });
    }
    while (this.units.length > need) { const u = this.units.pop()!; u.img.destroy(); u.cross.destroy(); }
    const s = (familiar ? 26 : 15) * Math.min(2.5, this.stat('size', 1));
    this.baseTint = this.hasProp(381) ? 0x9ff5e8 : this.hasProp(382) ? 0xffe2a8 : 0xffffff;
    for (const u of this.units) u.img.setDisplaySize(s, s * (28 / 24));
  }

  destroy() {
    for (const u of this.units) { u.img.destroy(); u.cross.destroy(); }
    this.units = []; this.burst = null;
  }

  update(dt: number) {
    if (!this.units.length) this.onChange();
    const P = W.player;
    this.angle += dt * 2.0;
    const n = this.units.length;
    const familiar = this.hasProp(382), missile = this.missile;
    // Заколдованная ракета: КД ускоряется пропорционально числу духов (Магическое копьё возвращает обычный КД)
    const full = missile ? this.cdOf(this.cdSec / (1 + this.spirits * 0.25)) : this.realCd;

    // ракеты стреляют разом: общий отсчёт по первому духу
    let volley = false;
    if (missile) {
      const u0 = this.units[0];
      u0.cd -= dt;
      if (u0.cd <= 0 && W.enemies.nearest(P.x, P.y, aimR())) volley = true;
    }

    for (let i = 0; i < n; i++) {
      const u = this.units[i];
      const a = this.angle + (i * Math.PI * 2) / n;
      const R = n === 1 ? 18 : 20 + n;
      const x = P.x + Math.cos(a) * R, y = P.y - 4 + Math.sin(a) * R * 0.7;
      u.img.setPosition(x, y);

      // своя перезарядка
      let fired = false;
      if (missile) {
        if (volley) fired = this.fireFrom(x, y);
        else if (i > 0) u.cd = this.units[0].cd;
      } else {
        u.cd -= dt;
        if (u.cd <= 0) {
          if (familiar) { this.startBurst(); fired = true; }
          else fired = this.fireFrom(x, y);
          if (!fired) u.cd = 0; // нет цели — ждёт заряженным
        }
      }
      if (fired || (missile && volley)) { u.cd = full; u.full = full; u.flash = FLASH; }

      // пока перезаряжается — темнеет (к концу КД снова светлеет)
      const k = u.full > 0 ? Math.max(0, Math.min(1, u.cd / u.full)) : 0;
      u.img.setTint(this.shade(1 - 0.62 * k));

      // вспышка выстрела: белый крестик раздувается и гаснет
      if (u.flash > 0) {
        u.flash -= dt;
        const f = 1 - Math.max(0, u.flash) / FLASH;
        const sz = u.img.displayWidth * (0.35 + 1.0 * f);
        u.cross.setVisible(u.flash > 0).setPosition(x, y - 1).setDisplaySize(sz, sz).setAlpha(1 - f * f);
      }
    }

    if (this.burst) {
      const b = this.burst, im = this.units[0].img;
      b.t += dt;
      const target = b.dur <= 0 ? b.shots : Math.min(b.shots, Math.floor((b.t / b.dur) * b.shots));
      while (b.done < target) {
        const a = b.dur <= 0 ? (b.done / b.shots) * Math.PI * 2 + this.angle : (b.done / b.shots) * Math.PI * 6 + this.angle;
        this.shot(im.x, im.y, a, this.dmg);
        b.done++;
      }
      if (b.done >= b.shots) this.burst = null;
      if (this.hasCombo(53) && b.done === b.shots) W.fx.burst(im.x, im.y, 60 * this.sizeMul, 0xffc070, 0.5, 'blast');
    }
  }

  /** Множитель яркости k (0..1) к основному цвету — тинт без добавления яркости */
  private shade(k: number): number {
    const t = this.baseTint;
    const r = (((t >> 16) & 255) * k) | 0, g = (((t >> 8) & 255) * k) | 0, b = ((t & 255) * k) | 0;
    return (r << 16) | (g << 8) | b;
  }

  /** Фамильяр: веер за ~1/5 КД; Сверхновая — всё разом */
  private startBurst() {
    const shots = this.hasCombo(53) ? Math.max(4, Math.round(15 * this.spirits * 0.25)) : 15 * this.spirits;
    this.burst = { t: 0, shots, done: 0, dur: this.hasCombo(53) ? 0 : Math.min(1, this.cdSec / 5) };
  }

  /** Выстрел духа в ближайшего врага на экране. false — целей нет. */
  private fireFrom(x: number, y: number): boolean {
    if (this.hasProp(381)) return this.blades(x, y);
    const e = W.enemies.nearest(x, y, aimR());
    if (!e) return false;
    this.shot(x, y, Math.atan2(e.y - y, e.x - x), this.dmg);
    return true;
  }

  /** Обычный заряд духа: пробивает всех, летит до края экрана */
  private shot(x: number, y: number, a: number, dmg: number) {
    const spear = this.hasCombo(43), size = this.sizeMul;
    const sp = (spear ? 900 : 380) * this.speedMul;
    W.projectiles.fire({
      src: this.def.id, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg,
      r: 4 * size, life: lifeToEdge(sp, 0.6), tex: 'fx_spirit_shot', size: (spear ? 34 : 22) * size,
      tint: this.hasProp(382) ? 0xffe2a8 : 0xffffff, pierce: Infinity, knock: 15,
      rotateToVel: false, update: faceVel(ROT.tipLeft),
    });
  }

  /**
   * Магический клинок: разрез возникает прямо на враге (короткий быстрый клинок насквозь).
   * Парящие мечи: клинки быстрее и длиннее; каждые 0.15 с сокращения КД → +1 к множителю урона и +1 удар.
   */
  private blades(x: number, y: number): boolean {
    let hits = 1, mul = 1, len = 1, sp = 1100;
    if (this.hasCombo(2)) {
      const bonus = Math.max(0, Math.floor((0.9 - this.realCd) / 0.15));
      hits = 1 + bonus; mul = 1 + bonus; len = 1.6; sp = 1600;
    }
    const targets: Enemy[] = W.enemies.nearestN(x, y, hits, aimR());
    if (!targets.length) return false;
    const dmg = this.dmg * mul, size = this.sizeMul * len;
    for (let i = 0; i < hits; i++) {
      const e = targets[i % targets.length];
      const a = Math.atan2(e.y - y, e.x - x) + (i >= targets.length ? (Math.random() - 0.5) * 1.2 : 0);
      const back = 24 * size;
      W.projectiles.fire({
        src: this.def.id, x: e.x - Math.cos(a) * back, y: e.y - Math.sin(a) * back,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg, r: 7 * size, life: (back * 2) / sp + 0.02,
        tex: 'fx_spirit_blade', size: 30 * size, tint: 0xbff8ee, pierce: Infinity, knock: 10,
        rotateToVel: false, update: faceVel(ROT.blade),
      });
    }
    return true;
  }
}

export const SPIRIT = defFromData(SPELL_BY_ID[3], (def) => new Spirit(def, SPELL_BY_ID[3]));
