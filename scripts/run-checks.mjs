/**
 * Bundles scripts/checks.ts with the esbuild that ships with Vite and runs it.
 * Keeps the logic checks dependency-free and usable without a browser.
 */
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const outfile = 'node_modules/.cache/goy-boy-checks.mjs';
mkdirSync('node_modules/.cache', { recursive: true });

await build({
  entryPoints: ['scripts/checks.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  jsx: 'automatic',
  logLevel: 'error',
  outfile,
});

await import(pathToFileURL(outfile).href);
