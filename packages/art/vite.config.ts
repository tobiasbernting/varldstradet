// The build `pnpm godot:sprites` runs (packages/godot/tools/export-sprites.mts): the page that draws the art
// (packages/godot/tools/sprites-page.ts) bundled into one script for Playwright's Chromium, since the art needs a
// canvas. Nothing is written to disk; the export reads the bundle from memory.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const at = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: at('.'),
  logLevel: 'warn',
  // the page sits outside this package, so the workspace package is pointed at by hand
  resolve: { alias: { '@lilla-garden/shared': at('../shared/src/index.ts') } },
  build: {
    write: false,
    minify: false,
    target: 'esnext',
    lib: { entry: at('../godot/tools/sprites-page.ts'), name: 'Sprites', formats: ['iife'], fileName: () => 'sprites.js' },
  },
});
