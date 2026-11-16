import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { areaDamage } from '../../Projectiles';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { aimR, faceVel, lifeToEdge, ROT, rnd } from './_proj';

/** Своя текстура иглы: тёмное лезвие + один белый блик на острие (без ореола и «осколков») */
const NEEDLE = 'v2_star_needle';
function ensureNeedle() {
  if (W.scene.textures.exists(NEEDLE)) return;
  const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
  // хвост-тень
  g.fillStyle(0x1c1826, 0.55); g.fillTriangle(0, 4, 22, 1, 22, 7);
  // тело иглы: тёмный фиолетово-серый
  g.fillStyle(0x3e3858, 1); g.fillTriangle(6, 4, 30, 2, 30, 6);
  g.fillTriangle(30, 2, 30, 6, 38, 4);
  // холодная сердцевина
  g.fillStyle(0x8f88b4, 1); g.fillRect(14, 3, 20, 2);
  // блик на острие: маленький белый крестик
  g.fillStyle(0xffffff, 1); g.fillRect(33, 3, 4, 2); g.fillRect(34, 2, 2, 4);
  g.generateTexture(NEEDLE, 40, 8);
  g.destroy();
}

/**
 * #1 Магическая пуля → «Звёздная игла». ОБРАЗЕЦ для остальных заклинаний на DataSpell:
 * числа (урон, КД, количество, размер, скорость) — только из геттеров DataSpell, механика свойств — по hasProp(id).
 * Свойства: 362 Стрела (пробивает всех), 363 Петарда (3 искры со взрывом), 364 Раскол (+2 цели),
 * 365 Непрерывная атака (чистые моды), 366 Лихорадка (хаотичные направления), 367 Двойник (3 фантома).
 * Слияния (основа): 33 Аватар (+3 фантома, 1 пуля, урон +33% за каждую пулю), 42 Фейерверк (взрывы в случайных точках ×1…×9),
 * 54 Бластер (каждая 6-я пуля ×7).
 */
class Bolt extends DataSpell {
  private queue: { delay: number; from: { x: number; y: number } }[] = [];
  private mirages: Phaser.GameObjects.Image[] = [];
  private mirAngle = 0;
  /** счётчик выстрелов для Бластера (каждая 6-я ×7) */
  private shotN = 0;

  onChange() {
    super.onChange();
    // Двойник: 3 фантома; Аватар — ещё 3
    const need = this.hasProp(367) ? (this.hasCombo(33) ? 6 : 3) : 0;
    if (this.mirages.length < need) {
      for (let i = this.mirages.length; i < need; i++) {
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
        const a = this.mirAngle + (i * Math.PI * 2) / this.mirages.length;
        m.setPosition(P.x + Math.cos(a) * 30, P.y + Math.sin(a) * 30 - 4);
      });
    }
    if (this.readyData(dt)) {
      const sources = this.mirages.length ? this.mirages.map((m) => ({ x: m.x, y: m.y + 4 })) : [P];
      // Аватар: число пуль фиксируется на 1
      const n = this.hasCombo(33) ? 1 : this.count;
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
    if (this.hasCombo(42)) { this.pyro(x, y); return; }
    let dmg = this.dmg, size = this.sizeMul;
    const spd = this.speedMul;
    // Аватар: урон +33% за каждую пулю, которая была бы в залпе
    if (this.hasCombo(33)) dmg *= 1 + 0.33 * this.count;
    // Бластер: каждая 6-я пуля ×7 (и заметно крупнее)
    let blast = false;
    if (this.hasCombo(54) && ++this.shotN % 6 === 0) { dmg *= 7; size *= 2; blast = true; }
    let dirs: number[];
    if (this.hasProp(366)) dirs = [Math.random() * Math.PI * 2];
    else {
      // как в оригинале: точно в ближайших врагов на экране, без разброса и короткого предела
      const targets = W.enemies.nearestN(x, y, this.hasProp(364) ? 3 : 1, aimR());
      if (!targets.length) return;
      dirs = targets.map((e) => Math.atan2(e.y - y, e.x - x));
    }
    const arrow = this.hasProp(362);
    const speed = 320 * spd;
    // дальность — до края экрана и дальше (без короткого предела)
    const life = lifeToEdge(speed);
    if (!blast) ensureNeedle();
    for (const a of dirs) {
      const p = W.projectiles.fire({
        src: this.def.id, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        dmg, r: 4 * size, life,
        tex: blast ? 'fx_bolt_proj' : NEEDLE, size: (blast ? 30 : 16) * size, tint: this.tint,
        rotateToVel: !blast, update: blast ? faceVel(ROT.tipLeft) : undefined,
        pierce: arrow ? Infinity : 0, knock: 30,
        onHit: this.hasProp(363) ? (q) => this.firecracker(q.x, q.y, dmg * 0.5) : undefined,
      });
      // обычная игла — без ADD-свечения (темнее, без пересвета)
      if (!blast) p.img.setBlendMode(Phaser.BlendModes.NORMAL);
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

  /**
   * Фейерверк: пуля летит в случайную точку (или к случайному видимому врагу) и там взрывается;
   * взрыв расширяется и наносит урон от ×1 до ×9 (чем сильнее, тем шире).
   */
  private pyro(x: number, y: number) {
    const size = this.sizeMul, sp = 300 * this.speedMul;
    const e = Math.random() < 0.5 ? W.enemies.randomVisible() : null;
    const a = e ? Math.atan2(e.y - y, e.x - x) : Math.random() * Math.PI * 2;
    const dist = e ? Math.max(20, Math.min(aimR(), Math.hypot(e.x - x, e.y - y))) : rnd(60, 180);
    const dmg = this.dmg;
    W.projectiles.fire({
      src: this.def.id, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: 0, r: 1, life: dist / sp,
      tex: 'fx_bolt_proj', size: 22 * size, tint: 0xffc890, pierce: Infinity,
      rotateToVel: false, update: faceVel(ROT.tipLeft),
      onEnd: (p) => {
        const k = 1 + ((Math.random() * 9) | 0);
        const r = 18 * size * (1 + 0.15 * k);
        areaDamage(p.x, p.y, r, dmg * k, 20, this.def.id);
        // без звезды-«разбитого стекла»: одна приглушённая вспышка
        W.fx.burst(p.x, p.y, r * 1.2, 0xb0607a, 0.45, 'blast');
        W.fx.sparks(p.x, p.y, 2 + (k >> 1), 0xffc070, 110);
      },
    });
  }
}

export const BOLT = defFromData(SPELL_BY_ID[1], (def) => new Bolt(def, SPELL_BY_ID[1]));
