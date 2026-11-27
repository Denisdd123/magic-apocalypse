import Phaser from 'phaser';
import { DEPTH, VIEW_H, VIEW_W } from '../config';
import { makeTextures } from '../textures';
import { Ground, LOCATION_LOAD } from './Ground';
import { Stats } from './Stats';
import { Player, MAGE_LOAD } from './Player';
import { Enemies } from './Enemies';
import { Orbs, ORBS_LOAD } from './Orbs';
import { Projectiles } from './Projectiles';
import { Effects } from './Effects';
import { SpellBook, SPELLS } from './SpellBook';
import { ART } from '../data/art';
import { ICON_ORIG } from '../data/icons_orig';
import { BOLT_LOAD } from './spells/v2/Bolt';
import { MOB_LOAD } from './mobLook';
import { SPIRIT_LOAD } from './spells/v2/Spirit';
import { MCIRCLE_LOAD } from './spells/v2/Mcircle';
import { SHIELD_LOAD } from './spells/v2/Shield';
import { SATELLITE_LOAD } from './spells/v2/Satellite';
import { CLOAK_LOAD } from './spells/v2/Cloak';
import { INCINERATE_LOAD } from './spells/v2/Incinerate';
import { RAY_LOAD } from './spells/v2/Ray';
import { FLASH_LOAD } from './spells/v2/Flash';
import { EBOLT_LOAD } from './spells/v2/Ebolt';
import { ESHOCK_LOAD } from './spells/v2/Eshock';
import { THUNDER_LOAD } from './spells/v2/Thunder';
import { METEOR_LOAD } from './spells/v2/Meteor';
import { FROSTNOVA_LOAD } from './spells/v2/Frostnova';
import { BLIZZARD_LOAD } from './spells/v2/Blizzard';
import { LAVA_LOAD } from './spells/v2/Lava';
import { EZONE_LOAD } from './spells/v2/Ezone';
import { CYCLONE_LOAD } from './spells/v2/Cyclone';
import { TSUNAMI_LOAD } from './spells/v2/Tsunami';
import { ARMAGEDDON_LOAD } from './spells/v2/Armageddon';

/** картинки, без которых нельзя начинать бой */
const CRITICAL = /^v2\/(spell_fx|world|spell_icons|passives)\//;
import { W } from './World';
import { Hud, Joystick, clearModals, initUi, showAttrPick, showLevelUp, showMenu } from '../ui/ui';
import { showDeath, showPause } from '../ui/screens';
import { showChest, toast } from '../ui/chest';
import { showEnhance, showShop, showZoneClear, type ShopItem } from '../ui/zone';
import { Zone } from './Zone';
import { ArtifactSet } from './Artifacts';
import { Pickups, RUNES, PICKUPS_LOAD } from './Pickups';
import { Waves } from './Waves';
import type { ChestType } from './ArtifactDeck';
import { ORIG_U } from '../config';

export class GameScene extends Phaser.Scene {
  private land!: Ground;
  private hud: Hud | null = null;
  private joy: Joystick | null = null;
  private paused = true;
  private inModal = false;
  private hudT = 0;
  private running = false;
  /** подобранные сундуки, ждущие окна */
  private chestQ: ChestType[] = [];
  /** Окна хода зоны, ждущие своей очереди (после выбора уровня/сундука) */
  private zoneQ: ('shop' | 'clear')[] = [];
  // пол по оригиналу не перекрашивается в зоне 1 (stageTint убран: красный пол — только зона 2)
  /** зум камеры без зачистки (fitCamera) */
  private baseZoom = 1;

  constructor() { super('game'); }

  preload() {
    // новая графика 2.0 (art-raw → public/v2, scripts/import_art.py): до меню — только нужное для боя
    for (const [k, p] of Object.entries(ART)) if (CRITICAL.test(p)) this.load.image(k, ICON_ORIG[k] ?? p);
    // огненный шар «гладкий» (выбран Денисом 2026-11-26, docs/STYLE_GUIDE.md): 3 кадра Bullet6
    for (const i of [1, 2, 3]) this.load.image(`fb_ball_${i}`, `vfx/fireball/v3/smooth_0${i}.png`);
    // кадры оригинала, уже гладкие (полный холст Unity): взрыв шара, пуля и взрыв Пандемониума
    const o = 'vfx/fireball/orig/', p2 = (i: number) => String(i).padStart(2, '0');
    for (let i = 1; i <= 9; i++) this.load.image(`Explosion6_${p2(i)}`, `${o}Explosion6_${p2(i)}.png`);
    for (let i = 1; i <= 8; i++) this.load.image(`Explosion27_${p2(i)}`, `${o}Explosion27_${p2(i)}.png`);
    for (let i = 1; i <= 3; i++) this.load.image(`Bullet27_${p2(i)}`, `${o}Bullet27_${p2(i)}.png`);
    // Ядовитый газ и Созвездие: взрывы 52 / 75–77 как есть, мелкие снаряды и дымки — сглаженные ×4 (_s)
    for (let i = 1; i <= 14; i++) this.load.image(`Explosion52_${p2(i)}`, `${o}Explosion52_${p2(i)}.png`);
    for (const n of [75, 76, 77]) for (let i = 1; i <= 8; i++) this.load.image(`Explosion${n}_${p2(i)}`, `${o}Explosion${n}_${p2(i)}.png`);
    for (const k of ['Bullet52_01', 'BulletSmoke52_01', 'BulletSmoke52_02', 'BulletSmoke52_03', 'Bullet75_01', 'Bullet75_02', 'Bullet75_03',
      'BulletSmoke75_01', 'BulletSmoke75_02', 'BulletSmoke75_03']) this.load.image(k + '_s', `${o}${k}_s.png`);
    // Магическая пуля: кадры оригинала (vfx/bolt/orig, мелкие сглажены ×4 — _s)
    for (const [k, p] of BOLT_LOAD) this.load.image(k, `vfx/bolt/orig/${p.split('/').pop()}`);
    for (const [k, p] of MAGE_LOAD) this.load.image(k, p);    // Маг AUnit1 + тень (art/mage)
    for (const [k, p] of ORBS_LOAD) this.load.image(k, p);    // Сферы маны и сердце (art/orbs)
    for (const [k, p] of PICKUPS_LOAD) this.load.image(k, p); // Сундуки, руны, Древо, указатели (art/pickups)
    for (const [k, p] of MOB_LOAD) this.load.image(k, p);     // Мобы, боссы, смерти (art/mobs)
    for (const [k, p] of SPIRIT_LOAD) this.load.image(k, p);   // Дух (vfx/spirit/orig)
    for (const [k, p] of MCIRCLE_LOAD) this.load.image(k, p);  // Магический круг (vfx/mcircle/orig)
    for (const [k, p] of SHIELD_LOAD) this.load.image(k, p);   // Щит (vfx/shield/orig)
    for (const [k, p] of SATELLITE_LOAD) this.load.image(k, p); // Спутник (vfx/satellite/orig)
    for (const [k, p] of CLOAK_LOAD) this.load.image(k, p);    // Маскировка (vfx/cloak/orig)
    for (const [k, p] of INCINERATE_LOAD) this.load.image(k, p); // Испепеление (vfx/incinerate/orig)
    for (const [k, p] of RAY_LOAD) this.load.image(k, p);       // Магический луч (vfx/ray/orig)
    for (const [k, p] of FLASH_LOAD) this.load.image(k, p);     // Вспышка (vfx/flash/orig)
    for (const [k, p] of EBOLT_LOAD) this.load.image(k, p);     // Энергопуля (vfx/ebolt/orig)
    for (const [k, p] of ESHOCK_LOAD) this.load.image(k, p);    // Электрический удар (vfx/eshock/orig)
    for (const [k, p] of THUNDER_LOAD) this.load.image(k, p);   // Молния (vfx/thunder/orig)
    for (const [k, p] of METEOR_LOAD) this.load.image(k, p);    // Метеор (vfx/meteor/orig)
    for (const [k, p] of FROSTNOVA_LOAD) this.load.image(k, p); // Ледяные иглы (vfx/frostnova/orig)
    for (const [k, p] of BLIZZARD_LOAD) this.load.image(k, p);  // Метель (vfx/blizzard/orig)
    for (const [k, p] of LAVA_LOAD) this.load.image(k, p);      // Лавовое поле (vfx/lava/orig)
    for (const [k, p] of EZONE_LOAD) this.load.image(k, p);     // Электрозона (vfx/ezone/orig)
    for (const [k, p] of CYCLONE_LOAD) this.load.image(k, p);   // Вихрь (vfx/cyclone/orig)
    for (const [k, p] of TSUNAMI_LOAD) this.load.image(k, p);   // Цунами (vfx/tsunami/orig)
    for (const [k, p] of ARMAGEDDON_LOAD) this.load.image(k, p); // Армагеддон (vfx/armageddon/orig)
    for (const [k, p] of LOCATION_LOAD) this.load.image(k, p);
  }

  /** Остальное (артефакты, синергии, слияния, классы…) — фоном, пока игрок в меню/в бою */
  private loadRest() {
    for (const [k, p] of Object.entries(ART)) if (!CRITICAL.test(p) && !this.textures.exists(k)) this.load.image(k, ICON_ORIG[k] ?? p);
    this.load.start();
  }

  create() {
    makeTextures(this);
    initUi(this.textures);
    this.land = new Ground(this);
    this.scale.on('resize', this.fitCamera, this);
    this.fitCamera();
    showMenu(() => this.startRun());
    this.loadRest();
  }

  /**
   * Камера как в оригинале: фиксирована ВЫСОТА обзора (orthographicSize 7.25 → 14.5 ед. = VIEW_H),
   * ширина зависит от экрана (на iPhone 19.5:9 — 6.69 ед. = VIEW_W). На широких экранах (ПК, альбомная)
   * ширину ограничиваем 8.2 ед. (как у портретного 16:9), чтобы спавн за краем не был виден.
   */
  private fitCamera() {
    const cam = this.cameras.main, w = this.scale.width, h = this.scale.height;
    let zoom = h / VIEW_H;
    const maxW = VIEW_W * (8.2 / 6.69);
    if (w / zoom > maxW) zoom = w / maxW;
    this.baseZoom = zoom;
    cam.setZoom(zoom / (1 + (W.waves?.camZoom ?? 0) / 100));
  }

  private startRun() {
    this.cleanupRun();
    W.scene = this;
    W.time = 0; W.kills = 0; W.mana = 0; W.dmgBy = new Map();
    W.stats = new Stats();
    W.waves = new Waves(1);
    W.fx = new Effects(this);
    W.orbs = new Orbs(this);
    W.projectiles = new Projectiles(this);
    W.enemies = new Enemies(this);
    W.player = new Player(this);
    W.artifacts = new ArtifactSet();
    W.book = new SpellBook();
    W.book.learnStart(1); // Магическая пуля (классы — позже)
    W.pickups = new Pickups(this);
    W.zone = new Zone();
    // круг зачистки Obj_EnemyClearGround_Destroy: Box 7.2×12.8 ед. × масштаб шага (spawn.md §2 «Конец зачистки»)
    W.waves.onClearCircle = (s) => {
      W.enemies.clearCircle(3.6 * s * ORIG_U, 6.4 * s * ORIG_U);
      if (s <= 1.8) W.fx.burst(W.player.x, W.player.y, Math.min(6.4 * s, 9) * ORIG_U, 0xffffff, 0.25, 'ring');
    };
    this.zoneQ = []; this.land.newRun();
    // победа (Game_ClearON на 12:00) → окно → бесконечный режим (Game_BattleLoopON); обелиска после босса в зоне 1 нет
    W.waves.onVictory = () => { this.zoneQ.push('clear'); };
    W.pickups.onCurse = (n, up) => toast(`<b style="color:#b8343f">Проклятая руна</b><br>Элитных врагов: ${n}${up ? ` (из них ${up} гигантов)` : ''}<br>Убейте всех за 3 мин — последний оставит сундук`, 2600);
    W.zone.onMerchant = () => { if (!this.zoneQ.includes('shop')) this.zoneQ.push('shop'); };
    this.chestQ = [];
    W.pickups.onChest = (t) => { this.chestQ.push(t); };
    W.pickups.onRune = (r) => toast(`<b style="color:#${RUNES[r].tint.toString(16).padStart(6, '0')}">${RUNES[r].name}</b><br>${RUNES[r].text}`, 2000);
    W.artifacts.onSynergy = (syn) => toast(`Синергия активирована!<br><b>${syn.emoji} ${syn.name}</b><br>${syn.text.join('<br>')}`, 3200);
    // стартовые кристаллы вокруг мага и кристаллы на плитках поля — как в оригинале (Orbs.startField)
    W.orbs.startField();
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
    this.children.list.slice().forEach((o) => { if (!this.land.owns(o)) o.destroy(); });
  }

  private openPause() {
    if (this.inModal || !this.running) return;
    this.inModal = true; this.paused = true; this.joy?.release();
    showPause(() => { this.inModal = false; this.paused = false; }, () => this.die());
  }

  private openLevelUp() {
    const P = W.player;
    this.inModal = true; this.paused = true; this.joy?.release();
    const scr = W.book.buildScreen();
    showLevelUp(P.level, scr, (c) => {
      const attr = W.book.pick(c);
      if (c.kind === 'enchant') { showEnhance((id) => { W.book.enchant(id); this.afterChoice(); }); return; }
      if (attr && attr.options.length) {
        showAttrPick(attr.spell, attr.options, (a) => { W.book.chooseAttr(attr.spell, a); this.afterChoice(); });
      } else this.afterChoice();
    }, () => { W.book.refund(scr); this.afterChoice(); },
    (combo) => { W.book.learnMerge(combo); this.afterChoice(); });
  }

  private afterChoice() {
    W.player.pendingLevels--;
    if (W.player.pendingLevels > 0) this.openLevelUp();
    else { this.inModal = false; this.paused = false; }
  }

  private openZone() {
    const k = this.zoneQ.shift()!;
    const close = () => { this.inModal = false; this.paused = false; };
    if (k === 'shop') {
      const items: ShopItem[] = W.artifacts.merchantGoods().map((g) => ({ ...g, sold: false }));
      if (!items.length) return;
      this.inModal = true; this.paused = true; this.joy?.release();
      showShop(items, (it) => { W.mana -= it.price; W.artifacts.add(it.a.id); }, close);
    } else {
      this.inModal = true; this.paused = true; this.joy?.release();
      document.body.classList.remove('fury');
      showZoneClear(() => this.startRun(), () => { this.cleanupRun(); this.cameras.main.centerOn(0, 0); showMenu(() => this.startRun()); },
        () => { W.waves.loopOn = true; close(); });
    }
  }

  /** Create_Artifact: взять один из показанных, «Обновить» за ключ (один раз на сундук) или крестик — ничего */
  private openChest(type: ChestType) {
    const close = () => { this.inModal = false; this.paused = false; };
    const open = (changed: boolean) => {
      const r = W.artifacts.openChest(type);
      if (!r.items.length) { close(); return; }
      const keys = W.artifacts.deck.keys;
      this.inModal = true; this.paused = true; this.joy?.release();
      showChest(r.items, (a) => { close(); W.artifacts.add(a.id); }, {
        type, title: r.roulette ? 'Золотая рулетка' : undefined, onDiscard: close, keys,
        onReroll: keys >= 1 && !changed && !r.legend && type !== 7 ? () => { W.artifacts.deck.keys--; open(true); } : undefined,
      });
    };
    open(false);
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
    // земля: клетки в кадре камеры (Ground.ts)
    this.land.update(v);

    if (!this.running) this.land.vignette(null);
    if (!this.running || this.paused) return;
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    if (!W.zone.timeFrozen) W.time += dt;
    W.waves.update(dt);
    if (W.waves.camZoom > 0 || this.cameras.main.zoom !== this.baseZoom) this.cameras.main.setZoom(this.baseZoom / (1 + W.waves.camZoom / 100));
    W.zone.update(dt);

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
    this.land.vignette(W.player.x, W.player.y); // Vision01 ×6 на маге

    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      const P = W.player;
      this.hud!.set(P.xp / P.xpNeed, W.time, W.mana);
      // полоска Obj_MonsterClearBar во время зачистки (вид — партия 7); HP боссов и эпиков — полоски под ними
      this.hud!.boss(W.waves.clearFrac);
      this.hud!.merchant(W.zone.merchantFrac);
      // откаты утилитарных заклинаний (поля cdLeft/cdTotal/active выставляют сами заклинания)
      for (const k of ['shield', 'cloak', 'mcircle', 'armageddon']) {
        const sp = W.book.spells.get(k) as any;
        if (!sp) { this.hud!.clearCd(k); continue; }
        const act = typeof sp.active === 'number' ? sp.active > 0 : !!sp.active && k !== 'shield';
        this.hud!.cd(k, 'spell_' + k, act ? 1 : (sp.cdLeft ?? 0) / Math.max(0.01, sp.cdTotal ?? 1));
      }
      for (const r of Object.keys(RUNES) as (keyof typeof RUNES)[]) {
        const left = W.pickups.active.get(r);
        if (left !== undefined) this.hud!.cd('rune_' + r, 'rune', 1 - left / (RUNES[r].dur * (1 + W.stats.runeDur)), RUNES[r].tint);
        else this.hud!.clearCd('rune_' + r);
      }
    }

    if (W.player.dead && !this.tryRevive()) { document.body.classList.remove('fury'); this.die(); return; }
    if (W.player.pendingLevels > 0 && !this.inModal) this.openLevelUp();
    // «Золотая рулетка»: очередь экранов (AbilityStatApply @0x1110628) сразу открывает окно артефакта
    else if (W.artifacts.deck.roulette && !this.inModal) this.openChest(5);
    else if (this.chestQ.length && !this.inModal) this.openChest(this.chestQ.shift()!);
    else if (this.zoneQ.length && !this.inModal) this.openZone();
  }
}
