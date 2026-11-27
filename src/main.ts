import Phaser from 'phaser';
import './ui/style.css';
import { GameScene } from './game/GameScene';
import { MAX_DPR } from './config';

// Холст рисуется в реальном разрешении экрана (с учётом плотности пикселей),
// а CSS-размер равен размеру контейнера — так картинка чёткая на iPhone.
// Размер берём у самого контейнера #game (он растянут на весь вьюпорт через CSS).
const host = document.getElementById('game')!;
const dpr = () => Math.min(window.devicePixelRatio || 1, MAX_DPR);

// iPhone («на экране Домой»): статус-бар непрозрачный чёрный (index.html), веб-вью начинается под ним и идёт
// до низа экрана. Высоту берём только у вьюпорта: screen.height больше его и увела бы низ игры за край.
let appH = 0;
function fitHost() {
  const vv = window.visualViewport;
  const h = Math.round(Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0, vv ? vv.height : 0));
  if (h > 0 && h !== appH) { appH = h; document.documentElement.style.setProperty('--app-h', h + 'px'); }
}
fitHost();
const size = () => {
  const r = host.getBoundingClientRect();
  const w = r.width || window.innerWidth || 375;
  const h = r.height || window.innerHeight || 812;
  return { w: Math.max(2, Math.round(w * dpr())), h: Math.max(2, Math.round(h * dpr())) };
};

const s = size();
const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: '#24261c',
  scale: { mode: Phaser.Scale.NONE, width: s.w, height: s.h, zoom: 1 / dpr() },
  render: { antialias: true, powerPreference: 'high-performance' },
  fps: { target: 60 },
  input: { keyboard: false, mouse: false, touch: false },
  scene: [GameScene],
});
if (import.meta.env.DEV) (window as any).GAME = game; // отладка загрузчика

// отладка (только dev): ручной шаг цикла, если вкладка в фоне и requestAnimationFrame не идёт
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;

let last = '';
function onResize() {
  fitHost();
  const n = size();
  const key = n.w + 'x' + n.h;
  if (key === last) return;
  last = key;
  game.scale.resize(n.w, n.h);
  game.scale.setZoom(1 / dpr());
}
new ResizeObserver(onResize).observe(host);
window.addEventListener('resize', onResize);
window.visualViewport?.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 300));
// iOS иногда «дорастягивает» окно уже после запуска — перепроверяем
[300, 1000, 2500].forEach((t) => setTimeout(onResize, t));

// Офлайн-режим и установка на главный экран (только в собранной версии)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
