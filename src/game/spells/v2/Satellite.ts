import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import type { Enemy } from '../../Enemies';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { SkyFx, freezeCrust } from './_skyfx';

interface Sat { img: Phaser.GameObjects.Image; hits: Map<number, number>; ring: number; frost: boolean; x: number; y: number }

/** базовая скорость вращения, рад/с — по видео оригинала ≈ 1 оборот за 6 с (~58°/с) */
const SPIN = 1.05;
/** базовый радиус сферы */
const ORB_R = 8;

/**
 * #4 Спутник → «Кольцо сфер» (референс — старый OrbRing). Сферы вращаются вокруг мага и бьют касанием
 * (интервал по одному врагу 0.5 с, отбрасывание).
 * Свойства: 389 Антигравитация (скорость циклично до ×3), 390 Блуждающие огоньки (два кольца навстречу; моды ×2 штук),
 * 391 Термоядерная реакция (одно «солнце»: урон ×N и размер растут за каждый спутник, тик 0.3 с).
 * Слияния (основа): 32 Гиперион, 45 Генерация магнитного поля, 62 Соул Блейд.
 */
class Satellite extends DataSpell {
  private sats: Sat[] = [];
  private fx = new SkyFx();
  private angle = 0;
  private t = 0;
  private key0 = '';
  // параметры текущей сферы для колбэка попадания (без замыканий в кадре)
  private cur: Sat | null = null;
  private curDmg = 0;
  private curInt = 0.5;

  get merged() { return this.hasProp(391); }

  onChange() { super.onChange(); this.rebuild(); }

  /** Пересобрать спутники под текущее число/форму */
  private rebuild() {
    const merged = this.merged;
    const n = merged ? (this.hasCombo(32) ? 2 : 1) : this.count;
    const tex = merged ? 'fx_satellite_sun' : this.hasCombo(62) ? 'blade' : 'fx_satellite_orb';
    const key = n + tex + (this.hasProp(390) ? 'w' : '');
    if (key === this.key0 && this.sats.length === n) return;
    this.key0 = key;
    while (this.sats.length < n) {
      this.sats.push({ img: W.scene.add.image(0, 0, tex).setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD), hits: new Map(), ring: 0, frost: false, x: 0, y: 0 });
    }
    while (this.sats.length > n) this.sats.pop()!.img.destroy();
    this.sats.forEach((s, i) => {
      s.img.setTexture(tex);
      s.ring = this.hasProp(390) && !merged ? i % 2 : 0;
      s.frost = merged && i === 1; // 32 Гиперион: второе солнце напротив — морозит при первом попадании
      if (s.frost) s.img.setTint(0x9fd8ff); else s.img.clearTint();
      s.hits.clear();
    });
  }

  destroy() { this.sats.forEach((s) => s.img.destroy()); this.sats = []; this.fx.destroy(); this.key0 = ''; }

  update(dt: number) {
    this.fx.update(dt);
    const merged = this.merged;
    // число спутников могло измениться от общих статов (артефакты) — без onChange
    if (!merged && this.sats.length !== this.count) this.rebuild();
    if (!this.sats.length) this.rebuild();
    this.t += dt;
    const P = W.player, crit = W.stats.crit;

    let speed = SPIN * this.speedMul;
    if (this.hasCombo(45)) speed *= 2;                                                  // 45: бонус Антигравитации фиксирован ×2
    else if (this.hasProp(389)) speed *= 1 + 2 * (0.5 - 0.5 * Math.cos((this.t / 6) * Math.PI * 2)); // 1 → 3 → 1 за 6 с
    const blade = this.hasCombo(62);
    if (blade) speed *= 1.5 * (1 + crit);                                               // 62 Соул Блейд: быстрее, растёт от шанса крита
    this.angle += speed * dt;

    const n = this.count;
    const ownSize = this.sizeMul;
    let r: number, dmg = this.dmg;
    if (merged) {
      // Термоядерная реакция: размер и урон растут за каждый спутник (мод «+1 размер» уже в ownSize → берём половину)
      const sz = (ownSize / 2) * (1 + 0.5 * n);
      r = ORB_R * sz;
      dmg *= n;
      if (this.hasCombo(32)) dmg *= ownSize / 2;                                        // 32 Гиперион: урон пропорционален размеру
    } else r = ORB_R * ownSize;
    if (blade) dmg *= 1 + crit;
    this.curInt = merged ? 0.3 : 0.5;

    let per0 = 0;
    for (const s of this.sats) if (s.ring === 0) per0++;
    const per1 = this.sats.length - per0;
    let i0 = 0, i1 = 0;
    const sq = Math.sqrt(W.stats.sizeMul);
    for (const s of this.sats) {
      let R: number, a: number;
      if (merged) { R = (52 + r * 0.6) * sq; a = this.angle + (s.frost ? Math.PI : 0); }
      else if (s.ring === 0) {
        R = (this.hasProp(390) ? 38 : 52) * sq;
        a = this.angle + (i0++ * Math.PI * 2) / per0;
      } else {
        R = 74 * sq;
        a = -this.angle + (i1++ * Math.PI * 2) / per1;
      }
      s.x = P.x + Math.cos(a) * R; s.y = P.y + Math.sin(a) * R;
      if (blade) s.img.setPosition(s.x, s.y).setDisplaySize(r * 4.5, r * 1.1).setRotation(a + Math.PI / 2).setTint(this.tint);
      else s.img.setPosition(s.x, s.y).setDisplaySize(r * 2.8, r * 2.8).setRotation(this.t * (merged ? 0.8 : 2));

      this.cur = s;
      this.curDmg = s.frost ? dmg * 0.8 : dmg;
      W.enemies.grid.query(s.x, s.y, r, this.onHit);
      if (s.hits.size > 300) s.hits.clear();
    }
    this.cur = null;
  }

  private onHit = (e: Enemy) => {
    const s = this.cur!;
    const last = s.hits.get(e.id);
    if (last !== undefined && this.t - last < this.curInt) return;
    s.hits.set(e.id, this.t);
    const P = W.player, dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1;
    W.enemies.damage(e, this.curDmg, (dx / d) * 70, (dy / d) * 70, this.def.id);
    if (s.frost && last === undefined) freezeCrust(this.fx, e, 1);
  };
}

export const SATELLITE = defFromData(SPELL_BY_ID[4], (def) => new Satellite(def, SPELL_BY_ID[4]));
