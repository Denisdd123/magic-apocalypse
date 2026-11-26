import Phaser from 'phaser';
import './ui/style.css';
import { GameScene } from './game/GameScene';
import { MAX_DPR } from './config';

// Холст рисуется в реальном разрешении экрана (с учётом плотности пикселей),
// а CSS-размер равен размеру контейнера — так картинка чёткая на iPhone.
// Размер берём у самого контейнера #game (он растянут на весь экран через CSS),
// а не у window.innerHeight: в режиме «на экране Домой» iOS отдаёт его неточно.
const host = document.getElementById('game')!;
const dpr = () => Math.min(window.devicePixelRatio || 1, MAX_DPR);

// Фидбек 2.1 (T7.2): в режиме «на экране Домой» iOS иногда даёт 100vh/100lvh короче экрана —
// снизу (зона home-indicator) оставалась полоса без игры. В standalone веб-вью занимает весь экран,
// поэтому высоту берём у screen (с учётом ориентации) и отдаём в CSS через --app-h (#game и #ui).
const standalone = () =>
  (navigator as unknown as { standalone?: boolean }).standalone === true ||
  window.matchMedia?.('(display-mode: standalone)').matches === true ||
  window.matchMedia?.('(display-mode: fullscreen)').matches === true;
let appH = 0;
function fitHost() {
  const vv = window.visualViewport;
  let h = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0, vv ? vv.height : 0);
  if (standalone() && window.screen) {
    const land = window.innerWidth > window.innerHeight;
    const sw = window.screen.width, sh = window.screen.height;
    h = Math.max(h, land ? Math.min(sw, sh) : Math.max(sw, sh));
  }
  h = Math.round(h);
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
