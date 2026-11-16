import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { areaDamage } from '../../Projectiles';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';

/**
 * #1 Магическая пуля → «Звёздная игла». ОБРАЗЕЦ для остальных заклинаний на DataSpell:
 * числа (урон, КД, количество, размер, скорость) — только из геттеров DataSpell, механика свойств — по hasProp(id).
 * Свойства: 362 Стрела (пробивает всех), 363 Петарда (3 искры со взрывом), 364 Раскол (+2 цели),
 * 365 Непрерывная атака (чистые моды), 366 Лихорадка (хаотичные направления), 367 Двойник (3 фантома).
 */
class Bolt extends DataSpell {
  private queue: { delay: number; from: { x: number; y: number } }[] = [];
  private mirages: Phaser.GameObjects.Image[] = [];
  private mirAngle = 0;

  onChange() {
    super.onChange();
    if (this.hasProp(367) && this.mirages.length === 0) {
      for (let i = 0; i < 3; i++) {
        this.mirages.push(W.scene.add.image(0, 0, 'mirage_0').setDepth(DEPTH.player).setDisplaySize(16, 22).setTint(0xc49bff).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD));
      }
    }
  }

  destroy() { this.mirages.forEach((m) => m.destroy()); this.mirages = []; }

  update(dt: number) {
    const P = W.player;
    if (this.mirages.length) {
      this.mirAngle += dt * 1.4;
      this.mirages.forEach((m, i) => {
        const a = this.mirAngle + (i * Math.PI * 2) / 3;
        m.setPosition(P.x + Math.cos(a) * 30, P.y + Math.sin(a) * 30 - 4);
      });
    }
    if (this.readyData(dt)) {
      const sources = this.mirages.length ? this.mirages.map((m) => ({ x: m.x, y: m.y + 4 })) : [P];
      const n = this.count;
      const gap = this.hasProp(366) ? 0.03 : 0.07;
      for (const src of sources) for (let i = 0; i < n; i++) this.queue.push({ delay: i * gap, from: src });
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
    const dmg = this.dmg, size = this.sizeMul, spd = this.speedMul;
    let dirs: number[];
    if (this.hasProp(366)) dirs = [Math.random() * Math.PI * 2];
    else {
      const targets = W.enemies.nearestN(x, y, this.hasProp(364) ? 3 : 1, 260);
      if (!targets.length) return;
      dirs = targets.map((e) => Math.atan2(e.y - y, e.x - x) + (Math.random() - 0.5) * 0.08);
    }
    const arrow = this.hasProp(362);
    const speed = 320 * spd;
    for (const a of dirs) {
      W.projectiles.fire({
        src: this.def.id, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        dmg, r: 4 * size, life: arrow ? 0.6 : 1.0,
        tex: 'bolt', size: 16 * size, tint: this.tint,
        pierce: arrow ? Infinity : 0, knock: 30,
        onHit: this.hasProp(363) ? (p) => this.firecracker(p.x, p.y, dmg * 0.5) : undefined,
      });
    }
  }

  private firecracker(x: number, y: number, dmg: number) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      W.projectiles.fire({
        src: this.def.id, x, y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, dmg: 0, r: 1, life: 0.22,
        tex: 'dot', size: 7, tint: 0xff7ad9, pierce: Infinity,
        onEnd: (p) => {
          const r = 20 * W.stats.sizeMul;
          areaDamage(p.x, p.y, r, dmg, 0, this.def.id);
          W.fx.burst(p.x, p.y, r, 0xff7ad9, 0.25);
        },
      });
    }
  }
}

export const BOLT = defFromData(SPELL_BY_ID[1], (def) => new Bolt(def, SPELL_BY_ID[1]));
