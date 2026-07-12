# blackgold-mcp/CLAUDE.md

Guía específica del servidor MCP del proyecto. Se carga solo cuando se trabaja con archivos bajo `blackgold-mcp/`. Ver también el `CLAUDE.md` raíz del repo para el contexto general del proyecto.

## Rack documental deportivo (conocimiento del deporte)

El **rack** es el corpus de ciencia del deporte del club, indexado en memoria con BM25 por `blackgold-mcp/src/rack.js` (normaliza acentos y expande sinónimos ES/EN derivados de `packages/analytics-core/vocabulario.js`). Las tools del MCP le inyectan contexto automáticamente (`contextoRack` en `analyze_athlete_pillars`, `generate_custom_mission`, `suggest_next_test`, `analyze_athlete_readiness`, `generar_catalogo_misiones`, `generar_catalogo_pruebas`, `generar_descripciones_pruebas`) y lo exponen para consulta directa (`consultar_rack`, `listar_rack`, `mapa_conocimiento`). Todo fundamento se cita como `[archivo › sección]`. **Regla dura: el conocimiento del deporte vive en el rack, nunca hardcodeado en `src/index.js`.**

Fuentes del corpus (manifest declarativo en `blackgold-mcp/knowledge/rack.config.json`):

- Todo `.md`/`.txt` de `blackgold-mcp/knowledge/` (área `metodologia` por defecto; su `README.md` se excluye del índice).
- Docs deportivos de `docs/` declarados uno a uno en el manifest, con su `area`.
- Carpetas personales con copyright vía la env `RACK_DIRS` (rutas separadas por `;`, área `extra`) — NUNCA commitear ese material al repo.

### Inventario actual (19 docs, ~393 fragmentos; `npm run rack` da el detalle vivo)

- **`metodologia`** (en `knowledge/`): `fundamentos_iniciacion_vinueza` (guía raíz ecuatoriana, Vinueza), `taxonomia_pilares_subpilares` (ontología del sistema), `fases_sensibles_entrenabilidad`, `periodizacion_entrenamiento_anual`, `crecimiento_maduracion` (edad biológica/PHV), `deteccion_talentos`, `nutricion_adolescente`, `recuperacion_carga_descanso`, `prevencion_lesiones_baloncesto`, `trabajo_casa_atleta`, `perfil_entrenador`.
- **`baremos`** (en `docs/`): `baremos_cientificos` (valores normativos por bucket).
- **`entrenamiento`** (en `docs/`): `manual_entrenamiento` (biblioteca de ejercicios por sub-pilar), `entrenamiento_coordinacion` (capacidades coordinativas).
- **`tactica`** (en `docs/`): `tactica_small_ball` (sistema), `tactica_defensiva`, `fundamentos_individuales`.
- **`mentalidad`** (en `docs/`): `mentalidad_mamba`.
- **`referencias`** (en `docs/`): `referencias_academicas` (bibliografía consolidada con DOI).

### Cómo nutrir/mantener el rack

Ver la skill `add-rack-doc` (`.claude/skills/add-rack-doc/SKILL.md`) para el flujo completo paso a paso de cómo agregar o etiquetar un documento nuevo.

README operativo del corpus: `blackgold-mcp/knowledge/README.md`. Al añadir docs, mantener sincronizado este inventario.
