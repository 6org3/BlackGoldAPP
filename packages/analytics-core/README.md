# analytics-core

Lógica de dominio compartida entre `Dashboard_Premium` (app web) y `blackgold-mcp`
(servidor MCP): baremos científicos por categoría/edad, categoría FEB derivada de la
fecha de nacimiento, y agregación de pilares para el radar. Fuente única de verdad —
no reimplementar esta lógica en otro lugar.

No es un paquete npm publicado ni parte de un workspace: ambos consumidores lo
importan por **ruta relativa** (`.js` planos, ES modules), para no acoplar el build de
`Dashboard_Premium` (Vite/Vercel) a tooling de monorepo.

## Consumidores

- `Dashboard_Premium/src/lib/baremosEngine.js`, `radarCalc.js` y
  `Dashboard_Premium/src/api/utilsAtletas.js` son **shims**: reexportan todo desde aquí
  para no romper los ~20 archivos que ya importan de esas rutas.
- `blackgold-mcp/src/index.js` importa directamente desde aquí.

## Archivos

- `baremos.js` — `BAREMOS`, `normalizarValor()`, `calcularOverall()`, `getRango()`,
  `categoriaABucketBaremo()`, `RANGOS`, recompensas.
- `categoriaFEB.js` — `calcularEdad()`, `calcularCategoriaFEB()`.
- `radar.js` — `getSubPilarScores()`, `build3LayerRadarData()`, `RADAR_AXES`.
- `baremos_cientificos.md` — auditoría de las fuentes citadas en `baremos.js` (qué está
  verificado, qué falta, y el riesgo de desincronización entre este archivo y el catálogo
  que usa la app en producción). Leer antes de modificar umbrales.
