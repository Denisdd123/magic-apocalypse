import Phaser from 'phaser';
import { DEPTH } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { Co, OrigBullets, PX, U, type OBullet } from './_orig';

const DEG = Math.PI / 180;
/** ASpeed — пауза между лучами одного каста */
const ASPEED = 0.2;
/** кружок у мага: (0.35, 0, 0) вдоль выстрела */
const RING_OFF = 0.35;
const prio = (uid: number) => (uid >= 41 && uid <= 46 ? 0.5 : 1);

// ——— заглушки по меркам спрайтов (рисуем с Денисом позже) ———
const T = { beam: 'ry_beam', beam0: 'ry_beam0', dot: 'ry_dot' };
/** Incinerate13_03 950×30 (рисуем 190×6 = ÷5); 36_03 908×56 (рисуем 182×12); кружок 13_01 56×55 (рисуем 28) */
const K_BEAM = 5, K_DOT = 2;
function textures() {
  const tx = W.scene.textures;
  const make = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    if (tx.exists(key)) return;
    const g = W.scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g); g.generateTexture(key, w, h); g.destroy();
  };
  // луч: ось x — от начала (левый край) вперёд, белая сердцевина в мягкой кромке
  make(T.beam, 190, 6, (g) => { g.fillStyle(0xffffff, 0.35); g.fillRect(0, 0, 190, 6); g.fillStyle(0xffffff, 1); g.fillRect(0, 2, 190, 2); });
  make(T.beam0, 182, 12, (g) => { g.fillStyle(0xffffff, 0.3); g.fillRect(0, 0, 182, 12); g.fillStyle(0xffffff, 1); g.fillRect(0, 4, 182, 4); });
  make(T.dot, 28, 28, (g) => { g.fillStyle(0xffffff, 0.35); g.fillCircle(14, 14, 13); g.fillStyle(0xffffff, 1); g.fillCircle(14, 14, 7); });
}

type Mode = 'a' | 'mirror' | 'hyper' | 'em' | 'c4' | 'c16' | 'c30' | 'c38' | 'c58';

/**
 * #18 Таинственный луч — 1:1 по коду оригинала (docs/orig/spells/ray.md, карточка tasks/ray.md):
 * Play_ArcaneRay: wait(PSpeed); цикл: цель — 1-й, 2-й… ближайший ((|dx|+|dy|)·приоритет, БЕЗ проверки дальности; врагов нет — wait 0.1),
 * лучи по одному через ASpeed 0.2 с, затем wait(PSpeed 3.5 с).
 * Луч (ID 4): дочерний объект у мага (едет с ним), не летит; коллайдер 9.8 × 0.1 со scale (1, Size·0.7) — 557 px от кружка
 * на 20 px от мага; живёт Time 0.8 с, затем 4 тика затухания без коллайдера; каждый враг на линии — раз за луч.
 * Цвет (0.85+0.015n, 0.3+0.03n, 1) по шагам 0.06 с, первые 0.06 с — спрайт 36_03.
 * Свойства: 515 Отражение (на каждый луч — второй под 180°, жёлтые), 516 Разрушительный луч (ОДИН луч, группа вращается +2° за тик против часовой),
 * 517 Электромагнитное излучение (Random(1, Num) лучей в случайные стороны, мерцание 0.125 с, повторный урон раз в 0.5 с, коллайдер 10.5 × 0.25).
 * Слияния (числа карточки; полностью — партия 6): 4, 16, 30, 38, 58.
 */
class Ray extends DataSpell {
  private co: Co | null = null;
  private beams = new OrigBullets();
  private dots: Phaser.GameObjects.Image[] = [];
  /** 516 / C16: поворот группы Transform_ObjArcaneRayMid (рад, экран) */
  private rot = 0;
  private rotAcc = 0;

  private get size(): number { return Math.round(100 + this.pctOf('size') + W.stats.size * 100) / 100 * 0.5; }
  private get pSpeed(): number { return Math.max(0.05, this.cdOrig(this.data.base.cd ?? 3.5) * this.cdGlobal); }
  /** ASpeed × (100 + interval%) — 515 даёт −50 % из данных */
  private get aSpeed(): number { return ASPEED * Math.max(0.05, 1 + this.pctOf('interval') / 100); }

  onChange() {
    super.onChange();
    textures();
    if (!this.co) this.co = new Co(this.loop());
  }

  destroy() {
    this.beams.destroy();
    for (const d of this.dots) d.destroy();
    this.dots = []; this.co = null;
  }

  update(dt: number) {
    if (!this.co) this.onChange();
    this.co!.update(dt);
    // Play_ArcaneRayMid_Rotation: +2° за 0.03 с против часовой (на экране угол уменьшается)
    if (this.hasProp(516) || this.hasCombo(16)) {
      this.rotAcc += dt;
      while (this.rotAcc >= 0.03) { this.rotAcc -= 0.03; this.rot -= 2 * DEG; }
    }
    this.beams.update(dt);
  }

  // ———— корутины ————
  private *loop(): Generator<number, void, unknown> {
    if (this.hasCombo(38)) yield this.pSpeed + 0.1; else yield this.pSpeed;
    for (;;) {
      const n = this.count;
      if (this.hasProp(517) || this.hasCombo(4)) {
        // Play_ArcaneRay_Electromagnetic: Random(1, Num+1) лучей в случайные стороны
        const k = 1 + Math.floor(Math.random() * n);
        for (let i = 0; i < k; i++) { this.ray(this.hasCombo(4) ? 'c4' : 'em', Math.random() * Math.PI * 2); yield this.aSpeed; }
        yield this.pSpeed;
        continue;
      }
      if (this.hasCombo(30)) { for (let i = 0; i < 5; i++) { this.ray('c30', Math.random() * Math.PI * 2); yield this.aSpeed; } yield this.pSpeed; continue; }
      if (this.hasCombo(38)) { for (let i = 0; i < n; i++) this.ray('c38', Math.random() * Math.PI * 2); yield this.pSpeed + 0.1; continue; }
      if (this.hasCombo(58)) { this.ray('c58', Math.random() * Math.PI * 2); yield 0.2; continue; }
      if (this.hasCombo(16)) {
        // постоянные лучи по кругу: 7/6/5/4 по PSpeed
        const ps = this.pSpeed, m = ps <= 1 ? 7 : ps <= 2 ? 6 : ps <= 3 ? 5 : 4;
        for (let i = 0; i < m; i++) this.ray('c16', (i / m) * Math.PI * 2 - this.rot);
        yield this.durSec + 4 * 0.03;
        continue;
      }
      const P = W.player;
      const list = W.enemies.list.filter((e) => e.alive)
        .map((e) => ({ e, d: ((Math.abs(e.x - P.x) + Math.abs(e.y - P.y)) / U) * prio(e.type.uid) }))
        .sort((a, b) => a.d - b.d);
      if (!list.length) { yield 0.1; continue; }
      const hyper = this.hasProp(516);
      const m = hyper ? 1 : n;
      for (let i = 0; i < m; i++) {
        const e = list[i % list.length].e;
        const a = Math.atan2(e.y - W.player.y, e.x - W.player.x);
        if (hyper) this.ray('hyper', a - this.rot);
        else if (this.hasProp(515)) { this.ray('mirror', a); this.ray('mirror', a + Math.PI); }
        else this.ray('a', a);
        yield this.aSpeed;
      }
      yield this.pSpeed;
    }
  }

  /** Bullet_Create 4 / 51 / 67 / 40 / 23 / 10016 / 90 / 94 / 111 */
  private ray(mode: Mode, ang: number) {
    const S = this.size;
    let len = 9.8, thick = 0.1, sy = S * 0.7, life = this.durSec;
    switch (mode) {
      case 'em': case 'c4': len = 10.5; thick = 0.25; sy = S * 0.5 + 0.35; break;
      case 'c16': len = 10.5; thick = 0.3; break;
      case 'c30': len = 10.5; thick = 0.08; break;
      case 'c38': len = 10.5; thick = 1.2; sy = 0.75; life = Math.max(0.3, life); break;
      case 'c58': len = 10.5; thick = 2; sy = 0.5; break;
    }
    const rotating = mode === 'hyper' || mode === 'c16';
    const dot = this.dots.find((d) => !d.visible) ?? (() => { const d = W.scene.add.image(0, 0, T.dot); this.dots.push(d); return d; })();
    const dotSc = ((S - 0.5) * 0.8 + 0.5) * 0.7;
    dot.setVisible(true).setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD).setScale((56 * PX * dotSc) / 28).setAlpha(1);
    const hl = (len / 2) * U, hw = (thick * sy / 2) * U;
    this.beams.fire({
      x: W.player.x + Math.cos(ang) * RING_OFF * U, y: W.player.y + Math.sin(ang) * RING_OFF * U, ang: rotating ? ang + this.rot : ang, sp: 0, life: life + 4 * 0.03,
      tex: T.beam0, scaleX: 908 / 182, scaleY: (56 / 12) * sy,
      hl, hw, cx: hl, pierce: 1e9, dmg: this.dmg, src: this.def.id,
      data: { base: ang, n: 0, acc: 0, cyc: 0, dot, life, sy, flick: 0 },
      step: (b) => this.beamStep(b, mode, rotating),
      onEnd: (b) => b.data.dot.setVisible(false),
    });
  }

  /** ArcaneRayA/B_Animation: шаги 0.06 с (цвет, смена спрайтов), мерцание 517, затухание */
  private beamStep(b: OBullet, mode: Mode, rotating: boolean) {
    const d = b.data, P = W.player;
    if (rotating) b.ang = d.base + this.rot;
    const c = Math.cos(b.ang), s = Math.sin(b.ang);
    // луч начинается у кружка (0.35 ед. от мага): изображение с началом в левом крае
    const ox = P.x + c * RING_OFF * U, oy = P.y + s * RING_OFF * U;
    b.img.setOrigin(0, 0.5);
    d.dot.setPosition(ox, oy);
    const em = mode === 'em' || mode === 'c4';
    while (d.acc + 0.06 <= b.t) {
      d.acc += 0.06; d.n++;
      if (!em) {
        b.img.setTexture(T.beam).setScale(PX * (950 / 190), PX * (30 / 6) * d.sy);
        const n = d.n;
        let tint: number[];
        if (mode === 'mirror') tint = [0.9, 0.804, 0.2 + 0.02 * n];
        else if (mode === 'hyper') tint = [1, 0.02 * n, 0];
        else if (mode === 'c16') tint = [0, 1, 0.4];
        else tint = [0.85 + 0.015 * n, 0.3 + 0.03 * n, 1];
        const k = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
        const col = (k(tint[0]) << 16) | (k(tint[1]) << 8) | k(tint[2]);
        b.img.setTint(col); d.dot.setTint(col).setScale(d.dot.scaleX * (n % 2 ? 0.92 : 1 / 0.92));
      }
    }
    if (em) {
      // цикл 0.125 с: 0.095 видно, 0.03 пусто; каждые 4 цикла (0.5 с) — повторный урон
      b.img.setTexture(T.beam).setScale(PX * (950 / 190), PX * (30 / 6) * d.sy).setTint(mode === 'c4' ? 0x59d9ff : 0xc0a0ff);
      const cyc = Math.floor(b.t / 0.125);
      b.img.setVisible(b.t % 0.125 < 0.095);
      if (cyc !== d.cyc) { d.cyc = cyc; if (cyc % 4 === 0) b.hits.clear(); }
    }
    if (mode === 'c16') { const k = Math.floor(b.t / 0.25); if (k !== d.flick) { d.flick = k; b.hits.clear(); } }
    // затухание: коллайдер OFF, 4 шага alpha 1 − 0.2·i
    if (b.t >= d.life) {
      b.hl = 0;
      const i = Math.floor((b.t - d.life) / 0.03) + 1;
      b.img.setAlpha(Math.max(0, 1 - 0.2 * i)); d.dot.setAlpha(Math.max(0, 1 - 0.2 * i));
    }
    // корень объекта — у кружка; коллайдер сдвинут на половину длины вперёд
    b.x = ox; b.y = oy;
  }
}

export const RAY = defFromData(SPELL_BY_ID[18], (def) => new Ray(def, SPELL_BY_ID[18]));
