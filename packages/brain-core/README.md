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
  `buscarRack()`, `contextoRack()`, `inventarioRack()`.
- `diagnostico.js` — `analizarPilares()` (objeto estructurado) y
  `construirPromptDiagnostico()` (prompt de diagnóstico 360°).
- `readiness.js` — `analizarReadiness()`, `construirPromptReadiness()` y las
  constantes `RECUPERACION_TRIGGERS` / `RECUPERACION_CONDICIONES`.
- `index.js` — barrel que reexporta todo lo anterior.

## Nota sobre el corpus

El corpus del rack **no vive aquí**: sigue en `blackgold-mcp/knowledge/`
(`rack.config.json` + `.md`/`.txt`; ver su README para añadir documentación).
`rack.js` lo resuelve por ruta relativa a este paquete, y la env `RACK_DIRS`
añade carpetas externas. Smoke: `npm run rack` desde `blackgold-mcp/`.
