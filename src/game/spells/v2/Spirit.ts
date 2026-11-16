import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { faceVel, ROT } from './_proj';

/**
 * #3 Дух → «Духи-стражи». Духи парят вокруг мага, каждый по КД стреляет пробивающим снарядом в ближайшего врага.
 * Свойства: 380 Заколдованная ракета (КД ускоряется от числа духов, стреляют разом), 381 Магический клинок
 * (мгновенный разрез прямо на враге), 382 Фамильяр (один большой дух, веер выстрелов во все стороны, 15 за духа).
 * Слияния (основа): 2 Парящие мечи, 43 Магическое копьё, 53 Сверхновая.
 */
class Spirit extends DataSpell {
  private imgs: Phaser.GameObjects.Image[] = [];
  private angle = 0;
  private queue: { delay: number; idx: number }[] = [];
  private burst: { t: number; shots: number; done: number; dur: number } | null = null;

  /** Число духов: база + прибавки «+N» (без %-множителей количества — те относятся к выстрелам) */
  private get spirits(): number {
    let n = this.data.base.count ?? 1;
    for (const m of this.mods()) if (m.stat === 'count' && m.op === 'add') n += m.v;
    n += W.stats.sc(this.def.id);
    if (this.hasProp(382)) n -= 15; // «+15 выстрелов за духа» — это не духи
    return Math.max(1, Math.round(n));
  }

  /** Фактический КД (как считает Spell.ready) — для «Парящих мечей» */
  private get realCd() {
    return Math.max(0.05, this.cdSec * W.stats.cdMul * (1 - (W.stats.spellCdr[this.def.id] ?? 0)));
  }

  onChange() {
    super.onChange();
    const familiar = this.hasProp(382);
    const need = familiar ? 1 : this.spirits;
    while (this.imgs.length < need) {
      this.imgs.push(W.scene.add.image(0, 0, 'fx_spirit_unit').setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD));
    }
    while (this.imgs.length > need) this.imgs.pop()!.destroy();
    const s = (familiar ? 26 : 15) * Math.min(2.5, this.stat('size', 1));
    const tint = this.hasProp(381) ? 0x9ff5e8 : this.hasProp(382) ? 0xffe2a8 : 0xffffff;
    for (const im of this.imgs) im.setDisplaySize(s, s).setTint(tint);
  }

  destroy() { this.imgs.forEach((i) => i.destroy()); this.imgs = []; this.queue.length = 0; this.burst = null; }

  update(dt: number) {
    if (!this.imgs.length) this.onChange();
    const P = W.player;
    this.angle += dt * 2.0;
    const n = this.imgs.length;
    for (let i = 0; i < n; i++) {
      const im = this.imgs[i];
      const a = this.angle + (i * Math.PI * 2) / n;
      const R = n === 1 ? 18 : 20 + n;
      im.setPosition(P.x + Math.cos(a) * R, P.y - 4 + Math.sin(a) * R * 0.7);
    }

    // Заколдованная ракета: КД ускоряется пропорционально числу духов (Магическое копьё возвращает обычный КД)
    let cd = this.cdSec;
    const missile = this.hasProp(380) && !this.hasCombo(43);
    if (missile) cd /= 1 + this.spirits * 0.25;
    if (this.ready(dt, cd)) {
      if (this.hasProp(382)) {
        const shots = this.hasCombo(53) ? Math.max(4, Math.round(15 * this.spirits * 0.25)) : 15 * this.spirits;
        // Фамильяр: веер за ~1/5 КД; Сверхновая — всё разом
        this.burst = { t: 0, shots, done: 0, dur: this.hasCombo(53) ? 0 : Math.min(1, this.cdSec / 5) };
      } else if (missile) {
        for (let i = 0; i < n; i++) this.queue.push({ delay: 0, idx: i });
      } else {
        const gap = Math.min(0.12, this.realCd / Math.max(1, n));
        for (let i = 0; i < n; i++) this.queue.push({ delay: i * gap, idx: i });
      }
    }

    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.delay -= dt;
      if (q.delay > 0) continue;
      this.queue[i] = this.queue[this.queue.length - 1]; this.queue.pop();
      const im = this.imgs[q.idx];
      if (im) this.fireFrom(im.x, im.y);
    }

    if (this.burst) {
      const b = this.burst, im = this.imgs[0];
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

  private fireFrom(x: number, y: number) {
    const range = this.hasCombo(43) ? 360 : 200;
    if (this.hasProp(381)) { this.blades(x, y); return; }
    const e = W.enemies.nearest(x, y, range);
    if (!e) return;
    this.shot(x, y, Math.atan2(e.y - y, e.x - x), this.dmg);
  }

  /** Обычный заряд духа: пробивает всех */
  private shot(x: number, y: number, a: number, dmg: number) {
    const spear = this.hasCombo(43), size = this.sizeMul;
    const sp = (spear ? 900 : 380) * this.speedMul;
    W.projectiles.fire({
      src: this.def.id, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg,
      r: 4 * size, life: spear ? 0.5 : 0.6, tex: 'fx_spirit_shot', size: (spear ? 34 : 22) * size,
      tint: this.hasProp(382) ? 0xffe2a8 : 0xffffff, pierce: Infinity, knock: 15,
      rotateToVel: false, update: faceVel(ROT.tipLeft),
    });
  }

  /**
   * Магический клинок: разрез возникает прямо на враге (короткий быстрый клинок насквозь).
   * Парящие мечи: клинки быстрее и длиннее; каждые 0.15 с сокращения КД → +1 к множителю урона и +1 удар.
   */
  private blades(x: number, y: number) {
    let hits = 1, mul = 1, len = 1, sp = 1100;
    if (this.hasCombo(2)) {
      const bonus = Math.max(0, Math.floor((0.9 - this.realCd) / 0.15));
      hits = 1 + bonus; mul = 1 + bonus; len = 1.6; sp = 1600;
    }
    const targets: Enemy[] = W.enemies.nearestN(x, y, hits, 220);
    if (!targets.length) return;
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
  }
}

export const SPIRIT = defFromData(SPELL_BY_ID[3], (def) => new Spirit(def, SPELL_BY_ID[3]));
