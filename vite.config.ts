import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt': la nueva versión espera a que la persona toque "Recargar"
      registerType: 'prompt',
      // Los iconos de public/ se generan con `npm run icons` (pwa-assets.config.ts)
      // y entran en el precache por globPatterns.
      manifest: {
        name: 'Troko Bloco',
        short_name: 'Troko',
        description: 'La app de la batucada y la escuela Troko Bloco',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#000000',
        background_color: '#000000',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Solo precachear las fuentes latinas (las demás se bajan si hicieran falta)
        globIgnores: ['**/*-{cyrillic,cyrillic-ext,vietnamese,hebrew,greek}-*.woff2'],
        navigateFallback: '/index.html',
        // Avisos push (public/push-sw.js)
        importScripts: ['/push-sw.js'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Fotos del muro (bucket privado): las URLs firmadas cambian de token,
            // así que se cachean por ruta ignorando la query. Se borra al cerrar sesión.
            urlPattern: ({ url }) => url.pathname.startsWith('/storage/v1/object/sign/wall/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'wall-photos',
              matchOptions: { ignoreSearch: true },
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Avatares y, más adelante, imágenes públicas de Supabase Storage
            urlPattern: ({ url }) => url.pathname.startsWith('/storage/v1/object/public/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-public-images',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
