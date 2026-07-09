# Rack documental deportivo (knowledge/)

Corpus de documentación específica del deporte que fundamenta las tools del
MCP Black Gold. Se indexa en memoria al primer uso (`packages/brain-core/rack.js`,
BM25 con normalización de acentos y sinónimos del dominio ES/EN) y las tools
analíticas y de autoría le inyectan a sus prompts los fragmentos más
relevantes, con cita `[archivo › sección]`.

## Qué se indexa

- Todos los `.md`/`.txt` de esta carpeta (área `metodologia` por defecto;
  este README se excluye).
- Los documentos deportivos del repo declarados en `rack.config.json`
  (baremos científicos, manual de entrenamiento, táctica, mentalidad,
  referencias académicas).
- Carpetas personales fuera del repo vía la variable de entorno `RACK_DIRS`
  (rutas separadas por `;`, área `extra`) — para bibliografía con copyright
  que no debe commitearse.

## Cómo añadir un documento

1. Guardarlo aquí como Markdown (o `.txt`). Usar headings `##`/`###`: el
   chunking corta por ellos y la sección aparece en la cita.
2. Si vive en otra parte del repo, añadir su entrada en `rack.config.json`
   con el `area` que corresponda.
3. Probar la recuperación: `npm run rack` (smoke de consultas) o la tool
   `consultar_rack` desde el cliente MCP. No hace falta reiniciar nada más:
   el índice se construye al arrancar cada sesión del servidor.

## Tools que lo consumen

- `consultar_rack` (búsqueda dirigida con citas) y `listar_rack` (inventario).
- `analyze_athlete_pillars`, `generate_custom_mission`, `suggest_next_test`,
  `analyze_athlete_readiness`, `generar_catalogo_misiones`,
  `generar_catalogo_pruebas` y `generar_descripciones_pruebas` recuperan
  contexto automáticamente según el caso analizado.
- `consultar_metodologia_iniciacion` sigue devolviendo la guía Vinueza
  completa (documento fundacional del área `metodologia`).
