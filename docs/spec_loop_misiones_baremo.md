# Spec — Loop Evaluación → Misión → XP → Reevaluación

**Fecha:** 2026-07-02 · **Estado:** decisiones cerradas, listo para implementar
**Contexto:** primer paso del norte de producto (ver `evaluacion_ingenieria_producto.md` §Norte). P0 de seguridad cerrado (v19), cadencia de evaluación definida: **trimestral**.

**Decisiones tomadas (2026-07-02):**

- **D1** — El trigger DB roto se **deshabilita** (no se parchea).
- **D2** — Disparo por **invocación explícita desde la app** (opción B): al cerrar la evaluación, `recalcularOverall` invoca la Edge Function una vez. Estrategia *catálogo primero*: se asignan misiones preestablecidas por baremo/pilar; solo si no hay cobertura en el catálogo se **genera una nueva** (IA), que siempre pasa por aprobación del coach.
- **D3** — El **catálogo lo genera el MCP** (`blackgold-mcp`), con **justificación científica por misión** (mismo estándar que los baremos), clasificado por nivel y por **categoría FEB (edad)**. El MCP propone; el coach activa. Se sugieren al coach post-evaluación según los resultados individuales del atleta.
- **D4** — Aprobación por complejidad: misiones **generales → auto-asignadas** (el atleta las ve de inmediato); misiones **específicas del baremo/pilar → aprobación del coach** antes de ser visibles.
- **D5** — Video **opcional** en las misiones del catálogo: si existe, es un link de YouTube reproducible desde la app; la misión vale por descripción + justificación.
- **D6** — Dosis por tanda: `maxDebilidades = 3` × `porDebilidad = 2` (hasta 6 misiones por evaluación); recalibrar con datos del primer ciclo.

---

## 1. Problema

Las misiones y el motor de baremos viven desconectados: el coach asigna misiones a mano sin que el sistema le diga *qué* necesita cada atleta, y el atleta gana XP por actividades que no atacan sus debilidades medidas. El intento existente de cerrar el loop (webhook `evaluaciones_pruebas` → Edge Function `generar-misiones-ia`) **está roto en producción**:

- **(a)** La Edge Function inserta `tipo: 'youtube'`, pero la migración v17 renombró esa columna a `pilar` → el INSERT falla desde v17. No se genera ninguna misión IA.
- **(b)** Aunque funcionara, crea la misión en `misiones` pero **nunca la asigna** (no inserta en `progreso_misiones`) → misión huérfana que nadie ve.
- **(c)** El trigger dispara **por cada fila** insertada: una sesión de evaluación con 8 pruebas generaría 8 misiones para el mismo atleta.
- **(d)** La detección de debilidades vive en la Edge Function (Deno) y no usa `analytics-core`; el contenido lo decide el LLM sin catálogo → misiones no auditables, con `video_url` placeholder.
- **(e)** El SQL del webhook (`20260626093100_setup_webhook_ia.sql`) tiene `Bearer YOUR_ANON_KEY` hardcodeado como placeholder.

Costo de no resolverlo: el activo estratégico (baremos científicos) no influye en el comportamiento diario de nadie; la gamificación reparte XP incoherente (hoy se calcula por **palabras clave en el título** de la misión, ver `aprobarMision` en `misionesService.js`).

## 2. Objetivos

1. Toda evaluación trimestral produce automáticamente misiones dirigidas a las debilidades medidas del atleta, visibles para el coach antes de llegar al atleta.
2. La selección de misiones es **determinista y auditable** (código en `analytics-core`), con IA solo como capa opcional de redacción.
3. El XP otorgado sale de datos (`misiones.xp_recompensa` + nivel del atleta), no de keywords en el título.
4. En la reevaluación del trimestre siguiente se puede medir: *delta en el sub-pilar objetivo de las misiones completadas vs. no completadas*.

## 3. No-objetivos (v1)

- **Radar histórico / capa longitudinal completa** — solo se implementa el delta mínimo entre dos ventanas trimestrales (Fase 3); las tendencias multi-punto son iniciativa aparte.
- **Benchmarks multi-club** — requiere más clubes con datos; el diseño no debe impedirlo (percentiles quedan como P2).
- **Recomendaciones de planificación de sesiones para el coach** — el motor de debilidades por grupo se expone (Fase 3) pero la planificación automática de sesiones es otro spec.
- **Rediseño de la UI de misiones del atleta** — se reutiliza `MisionesPanel` tal cual; solo cambia de dónde salen las misiones.

## 4. Historias de usuario

- Como **atleta**, quiero que tras mi evaluación aparezcan misiones que atacan mi métrica más débil, para saber exactamente qué entrenar y ganar XP por mejorar de verdad.
- Como **coach**, quiero revisar/editar las misiones auto-generadas antes de que las vea el atleta, para mantener el criterio técnico humano en el loop.
- Como **coach**, quiero ver la debilidad agregada de mi grupo, para orientar la próxima sesión.
- Como **padre**, quiero que el reporte mencione en qué está trabajando mi hijo y si mejoró, para confiar en el método del club.
- Como **owner**, quiero ver si las misiones completadas correlacionan con mejora en baremos, para defender el valor del club con datos.

## 5. Estado actual relevante (verificado en código)

| Pieza | Estado |
|---|---|
| `evaluaciones_pruebas` | Tiene `atleta_id, prueba_tipo, sub_pilar, tier, puntuacion_normalizada, created_at`. Sin baseline versionada. |
| `misiones` | `titulo, descripcion, pilar (CHECK: youtube/articulo/7 sub-pilares), video_url, xp_recompensa, quiz, condicion_trigger, is_ai_generated, autor_id`. |
| `progreso_misiones` | `atleta_id, mision_id, completada, estado (pendiente/pendiente_aprobacion/aprobada/rechazada), fecha_completada, asignado_por, tipo_asignacion (individual/categoria/grupo/todos), fecha_asignacion`. |
| `analytics-core` | `normalizarValor, calcularOverall, getRango, getSubPilarScores, RADAR_AXES, calcularCategoriaFEB`. **No hay** detección de debilidades ni selección de misiones. |
| Flujo XP | `aprobarMision` decide XP por keywords del título (`micro`/`desarrollo`/`elite`) — a reemplazar. |
| Duplicación | "Última evaluación por prueba" se implementa ad-hoc en `recalcularOverall` (evaluacionesService) y en la Edge Function. Extraer a `analytics-core`. |

## 6. Fases

### Fase 0 — Reparar lo roto (P0, ~1 día)

Sin funcionalidad nueva; deja el terreno operativo.

- [ ] **(D1)** Nueva migración que hace `DROP TRIGGER on_new_evaluation_generate_mission` y `DROP FUNCTION invoke_ai_mission_generator()` — está fallando en silencio desde v17 y el disparo pasa a la app (D2). Elimina de paso el token placeholder del SQL.
- [ ] Test unitario que fija el contrato de `calcularOverall` antes de tocar nada alrededor.

**Criterio de aceptación:** insertar una evaluación en staging no produce error de constraint ni llamada HTTP fallida desde `pg_net`.

### Fase 1 — Motor de recomendación en `analytics-core` (P0 del spec, ~1 semana)

Nuevo archivo `packages/analytics-core/recomendaciones.js`, exportado desde `index.js`. **Funciones puras**, testeables con Vitest, consumibles por web, MCP y Edge Function.

```js
// Última evaluación por prueba_tipo (extrae la lógica duplicada
// de recalcularOverall y de la Edge Function — fuente única).
ultimasPorPrueba(evaluaciones) → { [prueba_tipo]: evaluacion }

// Debilidades ordenadas de peor a mejor por sub-pilar.
// Usa la última evaluación por prueba, promedia por sub_pilar
// (misma agregación que getSubPilarScores) y filtra tiers bajos.
detectarDebilidades(evaluaciones, { maxDebilidades = 3, tiersDebiles = ['poor','below_avg'] })
  → [{ sub_pilar, score, tier, pruebas: [prueba_tipo…] }]

// Selección determinista de misiones del catálogo para esas debilidades.
// Filtra por nivel del atleta Y por su categoría FEB (bucket de baremo,
// vía categoriaABucketBaremo ya existente). Excluye misiones activas (dedup).
// Si una debilidad queda sin cobertura de catálogo, la devuelve en
// `sinCobertura` para que el orquestador genere una misión nueva (D2).
seleccionarMisiones(debilidades, catalogoMisiones, misionesActivasAtleta,
                    { porDebilidad = 2, nivel, categoriaBucket })
  → { asignaciones: [{ mision_id, sub_pilar_objetivo, motivo }],
      sinCobertura: [{ sub_pilar, nivel, categoriaBucket }] }

// Reemplaza la lógica de keywords de aprobarMision.
calcularXPMision(mision, atleta) → number
```

**Cambios de esquema** (una migración, `npx supabase migration new loop_misiones_fase1`):

```sql
-- El catálogo de misiones ES la tabla misiones; se le agrega metadata
-- para selección determinista (sin tabla nueva de plantillas):
ALTER TABLE misiones
  ADD COLUMN IF NOT EXISTS nivel_objetivo TEXT
    CHECK (nivel_objetivo IN ('Micro','Desarrollo','Elite')),
  -- (D3) individualización por edad: bucket de baremo de la categoría FEB
  ADD COLUMN IF NOT EXISTS categoria_bucket TEXT
    CHECK (categoria_bucket IN ('Sub12','Sub15','Sub18','Senior')),
  -- (D3) justificación científica, mismo estándar que los baremos
  ADD COLUMN IF NOT EXISTS justificacion TEXT,
  -- (D4) decide el flujo de aprobación de la asignación
  ADD COLUMN IF NOT EXISTS complejidad TEXT DEFAULT 'especifica'
    CHECK (complejidad IN ('general','especifica')),
  -- Las misiones propuestas por el MCP nacen inactivas hasta que
  -- el coach las active (curaduría humana del catálogo):
  ADD COLUMN IF NOT EXISTS activa BOOLEAN DEFAULT true;

-- Trazabilidad del loop en la asignación:
ALTER TABLE progreso_misiones
  ADD COLUMN IF NOT EXISTS origen TEXT DEFAULT 'coach'
    CHECK (origen IN ('coach','auto_baremo','ia')),
  ADD COLUMN IF NOT EXISTS sub_pilar_objetivo TEXT,
  ADD COLUMN IF NOT EXISTS evaluacion_id UUID REFERENCES evaluaciones_pruebas(id);
```

**Catálogo generado por el MCP (D3).** Nueva herramienta en `blackgold-mcp`: `generar_catalogo_misiones({ sub_pilar?, nivel?, categoria_bucket? })`. Para cada celda faltante de la matriz *7 sub-pilares × 3 niveles × 4 buckets de edad*, el MCP (que ya importa `analytics-core` y conoce los umbrales de los baremos) genera la misión con `titulo, descripcion, justificacion` (fuentes: NSCA/FitnessGram, como `baremos.js`), `xp_recompensa, complejidad` y `video_url` opcional (D5: link de YouTube reproducible desde la app, como ya soporta `MisionesPanel`) — e inserta con `activa=false, is_ai_generated=true`. El coach revisa y activa desde `AdminMisiones`. La matriz completa son 84 celdas; generarlas vía MCP en tandas por sub-pilar es una sesión de trabajo, no semanas de redacción manual.

**Requisitos:**

- **P0** — `detectarDebilidades` y `seleccionarMisiones` con suite Vitest (casos: sin evaluaciones, todo excellent, empate de tiers, sub-pilar débil sin cobertura → va a `sinCobertura`, dedup de misión activa, filtro por `categoria_bucket`).
- **P0** — Herramienta MCP `generar_catalogo_misiones` + cobertura mínima activada por el coach: ≥1 misión `general` y ≥1 `especifica` por sub-pilar y bucket de edad de los atletas actualmente en el club (no hace falta la matriz completa para lanzar).
- **P1** — Reescribir `recalcularOverall` para usar `ultimasPorPrueba` (elimina la duplicación).
- **P2** — Herramienta MCP hermana `proponer_prueba_evaluativa`: propone nuevas pruebas con umbrales justificados por fuentes, para revisión humana antes de entrar a `BAREMOS` (extiende D3 a las pruebas, fuera del alcance de v1).

**Criterio de aceptación (Given/When/Then):** dado un atleta con tier `poor` en `movilidad`, cuando se ejecuta `seleccionarMisiones` con el catálogo real, entonces devuelve ≥1 misión con `pilar = 'movilidad'` y nivel acorde, y no devuelve ninguna que el atleta ya tenga pendiente.

### Fase 2 — Cerrar el loop en producción (~1 semana)

Reescribir la Edge Function `generar-misiones-ia` como *orquestador* del motor, disparada **desde la app** (D2):

1. **Disparo:** al terminar la sesión de evaluación, `recalcularOverall` (que ya corre al guardar) invoca la Edge Function una vez con `supabase.functions.invoke('generar-misiones-ia', { atleta_id })`. Una sesión = una tanda; sin trigger DB, sin token en la base. Mitigación del riesgo cliente: botón **"Regenerar misiones"** en el panel del coach que re-invoca para un atleta (idempotente gracias al dedup de `seleccionarMisiones`).
2. Cargar historial + catálogo, ejecutar `detectarDebilidades` → `seleccionarMisiones` de `analytics-core` con el `nivel` y `categoria_bucket` del atleta (compartir el código vía `supabase/functions/_shared/` con un script de sync desde `packages/analytics-core`, o import relativo si el bundler de `supabase functions deploy` lo resuelve — verificar).
3. **Asignación según complejidad (D4):** insertar en `progreso_misiones` con `origen='auto_baremo'`, `sub_pilar_objetivo` y `evaluacion_id`; misiones `complejidad='general'` entran con `estado='pendiente'` (**auto-asignadas**, el atleta las ve ya); misiones `complejidad='especifica'` entran con `estado='pendiente_aprobacion'` (**el coach aprueba** antes de que el atleta las vea).
4. **Generación bajo demanda (D2):** para cada debilidad en `sinCobertura`, la IA (Gemini) genera una misión nueva usando el mismo formato del catálogo (con `justificacion`), la inserta con `is_ai_generated=true, activa=false` y la asigna con `origen='ia'` y `estado='pendiente_aprobacion'` — **lo generado siempre pasa por el coach**, y si él lo activa queda incorporado al catálogo para el futuro. Si Gemini falla, la debilidad se reporta al coach sin misión (estado vacío explícito).
5. Sustituir la lógica de keywords en `aprobarMision` por `calcularXPMision`.

**Requisitos:** P0 = pasos 1–3 y 5; P1 = paso 4 (generación bajo demanda); P1 = notificación al coach (badge en su panel de aprobaciones, ya existe la cola).

**Criterio de aceptación:** en staging, registrar una evaluación trimestral completa (varias pruebas) produce **una** tanda de ≤ `maxDebilidades × porDebilidad` asignaciones; las generales aparecen de inmediato en `MisionesPanel` del atleta, las específicas solo tras aprobación del coach; al completarla+aprobarla el atleta recibe XP calculado por `calcularXPMision` (verificable sin keywords en el título). Pulsar "Regenerar misiones" dos veces no duplica asignaciones.

### Fase 3 — El loop influye en los cuatro roles (~2 semanas, tras primer trimestre con datos)

Nuevo archivo `packages/analytics-core/tendencias.js`:

```js
// Delta por sub-pilar entre dos ventanas de evaluación (trimestres).
calcularDelta(evaluacionesAntes, evaluacionesDespues)
  → [{ sub_pilar, antes, despues, delta }]

// Debilidad agregada de un conjunto de atletas (para el coach).
agregarDebilidadesGrupo(evaluacionesPorAtleta)
  → [{ sub_pilar, scorePromedio, atletasDebiles: n }]
```

- **Atleta:** tarjeta "tu misión ataca tu punto débil: Movilidad (score 41)" en `MisionesPanel` — el *porqué* visible motiva.
- **Coach:** sección "debilidad del grupo" (usa `atleta_grupo`, poblada en migración 20260626092540) en su panel.
- **Padre:** una línea en el reporte WhatsApp: sub-pilar trabajado + delta del trimestre (requiere que `whatsappReport.js` ya no tenga la asistencia mock — prerequisito P1 del plan general).
- **Owner:** KPI en `OwnerKPIsPage`: % misiones auto-generadas completadas y delta promedio en sub-pilares objetivo vs. no objetivo (la métrica que valida todo el spec).

**Criterio de aceptación:** con dos ventanas trimestrales en la base, el owner ve el delta comparado; con una sola, las superficies muestran estado vacío explícito (no pantalla en negro).

## 7. Métricas de éxito

| Métrica | Tipo | Objetivo | Cuándo |
|---|---|---|---|
| Atletas con misión auto-asignada ≤48h tras evaluación | Leading | ≥90% | Primer ciclo trimestral (T3 2026) |
| Asignaciones *específicas* aprobadas por el coach sin editar | Leading | ≥70% (si es <50%, el catálogo o el selector están mal calibrados) | T3 2026 |
| Misiones del catálogo MCP activadas por el coach sin reescribir | Leading | ≥60% (mide la calidad de la generación D3) | Curaduría Fase 1 |
| Debilidades que caen en `sinCobertura` (requieren generación IA) | Guardrail | <20% tras la curaduría inicial | T3 2026 |
| Tasa de completado de misiones `auto_baremo` vs `coach` | Leading | ≥ igual que las manuales | T3 2026 |
| Delta en sub-pilar objetivo (misión completada) vs. no objetivo | Lagging | Positivo y mayor | Reevaluación T4 2026 |
| XP otorgado sin tocar keywords de título | Guardrail | 100% | Desde Fase 2 |

## 8. Preguntas abiertas

Q1–Q7 quedaron resueltas como D1–D6 (ver encabezado), salvo una técnica interna:

- **Q5 (ingeniería, Fase 2, no bloqueante — la resuelve quien implementa, no requiere decisión de producto):** el código nuevo de `analytics-core` debe correr también dentro de la Edge Function en los servidores de Supabase. Al desplegarla, Supabase empaqueta solo la carpeta de la función; hay que verificar en el primer deploy si el empaquetador incluye automáticamente el código importado desde `packages/analytics-core` (fuera de esa carpeta) o si hace falta un pequeño script que copie el paquete a `supabase/functions/_shared/` antes de desplegar. Cualquiera de las dos vías funciona; es un detalle de tooling.

## 9. Plan y dependencias

- **Fase 0:** ya — nada la bloquea.
- **Fase 1:** tras Fase 0. Su criterio de aceptación completo requiere la herramienta MCP y una sesión de curaduría del coach (D3).
- **Fase 2:** tras Fase 1. Objetivo: en producción **antes de la evaluación trimestral de T3 2026**, que será el primer ciclo real del loop.
- **Fase 3:** las funciones (`tendencias.js`) pueden escribirse tras Fase 1; las superficies de rol rinden recién con datos de dos trimestres (T4 2026).
- Prerequisito externo (P1 del plan general, para Fase 3-padre): quitar mock de asistencia y URL placeholder de `whatsappReport.js`.
