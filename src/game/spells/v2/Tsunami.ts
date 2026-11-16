import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { HitGate, ImgPool, faceAngle, viewHalfDiag } from './_zoneKit';
import { WAVE_ACROSS, WAVE_OX, WAVE_TEX, WAVE_TEX_LAVA, ensureInkWave } from './_inkfx';

/** штриховая волна (_inkfx): идёт по +x, гребень впереди; 3 кадра, смена ~12 раз в секунду */
const WAVE_FPS = 12;
/** видимая ширина волны относительно радиуса удара (с брызгами по краям) */
const WAVE_WK = 2.6;
const FIRE_TEX = 'fx_lava_wave', FIRE_D = 153;

interface Wave {
  x: number; y: number; vx: number; vy: number; t: number; life: number; delay: number;
  r: number; img: Phaser.GameObjects.Image | null; fireT: number; fr: number;
}
interface Fire { x: number; y: number; t: number; life: number; img: Phaser.GameObjects.Image }

/**
 * #9 Цунами → «Чёрный прилив». 8 волн одна за другой пересекают поле по диагонали (направление — случайная диагональ).
 * Урон одному врагу — не чаще 0.25 с (общие ворота), т.е. наложившиеся волны не дублируют удар.
 * Свойства: 434 Полюс (с четырёх сторон к магу, заморозка), 435 Песнь сирены (возле мага по направлению движения),
 * 436 Великое извержение (шире радиус появления, лава вместо воды).
 * Слияния (основа): C23 Потоп (+2 по бокам, регулярно из-за спины), C48 Феникс (из-за спины, оставляет пламя),
 * C61 Глейсиум (во все стороны от мага, заморозка).
 */
class Tsunami extends DataSpell {
  private waves: Wave[] = [];
  private spare: Wave[] = [];
  private fires: Fire[] = [];
  private pool = new ImgPool();
  private gate = new HitGate();
  private fireGate = new HitGate();
  private clock = 0;
  private floodT = 0; // C23: таймер волн из-за спины

  destroy() {
    for (const w of this.waves) if (w.img) this.pool.put(w.img);
    for (const f of this.fires) this.pool.put(f.img);
    this.waves.length = 0; this.fires.length = 0;
    this.pool.destroy();
  }

  private get freezes() { return this.hasProp(434); }
  private get lava() { return this.hasProp(436); }

  update(dt: number) {
    ensureInkWave();
    this.clock += dt;
    if (this.readyData(dt)) this.cast();
    if (this.hasCombo(23)) {
      this.floodT -= dt;
      if (this.floodT <= 0) { this.floodT = 1.2; this.fromBehind(1, 0); }
    }
    this.moveWaves(dt);
    if (this.fires.length) this.updateFires(dt);
    if ((this.clock * 4 | 0) % 20 === 0) this.gate.prune(this.clock, 2);
  }

  private moveWaves(dt: number) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      if (!w.img) {
        // волна с задержкой 0 тоже должна получить картинку (раньше падало)
        if (w.delay > 0) { w.delay -= dt; if (w.delay > 0) continue; }
        // обычное смешивание: тёмное тело воды видно на карте, светлый гребень — поверх
        const fr0 = this.lava ? WAVE_TEX_LAVA : WAVE_TEX;
        w.img = this.pool.get(fr0[w.fr % 3], DEPTH.fx, false).setOrigin(WAVE_OX, 0.5);
        if (this.freezes) w.img.setTint(0xcfe4ff);
      }
      w.t += dt;
      if (w.t >= w.life) {
        if (w.img) this.pool.put(w.img);
        w.img = null;
        this.waves[i] = this.waves[this.waves.length - 1]; this.waves.pop();
        this.spare.push(w);
        continue;
      }
      w.x += w.vx * dt; w.y += w.vy * dt;
      const k = w.t / w.life;
      const a = k < 0.1 ? k / 0.1 : k > 0.85 ? (1 - k) / 0.15 : 1;
      const frames = this.lava ? WAVE_TEX_LAVA : WAVE_TEX;
      const key = frames[(((this.clock * WAVE_FPS) | 0) + w.fr) % 3];
      const img = w.img!;
      if (img.texture.key !== key) img.setTexture(key);
      img.setPosition(w.x, w.y).setRotation(Math.atan2(w.vy, w.vx)).setScale((w.r * WAVE_WK) / WAVE_ACROSS).setAlpha(a * 0.95);
      this.cw = w;
      W.enemies.grid.query(w.x, w.y, w.r, this.onHit);
      // C48: пламя на пути
      if (this.hasCombo(48)) {
        w.fireT -= dt;
        if (w.fireT <= 0) { w.fireT = 0.15; this.addFire(w.x, w.y); }
      }
    }
  }

  private cw: Wave | null = null;
  private onHit = (e: Enemy) => {
    if (!this.gate.ok(e.id, this.clock, 0.25)) return;
    const w = this.cw!, sp = Math.hypot(w.vx, w.vy) || 1;
    W.enemies.damage(e, this.dmg, (w.vx / sp) * 40, (w.vy / sp) * 40, this.def.id);
    if (this.freezes) W.enemies.freeze(e, 1);
  };

  private addFire(x: number, y: number) {
    const img = this.pool.get(FIRE_TEX, DEPTH.zone).setPosition(x, y).setRotation(Math.random() * Math.PI * 2).setAlpha(0.8);
    this.fires.push({ x, y, t: 0, life: 2, img });
  }

  private onFire = (e: Enemy) => {
    if (this.fireGate.ok(e.id, this.clock, 0.5)) W.enemies.damage(e, this.dmg * 0.2, 0, 0, this.def.id);
  };

  private updateFires(dt: number) {
    const r = 18 * this.sizeMul;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t += dt;
      if (f.t >= f.life) { this.pool.put(f.img); this.fires[i] = this.fires[this.fires.length - 1]; this.fires.pop(); continue; }
      f.img.setScale((r * 2) / FIRE_D).setAlpha(0.8 * (1 - f.t / f.life));
      W.enemies.grid.query(f.x, f.y, r, this.onFire);
    }
    this.fireGate.prune(this.clock, 2);
  }

  private add(x: number, y: number, ang: number, dist: number, delay: number) {
    const sp = 230;
    const w = this.spare.pop() ?? ({} as Wave);
    w.x = x; w.y = y; w.vx = Math.cos(ang) * sp; w.vy = Math.sin(ang) * sp;
    w.t = 0; w.life = dist / sp; w.delay = delay; w.r = 30 * this.sizeMul; w.img = null; w.fireT = 0;
    w.fr = (Math.random() * 3) | 0;
    this.waves.push(w);
  }

  /** волны из-за спины мага по направлению движения; spreadK — разброс поперёк */
  private fromBehind(n: number, gap: number) {
    const P = W.player, fa = faceAngle(), D = viewHalfDiag();
    const ux = Math.cos(fa), uy = Math.sin(fa), px = -uy, py = ux;
    for (let i = 0; i < n; i++) {
      const o = (Math.random() * 2 - 1) * 70;
      this.add(P.x - ux * 60 + px * o, P.y - uy * 60 + py * o, fa, D + 120, i * gap);
    }
  }

  private cast() {
    const P = W.player, n = this.count, D = viewHalfDiag();

    if (this.hasCombo(61)) {
      // Глейсиум: во все стороны от мага
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; this.add(P.x, P.y, a, D + 40, 0); }
      return;
    }
    if (this.hasCombo(48)) { this.fromBehind(n, 0.12); return; }
    if (this.hasProp(435)) {
      // Песнь сирены: рядом с магом по направлению движения (Потоп — ещё 2 по бокам)
      this.fromBehind(n, 0.12);
      if (this.hasCombo(23)) {
        const fa = faceAngle();
        for (const s of [-1, 1]) {
          const a = fa + s * Math.PI / 2;
          this.add(P.x, P.y, a, D + 40, 0.1);
        }
      }
      return;
    }
    if (this.hasProp(434)) {
      // Полюс: с четырёх сторон к магу
      for (let i = 0; i < n; i++) {
        const side = i % 4, a = (side * Math.PI) / 2 + Math.PI / 4;   // откуда
        const o = (Math.random() * 2 - 1) * D * 0.5;
        const sx = P.x + Math.cos(a) * D - Math.sin(a) * o, sy = P.y + Math.sin(a) * D + Math.cos(a) * o;
        this.add(sx, sy, a + Math.PI, D * 2, Math.floor(i / 4) * 0.25);
      }
      return;
    }
    // обычные: из угла экрана в противоположный угол (угол диагонали — по пропорциям экрана,
    // чуть ближе к 45°, с небольшим разбросом между вызовами); волны одна за другой со смещением поперёк
    const a = this.cornerAngle();
    const ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
    const spread = D * (this.lava ? 0.95 : 0.6);
    for (let i = 0; i < n; i++) {
      const o = (Math.random() * 2 - 1) * spread;
      this.add(P.x - ux * (D + 40) + px * o, P.y - uy * (D + 40) + py * o, a, D * 2 + 80, i * 0.12);
    }
  }

  /** Направление «угол → противоположный угол»: никогда не строго вертикально/горизонтально */
  private cornerAngle(): number {
    const v = W.scene.cameras.main.worldView;
    let d = Math.atan2(v.height, v.width);              // левый верх → правый низ
    d = d * 0.75 + (Math.PI / 4) * 0.25 + (Math.random() - 0.5) * 0.16;
    d = Math.min(Math.PI / 2 - 0.35, Math.max(0.35, d)); // не круче ~70° и не положе ~20°
    switch ((Math.random() * 4) | 0) {
      case 0: return d;                 // из левого верхнего
      case 1: return Math.PI - d;       // из правого верхнего
      case 2: return Math.PI + d;       // из правого нижнего
      default: return -d;               // из левого нижнего
    }
  }
}

export const TSUNAMI = defFromData(SPELL_BY_ID[9], (def) => new Tsunami(def, SPELL_BY_ID[9]));
