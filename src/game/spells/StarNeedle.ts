import Phaser from 'phaser';
import { DEPTH } from '../../config';
import { areaDamage } from '../Projectiles';
import type { Enemy } from '../Enemies';
import { W } from '../World';
import { Spell, type SpellDef } from './Spell';

/** Звёздная игла — базовый снаряд в ближайшего врага. Преображения на 4 и 7 уровнях. */
class StarNeedle extends Spell {
  private queue: { delay: number; from: { x: number; y: number } }[] = [];
  private mirages: Phaser.GameObjects.Image[] = [];
  private mirAngle = 0;

  get count() {
    let c = 1 + (this.level >= 2 ? 1 : 0) + (this.level >= 5 ? 1 : 0) + (this.has('chain') ? 1 : 0);
    if (this.has('barrage')) c *= 5;
    return c;
  }
  get dmgMul() {
    let m = 1 + (this.level >= 3 ? 0.5 : 0) + (this.level >= 6 ? 0.5 : 0);
    if (this.has('lance')) m *= 1.8;
    if (this.has('firecracker')) m *= 1.5;
    if (this.has('barrage')) m *= 1.5;
    return m;
  }
  get baseCd() {
    let c = 0.75;
    if (this.has('firecracker')) c += 1.2;
    if (this.has('chain')) c *= 0.8;
    if (this.has('barrage')) c += 2;
    if (this.has('doppel')) c *= 1.5;
    return c;
  }

  onChange() {
    if (this.has('doppel') && this.mirages.length === 0) {
      for (let i = 0; i < 3; i++) {
        this.mirages.push(W.scene.add.image(0, 0, 'mirage').setDepth(DEPTH.player).setDisplaySize(16, 22).setTint(0xc49bff).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD));
      }
    }
  }

  update(dt: number) {
    const P = W.player;
    // миражи кружат вокруг мага
    if (this.mirages.length) {
      this.mirAngle += dt * 1.4;
      this.mirages.forEach((m, i) => {
        const a = this.mirAngle + (i * Math.PI * 2) / 3;
        m.setPosition(P.x + Math.cos(a) * 30, P.y + Math.sin(a) * 30 - 4);
      });
    }

    if (this.ready(dt, this.baseCd)) {
      const sources = this.mirages.length ? this.mirages.map((m) => ({ x: m.x, y: m.y + 4 })) : [P];
      const n = this.count;
      for (const src of sources) {
        for (let i = 0; i < n; i++) this.queue.push({ delay: i * (this.has('barrage') ? 0.03 : 0.07), from: src });
      }
    }
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.delay -= dt;
      if (q.delay <= 0) {
        this.queue.splice(i, 1);
        const from = this.mirages.length ? q.from : P;
        this.shoot(from.x, from.y);
      }
    }
  }

  private shoot(x: number, y: number) {
    const s = W.stats;
    const dmg = s.spellDamage(100, this.dmgMul);
    const tint = this.tint;
    let dirs: number[] = [];
    if (this.has('barrage')) {
      dirs = [Math.random() * Math.PI * 2];
    } else {
      const targets: Enemy[] = [];
      const skip = new Set<Enemy>();
      const n = this.has('fission') ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const e = W.enemies.nearest(x, y, 260, skip);
        if (!e) break;
        targets.push(e); skip.add(e);
      }
      if (!targets.length) return;
      dirs = targets.map((e) => Math.atan2(e.y - y, e.x - x) + (Math.random() - 0.5) * 0.08);
    }
    const lance = this.has('lance');
    const speed = 320 * (lance ? 2.2 : 1);
    for (const a of dirs) {
      W.projectiles.fire({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        dmg, r: (lance ? 7 : 4) * s.sizeMul, life: lance ? 0.6 : 1.0,
        tex: 'bolt', size: (lance ? 34 : 16) * s.sizeMul, tint,
        pierce: lance ? Infinity : 0, knock: 30,
        onHit: this.has('firecracker') ? (p) => this.firecracker(p.x, p.y, dmg * 0.5) : undefined,
      });
    }
  }

  private firecracker(x: number, y: number, dmg: number) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      W.projectiles.fire({
        x, y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, dmg: 0, r: 1, life: 0.22,
        tex: 'dot', size: 7, tint: 0xff7ad9, pierce: Infinity,
        onEnd: (p) => {
          const r = 20 * W.stats.sizeMul;
          areaDamage(p.x, p.y, r, dmg);
          W.fx.burst(p.x, p.y, r, 0xff7ad9, 0.25);
        },
      });
    }
  }
}

export const STAR_NEEDLE: SpellDef = {
  id: 'needle', name: 'Звёздная игла', icon: 'ico_bolt', kind: 'attack',
  desc: 'Выпускает иглу в ближайшего врага.',
  maxLevel: 7, attrLevels: [4, 7],
  levelText: {
    2: ['Число игл +1'], 3: ['Урон игл +50%'], 5: ['Число игл +1'], 6: ['Урон игл +50%'],
  },
  attrs: {
    4: [
      { id: 'lance', name: 'Копьё', tint: 0x9fd8ff, lines: ['Иглы пробивают всех врагов насквозь.', 'Урон x1.8, размер и скорость сильно выше'] },
      { id: 'firecracker', name: 'Хлопушка', tint: 0xff7ad9, lines: ['При попадании игла разлетается на 3 искры, которые взрываются.', 'Урон +50%', 'Перезарядка +1.2 сек.'] },
      { id: 'fission', name: 'Расщепление', tint: 0xffd25a, lines: ['Каждая игла летит сразу в 3 ближайших врагов.'] },
    ],
    7: [
      { id: 'chain', name: 'Очередь', tint: 0xffffff, lines: ['Число игл +1', 'Перезарядка -20%'] },
      { id: 'barrage', name: 'Шквал', tint: 0xffa040, lines: ['Иглы летят во все стороны.', 'Число игл x5, урон +50%', 'Перезарядка +2 сек.'] },
      { id: 'doppel', name: 'Двойники', tint: 0xc49bff, lines: ['Три призрачных двойника кружат рядом и стреляют вместо тебя.', 'Перезарядка +50%'] },
    ],
  },
  create: () => new StarNeedle(STAR_NEEDLE),
};
