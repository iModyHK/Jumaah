import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** The admin of Jumaah Cloud: the Community admin app with the cloud extensions. */
export default defineConfig({
  base: '/admin/',
  publicDir: '../../../apps/admin/public',
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom', 'react-router-dom', 'react-i18next', 'i18next', '@tanstack/react-query'] },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1000 },
});
