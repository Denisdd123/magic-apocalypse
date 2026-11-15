import Phaser from 'phaser';
import './ui/style.css';
import { GameScene } from './game/GameScene';
import { MAX_DPR } from './config';

// Холст рисуется в реальном разрешении экрана (с учётом плотности пикселей),
// а CSS-размер равен размеру окна — так картинка чёткая на iPhone.
const dpr = () => Math.min(window.devicePixelRatio || 1, MAX_DPR);
const size = () => ({
  w: Math.max(2, Math.round((window.innerWidth || 375) * dpr())),
  h: Math.max(2, Math.round((window.innerHeight || 812) * dpr())),
});

const s = size();
const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: '#7a8c55',
  scale: { mode: Phaser.Scale.NONE, width: s.w, height: s.h, zoom: 1 / dpr() },
  render: { antialias: true, powerPreference: 'high-performance' },
  fps: { target: 60 },
  input: { keyboard: false, mouse: false, touch: false },
  scene: [GameScene],
});

function onResize() {
  const n = size();
  game.scale.resize(n.w, n.h);
  game.scale.setZoom(1 / dpr());
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 200));

// Офлайн-режим и установка на главный экран (только в собранной версии)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
