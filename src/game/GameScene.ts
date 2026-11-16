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
import { showEnhance, showShop, showZoneClear, type ShopItem } from '../ui/zone';
import { Zone, ZONE } from './Zone';
import { ARTIFACTS, RARITY } from './Artifacts';
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
  /** Окна хода зоны, ждущие своей очереди (после выбора уровня/сундука) */
  private zoneQ: ('obelisk' | 'shop' | 'clear')[] = [];
  private shopItems: ShopItem[] = [];
  private obeliskRerolled = false;
  private stageTint = -1;

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
    W.zone = new Zone();
    this.zoneQ = []; this.stageTint = -1;
    W.zone.onBossKilled = (idx) => {
      if (idx >= ZONE.bossAt.length - 1) { this.zoneQ.push('clear'); return; }
      this.obeliskRerolled = false;
      W.pickups.spot('obelisk');
      toast('<b>Босс повержен!</b><br>Рядом появился обелиск', 2600);
    };
    W.zone.onMerchant = () => { this.shopItems = this.rollShop(); W.pickups.spot('merchant'); toast('<b>Пришёл торговец</b><br>Товары за ману', 2400); };
    W.zone.onMerchantGone = () => W.pickups.removeSpot('merchant');
    W.pickups.onSpot = (k) => { if (k === 'obelisk') this.zoneQ.push('obelisk'); else if (!this.zoneQ.includes('shop')) this.zoneQ.push('shop'); };
    this.pendingChests = 0;
    W.pickups.onChest = () => { this.pendingChests++; };
    W.pickups.onRune = (r) => toast(`<b style="color:#${RUNES[r].tint.toString(16).padStart(6, '0')}">${RUNES[r].name}</b><br>${RUNES[r].text}`, 2000);
    W.artifacts.onSynergy = (syn) => toast(`Синергия активирована!<br><b>${syn.emoji} ${syn.name}</b><br>${syn.text.join('<br>')}`, 3200);
    // стартовые сферы рядом, чтобы быстро взять первые уровни
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 130;
      W.orbs.drop(Math.cos(a) * d, Math.sin(a) * d, 's', 1);
    }
    this.cameras.main.startFollow(W.player.follow, false, 1, 1);
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
      if (c.kind === 'enhance') { showEnhance((id) => { this.enhance(id); this.afterChoice(); }); return; }
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

  /** 8 артефактов торговца, цена по редкости, на одном скидка 25% */
  private rollShop(): ShopItem[] {
    // мана-валюта как в оригинале (+1 со сферы, +5 с большой) — к 5:25 обычно 200–300; цены — оценка
    const base: Record<string, number> = { common: 150, rare: 230, epic: 330 };
    const pool = ARTIFACTS.filter((a) => a.rarity !== 'legend' && !W.artifacts.has(a.id));
    const out: ShopItem[] = [];
    while (out.length < 8 && pool.length) {
      const total = pool.reduce((t, a) => t + RARITY[a.rarity].weight, 0);
      let r = Math.random() * total;
      const a = pool.find((x) => (r -= RARITY[x.rarity].weight) <= 0) ?? pool[pool.length - 1];
      pool.splice(pool.indexOf(a), 1);
      out.push({ a, price: Math.round(base[a.rarity] * (0.9 + Math.random() * 0.2) / 10) * 10, discount: false, sold: false });
    }
    const d = out[(Math.random() * out.length) | 0];
    if (d) { d.discount = true; d.price = Math.round(d.price * 0.75 / 10) * 10; }
    return out;
  }

  /** Усиление заклинания: урон +50%, перезарядка −5% (можно несколько раз) */
  private enhance(id: string) {
    const s = W.stats;
    s.addSpellDmg(id, 0.5);
    s.spellCdr[id] = 1 - (1 - (s.spellCdr[id] ?? 0)) * 0.95;
    s.enhanced[id] = (s.enhanced[id] ?? 0) + 1;
    W.book.spells.get(id)?.onChange();
  }

  private openZone() {
    const k = this.zoneQ.shift()!;
    const close = () => { this.inModal = false; this.paused = false; };
    this.inModal = true; this.paused = true; this.joy?.release();
    if (k === 'obelisk') {
      const open = () => {
        const choices = W.artifacts.rollLegend(3);
        if (!choices.length) { W.pickups.removeSpot('obelisk'); close(); return; }
        showChest(choices, (a) => {
          W.artifacts.add(a.id);
          W.pickups.removeSpot('obelisk');
          W.orbs.magnetAll(); // после алтаря все кристаллы притягиваются
          close();
        }, { title: 'Обелиск', cls: 'obelisk', onReroll: this.obeliskRerolled ? undefined : () => { this.obeliskRerolled = true; open(); } });
      };
      open();
    } else if (k === 'shop') {
      showShop(this.shopItems, (it) => { W.mana -= it.price; W.artifacts.add(it.a.id); }, close);
    } else {
      document.body.classList.remove('fury');
      showZoneClear(() => this.startRun(), () => { this.cleanupRun(); this.cameras.main.centerOn(0, 0); showMenu(() => this.startRun()); });
    }
  }

  private openChest() {
    this.pendingChests--;
    this.inModal = true; this.paused = true; this.joy?.release();
    const choices = W.artifacts.roll(3);
    if (!choices.length) { W.orbs.drop(W.player.x, W.player.y, 'l'); this.inModal = false; this.paused = false; return; }
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
    if (!W.zone.timeFrozen) W.time += dt;
    W.zone.update();

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
    document.body.classList.toggle('fury', W.pickups.active.has('fury') || W.zone.bossFight);
    // пол меняет цвет по ходу зоны: трава → красная → тёмная
    const st = Math.min(W.zone.stage, 2);
    if (st !== this.stageTint) { this.stageTint = st; if (st === 0) this.ground.clearTint(); else this.ground.setTint(st === 1 ? 0xe0a08c : 0x8c8f99); }

    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      const P = W.player;
      this.hud!.set(P.xp / P.xpNeed, W.time, W.mana);
      const b = W.zone.boss;
      this.hud!.boss(b && b.alive ? b.hp / b.maxHp : null);
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
    else if (this.zoneQ.length && !this.inModal) this.openZone();
  }
}
