import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `dev-dist` es el service worker que genera `npm run dev` (devOptions de
  // vite-plugin-pwa): está gitignored y es regenerable, pero si queda en disco
  // aporta 76 errores de código de Workbox que no son de este repo. CI nunca lo
  // ve (no corre `npm run dev`), así que su presencia hacía que el conteo local
  // de problemas de lint (163) no se pareciera al real (87).
  globalIgnores(['dist', 'dev-dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Specs de Cypress: globals de Mocha (describe/it/before) + Cypress (cy/Cypress).
    // `simulacion/ui/**` también son specs de Cypress aunque vivan fuera de
    // cypress/: sin incluirlas, sus cy/describe/it salían como no-undef.
    files: ['cypress/**/*.{js,jsx}', 'simulacion/ui/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.mocha, cy: 'readonly', Cypress: 'readonly', expect: 'readonly', assert: 'readonly' },
    },
  },
  {
    // Entorno Node: scripts operativos, el motor de simulación y la propia
    // configuración de Vite (que lee process.env y corre bajo Node).
    files: ['scripts/**/*.{js,mjs}', 'simulacion/**/*.{js,mjs}', 'vite.config.js'],
    languageOptions: { globals: globals.node },
  },
])
