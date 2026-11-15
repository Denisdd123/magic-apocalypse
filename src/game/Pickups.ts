import Phaser from 'phaser';
import { DEPTH } from '../config';
import { ENEMY_TYPES } from './Enemies';
import { W } from './World';

export type RuneType = 'invuln' | 'fury' | 'greed' | 'cleanse' | 'timestop' | 'curse';

export const RUNES: Record<RuneType, { name: string; tint: number; dur: number; weight: number; text: string }> = {
  invuln:   { name: 'Руна неуязвимости', tint: 0xffe066, dur: 8, weight: 2, text: 'Неуязвимость на 8 сек.' },
  fury:     { name: 'Руна ярости',       tint: 0xff4a4a, dur: 8, weight: 2, text: 'Атака +50%, скорость +25% на 8 сек.' },
  greed:    { name: 'Руна жадности',     tint: 0x46d6ff, dur: 5, weight: 2, text: 'Притягивает все сферы' },
  cleanse:  { name: 'Руна очищения',     tint: 0xffffff, dur: 0, weight: 1, text: 'Уничтожает врагов на экране' },
  timestop: { name: 'Руна времени',      tint: 0x9fe8b0, dur: 5, weight: 1.5, text: 'Враги замирают на 5 сек.' },
  curse:    { name: 'Проклятая руна',    tint: 0xff2d8a, dur: 0, weight: 1.2, text: 'Призывает элитных монстров. Последний оставит сундук' },
};

interface Item {
  kind: 'chest' | 'rune';
  rune?: RuneType;
  x: number; y: number; t: number;
  img: Phaser.GameObjects.Image;
  arrow?: Phaser.GameObjects.Image;
}

/** Сундуки и руны на карте + действующие эффекты рун */
export class Pickups {
  items: Item[] = [];
  active = new Map<RuneType, number>(); // руна -> оставшееся время
  cursedLeft = 0;
  private chestT = 45;
  private runeT = 25;
  onChest: (() => void) | null = null;
  onRune: ((r: RuneType) => void) | null = null;

  constructor(private scene: Phaser.Scene) {}

  get timeStop() { return (this.active.get('timestop') ?? 0) > 0; }

  private around(minR: number, maxR: number) {
    const a = Math.random() * Math.PI * 2, d = minR + Math.random() * (maxR - minR);
    return { x: W.player.x + Math.cos(a) * d, y: W.player.y + Math.sin(a) * d };
  }

  chest(x: number, y: number) {
    const img = this.scene.add.image(x, y, 'chest').setDepth(DEPTH.orb).setDisplaySize(26, 23);
    const arrow = this.scene.add.image(0, 0, 'arrow').setDepth(DEPTH.top).setDisplaySize(12, 12).setTint(0xffd36b).setVisible(false);
    this.items.push({ kind: 'chest', x, y, t: 0, img, arrow });
  }

  rune(type: RuneType, x: number, y: number) {
    const img = this.scene.add.image(x, y, 'rune').setDepth(DEPTH.orb).setDisplaySize(18, 18).setTint(RUNES[type].tint).setBlendMode(Phaser.BlendModes.ADD);
    this.items.push({ kind: 'rune', rune: type, x, y, t: 0, img });
  }

  private randomRune(): RuneType {
    const types = Object.keys(RUNES) as RuneType[];
    const total = types.reduce((s, t) => s + RUNES[t].weight, 0);
    let r = Math.random() * total;
    return types.find((t) => (r -= RUNES[t].weight) <= 0) ?? 'greed';
  }

  update(dt: number) {
    const P = W.player, s = W.stats;
    // появление
    this.chestT -= dt;
    if (this.chestT <= 0) {
      this.chestT = 70 / (1 + s.chestRate);
      const p = this.around(220, 320); this.chest(p.x, p.y);
    }
    this.runeT -= dt;
    if (this.runeT <= 0) {
      this.runeT = 32 + Math.random() * 18;
      const p = this.around(110, 240); this.rune(this.randomRune(), p.x, p.y);
    }

    // предметы на земле
    const view = this.scene.cameras.main.worldView;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.img.setPosition(it.x, it.y + Math.sin(it.t * 3) * 2);
      if (it.kind === 'rune') it.img.setAlpha(0.75 + 0.25 * Math.sin(it.t * 5));
      if (it.arrow) {
        // стрелка у края экрана, если сундук не виден
        const inView = view.contains(it.x, it.y);
        it.arrow.setVisible(!inView);
        if (!inView) {
          const m = 14;
          const ax = Phaser.Math.Clamp(it.x, view.x + m, view.right - m);
          const ay = Phaser.Math.Clamp(it.y, view.y + m + 30, view.bottom - m);
          it.arrow.setPosition(ax, ay).setRotation(Math.atan2(it.y - P.y, it.x - P.x));
        }
      }
      const pr = it.kind === 'chest' ? 16 : 14;
      if (Math.hypot(P.x - it.x, P.y - it.y) < pr + P.r) {
        it.img.destroy(); it.arrow?.destroy();
        this.items.splice(i, 1);
        if (it.kind === 'chest') this.onChest?.();
        else this.activate(it.rune!);
      }
    }

    // действующие руны
    for (const [r, t] of this.active) {
      const nt = t - dt;
      if (nt <= 0) { this.active.delete(r); this.end(r); } else this.active.set(r, nt);
    }
  }

  activate(r: RuneType) {
    const P = W.player, s = W.stats;
    const dur = RUNES[r].dur * (1 + s.runeDur);
    W.fx.burst(P.x, P.y, 60, RUNES[r].tint, 0.5, 'ring');
    switch (r) {
      case 'invuln': P.invulnT = Math.max(P.invulnT, dur); break;
      case 'fury': s.runeAmp = 0.5; s.runeSpeed = 0.25; break;
      case 'greed': s.runePickup = 2; W.orbs.magnetAll(); break;
      case 'timestop': for (const e of W.enemies.list) if (e.alive) e.stunT = Math.max(e.stunT, dur); break;
      case 'cleanse': {
        const v = this.scene.cameras.main.worldView;
        for (const e of W.enemies.list) {
          if (!e.alive || !v.contains(e.x, e.y)) continue;
          if (e.elite || e.type.id === 'big') W.enemies.damage(e, e.maxHp * 0.3);
          else W.enemies.kill(e);
        }
        W.fx.burst(P.x, P.y, 320, 0xffffff, 0.6);
        break;
      }
      case 'curse': {
        const n = 4;
        this.cursedLeft += n;
        const type = W.time > 240 ? ENEMY_TYPES.white : W.time > 100 ? ENEMY_TYPES.red : ENEMY_TYPES.basic;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2, d = 200;
          const e = W.enemies.spawn(type, P.x + Math.cos(a) * d, P.y + Math.sin(a) * d, true);
          if (e) e.cursed = true; else this.cursedLeft--;
        }
        break;
      }
    }
    if (dur > 0) this.active.set(r, dur);
    this.onRune?.(r);
  }

  private end(r: RuneType) {
    const s = W.stats;
    if (r === 'fury') { s.runeAmp = 0; s.runeSpeed = 0; }
    if (r === 'greed') s.runePickup = 0;
  }

  /** Убит проклятый элитный монстр: последний оставляет сундук */
  cursedKilled(x: number, y: number) {
    this.cursedLeft = Math.max(0, this.cursedLeft - 1);
    if (this.cursedLeft === 0) this.chest(x, y);
  }
}
