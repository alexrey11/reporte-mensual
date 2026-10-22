import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  // IMPORTANTE: Debe coincidir con el nombre de tu repositorio
  base: '/reporte-mensual/',

  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'ReporteMensual',
        short_name: 'ReporteMensual',
        description: 'Reportes Generales y Registro Venceremos (offline)',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        // 🔥 ESTOS SON LOS VALORES CORRECTOS
        start_url: '/reporte-mensual/',
        scope: '/reporte-mensual/',
        lang: 'es',
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
    // 🔥 ELIMINADO: viteSingleFile() ya no es necesario para la web
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  // Eliminadas las configuraciones de build para single-file
});