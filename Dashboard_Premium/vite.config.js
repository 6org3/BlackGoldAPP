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
        // Ya no hace falta runtimeCaching: las fuentes se auto-hospedan
        // (@fontsource, ver src/index.css), así que son parte del propio build.
        // Antes había que cachear a mano fonts.googleapis.com y
        // fonts.gstatic.com porque el CSS de un tercero no entra en el build.
        // Sigue sin haber NINGUNA regla que cachee respuestas de Supabase: los
        // datos del club no deben servirse rancios desde el service worker.
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
