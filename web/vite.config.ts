import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import path from 'path';

export default defineConfig({
  plugins: [preact()],
  root: '.',
  base: './',
  server: {
    port: 5173,
    fs: {
      allow: ['..'],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: true,
  },
  worker: {
    format: 'es',
  },
  resolve: {
    alias: {
      '@pi-oxide/web-lua': path.resolve(__dirname, '../crates/web-lua/js/index.ts'),
      '@pi-oxide/extension-lua': path.resolve(__dirname, '../crates/extension-lua/js/index.ts'),
      '@pi-oxide/dom-snapshot-wasm': path.resolve(__dirname, '../crates/dom-snapshot-wasm/pkg/dom_snapshot_wasm.js'),
      '@pi-oxide/lua-types': path.resolve(__dirname, '../packages/lua-types/dist/index.js'),
    },
  },
});
