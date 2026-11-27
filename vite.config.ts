import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The preview panel of this workspace proxies the dev server through a
 * dedicated hostname. Vite 5.4 rejects unknown Host headers, so the exact
 * preview host is allowed here — never a wildcard.
 */
const PREVIEW_HOSTS = [
  '9yxshf6tup-3000.agent37.app',
  'pv-ecafd0f00ac3-agent37-ae446163-d0cc-4f43-ab16-50324f756d13.freebuff.site',
  'localhost',
  '127.0.0.1',
];

/** GitHub Pages serves this project from https://mrxennt.github.io/goy-boy/ */
const PAGES_BASE = '/goy-boy/';

export default defineConfig(({ mode }) => ({
  // Production builds (and `npm run preview`) use the Pages sub-path, `npm run dev` stays at `/`.
  base: mode === 'production' ? PAGES_BASE : '/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: PREVIEW_HOSTS,
  },
  preview: {
    host: '0.0.0.0',
    port: 3400,
    strictPort: true,
    allowedHosts: PREVIEW_HOSTS,
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1200,
    // `docs/` is published by GitHub Pages straight from the main branch.
    outDir: 'docs',
    emptyOutDir: true,
  },
}));
