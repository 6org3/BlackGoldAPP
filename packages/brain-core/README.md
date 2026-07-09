# brain-core

La "lógica de las tools" del cerebro Black Gold, sin transporte: rack documental
deportivo (índice BM25 local con capa semántica de la taxonomía), diagnóstico de
pilares y análisis de readiness/recuperación. Cada dominio separa el análisis
estructurado (objeto JSON) del formateo de prompt para la IA, para que un mismo
cerebro sirva por MCP hoy y por HTTP mañana.

No es un paquete npm publicado ni parte de un workspace: los consumidores lo
importan por **ruta relativa** (`.js` planos, ES modules), igual que
`packages/analytics-core` (del que este paquete importa taxonomía, categoría FEB
y el motor de recomendación).

## Consumidores

- `blackgold-mcp/src/index.js` — las tools del MCP son wrappers finos: fetch a
  Supabase → funciones puras de aquí → texto de respuesta.
- Edge Functions `brain-gateway` (futuro) — mismas funciones puras detrás de un
  endpoint HTTP con validación JWT+rol.

## Archivos

- `rack.js` — rack documental (BM25): `extraerFrontmatter()`, `partirEnChunks()`,
  `buscarRack()`, `contextoRack()`, `inventarioRack()`. **Node-only** (lee el
  corpus del disco con `fs`).
- `diagnostico.js` — `analizarPilares()` (objeto estructurado). **Portable**
  (Node y Deno).
- `readiness.js` — `analizarReadiness()` y las constantes
  `RECUPERACION_TRIGGERS` / `RECUPERACION_CONDICIONES`. **Portable**.
- `prompts.js` — `construirPromptDiagnostico()` y `construirPromptReadiness()`:
  el formateo de prompt para la IA, fundamentado en el rack. **Node-only**
  (importa `rack.js`).
- `index.js` — barrel que reexporta todo lo anterior (arrastra `rack.js`; las
  Edge Functions no lo usan).

## Edge Functions (_shared)

Los módulos **portables** (`diagnostico.js`, `readiness.js`) se espejan en
`Dashboard_Premium/supabase/functions/_shared/brain-core/` con
`npm run functions:sync` (misma mecánica que `analytics-core`; el test
`edgeSharedSync.test.js` falla si la copia diverge). `rack.js`, `prompts.js`
y el barrel NO viajan al espejo: dependen de `fs` y en Deno romperían el
bundle. La Edge Function `brain-gateway` responde JSON estructurado — el
prompt para IA es cosa del MCP.

## Nota sobre el corpus

El corpus del rack **no vive aquí**: sigue en `blackgold-mcp/knowledge/`
(`rack.config.json` + `.md`/`.txt`; ver su README para añadir documentación).
`rack.js` lo resuelve por ruta relativa a este paquete, y la env `RACK_DIRS`
añade carpetas externas. Smoke: `npm run rack` desde `blackgold-mcp/`.
