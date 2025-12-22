import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'demo-dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'demo/index.html'),
        raycasting: resolve(__dirname, 'demo/html/raycasting.html'),
        'range-query': resolve(__dirname, 'demo/html/range-query.html'),
        'nearest-neighbor': resolve(__dirname, 'demo/html/nearest-neighbor.html'),
        'dynamic-objects': resolve(__dirname, 'demo/html/dynamic-objects.html'),
        benchmark: resolve(__dirname, 'demo/html/benchmark.html'),
        'stress-test': resolve(__dirname, 'demo/html/stress-test.html'),
        'galacean-integration': resolve(__dirname, 'demo/html/galacean-integration.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    open: '/demo/index.html',
  },
  optimizeDeps: {
    include: ['@galacean/engine', '@galacean/engine-math'],
  },
});
