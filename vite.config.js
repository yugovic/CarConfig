import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 3D アセットはリポジトリ直下の Assets/ に一元管理する。
 * GitHub Pages ではそのまま参照され、Vite ビルド時は dist/Assets にコピーする。
 */
function copyAssets() {
  return {
    name: 'copy-assets',
    closeBundle() {
      cpSync(resolve(__dirname, 'Assets'), resolve(__dirname, 'dist/Assets'), { recursive: true });
    }
  };
}

export default defineConfig({
  base: './',
  publicDir: false,
  server: {
    port: 3000,
    open: false
  },
  build: {
    outDir: 'dist'
  },
  plugins: [copyAssets()]
});
