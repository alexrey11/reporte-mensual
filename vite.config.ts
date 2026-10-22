import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath, URL } from 'node:url';


export default defineConfig({
  base: '/reporte-mensual/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // No inyectar el SW automáticamente para evitar conflictos en file://
      injectRegister: false,
      manifest: {
        name: 'ReporteMensual',
        short_name: 'ReporteMensual',
        description: 'Reportes Generales y Registro Venceremos (offline)',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
      },
    }),
    viteSingleFile(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // Necesario para que viteSingleFile incruste todo en un solo HTML
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    // Evita warnings de chunk size (es normal con single file)
    chunkSizeWarningLimit: 5000,
  },
});