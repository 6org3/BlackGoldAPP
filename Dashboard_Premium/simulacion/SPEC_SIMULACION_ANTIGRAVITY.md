# SPEC — Simulación aleatoria tipo loop diario para Black Gold

> **Cómo usar este documento en Antigravity**
> 1. Abrí el repo `BlackGoldAPP` en Antigravity.
> 2. Copiá la carpeta `simulacion/` a `Dashboard_Premium/simulacion/` y este
>    archivo a la raíz del repo (o pegalo como contexto/`agents.md` del agente).
> 3. Dale al agente la tarea: *"Implementá y ejecutá el sistema descrito en
>    SPEC_SIMULACION_ANTIGRAVITY.md. Empezá por el Backlog. Corré todo en
>    dry-run, luego en real contra staging, y entregame el RESUMEN con los
>    hallazgos."*
> 4. El **loop corre como código** (Node/Cypress): Antigravity gasta tokens solo
>    para **completar los esqueletos 🚧** y **triar los hallazgos**, no para
>    ejecutar cada día. Ahí está el ahorro.

---

## 1. Objetivo

Simular un club de baloncesto **vivo**, día por día, para probar la app
`Dashboard_Premium` (React + Vite + Supabase) **de forma progresiva**: el club
arranca chico y crece, y en cada tramo el sistema **detecta bugs**, **valida la
lógica de negocio**, **puebla datos demo realistas** y **mide el comportamiento
bajo carga creciente**. Cuatro objetivos, un solo motor.

## 2. Filosofía de diseño (no negociable)

- **Reusar, no reinventar.** La lógica de negocio vive en
  `packages/analytics-core/*` (baremos, `categoriaFEB`, recomendaciones/XP) y en
  `src/api/*Service.js`. La simulación los **envuelve y ejercita**; nunca copia
  reglas. (Es exactamente el patrón de `scripts/simular_club_nuevo_1anio.mjs`.)
- **Determinista.** RNG LCG con semilla (`SIM_SEED`) → corridas reproducibles.
- **Seguro por defecto.** Dry-run salvo `SIM_REAL=1`; guardarraíl anti-producción
  por `SIM_STAGING_URL`; aislamiento por prefijo `SIMLOOP-` / club `"SIM Loop Diario"`.
- **Barato de correr.** El día a día es código puro. El agente interviene solo
  para construir y para analizar hallazgos.

## 3. La app en una pantalla (lo que hay que ejercitar)

- **Stack:** React+Vite (PWA), Supabase (Postgres + Auth + RLS). Capa de API en
  `src/api/*Service.js` (un servicio por dominio). Deploy en Vercel. UI en **español**.
- **Roles:** `superadmin`, `owner`, `coach`, `atleta`, `padre`.
- **Dominios/tablas clave:** `usuarios`, `atletas`, `atleta_grupo`,
  `grupos_entrenamiento`, `asistencia`, `evaluaciones_pruebas`, `sesiones_control`,
  `sesiones_entrenamiento`, `misiones`/`progreso_misiones`, `xp_eventos`,
  `pagos`/`pago_transacciones`, `catalogo_servicios`/`servicio_tarifas`,
  `eventos`/`evento_convocados`, `comunicaciones`/`comunicacion_destinatarios`,
  `club_config`.
- **Reglas de negocio a validar:**
  - Categoría FEB derivada de la edad — `calcularCategoriaFEB()` (JS en
    `packages/analytics-core/categoriaFEB.js`) tiene un **gemelo SQL**
    `calcular_categoria_feb()` y una **columna** `atletas.categoria_feb` (v20).
    Los tres deben coincidir → invariante de alta severidad.
  - Pagos: `generarPagosMensuales` / `marcarPagado` / `actualizarEstadoVencidos`
    (`src/api/pagosService.js`). **Bug conocido documentado:** `monto_base`
    hardcodeado a `30.00` sin importar `precio_mensual` del grupo → la invariante
    de cuadre debe detectarlo comparando contra `servicio_tarifas`.
  - RLS v24/v29 (aislamiento por rol y multiclub) — ya hay suite:
    `scripts/validar_rls_por_rol.js`.

## 4. Convenciones del repo (respetarlas al pie de la letra)

| Tema | Convención |
|---|---|
| Conexión | `.mjs` con `process.loadEnvFile('../.env.local')`; `createClient(url, SERVICE_ROLE, {auth:{persistSession:false}})`. Para login/RLS, cliente `ANON`. |
| Env vars | `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_ANON_KEY` (en `Dashboard_Premium/.env.local`, gitignored). |
| Escritura | Dry-run por defecto; real solo con flag explícito (`SEED_REAL=1` en los scripts; acá `SIM_REAL=1`). |
| RNG | LCG `seed=(seed*1103515245+12345)&0x7fffffff`. |
| Login | RPC `resolver_email_login(p_identificador)` → `signInWithPassword`. Cuentas internas: email `<cedula>@sinacceso.blackgoldapp.internal`, **password = cédula**. |
| Idempotencia | Chequear existencia antes de insertar; reejecutar no duplica. |
| Migraciones | Aditivas, con timestamp (`npx supabase migration new`). No editar aplicadas. |
| UI E2E | **Cypress** (`cypress/e2e/*.cy.js`, baseUrl `localhost:5173`), no Playwright. |

## 5. Arquitectura del motor (ya scaffoldeada en `simulacion/`)

```
reloj (día virtual) ──► fase(día) ──► acciones activas (aleatorias) ──► BD staging
                                   └► cada CHECKPOINT: invariantes ──► HALLAZGOS
                                   └► fin de fase: smoke UI (Cypress)
                                   └► reporte JSONL + RESUMEN.md
```

- `core/reloj.mjs` — avanza 1 día de club por tick; marca días de entreno,
  inicio/fin de mes.
- `core/rng.mjs` — aleatoriedad determinista (`rand/randInt/pick/chance/sample`).
- `config/fases.mjs` — **plan progresivo** (ver §6).
- `generadores/personas.mjs` — atletas/coaches/padres con cédula `SIMLOOP-*` y
  `fecha_nacimiento` coherente con la categoría del grupo.
- `acciones/index.mjs` — una función por tipo de actividad, envuelve el servicio real.
- `invariantes/index.mjs` — aserciones de bug/negocio (ver §7).
- `loop/diaLoop.mjs` — orquestador.
- `limpieza/limpiar.mjs` — borra solo lo de simulación.
- `ui/smoke_simulacion.cy.js` — checkpoint end-to-end.

## 6. Plan progresivo (fases)

| Fase | Hasta día | Atletas objetivo | Grupos | Acciones activas |
|---|---|---|---|---|
| F0 Arranque | 7 | 6 | Sub-8 | alta coach/atleta, asistencia |
| F1 Formación | 30 | 20 | +Sub-12 | +evaluación, misiones, comunicación |
| F2 Club vivo | 90 | 45 | +Sub-16 | +pagos, eventos, bajas |
| F3 Carga/estrés | ∞ | 200 (config) | +Juvenil/Mayores | todo, alta probabilidad |

La idea: los bugs simples aparecen con el club chico (baratos de diagnosticar) y
los de escala/carga aparecen después, sin haber tenido que sembrar 200 atletas
de entrada.

## 7. Invariantes (el detector de bugs) — qué debe cumplirse SIEMPRE

1. **`categoria_feb` sincronizada** *(alta)* — `atletas.categoria_feb` ==
   `calcularCategoriaFEB(fecha_nacimiento)`. Detecta divergencia JS/SQL/columna. ✅ implementada.
2. **Cuadre de pagos** *(alta)* — `Σ pago_transacciones.monto ≤ pagos.monto`;
   `estado='Pagado' ⇒ saldo≈0`. ✅ base implementada; 🚧 **falta** comparar
   `pagos.monto` vs precio esperado (`servicio_tarifas`) para cazar el `monto_base=30`.
3. **Integridad referencial** *(alta/media)* — sin atletas huérfanos, sin
   asistencia/evaluaciones apuntando a atletas inexistentes. ✅ implementada.
4. **Unicidad de asistencia** *(media)* — no dos registros `(atleta_id, fecha)`
   (la tabla tiene UNIQUE; si aparece, es bug del código que la puebla). 🚧 completar.
5. **Ledger de XP** *(media)* — `Σ xp_eventos.xp` == total del atleta; sin negativos. 🚧 completar.
6. **RLS por rol** *(alta)* — envolver `scripts/validar_rls_por_rol.js` como
   subproceso en el checkpoint; cada `❌` → hallazgo. 🚧 completar.

Cada violación se registra como **hallazgo** con contexto en el JSONL y en el
`RESUMEN-*.md`. Ese resumen es el entregable para triar.

## 8. Acciones (envuelven `src/api/*Service.js`)

| Acción | Estado | Servicio/RPC real a usar |
|---|---|---|
| `altaCoach` / `altaAtleta` | ✅ | `usuarios`+Auth; `atletas`; `atleta_grupo`; deriva `categoria_feb` |
| `asistencia` | ✅ | `asistencia` upsert por `(atleta_id,fecha)` (`asistenciaService.js:58`) |
| `pago` | ✅ base | RPC `generar_pagos_mes`; 🚧 abonos `registrarTransaccion`/`marcarPagado` (`pagosService.js:63,120,142`) |
| `evaluacion` | 🚧 | `evaluacionesService.js:41` `guardarEvaluacionesLote` + `:74 recalcularOverall`, valores desde `analytics-core/baremos.js` |
| `mision` | 🚧 | `misionesService.js` (asignar/completar/aprobar) + `xpService.js:26 otorgarXP` |
| `evento` | 🚧 | `eventosService.js:5 crearEvento`, `:95 responderRSVP` |
| `comunicacion` | 🚧 | `comunicacionesService.js:16 crearComunicacion` |
| `baja` | 🚧 | `retencionService.js:47 marcarBaja` |

Regla: cada acción ejercita el **camino real** del app. Cuando una escritura
directa no baste, preferí llamar la RPC/servicio que usa la UI, para que el bug
que encontremos sea del código real y no de la simulación.

## 9. Smoke de UI (checkpoint end-to-end)

`ui/smoke_simulacion.cy.js` → copiar a `cypress/e2e/`. Loguea con cuentas
`SIMLOOP-` (password = cédula, vía el mismo flujo del app) y verifica que los 5
portales rendericen **con datos** y **sin `console.error`**. Reusar selectores de
`cypress/e2e/qa_flow.cy.js` y `qa_roles.cy.js`.

```bash
npm run dev &                                             # app en :5173
npx cypress run --spec cypress/e2e/smoke_simulacion.cy.js
```

## 10. Seguridad y limpieza

- `SIM_REAL` ausente ⇒ **no escribe nada**.
- `SIM_STAGING_URL` definido y distinto de `VITE_SUPABASE_URL` ⇒ **aborta**.
- Todo lo creado lleva prefijo `SIMLOOP-` / club `"SIM Loop Diario"`;
  `limpieza/limpiar.mjs` borra **solo** eso (hijos→padres + cuentas Auth).
- **Nunca** correr contra producción. Crear un proyecto Supabase de staging y
  aplicarle las migraciones: `npx supabase db push`.

## 11. Backlog para el agente (orden sugerido)

1. **Preparar staging.** Proyecto Supabase separado; `.env.local` con sus claves
   + `SIM_STAGING_URL`. Aplicar migraciones (`db push`). Verificar con
   `node scripts/verificar_seed_demo.mjs` (adaptado) que hay conexión.
2. **Correr dry-run** `node simulacion/loop/diaLoop.mjs` (90 días). Debe imprimir
   el plan sin tocar la BD. Arreglar cualquier error de ejecución.
3. **Completar acciones 🚧** (§8) una por una, verificando columnas reales en el
   servicio citado. Tras cada una, re-correr dry-run.
4. **Completar invariantes 🚧** (§7, ítems 2-final), incluida la comparación de
   precios y el wrap de `validar_rls_por_rol.js`.
5. **Correr real contra staging** `SIM_REAL=1 SIM_DIAS=90 node simulacion/loop/diaLoop.mjs`.
   Revisar `simulacion/reportes/RESUMEN-*.md`.
6. **Smoke UI** en un checkpoint (§9).
7. **Modo carga** `SIM_DIAS=365 SIM_CARGA_ATLETAS=300 SIM_REAL=1 …`; reportar
   p50/p95 de latencia y cualquier error de Supabase.
8. **Triar hallazgos:** por cada hallazgo del RESUMEN, decidir bug real vs.
   dato de simulación mal generado; abrir issue/fix. Iterar.
9. **Automatizar (opcional):** un job diario que corra `SIM_DIAS=1` incremental
   sobre el mismo club (reanudable) y publique el RESUMEN.

## 12. Definition of Done

- Dry-run y real corren sin errores de ejecución contra staging.
- Las 6 invariantes están implementadas y corren en cada checkpoint.
- Existe al menos un `RESUMEN-*.md` con hallazgos triados (bug real o descartado con razón).
- El smoke UI pasa para los 5 roles.
- `limpieza/limpiar.mjs` deja staging sin rastro del club de simulación.
- Ningún secreto commiteado; nada corrió contra producción.
