import Phaser from 'phaser';
import { DEPTH } from '../../config';
import { W } from '../World';
import { Spell, type SpellDef } from './Spell';

/** Духи-стражи — звёздочки рядом с магом, стреляют пробивающими снарядами. */
class Guardians extends Spell {
  private imgs: Phaser.GameObjects.Image[] = [];
  private angle = 0;
  private queue: { delay: number; idx: number }[] = [];
  private burst: { t: number; shots: number; done: number } | null = null;

  get count() { return (this.level >= 6 ? 6 : this.level) + W.stats.sc('guardians'); }
  get dmgMul() {
    let m = 1 + 0.2 * (Math.min(this.level, 6) - 1);
    if (this.has('blades')) m *= 2.5;
    return m * W.stats.sd('guardians');
  }
  get baseCd() {
    if (this.has('guardian')) return 0.9 * 5;
    if (this.has('missiles')) return (0.9 * 0.8) / (1 + this.count * 0.25);
    return 0.9;
  }

  onChange() {
    const need = this.has('guardian') ? 1 : this.count;
    while (this.imgs.length < need) {
      this.imgs.push(W.scene.add.image(0, 0, 'spirit').setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD));
    }
    while (this.imgs.length > need) this.imgs.pop()!.destroy();
    const big = this.has('guardian');
    for (const im of this.imgs) im.setDisplaySize(big ? 20 : 11, big ? 20 : 11).setTint(this.tint);
  }

  update(dt: number) {
    if (!this.imgs.length) this.onChange();
    const P = W.player;
    this.angle += dt * 2.2;
    const n = this.imgs.length;
    this.imgs.forEach((im, i) => {
      const a = this.angle + (i * Math.PI * 2) / n;
      const R = n === 1 ? 16 : 18;
      im.setPosition(P.x + Math.cos(a) * R, P.y - 4 + Math.sin(a) * R * 0.7);
      im.rotation += dt * 3;
    });

    if (this.ready(dt, this.baseCd)) {
      if (this.has('guardian')) this.burst = { t: 0, shots: 15 * this.count, done: 0 };
      else if (this.has('missiles')) this.imgs.forEach((_, i) => this.queue.push({ delay: 0, idx: i }));
      else this.imgs.forEach((_, i) => this.queue.push({ delay: i * 0.09, idx: i }));
    }

    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.delay -= dt;
      if (q.delay <= 0) { this.queue.splice(i, 1); this.fireFrom(this.imgs[q.idx]); }
    }

    // Хранитель: веер выстрелов во все стороны в течение секунды
    if (this.burst) {
      const b = this.burst;
      b.t += dt;
      const target = Math.min(b.shots, Math.floor((b.t / 1.0) * b.shots));
      const im = this.imgs[0];
      while (b.done < target) {
        const a = (b.done / b.shots) * Math.PI * 6 + this.angle;
        this.fireDir(im.x, im.y, a);
        b.done++;
      }
      if (b.done >= b.shots) this.burst = null;
    }
  }

  private fireFrom(im: Phaser.GameObjects.Image | undefined) {
    if (!im) return;
    const e = W.enemies.nearest(im.x, im.y, 190);
    if (!e) return;
    this.fireDir(im.x, im.y, Math.atan2(e.y - im.y, e.x - im.x));
  }

  private fireDir(x: number, y: number, a: number) {
    const s = W.stats;
    const blade = this.has('blades');
    const sp = blade ? 900 : 380;
    W.projectiles.fire({ src: 'guardians',
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      dmg: s.spellDamage(150, this.dmgMul), r: (blade ? 6 : 4) * s.sizeMul,
      life: blade ? 0.3 : 0.65, tex: blade ? 'blade' : 'dot', size: (blade ? 30 : 8) * s.sizeMul,
      tint: this.tint, pierce: Infinity, knock: 20,
    });
  }

  destroy() { this.imgs.forEach((i) => i.destroy()); }
}

export const GUARDIANS: SpellDef = {
  id: 'guardians', name: 'Духи-стражи', icon: 'ico_spirit', kind: 'attack',
  desc: 'Призывает духов, которые помогают атаковать.',
  maxLevel: 7, attrLevels: [7],
  levelText: {
    2: ['Урон духов +20%', 'Число духов +1'], 3: ['Урон духов +20%', 'Число духов +1'],
    4: ['Урон духов +20%', 'Число духов +1'], 5: ['Урон духов +20%', 'Число духов +1'], 6: ['Урон духов +20%', 'Число духов +1'],
  },
  attrs: {
    7: [
      { id: 'missiles', name: 'Рой ракет', tint: 0x6ff7ff, lines: ['Духи стреляют одновременно, и чем их больше — тем чаще.', 'Перезарядка -20%'] },
      { id: 'blades', name: 'Клинки', tint: 0xff8ad8, lines: ['Духи мгновенно метают длинные клинки.', 'Урон духов x2.5'] },
      { id: 'guardian', name: 'Хранитель', tint: 0xffd166, lines: ['Духи сливаются в одного, который выпускает веер снарядов во все стороны.', '+15 снарядов за каждого духа', 'Перезарядка x5'] },
    ],
  },
  create: () => new Guardians(GUARDIANS),
};
