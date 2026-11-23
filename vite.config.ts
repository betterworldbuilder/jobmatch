import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
  // Copyright banner on every built JS file (founder, 2026-11-23). `/*!` marks it as a legal comment.
  build: {
    rollupOptions: {
      output: {
        banner: '/*! (c) 2026 JobsMatchNow SARL, Paris, France. All rights reserved. Proprietary and confidential: copying, reverse engineering, scraping or reuse is prohibited. https://jobsmatchnow.com/legal.html */',
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT || process.env.PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
});
