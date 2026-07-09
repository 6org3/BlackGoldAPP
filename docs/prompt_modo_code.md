# Prompt de arranque — modo code

Copia y pega el bloque de abajo al iniciar la sesión de código en el repo `BlackGoldAPP`.
Para cambiar el punto de arranque, edita la sección **"Objetivo de esta sesión"** (los PRs están en `docs/handoff_implementacion.md §5`).

---

```
Trabajas en el repo BlackGoldAPP: ecosistema de un club de baloncesto (React + Vite + Supabase),
con un servidor MCP en `blackgold-mcp/` y analítica compartida en `packages/analytics-core/`.
Vamos a empezar la implementación del rediseño frontend por rol ya diseñado.

LEE PRIMERO, EN ESTE ORDEN (no escribas código hasta terminar):
1. CLAUDE.md — convenciones, roles, RLS, migraciones, secretos.
2. docs/blueprint_rediseno_frontend.md — diseño y arquitectura (Parte I y Parte II).
3. docs/handoff_implementacion.md — plan de PRs; es tu guía operativa.
4. docs/mockup_v6_comparar_graficos.html — referencia visual del objetivo (ábrelo).

OBJETIVO DE ESTA SESIÓN (arranque de mayor valor):
- PR1 — Fundación `packages/brain-core`: mover `blackgold-mcp/src/rack.js` a `packages/brain-core/`
  y envolver la lógica de `analyze_athlete_pillars` y `analyze_athlete_readiness` como funciones
  puras. `blackgold-mcp` debe consumir `brain-core` SIN cambiar la salida de sus tools.
  Smoke: `npm run rack`.
- PR4 — Vista Comparar (Dashboard_Premium): componente `CompararPruebas` que reproduce el mockup v6:
  selector de categoría y de prueba; distribución de la categoría (dot-plot) con líneas de media
  categoría y media club; comparación atleta vs medias (bullet); e histórico por atleta.
  Datos desde `src/api/evaluacionesService.js` + `packages/analytics-core` (medias), filtrado por club.

RESTRICCIONES (de CLAUDE.md — obligatorias):
- Design system: usa SOLO tokens de `Dashboard_Premium/src/styles/tokens.css` y
  `src/lib/designTokens.js`. NO introduzcas hex nuevos; si falta un token, agrégalo ahí.
- La UI habla con Supabase solo vía `src/api/*Service.js`. Crea `brainService.js` si hace falta.
- Jerarquía multi-club: cada lectura filtra por rol Y por club (RLS v24, `current_user_club()`).
  Valida políticas con `Dashboard_Premium/scripts/validar_rls_por_rol.js`.
- Migraciones aditivas, timestamp nuevo (`npx supabase migration new ...`); no edites migraciones
  ya aplicadas. Aplica con `npx supabase db push`.
- Nunca hardcodees secretos; credenciales por variables de entorno (VITE_SUPABASE_*, service_role
  solo server-side).
- Reusa `analytics-core`; no dupliques lógica de baremos/radar (respeta los shims existentes).

MÉTODO:
1. Confirma que leíste los 4 documentos y muéstrame un PLAN corto (archivos a crear/editar por PR).
   Espera mi OK antes de cambios grandes o cualquier migración.
2. Implementa PR1, corre el smoke del rack, y luego PR4.
3. Al terminar, dame un resumen de los diffs y cómo probarlo localmente.

Empieza confirmando la lectura y proponiendo el plan de PR1 + PR4.
```

---

**Nota:** si prefieres empezar por otro frente (p. ej. routing por rol = PR3, o el copiloto = PR6),
sustituye el bloque "OBJETIVO DE ESTA SESIÓN" por el PR correspondiente del handoff §5.
