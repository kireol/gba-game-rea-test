import { defineConfig } from 'vite';

/**
 * The game ships as static files: no server code, no runtime asset fetches.
 * `base: './'` keeps the built page working from any path, including a
 * `file://` copy or a subfolder on a static host.
 */
export default defineConfig({
  base: './',
  appType: 'spa',
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});
