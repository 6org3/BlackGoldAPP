# CLAUDE.md

Guía para asistentes de IA (y personas) que trabajen en este repositorio.

## Qué es este repo

Black Gold — un ecosistema de club de baloncesto para el club en Sucumbíos (Ecuador). Es una bóveda de Obsidian (documentación del club en `docs/`) más dos aplicaciones web.

- `Dashboard_Premium/` — la app principal. React + Vite (PWA), backend en Supabase. Aquí ocurre el desarrollo activo.
- `blackgold-mcp/` — servidor MCP del proyecto (proceso Node por stdio que se conecta a Supabase y expone herramientas analíticas como `analyze_athlete_pillars`). Consume `packages/analytics-core` para la categoría FEB (ver abajo) y `packages/brain-core` — la **lógica analítica compartida de las tools** (rack, diagnóstico de pilares, readiness; las tools del MCP son wrappers finos sobre esas funciones puras) — y fundamenta sus tools en el **rack documental deportivo** (`packages/brain-core/rack.js` + `knowledge/` + docs deportivos del repo declarados en `knowledge/rack.config.json`, índice BM25 local): tools `consultar_rack`/`listar_rack`, smoke con `npm run rack`. Documentación nueva del deporte → `knowledge/` (ver su README), no hardcodearla en `src/index.js`.
- `blackgold-negocio-mcp/` — servidor MCP hermano, mismo patrón (proceso Node por stdio, `@modelcontextprotocol/sdk`) pero de **negocio** (leads, cobranza, KPIs de dirección, gastos) en vez de analítica deportiva. Detalle de estado en la sección dedicada más abajo.
- `packages/analytics-core/` — **capa de analítica compartida**: baremos científicos, categoría FEB y agregación de pilares/radar, consumidos tanto por `Dashboard_Premium` como por `blackgold-mcp`. No es un paquete npm publicado ni un workspace: ambos lo importan por ruta relativa (ver `packages/analytics-core/README.md`). `Dashboard_Premium/src/lib/baremosEngine.js`, `radarCalc.js` y `src/api/utilsAtletas.js` son shims que reexportan desde aquí — no reintroducir esa lógica en esos archivos.
- `docs/` — notas de metodología y estrategia del club (entrenamiento, táctica, mentalidad, corporativo, comunicaciones, redes sociales) más los documentos de estado del proyecto (`evaluacion_ingenieria_producto.md`, `plan_remediacion_seguridad.md`, `pendientes_post_beta.md`). En español.
- `Dashboard_Premium/supabase/migrations/` — migraciones SQL versionadas con la convención de Supabase CLI (`<timestamp>_descripcion.sql`), consolidadas ahí desde julio 2026 (antes vivían sueltas en la raíz del repo y de `Dashboard_Premium/`). 59 archivos a la fecha. Las dos últimas salen de la auditoría pre-producción del 2026-07-29 y **están escritas pero NO aplicadas** (requieren `npx supabase db push`): **v53** (`20260729180000_v53_anon_funciones_catalogos_y_cuota.sql` — `anon` pierde EXECUTE sobre 13 funciones y se cierra el default privilege del baseline que las reabría, `marcar_pagos_vencidos` gana gate de staff y alcance por club, los catálogos compartidos dejan de ser destruibles cross-club, y llega `copiloto_uso` para la cuota del copiloto) y **v52** (`20260729120000_v52_endurecimiento_pre_produccion.sql` — `beca_pct` protegida, `es_owner_activo()`, pagos solo-dueño, `resolver_email_login` sin oráculo de existencia y la tabla `registro_intentos`). Antes de esas dos, aplicadas: **v51** (`20260726120000_v51_gastos_contabilidad_gestion.sql`, tabla `gastos` para `blackgold-negocio-mcp` — aplicada a producción el 2026-07-27) y **v50** (`20260723120000_v50_padre_ve_sesiones_grupales.sql`), con un parche sin número entre estas dos últimas (`revierte_plantilla_id_duplicado.sql`, revierte un diseño descartado de un PR paralelo). Ver detalle más abajo.

## Estado de seguridad — LOS P0 YA ESTÁN CERRADOS

Si una versión anterior de este documento (o cualquier doc de `docs/plan_remediacion_seguridad.md` / `docs/pendientes_post_beta.md`, ambos con fecha de redacción de principios de julio) describe como **pendiente** la migración a Supabase Auth, RLS real o la purga de contraseñas en texto plano: **eso ya se hizo**. No repetir ese trabajo ni "arreglar" algo que ya está arreglado. Verificado contra los archivos de migración presentes en el repo:

- **v19** (`20260701121100_v19_auth.sql`) — migración a Supabase Auth real (`auth.uid()`), reemplaza el login del lado del cliente basado en `localStorage`.
- **v24** (dos archivos con el mismo número lógico: `20260705224803_v24_misiones_pilar_resistencia_recuperacion.sql` es en realidad de misiones — el de seguridad es `20260707113000_v24_rls_real_auth_uid.sql`) — RLS real por rol/`auth.uid()`, quita el acceso directo de `anon` a las tablas base, agrega el registro público server-side (Edge Function `registro-publico` + RPC `registrar_publico()`).
- **v25** (`20260707140000_v25_drop_contrasena_hash.sql`) — elimina `usuarios.contrasena_hash` (contraseñas de staff en texto plano).
- Después de v24/v25 la seguridad siguió endureciéndose de forma incremental, no como P0 sino como hallazgos puntuales de auditoría: **v29** (aislamiento por club en políticas "staff"), **v40**/**v40b** (el club deja de ser un parámetro confiable del cliente en pagos + cierre de un correo de staff como puerta trasera), **v44** (cierra una fuga cross-club de lectura en `comunicaciones`), **v50** (el padre pasa a ver también las sesiones grupales de su hijo, un hueco de visibilidad — no de escritura — dejado abierto a propósito por v24).
- **Corrección (auditoría 2026-07-29):** versiones anteriores de este documento describían `pagos_staff` como una "tabla de pagos al staff" sin aislamiento por club. Eso es falso y llevaba tiempo despistando: **no existe ninguna tabla `pagos_staff`**. Es el nombre de una *política* sobre `pagos`, y está scopeada por club desde v29. No hay nada pendiente ahí.

**Paridad local↔producción: verificada el 2026-07-29** con `npx supabase migration list` — las 57 migraciones existentes están aplicadas en producción. La duda que este documento dejaba abierta al respecto queda cerrada; v52 es la única escrita y sin aplicar.

### Auditoría pre-producción del 2026-07-29 — lo que sigue abierto

Auditoría completa (RLS, Edge Functions, MCPs, secretos, despliegue) con verificación adversarial de cada hallazgo. Resultado en el PR #143. **Lo cerrado en código está en ese PR; lo que sigue abierto y NO puede hacerse desde el repositorio:**

1. **Rotar credenciales expuestas** (solo el dueño, dashboard de Supabase). El repo es público y tuvo trackeados el password del superadmin global, el del owner de NLB y el algoritmo que genera el de todo el staff sembrado. El código ya está limpio, pero los valores siguen en el historial: hay que rotar, no basta con borrar. Igual la anon key legacy expuesta desde `da5f5c1` — usar el formato `sb_publishable_*` en `.env.local` **no** prueba que las legacy estén desactivadas, siguen vivas hasta desactivarlas explícitamente.
2. **Desplegar `generar-misiones-ia`** con `npm run functions:deploy` (era la única Edge Function sin autenticación).
3. **Desplegar `registro-publico`** con `npm run functions:deploy:registro` — **solo DESPUÉS de aplicar v52** (ya aplicada, ver abajo). El control de abuso anota cada intento en `registro_intentos` y es *fail-closed*: si esa tabla no existe, la función responde 503 a **todo** registro. Migración primero, función después.

**v52 y v53 YA ESTÁN APLICADAS** en producción — verificado el 2026-07-29 con `npx supabase migration list` (ambas aparecen con versión remota). Si otra parte de este documento dice que están "escritas pero no aplicadas", está desactualizada. La única sin aplicar es **v54**.

Los P2 se abordaron en el PR #146 (v53 + fuentes propias + paginación de PostgREST + guardarraíles). Lo que **queda abierto** de ese lote:

- **Gate de cuota del copiloto** en la Edge Function: v53 trae `copiloto_uso` y `consumir_cuota_copiloto`, falta invocarla desde `copiloto/index.ts`.
- **Mensajes internos de Postgres/GoTrue** devueltos al cliente en `brain-gateway`, `crear-acceso-usuario` y `purgar-usuario-rechazado` (`copiloto` ya lo hace bien y sirve de patrón). Y `crear-acceso-usuario` no comprueba el `estado` del target.
- **`npm audit fix`** sin `--force` en `Dashboard_Premium` y `blackgold-mcp`, y `zod` sin declarar en `blackgold-mcp/package.json`.
- **CSP a enforcing**: ya no quedan terceros, así que puede salir de `Report-Only`. Debe ir en un PR aparte con verificación manual en el preview. Ojo: quitar `'unsafe-inline'` de `style-src` NO es viable — hay 1.504 atributos `style=` y los nonces no aplican a atributos; es el techo de la arquitectura, no deuda.

Descartado tras verificación adversarial, **no volver a levantarlo**: la allowlist de CORS (sin `Allow-Credentials` y con la sesión en el header `Authorization` no concede nada, y es el único cambio capaz de tumbar todos los previews), `precio_servicio_atleta` (v27 ya revoca `anon`), `p_registrado_por` (la RLS lo ata desde v27), `club_id: null` en el MCP (es la semántica de catálogo global) y la CVE de `react-router` (aplica al modo RSC; esta app es una SPA con `BrowserRouter`).

**P1-6 (control de abuso y rollback del registro público) ya está cerrado en código** — PR #145: límite por IP (5/hora, cuenta todo intento) y tope por club (20/día, solo altas efectivas más las peticiones en vuelo) sobre `registro_intentos`, compensación del alta cuando `admin.createUser` falla, y captcha Turnstile verificado server-side pero **inerte** hasta que se configuren `TURNSTILE_SECRET_KEY` (Supabase → Edge Functions → Secrets) y `VITE_TURNSTILE_SITE_KEY` (Vercel). Los umbrales se ajustan sin redesplegar con `REGISTRO_LIMITE_IP_HORA` y `REGISTRO_LIMITE_CLUB_DIA`.

## Stack técnico (Dashboard_Premium)

Versiones reales de `Dashboard_Premium/package.json` (no asumir versiones anteriores por experiencia previa con el repo):

- **React** 19.2.6 + **React DOM** 19.2.6, **React Router DOM** 7.18.0.
- **Vite** 8.0.12 (`@vitejs/plugin-react` 6.0.1), **vite-plugin-pwa** 1.3.0 (PWA real, no solo manifest declarado).
- **Tailwind CSS** 4.3.1 vía `@tailwindcss/vite` (sintaxis `@theme`, sin `tailwind.config.js` clásico — tokens en `src/styles/tokens.css`).
- **Supabase JS** (`@supabase/supabase-js`) 2.108.2. Backend Postgres + Auth + RLS, accedido a través de `src/api/*Service.js`.
- **Framer Motion** 12.41.0, **Recharts** 3.8.1 para gráficos (radar, histórico), **lucide-react** para íconos.
- Exportables: **jsPDF** 4.2.1, **xlsx** (SheetJS) 0.18.5, **html2canvas-pro** 2.2.3 (fork de html2canvas, no el paquete original).
- **canvas-confetti** 1.9.4 para micro-interacciones (arcade/XP).
- Testing: **Vitest** 4.1.9 (`npm run test` / `npm run test:watch`), **Cypress** 15.17.0 (e2e).
- Desplegado en Vercel (`vercel.json`), con configuración de monorepo (`sourceFilesOutsideRootDirectory`) necesaria porque `Dashboard_Premium` importa `packages/*` fuera de su propia raíz — sin eso el build no compila.

## Tests

- **Vitest**: 21 archivos de spec bajo `Dashboard_Premium/src/` (`**/*.test.js`), sobre todo en `src/lib/` (motor de baremos, radar, readiness, XP, taxonomía, tendencias, clasificador de contexto) y `src/components/` (incl. `src/components/arcade/`). Correr con `npm run test` (una vez) o `npm run test:watch`.
- **Cypress**: 14 specs e2e bajo `Dashboard_Premium/cypress/e2e/*.cy.js` (login/roles, asistencia por grupo, arcade, consola de dueño, membresía, catálogo de ejercicios, QA visual/mobile). Usan cuentas QA fijas (`cypress.env.json`, gitignored — plantilla en `cypress.env.json.example`). No confundir con `cypress/screenshots/`, que solo contiene capturas generadas, no specs.
- Vitest corre automático en CI en cada push/PR a `main` (ver sección siguiente); Cypress sigue siendo manual — no está en el pipeline.

## CI/CD

`.github/workflows/ci.yml` (job `dashboard`, dispara en push/PR a `main` + `workflow_dispatch`) corre dentro de `Dashboard_Premium/`: `npm ci` + lint (**informativo**, `continue-on-error: true` — el repo arrastra **70** problemas de lint preexistentes, no bloquea hasta limpiarlos. Ese número bajó de 87 al cubrir en `eslint.config.js` los globals que faltaban —`vite.config.js` y `simulacion/` como Node, `simulacion/ui/` como Cypress— e ignorar `dev-dist/`; y el "~163" que llegó a decir este documento contaba de más, porque incluía los 76 errores de ese `dev-dist/`, un artefacto local gitignored que CI nunca ve) + `npm test` (Vitest, **bloqueante**) + `npm run build` (**bloqueante**), con `VITE_SUPABASE_*` de relleno (no son secretos reales; los specs que necesitan Supabase ya mockean el cliente). **Cypress queda fuera a propósito** (documentado en el propio yml): las 14 specs e2e necesitan una base Supabase real + credenciales y son mucho más lentas — el siguiente paso natural es un proyecto Supabase de pruebas dedicado. `blackgold-mcp/` y `blackgold-negocio-mcp/` tampoco tienen job: ninguno de los dos define script de test en su `package.json`.

Lo que además existe, según `CONTRIBUTING.md`:

- `main` está protegida (force-push y borrado bloqueados, PR obligatorio con 0 approvals requeridos, conversaciones deben resolverse) y auto-despliega a producción vía Vercel al mergear.
- Cada PR genera además un preview deployment de Vercel.
- `enforce_admins` está desactivado a propósito (guardarraíl gradual, no estricto): un admin todavía puede pushear directo a `main` sin pasar por PR ni CI.

**Consecuencia práctica:** el CI ya bloquea tests/build rotos, pero no cubre Cypress ni bloquea por lint — correr los specs de Cypress relevantes a mano si el cambio toca flujos críticos, no asumir que "pasó CI" cubre el E2E.

## Convenciones

- La capa de API vive en `src/api/`, un `*Service.js` por dominio: 28 archivos hoy (`atletasService`, `authService`, `pagosService`, `comunicacionesService`, `eventosService`, `gruposService`, `misionesService`, `asistenciaService`, `readinessService`, `xpService`, `retencionService`, `screeningService`, `clubesService`, `coachesService`, `padreService`, `registroPublicoService`, `solicitudesService`, `ocupacionService`, `sesionesService`/`sesionesEntrenamientoService`, `evaluacionesService`, `observacionesService`, `notasCoachService`, `recompensasService`, `encuestasHabitosService`, `accesosService`, `brainService`, `copilotoService`, `supabaseClient`/`tablas`/`utilsAtletas` como utilidades transversales). Los componentes/páginas llaman a estos servicios, no a Supabase directamente.
- El texto de la UI y el lenguaje de dominio están en **español** (categoría, atleta, grupo, convocatoria). Mantenerlo así para los textos de cara al producto.
- La categoría del atleta se deriva de la fecha de nacimiento con `calcularCategoriaFEB()` (real en `packages/analytics-core/categoriaFEB.js`, reexportada por el shim `src/api/utilsAtletas.js`; Premini Sub-9 … Mayores). Existe un gemelo en SQL, `calcular_categoria_feb()` (migración v18) — mantener sincronizados los tres (JS compartido, shim, SQL) si cambian los rangos.
- Roles: `superadmin`, `owner`, `coach`, `atleta`, `padre`. El ruteo por rol vive en `Dashboard_Premium/src/main.jsx` (`react-router-dom` 7, `PrivateRoute` con `roles={[...]}` por ruta: `/dashboard`, `/padre`, `/coach`, `/club`, `/sistema`, `/atleta`, `/admin/atletas`, `/admin/misiones`, etc.). Páginas por rol en `src/pages/*Page.jsx` (p. ej. `OwnerKPIsPage`, `CoachHomePage`, `AdminPagosPage`, `AdminGruposPage`, `AdminComunicacionesPage`, `AdminEventosPage`, `AdminSesionesPage`, `AdminPlanificacionPage`, `AdminAsistenciaPage`, `AdminAtletasPage`, `AdminEquipoPage`, `SistemaHomePage`, `CompararPruebasPage`, `RegistroPage`); nota conocida y sin resolver: la convención `*Page.jsx` mezcla wrappers delgados con páginas-implementación completas, no unificada aún a propósito (ver `docs/plan_remediacion_seguridad.md`).
- Las migraciones de base de datos son aditivas (`ALTER TABLE ... IF NOT EXISTS`). Agregar un nuevo archivo en `Dashboard_Premium/supabase/migrations/` con timestamp nuevo (`npx supabase migration new <descripcion>` genera el nombre correcto) en lugar de editar uno ya aplicado. Aplicar con `npx supabase db push` (proyecto ya vinculado, ver `supabase/.temp/project-ref`) en vez de pegar el SQL a mano en el editor web — así el historial de migraciones aplicadas queda registrado server-side.
- Desde v27 (módulo de pagos) el rango v28→v50 fue sobre todo: endurecimiento de pagos y multi-club (v28/v28b generación de pagos del mes, v29/v40/v40b/v44 aislamiento por club, v30 auditoría de pagos), catálogo de clubes/membresías administradas por superadmin y solicitudes de registro (v33-v39), y una cola de fixes puntuales más recientes (v42-v50: mensualidad sin fallback de 30 días, octavo pilar de resistencia, purga de usuarios rechazados, media cuota en alta día 15, origen automático de readiness, becas, ids de ejercicios en sesiones programadas, padre viendo sesiones grupales). Para el detalle de cualquier migración puntual, el encabezado en comentario del propio archivo `.sql` documenta el porqué (varias citan auditorías adversariales o decisiones explícitas del dueño con fecha).
- El esquema real de las tablas base está capturado en `supabase/migrations/00000000000000_baseline.sql` (dump de 2026-07; incluye las 29 tablas y el estado de RLS previo a v24). Si el esquema en producción vuelve a divergir por cambios a mano, regenerarlo con `npx supabase db dump --schema public`.

## MCPs del proyecto (`blackgold-mcp` + `blackgold-negocio-mcp`)

`blackgold-mcp` expone **18 tools** (`server.tool(...)` en `blackgold-mcp/src/index.js`): `analyze_athlete_pillars`, `generate_custom_mission`, `suggest_next_test`, `analyze_athlete_readiness`, `generar_catalogo_misiones`, `insertar_misiones_catalogo`, `insertar_misiones_recuperacion`, `consultar_metodologia_iniciacion`, `consultar_rack`, `listar_rack`, `mapa_conocimiento`, `generar_catalogo_pruebas`, `insertar_pruebas_evaluacion`, `generar_descripciones_pruebas`, `actualizar_descripciones_pruebas`, `auditar_misiones`, `actualizar_misiones`, `eliminar_misiones_basura` — **las 18 de analítica/metodología deportiva** (pilares, misiones, pruebas físicas, rack de conocimiento). Cero tools de negocio ahí a propósito: ese dominio vive en el MCP hermano.

`blackgold-negocio-mcp` (nuevo, **v0.1**) es el hermano de negocio: **8 tools** (`server.tool(...)` en `blackgold-negocio-mcp/src/index.js`) sobre leads, cobranza, KPIs de dirección y gastos, reusando las consultas/reglas ya existentes en `Dashboard_Premium/src/api/*Service.js` (sobre todo `pagosService`, `solicitudesService`, `retencionService`) en vez de inventar cálculos nuevos. **Las 8 tools funcionan hoy** contra el esquema real; `registrar_gasto` y `resumen_gastos` dependen de la tabla `gastos` (migración v51, aplicada a producción el 2026-07-27 y verificada con `npx supabase migration list`). Corre con la `service_role` key (con RLS v24 la `anon` key no lee ni escribe ninguna tabla) — variables solo en `.env` (plantilla en `.env.example`), nunca hardcodeadas ni commiteadas.

Si se necesita que un agente opere sobre algo que ninguno de los dos MCP cubre todavía, no asumir que ya está — construirlo.

## Secretos

- Nunca poner claves en el código. Las credenciales de Supabase vienen de variables de entorno (`VITE_SUPABASE_*`). Los archivos `.env*` están en `.gitignore` — no commitearlos.

## Problemas conocidos / detalles a tener en cuenta

- **El repo ya no vive en OneDrive** (vive en `~/dev/BlackGoldAPP`). Sigue pudiendo aparecer un `index.lock` stale en `.git` cuando git se ejecuta desde herramientas en sandbox; si no hay ningún proceso git corriendo, es seguro borrar ese archivo y reintentar.
- Los scripts operativos de un solo uso viven en `Dashboard_Premium/scripts/` (no en la raíz de `Dashboard_Premium/`), leen credenciales solo de `.env` (nunca hardcodeadas) y varios escriben/borran datos reales — revisar cada uno antes de ejecutarlo, especialmente `limpiar_base_datos.js`.
- `Dashboard_Premium/simulacion/` — motor de simulación de un club "vivo" día a día (altas, asistencia, evaluaciones, misiones/XP, pagos, eventos, comunicaciones) con semilla fija y carga creciente; corre invariantes (categoría FEB, cuadre de pagos, integridad referencial, RLS) tras cada tramo y cierra el ciclo con un smoke de UI en Cypress. Dry-run por defecto, `SIM_REAL=1` para escribir, `SIM_STAGING_URL` como guardarraíl anti-producción. Ver `Dashboard_Premium/simulacion/README.md`.
- El CI (ver sección dedicada arriba) no cubre Cypress ni bloquea por lint: un PR mergeado garantiza que Vitest y el build pasaron, no que los specs E2E lo hicieron.
- **El repositorio es PÚBLICO** (`gh repo view` → `isPrivate: false`) y apunta al proyecto Supabase real. Cualquier literal que entre aquí queda publicado en internet, y entonces borrarlo no basta: hay que rotar la credencial. Los scripts de `scripts/` leen contraseñas de `.env.local`, nunca hardcodeadas — mantenerlo así.
- `blackgold-negocio-mcp` está en v0.1: sus 8 tools funcionan hoy (migración v51 aplicada el 2026-07-27, ver sección dedicada arriba).
- La convención `*Page.jsx` no está unificada (wrappers delgados vs. páginas completas conviven) — cambio de bajo riesgo pendiente, dejado fuera a propósito de refactors anteriores para no ampliar su radio de cambio.

## Documentos de diseño

- `docs/design_system.md` / `docs/design_system_arcade.md` — Black Gold Design System (tokens, componentes, motion, gobernanza). Implementación viva en `Dashboard_Premium/src/styles/tokens.css` (Tailwind v4 `@theme`) y `Dashboard_Premium/src/lib/designTokens.js` (Recharts/Framer/confetti). Demo visual: `docs/design_system_demo.html`. Regla: no introducir hex nuevos en componentes — tokenizar primero.
- `docs/comunicaciones_eventos.md` — diseño de las comunicaciones segmentadas y el módulo de eventos deportivos (convocatorias/RSVP, recordatorios, resultados). Acompaña a la migración v18.
- `docs/pagos_diseno.md` — diseño del módulo de gestión de pagos (catálogo de servicios con tarifas por grupo/categoría FEB/género, transacciones/abonos, comprobantes de transferencia, plantillas WhatsApp). Sección §10 (decisiones de producto) ya resuelta por el dueño el 2026-07-22: sin pasarela de pago activa por ahora (sin RUC), sin moras/recargos, alta a mitad de mes en dos tramos, pagos es solo-owner/co-dueños.
- `docs/evaluacion_ingenieria_producto.md` — evaluación de ingeniería del producto (2026-07-01): arquitectura, seguridad, calidad de código y roadmap P0/P1/P2. **Fecha de redacción anterior a v19/v24/v25/v27+** — leerla como diagnóstico histórico, no como estado actual de los P0 de seguridad (ya cerrados, ver sección dedicada arriba).
- `docs/plan_remediacion_seguridad.md` — plan de remediación fase por fase derivado de la evaluación anterior. Mismo aviso: describe varias fases P0 como "pendiente aplicar/desplegar" con fecha de julio; los archivos de migración correspondientes (v19, v24, v25) ya existen en el repo. Sigue siendo útil para el detalle técnico de cómo se resolvió cada hallazgo.
- `docs/pendientes_post_beta.md` (2026-07-04) — lista de pendientes post-lanzamiento de la beta; varios puntos P0 de seguridad que ahí figuran como abiertos ya se cerraron después (v19/v24/v25). Los puntos P1/P2 de producto y ciencia de los baremos (diferenciación por género, umbrales de movilidad, mapeo categoría→bucket) siguen siendo la referencia vigente para ese trabajo.
- `docs/spec_h1_autonomia_resultados.md` (2026-07-16) — spec de la fase H1: loop autónomo con auditoría por excepción, reporte de resultado al padre, y un agente de conciliación de cobros **read-only** (nunca ejecuta dinero). **Estado: Propuesta — pendiente de decisiones del owner**, no implementado; su prerrequisito H1-D1 exige verificar el estado real de RLS por tabla antes de dar a cualquier agente permiso de escritura.
- `docs/redes_sociales.md` y `docs/estrategia_contenidos_IA.md` — estrategia y calendario de contenidos para redes sociales del club (tono motivacional, no técnico); no tienen relación con el código de `Dashboard_Premium` ni con `blackgold-mcp`.
- `docs/gestion_corporativa.md` — cultura organizacional y estructura de gobierno del club (documento de negocio, no técnico).

## Rack documental deportivo (conocimiento del deporte)

Corpus de ciencia del deporte del club, indexado con BM25 por `packages/brain-core/rackMotor.js` + `packages/brain-core/rack.js` (el motor se movió ahí en el refactor de brain-core; ya no vive en `blackgold-mcp/src/`). Detalle completo (fuentes, inventario de docs, cómo nutrirlo) en [`blackgold-mcp/CLAUDE.md`](blackgold-mcp/CLAUDE.md) y la skill `add-rack-doc`; plan de evolución con disparadores en [`docs/plan_semantico_rack.md`](docs/plan_semantico_rack.md). **Regla dura: el conocimiento del deporte vive en el rack, nunca hardcodeado en `src/index.js`.**

---
Última actualización: 2026-07-29.
