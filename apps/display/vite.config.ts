import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/display/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Jumaah Display',
        short_name: 'Display',
        start_url: '/display/',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#0b1220',
        theme_color: '#0b1220',
        icons: [{ src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      workbox: {
        navigateFallback: '/display/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/, /^\/admin/, /^\/imam/],
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/api\/public\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'public', networkTimeoutSeconds: 3 },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5175,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
    },
  },
});
