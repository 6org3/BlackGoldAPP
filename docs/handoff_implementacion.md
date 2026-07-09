# Handoff de implementación — rediseño frontend por rol (listo para modo code)

> Fecha: 2026-07-08. Resumen ejecutable para pasar del diseño a la implementación.
> **Fuente de diseño:** `docs/blueprint_rediseno_frontend.md` (Parte I + Parte II).
> **Mockup canónico aprobado:** `docs/mockup_v6_comparar_graficos.html` — ábrelo como referencia visual mientras codeas.

Este documento es el punto de partida para el trabajo de código. No repite el blueprint; lo aterriza en PRs concretos con rutas reales y las convenciones de `CLAUDE.md`.

---

## 1. Decisiones aprobadas (congeladas)

1. **Home nativo por rol** — nada de dashboard genérico compartido. Cinco experiencias: superadmin, owner, coach, atleta, padre.
2. **Jerarquía multi-club (multi-tenant):** superadmin = plataforma (gestiona y cruza clubs, con auditoría) → owner = su club, aislado → coach = su categoría → atleta/padre = lo suyo. Aislamiento por club en la base de datos (RLS `club_id` / `current_user_club()`, ya en v24).
3. **Cerebro MCP surfaced en cada rol:** diagnóstico 360°, misiones sugeridas, siguiente prueba, readiness, copiloto fundamentado en el rack, y curación (superadmin). Cada dato IA muestra la tool que lo produce.
4. **Copiloto con dos tonos:** simple y cercano (atleta/padre) · técnico y específico (coach/owner/superadmin).
5. **Vista Comparar** (coach/owner): distribución de una prueba entre atletas de la categoría + comparación contra media de categoría y de club + histórico por atleta. Todo gráfico.
6. **Menos números, más gráficos:** gauges radiales, dot-plots, líneas.
7. **Biomecánica = pilar físico / sub-pilar `movilidad`,** como instrumento de prueba (evaluativa + control), no un sub-pilar nuevo. **Cámara = roadmap posterior** (movilidad, potencia de salto, velocidad en circuito) — no entra en esta ronda.

---

## 2. Artefactos

| Artefacto | Ruta | Uso |
|-----------|------|-----|
| Blueprint (diseño + arquitectura) | `docs/blueprint_rediseno_frontend.md` | Fuente de verdad del rediseño |
| **Mockup canónico** | `docs/mockup_v6_comparar_graficos.html` | Referencia visual a implementar |
| Prompt de arranque | `docs/prompt_modo_code.md` | Prompt listo para pegar en la sesión de código |

> Los mockups de iteración v1–v5 se borraron; **`mockup_v6_comparar_graficos.html` es el único y canónico**.

---

## 3. Qué NO cambia (reusar, no reinventar)

- **Design system:** `Dashboard_Premium/src/styles/tokens.css` + `src/lib/designTokens.js`. Regla: **no introducir hex nuevos**, tokenizar primero. El mockup v6 ya usa exactamente estos tokens.
- **Capa API:** `src/api/*Service.js` (un servicio por dominio). Los componentes no hablan con Supabase directo.
- **`analytics-core`** (`packages/analytics-core/`): fuente única de taxonomía, baremos, radar, recomendaciones. Los shims (`baremosEngine.js`, `radarCalc.js`, `utilsAtletas.js`) se conservan.
- **Routing:** `src/main.jsx` con `PrivateRoute roles={[...]}`.
- **RLS v24:** aislamiento por club vía `club_id` / `current_user_club()` / `es_staff()`. Validar con `Dashboard_Premium/scripts/validar_rls_por_rol.js`.

---

## 4. Orden de implementación (fases)

- **Fase 0 — Fundación:** `packages/brain-core` + primer endpoint del brain gateway.
- **Fase 1 — Homes por rol:** routing + `App.jsx` grid → módulo `Plantel` reutilizable.
- **Fase 2 — Comparar + cards IA:** la vista Comparar con datos reales y las cards del cerebro. *(La más visible; buen punto para empezar a ver valor.)*
- Fase 3 — Copiloto (tono por rol). Fase 4 — biomecánica (movilidad). Fase 5 — cámara/OpenSim.

---

## 5. Primeros PRs concretos

### PR1 — `packages/brain-core` (fundación)
Mover `blackgold-mcp/src/rack.js` a `packages/brain-core/rack.js`. Envolver la lógica de `analyze_athlete_pillars` y `analyze_athlete_readiness` como funciones puras (`diagnostico.js`, `readiness.js`) que reciben `{ evaluaciones, atleta }` y devuelven objetos estructurados. `blackgold-mcp` pasa a **consumir** `brain-core` (sin cambiar la salida de sus tools). Smoke: `npm run rack`.

### PR2 — Edge Function `brain-gateway`
`Dashboard_Premium/supabase/functions/brain-gateway/` (Deno). Precedente exacto en el repo: `supabase/functions/registro-publico/`. Primer endpoint: `POST /brain/atleta/{id}/diagnostico` → valida JWT + rol + **club**, lee `evaluaciones_pruebas` con `service_role` server-side, corre `brain-core` y devuelve el diagnóstico. Nunca exponer `service_role` al cliente.

### PR3 — Routing por rol (`src/main.jsx`)
Añadir `/coach`, `/club`, `/sistema`, `/atleta`, `/padre` con sus `PrivateRoute`. `RootRedirect` decide por rol. Refactor `App.jsx` (grid) → componente reutilizable `Plantel` embebible. Sin big-bang: feature flag por rol.

### PR4 — Vista **Comparar** (alto valor visual)
Componente nuevo `CompararPruebas.jsx`. Selector de categoría + selector de `prueba_tipo`. Tres gráficos (como en v6): distribución de la categoría (dot-plot con líneas de media categoría/club), bullet atleta vs medias, e histórico por atleta.
**Datos:** endpoint `POST /brain/comparar` (o `evaluacionesService` + agregación en `analytics-core`) que devuelve, para una `prueba_tipo` y una categoría del club: `{ atletas:[{nombre, valor, historico[]}], mediaCategoria, mediaClub }`, todo filtrado por club (RLS). Recharts o SVG propio (el mockup usa SVG).

### PR5 — `brainService.js` + hooks
`src/api/brainService.js` (misma convención) + `useBrainDiagnostico(atletaId)`, `useReadiness()`. Poblar las cards IA de coach/atleta/padre. Caché por `(atleta_id, última evaluación)`; invalidar en `evaluacionesService.guardarEvaluacionesLote`.

### PR6 — Copiloto
Edge Function `copiloto` (function-calling sobre `brain-core` + rack, `ANTHROPIC_API_KEY` en secrets). `CopilotoPanel.jsx` con **tono por rol** (simple para atleta/padre, técnico para coach/owner/superadmin) y alcance por rol + club.

---

## 6. Hardening multi-tenant (antes de operar multi-club real)

Hoy `club` es `text` (efectivamente mono-club: default `'Black Gold'`, `club_id NULL` = global). Para plataforma multi-club:

- Migración aditiva: tabla **`clubes`** con `club_id UUID` (PK) + `plan`/estado, y FK `usuarios.club_id`, `atletas.club_id`, etc. (convención Supabase CLI: `npx supabase migration new ...`).
- Registro de **auditoría de accesos cross-club** del superadmin.
- Re-validar todas las políticas con `scripts/validar_rls_por_rol.js`.

Es aditivo sobre la RLS existente; no rompe lo actual.

---

## 7. Checklist "listo para code"

- [ ] Abrir `docs/mockup_v6_comparar_graficos.html` como referencia visual.
- [ ] Leer §5 de este handoff y elegir el PR de arranque (**sugerido: PR1 brain-core + PR4 Comparar**, que es lo más visible).
- [ ] Crear rama por PR.
- [ ] Respetar tokens (`tokens.css`/`designTokens.js`) — sin hex nuevos.
- [ ] Cada endpoint/UI nuevo filtra por **rol y club**; validar con `validar_rls_por_rol.js`.
- [ ] Migraciones aditivas con timestamp nuevo; aplicar con `npx supabase db push`.
- [ ] Actualizar el blueprint y este handoff si una decisión cambia.

---

*Todo el diseño está congelado y aterrizado. A partir de aquí, el trabajo es código sobre `Dashboard_Premium/` y `packages/`.*
