import { defineConfig } from 'vite';

// base './' — чтобы игра работала из любой папки (GitHub Pages: /repo-name/)
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
  server: { host: true },
});
