# Plan semántico del rack documental

*Fecha: 2026-07-29. Estado: **Fase A implementada y vigente**; Fase B y Fase C son diseño con disparadores, NO implementadas ni programadas.*

Este documento existe porque `blackgold-mcp/src/rack.selftest.js` referenciaba un "plan semántico, Fase C" que nunca se había escrito. Aquí queda: qué hace hoy el rack, qué se haría después, y — lo importante — **bajo qué condición concreta se justificaría hacerlo**. La regla del club es no adelantar infraestructura: cada fase se activa por un disparador medible, no por intuición.

## Fase A — BM25 + capa semántica de sub-pilares (implementada)

Es el estado actual. El rack indexa el corpus en memoria, dentro del proceso del MCP, sin base de datos ni servicios externos.

- **Motor**: `packages/brain-core/rackMotor.js` (puro, portable a Deno) + `packages/brain-core/rack.js` (loader Node que lee disco y env). BM25 clásico (K1=1.5, B=0.75) sobre chunks partidos por heading.
- **Capa semántica**: sinónimos ES/EN derivados en runtime de `packages/analytics-core/vocabulario.js` y de los labels de `taxonomia.js`; etiquetado por sub-pilar a tres niveles (manifest → frontmatter del doc → override por sección con `<!-- subpilares: ... -->`); `BOOST_SUBPILAR` cuando la consulta menciona un sub-pilar con el que el chunk está etiquetado.
- **Fuentes**: manifest declarativo en `blackgold-mcp/knowledge/rack.config.json` (carpeta `knowledge/` completa + docs de `docs/` declarados uno a uno + carpetas privadas por la env `RACK_DIRS`).
- **Verificación**: `npm run rack` en `blackgold-mcp/` — falla (exit 1) ante etiquetas fuera de taxonomía, advierte si un sub-pilar baja de 3 fragmentos, y corre una golden query por sub-pilar esperando el doc correcto en top-3.

Por qué alcanza hoy: el corpus son decenas de KB, las consultas vienen de tools con vocabulario del dominio ya acotado, y las golden queries pasan 10/10. Un índice en memoria se reconstruye en milisegundos y no añade ninguna dependencia operativa.

**Costo de la Fase A: cero infraestructura.** Ese es su valor principal y la razón por la que las fases siguientes necesitan justificarse.

## Fase B — Corpus en Supabase (diseño, no implementada)

Mover el corpus de archivos en disco a tablas (`conocimiento_documentos`, `conocimiento_fragmentos`), con el índice BM25 reconstruido desde ahí o reemplazado por full-text search nativo de Postgres (`tsvector` con diccionario en español).

**Qué habilitaría**: que el Dashboard lea el rack sin pasar por el MCP (hoy el corpus solo vive donde corre el proceso Node); que un coach agregue o edite conocimiento desde la UI sin un commit al repo; que las citas `[archivo › sección]` enlacen a contenido navegable en la app.

**Costo real**: el corpus dejaría de versionarse en git (se pierde el diff, el PR y la revisión del contenido deportivo, que hoy es una ventaja fuerte), habría que resolver RLS por club para el conocimiento, y aparece un problema de sincronización entre lo que está en disco y lo que está en la base.

**Disparadores — se implementa solo si se cumple alguno:**

1. Existe un requerimiento concreto de UI donde el atleta, el padre o el coach **lee el rack desde el Dashboard** (no una tool del MCP citándolo, sino la app mostrándolo).
2. El cuerpo técnico necesita **editar conocimiento sin pasar por git** de forma recurrente (más de una edición por semana sostenida).
3. Aparece conocimiento **específico por club** (multi-club real) que no puede vivir en un repo compartido.

Mientras el corpus solo lo consuman las tools del MCP y se edite por PR, la Fase B es infraestructura sin cliente.

## Fase C — Embeddings / pgvector (diseño, no implementada)

Reemplazar o complementar BM25 con búsqueda vectorial: embeddings por chunk almacenados en `pgvector`, recuperación por similitud coseno, típicamente en modo híbrido (BM25 + vectorial con fusión de rankings).

**Qué habilitaría**: recuperar por significado y no por término — consultas parafraseadas, preguntas en lenguaje natural del padre o del atleta, y conceptos que el vocabulario de sinónimos no cubre.

**Costo real**: dependencia de un proveedor de embeddings (costo por token e indisponibilidad como modo de fallo nuevo), reindexado ante cada cambio del corpus, Fase B como prerrequisito de facto, y — lo más importante — **pérdida de la trazabilidad barata**: hoy se puede explicar exactamente por qué un fragmento salió primero.

**Disparadores — se implementa solo si se cumple alguno:**

1. **Las golden queries se degradan**: `npm run rack` reporta menos de 10/10 con doc esperado en top-3 de forma sostenida, y la causa no se arregla agregando sinónimos a `vocabulario.js` ni reetiquetando secciones.
2. **Escala del corpus**: supera aproximadamente 2000 fragmentos o 2 MB de texto, punto en el que el índice en memoria y el ranking por término empiezan a diluirse.
3. **Consultas de usuario final en lenguaje libre**: se expone una búsqueda del corpus a padres o atletas (no a tools con vocabulario controlado), donde la paráfrasis es la norma y no la excepción.

Regla de decisión: antes de saltar a embeddings, **agotar la Fase A** — agregar sinónimos al vocabulario, mejorar el etiquetado por sección, y engordar el corpus donde el sub-pilar esté flaco. Esas tres palancas son gratis y resuelven la mayoría de los fallos de recuperación observados hasta hoy.

## Cómo se mide si la Fase A sigue alcanzando

La métrica de decisión ya está automatizada y no requiere trabajo nuevo: el bloque de **golden queries** de `npm run rack` (una consulta por sub-pilar, doc esperado en top-3) más el reporte de **fragmentos por sub-pilar** (mínimo 3). Mientras ese comando reporte 10/10 y ningún sub-pilar por debajo del mínimo, no hay evidencia que justifique Fase B ni C.

Al agregar documentos al corpus conviene endurecer las golden queries (consultas más difíciles, esperados más específicos): una batería que siempre pasa deja de ser una métrica de decisión.

## Referencias internas

- `blackgold-mcp/CLAUDE.md` — contexto operativo del rack y su inventario.
- `blackgold-mcp/knowledge/README.md` — cómo se nutre el corpus.
- `.claude/skills/add-rack-doc/SKILL.md` — flujo paso a paso para agregar un documento.
- `packages/brain-core/README.md` — el paquete que implementa el motor y su rol compartido.
