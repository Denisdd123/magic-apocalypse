import Phaser from 'phaser';
import { DEPTH } from '../../config';
import { W } from '../World';
import { Spell, type SpellDef } from './Spell';

interface Sat { img: Phaser.GameObjects.Image; hits: Map<number, number>; ring: number; }

/** Кольцо сфер — светящиеся шары вращаются вокруг мага и бьют всех, кого касаются. */
class OrbRing extends Spell {
  private sats: Sat[] = [];
  private angle = 0;
  private t = 0;

  get baseCount() { return (this.level >= 6 ? 6 : this.level) + W.stats.sc('orbring'); }
  get dmgMul() { return (1 + 0.2 * (Math.min(this.level, 6) - 1)) * W.stats.sd('orbring'); }

  onChange() {
    const merged = this.has('core');
    const n = merged ? 1 : this.has('wisp') ? this.baseCount * 2 : this.baseCount;
    while (this.sats.length < n) {
      this.sats.push({ img: W.scene.add.image(0, 0, 'satellite').setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD), hits: new Map(), ring: 0 });
    }
    while (this.sats.length > n) this.sats.pop()!.img.destroy();
    this.sats.forEach((s, i) => { s.ring = this.has('wisp') ? i % 2 : 0; s.img.setTint(this.tint); });
  }

  update(dt: number) {
    if (!this.sats.length) this.onChange();
    this.t += dt;
    const P = W.player, st = W.stats;
    let speed = 2.4;
    if (this.has('antigrav')) speed *= 1 + 2 * (0.5 - 0.5 * Math.cos((this.t / 6) * Math.PI * 2));
    if (this.has('wisp')) speed *= 1.33;
    if (this.has('core')) speed *= 0.5;
    this.angle += speed * dt;

    const merged = this.has('core');
    const sizeK = merged ? 1 + this.baseCount * 0.5 : this.has('wisp') ? 0.67 : 1;
    const r = 8 * st.sizeMul * sizeK;
    const dmg = st.spellDamage(100, this.dmgMul * (merged ? this.baseCount : 1));
    const interval = merged ? 0.3 : 0.5;

    const perRing = [0, 0];
    for (const s of this.sats) perRing[s.ring]++;
    const idxInRing = [0, 0];

    for (const s of this.sats) {
      const k = idxInRing[s.ring]++;
      const R = (s.ring === 0 ? (this.has('wisp') ? 38 : 52) : 74) * Math.sqrt(st.sizeMul);
      const dir = s.ring === 0 ? 1 : -1;
      const a = this.angle * dir + (k * Math.PI * 2) / perRing[s.ring];
      const x = P.x + Math.cos(a) * R, y = P.y + Math.sin(a) * R;
      s.img.setPosition(x, y).setDisplaySize(r * 3, r * 3);

      W.enemies.grid.query(x, y, r, (e) => {
        const last = s.hits.get(e.id);
        if (last !== undefined && this.t - last < interval) return;
        s.hits.set(e.id, this.t);
        const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1;
        W.enemies.damage(e, dmg, (dx / d) * 70, (dy / d) * 70, 'orbring');
      });
      if (s.hits.size > 300) s.hits.clear();
    }
  }

  destroy() { this.sats.forEach((s) => s.img.destroy()); }
}

export const ORB_RING: SpellDef = {
  id: 'orbring', name: 'Кольцо сфер', icon: 'ico_satellite', kind: 'attack',
  desc: 'Создаёт сферы, которые вращаются вокруг тебя.',
  maxLevel: 7, attrLevels: [7],
  levelText: {
    2: ['Урон сфер +20%', 'Число сфер +1'], 3: ['Урон сфер +20%', 'Число сфер +1'],
    4: ['Урон сфер +20%', 'Число сфер +1'], 5: ['Урон сфер +20%', 'Число сфер +1'], 6: ['Урон сфер +20%', 'Число сфер +1'],
  },
  attrs: {
    7: [
      { id: 'antigrav', name: 'Антигравитация', tint: 0xa0ffcf, lines: ['Скорость вращения нарастает до x3, затем снова падает.'] },
      { id: 'wisp', name: 'Два кольца', tint: 0x9fd8ff, lines: ['Сферы делятся на два кольца, вращающихся навстречу.', 'Число сфер x2, скорость +33%', 'Размер сфер -33%'] },
      { id: 'core', name: 'Ядро', tint: 0xffe08a, lines: ['Все сферы сливаются в одно огромное ядро.', 'Урон и размер растут за каждую сферу', 'Бьёт каждые 0.3 сек., скорость -50%'] },
    ],
  },
  create: () => new OrbRing(ORB_RING),
};
