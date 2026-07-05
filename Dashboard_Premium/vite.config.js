import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
  server: {
    // Respeta el puerto asignado por el entorno (p. ej. el preview del agente)
    // sin fijarlo cuando no viene definido.
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    fs: {
      // Permite importar packages/analytics-core (fuera de Dashboard_Premium/) desde
      // los shims en src/lib y src/api — ver packages/analytics-core/README.md.
      allow: [path.resolve(__dirname, '..')],
    },
  },
  build: {
    // Separar dependencias pesadas en chunks vendor cacheables por separado.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) return 'charts'
          if (id.includes('framer-motion')) return 'motion'
          // canvas-confetti va aparte: QuizModal lo importa estáticamente y no
          // debe arrastrar nada más al chunk de App.
          if (id.includes('canvas-confetti')) return 'confetti'
          // OJO: no agrupar jspdf/html2canvas en un chunk manual. Solo se
          // importan dinámicamente (exportar PDF), y al forzar un chunk 'pdf'
          // el bundler metía ahí el vite/preload-helper compartido, con lo que
          // el entry y App importaban ~640 kB de jspdf en la carga inicial.
          // Sueltos, cada uno queda en su chunk cargado solo bajo demanda.
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('react-router')) return 'router'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react-vendor'
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MB
        // Sin esto, la fuente Outfit no carga offline ni con red débil:
        // el CSS de Google Fonts no forma parte del precache del build.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-woff',
              expiration: { maxEntries: 10, maxAgeSeconds: 31536000 }, // 1 año
            },
          },
        ],
      },
      manifest: {
        name: 'Black Gold Premium',
        short_name: 'Black Gold',
        description: 'Plataforma integral de inteligencia y entrenamiento Black Gold EdTech',
        lang: 'es',
        dir: 'ltr',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ]
})
