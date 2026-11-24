import { defineConfig } from 'vite';

// No React plugin needed: esbuild compiles TSX with the automatic JSX runtime.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  server: { port: 5173 },
  // The bundle includes the full catalogue (data/*.json); ~140 kB gzipped.
  build: { chunkSizeWarningLimit: 900 },
});
