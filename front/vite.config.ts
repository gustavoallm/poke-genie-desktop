import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  // Keep Vite's cache in the workspace's single node_modules instead of creating front/node_modules.
  cacheDir: path.join(projectRoot, 'node_modules', '.vite', 'front'),
  // All data comes from the local API (api/, port 4000).
  server: { open: true, proxy: { '/api': 'http://localhost:4000' } },
  // `npm run build -w front` writes front/dist.
  build: { outDir: 'dist', emptyOutDir: true },
});
