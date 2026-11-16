import Phaser from 'phaser';
import { DEPTH, VIEW_W } from '../../../config';
import { SPELL_BY_ID } from '../../../data/spells_data';
import { W } from '../../World';
import { DataSpell, defFromData } from '../DataSpell';
import { effCd } from './_utilGuard';

/**
 * #14 Армагеддон → «Судный час». Раз в cdSec (100 с, ур.2–4 −10%): чёрное солнце — вспышка на весь экран,
 * все видимые враги умирают (без маны за убийство; элитки по-прежнему роняют своё), боссы получают 15% макс. HP.
 * Задержку спавна 1 с оригинала не делаем (спавн — общий код).
 * Свойства: 479 Апокалипсис (HP всех врагов −40%, за 20 с сокращение плавно уходит в 0),
 * 480 Вознесение (каждый 4-й Армагеддон — полное лечение; реген +0.1%/с — применяем сами, в данных
 *   этот мод ошибочно записан как cd +0.1%), 481 Пророчество (каждая крупица маны −1% оставшегося КД; КД −10% мод).
 * Слияний, где Армагеддон — основа, нет (в Эксидиуме он донор).
 * Для HUD: cdLeft, cdTotal.
 */
class Armageddon extends DataSpell {
  cdLeft = 0;
  private casts = 0;
  private apoT = 0;           // время с начала Апокалипсиса
  private regenApplied = false;
  private lastMana = 0;
  private flash: Phaser.GameObjects.Image | null = null;
  private dark: Phaser.GameObjects.Rectangle | null = null;
  private flashT = 0;

  get cdTotal() { return effCd(this.cdSec, this.def.id); }

  onChange() {
    super.onChange();
    if (this.cdLeft <= 0 && this.casts === 0) this.cdLeft = this.cdTotal;
    const rapture = this.hasProp(480);
    if (rapture !== this.regenApplied) { W.stats.regen += rapture ? 0.001 : -0.001; this.regenApplied = rapture; }
    this.lastMana = W.mana;
  }

  update(dt: number) {
    // Пророчество: каждая подобранная крупица маны срезает 1% оставшегося КД
    if (W.mana > this.lastMana && this.hasProp(481)) this.cdLeft *= Math.pow(0.99, W.mana - this.lastMana);
    this.lastMana = W.mana;

    this.cdLeft -= dt;
    if (this.cdLeft <= 0) { this.cdLeft = this.cdTotal; this.cast(); }

    if (this.apoT > 0) this.apocalypse(dt);
    if (this.flashT > 0) this.animFlash(dt);
  }

  private cast() {
    const E = W.enemies, P = W.player;
    this.casts++;
    for (const e of E.visible(20)) {
      if (e.type.id === 'boss') { E.damage(e, e.maxHp * 0.15, 0, 0, this.def.id); continue; }
      e.xp = 0; // «без маны»
      E.damage(e, e.hp * 2 + 1, 0, 0, this.def.id);
    }
    if (this.hasProp(479)) this.apoT = 0.0001;
    if (this.hasProp(480) && this.casts % 4 === 0) { P.heal(W.stats.maxHp); W.fx.burst(P.x, P.y, 40, 0x9cff7a, 0.5, 'ring'); }
    this.startFlash();
  }

  /** HP всех врагов ≤ (1 − 40%·(1 − t/20)) от максимума */
  private apocalypse(dt: number) {
    this.apoT += dt;
    if (this.apoT >= 20) { this.apoT = 0; return; }
    const cap = 1 - 0.4 * (1 - this.apoT / 20);
    for (const e of W.enemies.list) if (e.alive && e.hp > e.maxHp * cap) e.hp = e.maxHp * cap;
  }

  private startFlash() {
    const cam = W.scene.cameras.main, P = W.player;
    if (!this.dark) {
      this.dark = W.scene.add.rectangle(0, 0, 10, 10, 0x05030a).setDepth(DEPTH.top).setOrigin(0, 0);
      this.flash = W.scene.add.image(0, 0, 'fx_armageddon_flash').setDepth(DEPTH.top).setBlendMode(Phaser.BlendModes.ADD);
    }
    this.dark!.setVisible(true).setAlpha(0);
    this.flash!.setVisible(true).setPosition(P.x, P.y).setAlpha(0);
    this.flashT = 1.1;
    cam.shake(250, 0.006);
  }

  /** 0–0.25 с: экран темнеет; затем белая печать расходится от мага и гаснет */
  private animFlash(dt: number) {
    this.flashT -= dt;
    const t = 1.1 - this.flashT, P = W.player;
    const d = this.dark!, f = this.flash!;
    if (this.flashT <= 0) { d.setVisible(false); f.setVisible(false); return; }
    const v = W.scene.cameras.main.worldView; // затемнение в мировых координатах (не зависит от зума камеры)
    d.setPosition(v.x - 10, v.y - 10).setSize(v.width + 20, v.height + 20);
    d.setAlpha(t < 0.25 ? t / 0.25 * 0.6 : Math.max(0, 0.6 * (1 - (t - 0.25) / 0.5)));
    if (t >= 0.2) {
      const k = Math.min(1, (t - 0.2) / 0.5);
      const s = VIEW_W * (0.3 + 1.6 * k);
      f.setPosition(P.x, P.y).setDisplaySize(s, s).setAlpha(k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7 * 0.9 - (t > 0.8 ? (t - 0.8) / 0.3 * 0.1 : 0));
    }
  }

  destroy() {
    if (this.regenApplied) { W.stats.regen -= 0.001; this.regenApplied = false; }
    this.dark?.destroy(); this.flash?.destroy(); this.dark = this.flash = null;
  }
}

export const ARMAGEDDON = defFromData(SPELL_BY_ID[14], (def) => new Armageddon(def, SPELL_BY_ID[14]));
