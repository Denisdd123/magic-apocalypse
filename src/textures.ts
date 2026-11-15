import Phaser from 'phaser';

// Вся графика рисуется кодом при запуске — никаких чужих файлов.
// Стиль: оливковая земля с «каракулями», чёрные чернильные клубки-враги, белые светящиеся заклинания.

type G = Phaser.GameObjects.Graphics;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function glow(g: G, x: number, y: number, r: number, color: number, steps = 8, maxA = 0.5) {
  for (let i = steps; i >= 1; i--) {
    g.fillStyle(color, (maxA / steps) * (steps - i + 1) * 0.5);
    g.fillCircle(x, y, (r * i) / steps);
  }
}

/** Чернильный клубок: плотное ядро + много коротких штрихов наружу */
function inkBlob(g: G, cx: number, cy: number, R: number) {
  g.fillStyle(0x0e0e10, 1);
  g.fillCircle(cx, cy, R * 0.6);
  for (let k = 0; k < 26; k++) {
    const a = rnd(0, Math.PI * 2), d = rnd(R * 0.35, R * 0.62);
    g.fillCircle(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rnd(R * 0.12, R * 0.24));
  }
  for (let k = 0; k < 110; k++) {
    const a = rnd(0, Math.PI * 2);
    const r0 = R * rnd(0.3, 0.55), r1 = R * rnd(0.7, 1.0);
    const da = rnd(-0.25, 0.25);
    g.lineStyle(rnd(1.2, 2.6), 0x0e0e10, 1);
    g.lineBetween(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a + da) * r1, cy + Math.sin(a + da) * r1);
  }
}

/**
 * Маг: высокая шляпа, плащ с рваным подолом, цветная окантовка и светящийся камень.
 * f — кадр «дыхания» (0..3): подол и плащ слегка колышутся, как в рисованной анимации.
 * Базовый размер 32x44, s — масштаб.
 */
function witch(g: G, s: number, color: number, f = 0, accent = -1) {
  const sw = Math.sin((f / 4) * Math.PI * 2);        // покачивание
  const sw2 = Math.cos((f / 4) * Math.PI * 2);
  const P = (x: number, y: number) => new Phaser.Math.Vector2(x * s, y * s);
  g.fillStyle(color, 1);
  // шляпа с загнутым концом
  g.fillPoints([P(9, 17), P(23, 17), P(19.5, 6), P(21 + sw * 0.6, 2), P(25 + sw, 3.5), P(18, 1.5), P(15, 6)], true);
  g.fillEllipse(16 * s, 17.5 * s, 22 * s, 3.4 * s);
  // плащ: колышущийся рваный подол
  const hem = [P(4 + sw2 * 0.8, 41), P(7, 38.5 + sw), P(9.5, 42.5), P(12.5, 39.5 - sw), P(16, 43), P(19.5, 39.5 + sw), P(22.5, 42.5), P(25, 38.5 - sw), P(28 - sw2 * 0.8, 41)];
  g.fillPoints([P(16, 15), P(20.5, 19), P(24, 26), P(26 + sw * 0.5, 33), ...hem.reverse(), P(6 - sw * 0.5, 33), P(8, 26), P(11.5, 19)], true);
  if (accent >= 0) {
    // цветная полоса по центру плаща и светящийся камень на шляпе
    g.fillStyle(accent, 0.9);
    g.fillPoints([P(15.4, 20), P(16.6, 20), P(17.2, 40), P(14.8, 40)], true);
    g.fillStyle(accent, 0.35); g.fillCircle(16 * s, 14.5 * s, 3.2 * s);
    g.fillStyle(0xffffff, 1); g.fillCircle(16 * s, 14.5 * s, 1.2 * s);
    // глаза
    g.fillStyle(accent, 1); g.fillCircle(14.3 * s, 20.6 * s, 0.7 * s); g.fillCircle(17.7 * s, 20.6 * s, 0.7 * s);
  }
}

function star4(g: G, cx: number, cy: number, r: number, w: number) {
  g.fillTriangle(cx - w, cy, cx + w, cy, cx, cy - r);
  g.fillTriangle(cx - w, cy, cx + w, cy, cx, cy + r);
  g.fillTriangle(cx, cy - w, cx, cy + w, cx - r, cy);
  g.fillTriangle(cx, cy - w, cx, cy + w, cx + r, cy);
}

export function makeTextures(scene: Phaser.Scene) {
  // --- Земля (бесшовная плитка 512x512) ---
  make(scene, 'ground', 512, 512, (g) => {
    g.fillStyle(0x7a8c55, 1);
    g.fillRect(0, 0, 512, 512);
    const patch = (x: number, y: number, color: number, alpha: number, size: number) => {
      for (let i = 0; i < 26; i++) {
        const px = x + rnd(-size, size), py = y + rnd(-size * 0.6, size * 0.6);
        const a = rnd(0, Math.PI);
        const l = rnd(4, 11);
        g.lineStyle(rnd(1.5, 3), color, alpha);
        for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
          g.lineBetween(px + ox, py + oy, px + ox + Math.cos(a) * l, py + oy + Math.sin(a) * l);
        }
      }
    };
    for (let i = 0; i < 34; i++) patch(rnd(0, 512), rnd(0, 512), 0x667846, 0.55, rnd(14, 30));
    for (let i = 0; i < 14; i++) patch(rnd(0, 512), rnd(0, 512), 0x8a9c64, 0.45, rnd(10, 22));
  });

  // --- Маг ---
  for (let f = 0; f < 4; f++) {
    make(scene, 'player_' + f, 64, 88, (g) => witch(g, 2, 0x0d0d10, f, 0x7fe3ff));
    make(scene, 'mirage_' + f, 64, 88, (g) => witch(g, 2, 0xffffff, f));
  }
  make(scene, 'shadow', 64, 24, (g) => { g.fillStyle(0x000000, 0.28); g.fillEllipse(32, 12, 60, 20); g.fillStyle(0x000000, 0.25); g.fillEllipse(32, 12, 40, 12); });
  make(scene, 'aura', 96, 96, (g) => glow(g, 48, 48, 48, 0x7fe3ff, 10, 0.35));

  // --- Враги: по 3 кадра «дрожащей линии», чтобы клубки шевелились ---
  for (let f = 0; f < 3; f++) {
  make(scene, 'enemy_basic_' + f, 72, 72, (g) => inkBlob(g, 36, 36, 30));
  make(scene, 'enemy_red_' + f, 80, 80, (g) => {
    inkBlob(g, 40, 40, 34);
    glow(g, 40, 40, 13, 0xff1a2a, 8, 1);
    g.fillStyle(0xff3040, 1); g.fillCircle(40, 40, 4);
  });
  make(scene, 'enemy_white_' + f, 80, 80, (g) => {
    inkBlob(g, 40, 40, 34);
    glow(g, 40, 40, 14, 0xfff4d6, 8, 1.2);
    g.fillStyle(0xffffff, 1); g.fillCircle(40, 40, 5);
  });
  make(scene, 'enemy_small_' + f, 44, 44, (g) => inkBlob(g, 22, 22, 18));
  make(scene, 'enemy_big_' + f, 128, 128, (g) => {
    inkBlob(g, 64, 64, 56);
    glow(g, 64, 64, 18, 0xb04cff, 8, 0.9);
  });
  }
  make(scene, 'elite_ring', 128, 128, (g) => {
    g.lineStyle(5, 0xff2d8a, 0.9); g.strokeCircle(64, 64, 58);
    g.lineStyle(10, 0xff2d8a, 0.25); g.strokeCircle(64, 64, 56);
  });

  // --- Предметы ---
  make(scene, 'orb_s', 16, 16, (g) => { glow(g, 8, 8, 8, 0x46d6ff, 6, 0.9); g.fillStyle(0xb8f2ff, 1); g.fillCircle(8, 8, 2.6); });
  make(scene, 'orb_m', 22, 22, (g) => { glow(g, 11, 11, 11, 0x3f9dff, 6, 1); g.fillStyle(0xd0eaff, 1); g.fillCircle(11, 11, 3.6); });
  make(scene, 'orb_l', 28, 28, (g) => { glow(g, 14, 14, 14, 0xff5ad2, 6, 1); g.fillStyle(0xffd6f4, 1); g.fillCircle(14, 14, 4.6); });
  make(scene, 'orb_life', 28, 28, (g) => {
    glow(g, 14, 14, 14, 0x55ff77, 6, 0.9);
    g.fillStyle(0xe8ffe8, 1); g.fillRect(12, 7, 4, 14); g.fillRect(7, 12, 14, 4);
  });

  // --- Сундук и руны ---
  make(scene, 'chest', 64, 56, (g) => {
    glow(g, 32, 30, 30, 0xffd36b, 8, 0.6);
    g.fillStyle(0x5a3416, 1); g.fillRoundedRect(10, 20, 44, 28, 4);
    g.fillStyle(0x7a4a22, 1); g.fillRoundedRect(10, 12, 44, 14, { tl: 10, tr: 10, bl: 0, br: 0 });
    g.fillStyle(0xf2c94c, 1);
    g.fillRect(10, 24, 44, 3); g.fillRect(29, 12, 6, 36);
    g.fillStyle(0x2b1a0b, 1); g.fillRect(30, 27, 4, 6);
  });
  make(scene, 'rune', 64, 64, (g) => {
    glow(g, 32, 32, 32, 0xffffff, 8, 0.7);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(32, 6, 50, 32, 14, 32); g.fillTriangle(32, 58, 50, 32, 14, 32);
    g.fillStyle(0x000000, 0.55);
    g.fillTriangle(32, 16, 42, 32, 22, 32); g.fillTriangle(32, 48, 42, 32, 22, 32);
  });
  make(scene, 'arrow', 32, 32, (g) => {
    g.fillStyle(0xffffff, 1); g.fillTriangle(30, 16, 8, 4, 8, 28);
  });

  // --- Снаряды и эффекты ---
  make(scene, 'bolt', 40, 12, (g) => {
    g.fillStyle(0xffffff, 0.25); g.fillEllipse(20, 6, 40, 12);
    g.fillStyle(0xffffff, 1); g.fillEllipse(24, 6, 30, 4);
  });
  make(scene, 'blade', 64, 14, (g) => {
    g.fillStyle(0xffffff, 0.25); g.fillEllipse(32, 7, 64, 14);
    g.fillStyle(0xffffff, 1); g.fillTriangle(2, 7, 62, 4, 62, 10);
  });
  make(scene, 'dot', 16, 16, (g) => { glow(g, 8, 8, 8, 0xffffff, 6, 1); g.fillStyle(0xffffff, 1); g.fillCircle(8, 8, 3); });
  make(scene, 'fireball', 32, 32, (g) => {
    glow(g, 16, 16, 16, 0xff7a1a, 8, 1);
    g.fillStyle(0xffe2a8, 1); g.fillCircle(16, 16, 5);
  });
  make(scene, 'spirit', 24, 24, (g) => {
    glow(g, 12, 12, 12, 0xffffff, 6, 0.6);
    g.fillStyle(0xffffff, 1); star4(g, 12, 12, 10, 2);
  });
  make(scene, 'satellite', 40, 40, (g) => {
    glow(g, 20, 20, 20, 0xbfe8ff, 8, 0.9);
    g.fillStyle(0xffffff, 1); g.fillCircle(20, 20, 7);
    g.lineStyle(2, 0xffffff, 0.8); g.strokeCircle(20, 20, 11);
  });
  make(scene, 'ring', 128, 128, (g) => {
    g.lineStyle(3, 0xffffff, 1); g.strokeCircle(64, 64, 60);
    g.lineStyle(1.5, 0xffffff, 0.5); g.strokeCircle(64, 64, 52);
    for (let i = 0; i < 40; i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(30, 60);
      g.fillStyle(0xffffff, rnd(0.3, 0.9)); g.fillCircle(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, rnd(0.8, 1.8));
    }
  });
  make(scene, 'blast', 128, 128, (g) => {
    glow(g, 64, 64, 64, 0xffffff, 10, 0.8);
    g.lineStyle(3, 0xffffff, 0.9); g.strokeCircle(64, 64, 58);
  });
  make(scene, 'spark', 32, 32, (g) => { g.fillStyle(0xffffff, 1); star4(g, 16, 16, 15, 1.6); });
  make(scene, 'magic_circle', 256, 256, (g) => {
    const c = 128;
    g.lineStyle(4, 0xffffff, 0.9); g.strokeCircle(c, c, 122);
    g.lineStyle(2, 0xffffff, 0.7); g.strokeCircle(c, c, 104);
    g.lineStyle(2, 0xffffff, 0.6); g.strokeCircle(c, c, 60);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      g.lineBetween(c + Math.cos(a) * 106, c + Math.sin(a) * 106, c + Math.cos(a) * (i % 3 ? 114 : 120), c + Math.sin(a) * (i % 3 ? 114 : 120));
    }
    // семиконечная звезда
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i * 3 * Math.PI * 2) / 7;
      pts.push(new Phaser.Math.Vector2(c + Math.cos(a) * 100, c + Math.sin(a) * 100));
    }
    g.lineStyle(2.5, 0xffffff, 0.85);
    g.strokePoints(pts, true);
  });

  makeIcons(scene);
}

// --- Иконки для карточек (белые линии, 96x96) ---
function makeIcons(scene: Phaser.Scene) {
  const W = 0xffffff;
  make(scene, 'ico_bolt', 96, 96, (g) => {
    for (let i = 0; i < 3; i++) {
      g.fillStyle(W, 1);
      g.fillTriangle(22 + i * 18, 82, 30 + i * 18, 80, 64 + i * 14, 12 + i * 6);
    }
  });
  make(scene, 'ico_fireball', 96, 96, (g) => {
    g.lineStyle(5, W, 1); g.strokeCircle(48, 54, 24);
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9;
      g.lineBetween(48 + Math.cos(a) * 26, 54 + Math.sin(a) * 26, 48 + Math.cos(a) * rnd(36, 44), 54 + Math.sin(a) * rnd(36, 44));
    }
    g.fillStyle(W, 1); g.fillCircle(48, 54, 9);
  });
  make(scene, 'ico_spirit', 96, 96, (g) => {
    g.lineStyle(7, W, 1); g.strokeCircle(48, 48, 30);
    g.lineStyle(2, W, 0.8); g.strokeCircle(48, 48, 38);
    for (let i = 0; i < 18; i++) {
      const a = rnd(0, Math.PI * 2);
      g.fillStyle(W, 1); g.fillCircle(48 + Math.cos(a) * rnd(24, 40), 48 + Math.sin(a) * rnd(24, 40), rnd(1, 2.5));
    }
  });
  make(scene, 'ico_satellite', 96, 96, (g) => {
    g.lineStyle(3, W, 0.9); g.strokeEllipse(48, 48, 84, 40);
    g.fillStyle(W, 1); g.fillCircle(48, 48, 12); g.fillCircle(84, 54, 8); g.fillCircle(14, 42, 6);
  });
  make(scene, 'ico_circle', 96, 96, (g) => {
    g.lineStyle(3, W, 1); g.strokeCircle(48, 48, 40); g.strokeCircle(48, 48, 32);
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i * 3 * Math.PI * 2) / 7;
      pts.push(new Phaser.Math.Vector2(48 + Math.cos(a) * 30, 48 + Math.sin(a) * 30));
    }
    g.strokePoints(pts, true);
  });
  make(scene, 'ico_phase', 96, 96, (g) => {
    g.fillStyle(W, 0.35); witchAt(g, 18, 14);
    g.fillStyle(W, 1); witchAt(g, 34, 14);
  });
  make(scene, 'ico_atk', 96, 96, (g) => { g.fillStyle(W, 1); g.fillTriangle(48, 8, 60, 60, 36, 60); g.fillRect(30, 60, 36, 6); g.fillRect(44, 66, 8, 22); });
  make(scene, 'ico_cd', 96, 96, (g) => {
    g.lineStyle(5, W, 1); g.strokeCircle(48, 48, 34); g.lineBetween(48, 48, 48, 24); g.lineBetween(48, 48, 66, 56);
  });
  make(scene, 'ico_hp', 96, 96, (g) => { g.fillStyle(W, 1); g.fillCircle(34, 38, 18); g.fillCircle(62, 38, 18); g.fillTriangle(17, 44, 79, 44, 48, 82); });
  make(scene, 'ico_speed', 96, 96, (g) => {
    g.lineStyle(6, W, 1);
    for (let i = 0; i < 3; i++) { g.lineBetween(20 + i * 18, 24, 42 + i * 18, 48); g.lineBetween(42 + i * 18, 48, 20 + i * 18, 72); }
  });
  make(scene, 'ico_size', 96, 96, (g) => {
    g.lineStyle(4, W, 1); g.strokeCircle(48, 48, 14); g.strokeCircle(48, 48, 26); g.strokeCircle(48, 48, 38);
  });
  make(scene, 'ico_duration', 96, 96, (g) => {
    g.fillStyle(W, 1); g.fillTriangle(26, 16, 70, 16, 48, 48); g.fillTriangle(26, 80, 70, 80, 48, 48);
  });
  make(scene, 'ico_crit', 96, 96, (g) => {
    g.lineStyle(5, W, 1); g.strokeCircle(48, 48, 28);
    g.lineBetween(48, 8, 48, 34); g.lineBetween(48, 62, 48, 88); g.lineBetween(8, 48, 34, 48); g.lineBetween(62, 48, 88, 48);
  });
  make(scene, 'ico_pickup', 96, 96, (g) => {
    g.lineStyle(5, W, 1); g.strokeCircle(40, 40, 24); g.lineBetween(57, 57, 82, 82);
  });
  make(scene, 'ico_grail', 96, 96, (g) => {
    g.fillStyle(W, 1);
    g.fillRect(16, 18, 64, 6);
    g.fillTriangle(18, 24, 78, 24, 48, 56);
    g.fillRect(44, 54, 8, 22); g.fillRect(30, 76, 36, 6);
  });
  make(scene, 'ico_synergy', 96, 96, (g) => {
    g.lineStyle(5, W, 1);
    g.strokeCircle(48, 34, 20); g.strokeCircle(34, 58, 20); g.strokeCircle(62, 58, 20);
  });
  make(scene, 'ico_magic', 96, 96, (g) => {
    g.fillStyle(W, 1);
    g.fillTriangle(48, 6, 58, 40, 38, 40);
    g.fillTriangle(38, 40, 58, 40, 48, 90);
    g.lineStyle(4, W, 1); g.strokeCircle(48, 48, 34);
  });
  make(scene, 'ico_critmult', 96, 96, (g) => {
    g.fillStyle(W, 1); g.fillCircle(48, 44, 26); g.fillRect(34, 62, 28, 18);
    g.fillStyle(0x000000, 1); g.fillCircle(38, 42, 7); g.fillCircle(58, 42, 7);
  });
}

function witchAt(g: G, x: number, y: number) {
  g.fillTriangle(x + 5, y + 26, x + 38, y + 26, x + 30, y);
  g.fillTriangle(x + 6, y + 70, x + 40, y + 70, x + 23, y + 22);
}
