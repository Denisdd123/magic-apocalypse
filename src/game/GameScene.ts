import Phaser from 'phaser';
import { DEPTH, VIEW_W } from '../config';
import { makeTextures } from '../textures';
import { Stats } from './Stats';
import { Player } from './Player';
import { Enemies } from './Enemies';
import { Orbs } from './Orbs';
import { Projectiles } from './Projectiles';
import { Effects } from './Effects';
import { SpellBook, SPELLS } from './SpellBook';
import { STAR_NEEDLE } from './spells/StarNeedle';
import { W } from './World';
import { Hud, Joystick, clearModals, initUi, showAttrPick, showLevelUp, showMenu } from '../ui/ui';
import { showDeath, showPause } from '../ui/screens';
import { showChest, toast } from '../ui/chest';
import { ArtifactSet } from './Artifacts';
import { Pickups, RUNES } from './Pickups';

export class GameScene extends Phaser.Scene {
  private ground!: Phaser.GameObjects.TileSprite;
  private hud: Hud | null = null;
  private joy: Joystick | null = null;
  private paused = true;
  private inModal = false;
  private hudT = 0;
  private running = false;
  private pendingChests = 0;

  constructor() { super('game'); }

  create() {
    makeTextures(this);
    initUi(this.textures);
    this.ground = this.add.tileSprite(0, 0, 10, 10, 'ground').setOrigin(0, 0).setDepth(DEPTH.ground);
    this.scale.on('resize', this.fitCamera, this);
    this.fitCamera();
    showMenu(() => this.startRun());
  }

  /** Камера: по ширине всегда видно VIEW_W игровых единиц */
  private fitCamera() {
    const cam = this.cameras.main;
    cam.setZoom(this.scale.width / VIEW_W);
  }

  private startRun() {
    this.cleanupRun();
    W.scene = this;
    W.time = 0; W.kills = 0; W.mana = 0; W.dmgBy = new Map();
    W.stats = new Stats();
    W.fx = new Effects(this);
    W.orbs = new Orbs(this);
    W.projectiles = new Projectiles(this);
    W.enemies = new Enemies(this);
    W.player = new Player(this);
    W.book = new SpellBook();
    W.book.add(STAR_NEEDLE);
    W.artifacts = new ArtifactSet();
    W.pickups = new Pickups(this);
    this.pendingChests = 0;
    W.pickups.onChest = () => { this.pendingChests++; };
    W.pickups.onRune = (r) => toast(`<b style="color:#${RUNES[r].tint.toString(16).padStart(6, '0')}">${RUNES[r].name}</b><br>${RUNES[r].text}`, 2000);
    W.artifacts.onSynergy = (syn) => toast(`Синергия активирована!<br><b>${syn.emoji} ${syn.name}</b><br>${syn.text.join('<br>')}`, 3200);
    // стартовые сферы рядом, чтобы быстро взять первые уровни
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 130;
      W.orbs.drop(Math.cos(a) * d, Math.sin(a) * d, 's', 1);
    }
    this.cameras.main.startFollow(W.player.img, true, 1, 1);
    this.hud = new Hud(() => this.openPause());
    this.joy = new Joystick(document.getElementById('game')!);
    this.paused = false; this.inModal = false; this.running = true;
    if (import.meta.env.DEV) { (window as any).W = W; (window as any).SPELLS = SPELLS; } // для отладки
  }

  /** Полная очистка объектов прошлого забега (каждый забег — с нуля) */
  private cleanupRun() {
    if (!this.running) return;
    this.running = false;
    W.book?.destroy();
    this.hud?.destroy(); this.hud = null;
    this.joy?.destroy(); this.joy = null;
    clearModals();
    this.cameras.main.stopFollow();
    this.children.list.slice().forEach((o) => { if (o !== this.ground) o.destroy(); });
  }

  private openPause() {
    if (this.inModal || !this.running) return;
    this.inModal = true; this.paused = true; this.joy?.release();
    showPause(() => { this.inModal = false; this.paused = false; }, () => this.die());
  }

  private openLevelUp() {
    const P = W.player;
    this.inModal = true; this.paused = true; this.joy?.release();
    const choices = W.book.buildChoices(3);
    showLevelUp(P.level - P.pendingLevels + 1, choices, W.book.refundPct(), (c) => {
      const attr = W.book.apply(c);
      if (attr && attr.options.length) {
        showAttrPick(attr.spell, attr.options, (a) => { W.book.chooseAttr(attr.spell, a); this.afterChoice(); });
      } else this.afterChoice();
    }, () => { W.book.refund(); this.afterChoice(); });
  }

  private afterChoice() {
    W.player.pendingLevels--;
    if (W.player.pendingLevels > 0) this.openLevelUp();
    else { this.inModal = false; this.paused = false; }
  }

  private openChest() {
    this.pendingChests--;
    this.inModal = true; this.paused = true; this.joy?.release();
    const choices = W.artifacts.roll(3);
    if (!choices.length) { W.orbs.drop(W.player.x, W.player.y, 'l', 30); this.inModal = false; this.paused = false; return; }
    showChest(choices, (a) => {
      W.artifacts.add(a.id);
      this.inModal = false; this.paused = false;
    });
  }

  /** Воскрешение (артефакты/синергии): полное здоровье, очищение экрана и неуязвимость */
  private tryRevive() {
    const s = W.stats, P = W.player;
    if (s.revives <= 0) return false;
    s.revives--;
    P.dead = false; P.hp = s.maxHp; P.invulnT = 3;
    W.pickups.activate('cleanse');
    toast('<b>Воскрешение!</b>', 1800);
    return true;
  }

  private die() {
    this.paused = true; this.inModal = true;
    this.joy?.release();
    showDeath(() => this.startRun(), () => { this.cleanupRun(); this.cameras.main.centerOn(0, 0); showMenu(() => this.startRun()); });
  }

  update(_t: number, deltaMs: number) {
    const cam = this.cameras.main;
    const v = cam.worldView;
    // земля всегда под камерой
    this.ground.setPosition(v.x - 2, v.y - 2).setSize(v.width + 4, v.height + 4);
    this.ground.tilePositionX = v.x; this.ground.tilePositionY = v.y;

    if (!this.running || this.paused) return;
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    W.time += dt;

    const mv = this.joy!.vector;
    W.player.move(mv.x, mv.y, dt);
    W.player.update(dt);
    W.enemies.updateSpawner(dt);
    W.enemies.update(dt);
    W.book.update(dt);
    W.projectiles.update(dt);
    W.orbs.update(dt);
    W.pickups.update(dt);
    W.artifacts.update(dt);
    W.fx.update(dt);
    document.body.classList.toggle('fury', W.pickups.active.has('fury'));

    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      const P = W.player;
      this.hud!.set(P.xp / P.xpNeed, W.time, W.mana);
      const ph = W.book.spells.get('phase') as any;
      if (ph) this.hud!.cd('phase', 'ico_phase', ph.active > 0 ? 1 : ph.cdLeft / 45);
      for (const r of Object.keys(RUNES) as (keyof typeof RUNES)[]) {
        const left = W.pickups.active.get(r);
        if (left !== undefined) this.hud!.cd('rune_' + r, 'rune', 1 - left / (RUNES[r].dur * (1 + W.stats.runeDur)), RUNES[r].tint);
        else this.hud!.clearCd('rune_' + r);
      }
    }

    if (W.player.dead && !this.tryRevive()) { document.body.classList.remove('fury'); this.die(); return; }
    if (W.player.pendingLevels > 0 && !this.inModal) this.openLevelUp();
    else if (this.pendingChests > 0 && !this.inModal) this.openChest();
  }
}
