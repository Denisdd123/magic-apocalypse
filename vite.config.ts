import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// base './' — чтобы игра работала из любой папки (GitHub Pages: /repo-name/)
// Две страницы: сама игра и галерея разработчика (gallery.html)
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), gallery: resolve(__dirname, 'gallery.html') } },
  },
  server: { host: true },
});
