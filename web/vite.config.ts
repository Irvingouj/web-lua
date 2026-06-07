import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [preact()],
  root: '.',
  base: './',
  define: {
    __DOCTEST__: JSON.stringify(mode === 'doctest'),
  },
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
      '@pi-oxide/dom-semantic-tree': path.resolve(__dirname, '../crates/dom-semantic-tree/js/index.ts'),
    },
  },
}));
