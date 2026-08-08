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
    //
    // advancedChunks (API nativa de Rolldown), NO manualChunks: la capa de
    // compatibilidad de manualChunks en rolldown-vite no impone prioridad
    // entre grupos y cada grupo arrastra las DEPENDENCIAS de lo que captura,
    // así que aunque la función devolviera 'react-vendor' para react, el grupo
    // 'charts' (recharts depende de react) se tragaba React y ReactDOM enteros
    // y el login descargaba los 430 kB de Recharts en la carga inicial.
    // Con priority explícita, react se captura antes de que charts lo arrastre.
    rollupOptions: {
      output: {
        advancedChunks: {
          groups: [
            // Máxima prioridad: nadie debe tragarse React como dependencia.
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 100 },
            { name: 'router', test: /node_modules[\\/]react-router/, priority: 90 },
            { name: 'charts', test: /node_modules[\\/](recharts|d3-|victory-vendor)/, priority: 50 },
            { name: 'motion', test: /node_modules[\\/]framer-motion[\\/]/, priority: 50 },
            // canvas-confetti va aparte: QuizModal lo importa estáticamente y no
            // debe arrastrar nada más al chunk de App.
            { name: 'confetti', test: /node_modules[\\/]canvas-confetti[\\/]/, priority: 50 },
            // OJO: no agrupar jspdf/html2canvas en un chunk manual. Solo se
            // importan dinámicamente (exportar PDF), y al forzar un chunk 'pdf'
            // el bundler metía ahí el vite/preload-helper compartido, con lo que
            // el entry y App importaban ~640 kB de jspdf en la carga inicial.
            // Sueltos, cada uno queda en su chunk cargado solo bajo demanda.
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/, priority: 50 },
          ],
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
      // Registro manual en main.jsx: el script auto-inyectado por defecto
      // solo llama a navigator.serviceWorker.register() y no recarga la
      // pestaña cuando un SW nuevo toma el control, así que una PWA instalada
      // (que casi nunca se cierra del todo) se queda mostrando el build viejo.
      injectRegister: false,
      devOptions: {
        enabled: true
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MB
        // globPatterns explícito: el default de Workbox
        // (js,css,html,ico,png,svg) NO incluye woff2, así que sin esto las
        // fuentes auto-hospedadas quedaban fuera del precache y la app
        // instalada perdía la tipografía al abrirse sin red.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // El stack de exportar PDF (~1 MB) se importa dinámicamente y casi
        // nadie exporta en la primera visita: precachearlo de entrada solo
        // infla la instalación inicial de la PWA sin beneficio para la
        // mayoría de las sesiones. Se excluye del precache y se sirve bajo
        // demanda vía runtimeCaching (ver abajo). Un patrón por paquete:
        //   - '**/jspdf*.js'      → jspdf
        //   - '**/html2canvas*.js' → html2canvas y html2canvas-pro
        //   - '**/index.es-*.js'  → canvg. OJO: es 'index.es-*', NO 'index-*'
        //     (ese es el chunk del entry y NO debe excluirse del precache).
        //   - '**/purify.es-*.js' → dompurify
        // Un build local antiguo dejó en dist dos copias mal nombradas
        // (192x192.png.png / 512x512.png.png) de 4,65 MB. Vite 8 no las
        // retiró ni con --emptyOutDir y Workbox las tomó por assets válidos,
        // bloqueando closeBundle. Ningún icono del manifest usa doble
        // extensión: excluir ese patrón evita que un residuo vuelva a romper
        // el precaché, mientras los pwa-*.png reales siguen incluidos.
        globIgnores: ['**/*.png.png', '**/jspdf*.js', '**/html2canvas*.js', '**/index.es-*.js', '**/purify.es-*.js'],
        // runtimeCaching vuelve, pero solo para los assets con hash excluidos
        // arriba: las fuentes siguen auto-hospedadas (@fontsource, ver
        // src/index.css) y van en el precache normal, así que no necesitan
        // regla propia. Antes había que cachear a mano fonts.googleapis.com y
        // fonts.gstatic.com porque el CSS de un tercero no entraba en el build;
        // eso ya no aplica. CacheFirst es seguro aquí porque el nombre de cada
        // archivo lleva hash de contenido (un cambio de contenido = nombre
        // nuevo, nunca una respuesta vieja bajo el mismo nombre).
        // Sigue sin haber NINGUNA regla que cachee respuestas de Supabase: los
        // datos del club no deben servirse rancios desde el service worker.
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets-bajo-demanda',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 90 },
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
