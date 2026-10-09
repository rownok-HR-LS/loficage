import { defineConfig } from 'vite';

// base './' so the build works from a GitHub Pages sub-path (/loficage/)
export default defineConfig({
  base: './',
  server: { port: 5180, strictPort: true, host: true },
  preview: { port: 5180 },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500, target: 'es2022' },
});
