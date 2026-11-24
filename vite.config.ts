import { defineConfig } from 'vite';

// No React plugin needed: esbuild compiles TSX with the automatic JSX runtime.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  // Relative asset URLs, so the built site works at any path (GitHub Pages serves it from /videomaps-atlas/).
  base: './',
  server: { port: 5173 },
  // The bundle includes the full catalogue (data/*.json); ~140 kB gzipped.
  build: { chunkSizeWarningLimit: 900 },
});
