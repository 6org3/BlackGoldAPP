# Plan de Remediación — Black Gold APP

**Fecha:** 2026-07-01
**Basado en:** [`docs/evaluacion_ingenieria_producto.md`](./evaluacion_ingenieria_producto.md)
**Alcance:** ejecutar el roadmap completo P0 (bloqueante) + P1 (alto) + P2 (medio) de la evaluación.
**Método:** este plan se apoya en una investigación de código en vivo (no solo en la evaluación) para citar archivos y líneas exactas.

---

## Contexto

La evaluación de ingeniería (2026-07-01) identificó que Black Gold, aunque funcionalmente muy completo, está construido sobre una **base de seguridad de prototipo**: autenticación 100% del lado del cliente, contraseñas de staff en texto plano, sesión falsificable, y políticas RLS permisivas — todo esto sobre datos personales de **menores de edad** (nombres, cédulas, fechas de nacimiento, contactos de padres). El propio informe recomienda congelar features nuevas hasta cerrar esto. Este documento traduce esa recomendación en un plan ejecutable, fase por fase, con los archivos exactos a tocar.

**Principio de secuenciación:** el bloque P0 no es una sola tarea, son tres que se refuerzan entre sí (auth propia + contraseñas en claro + RLS permisiva). Deben resolverse **en conjunto y en orden**, porque activar RLS real antes de tener `auth.uid()` real rompería la app (así lo dice explícitamente el comentario en `supabase_migration_v18_comunicaciones_eventos.sql:287-292`), y migrar a Supabase Auth sin RLS real deja el hueco de la anon key abierto igual.

---

## Hallazgos consolidados (verificados en código, no solo en la evaluación)

### Autenticación y sesión
- `Dashboard_Premium/src/AuthContext.jsx:14-16,50` — sesión guardada como JSON plano sin firmar en `localStorage['bg_session']`; se restaura y se confía en el rol cacheado (línea 17) antes de cualquier revalidación async.
- `Dashboard_Premium/src/api/authService.js:38-39` — atleta: `password === usuario.cedula`.
- `authService.js:40-49` — padre: contraseña = cédula de un hijo (vía `padres_atletas` → `atletas` → `usuarios.cedula`).
- `authService.js:51-53` — staff: `password === usuario.contrasena_hash` (comparación directa, sin hash pese al nombre de columna).
- Búsqueda exhaustiva de `bcrypt`/`crypto.createHash`/`argon2` en el repo: **cero resultados**. No hay ni siquiera código muerto de hashing.
- `supabase.auth.*` no se usa en ningún punto del código fuente (solo aparece, irrelevantemente, en el bundle minificado de `dist/`).
- **~35 puntos de verificación de rol client-side** que habrá que revisar al migrar (lista completa recopilada por el agente de exploración): `main.jsx:32-108` (`PrivateRoute`), `Sidebar.jsx:27,75-169`, `App.jsx:47,85,150,168,195,200,233`, `AdminAtletas.jsx:168,207,468`, `AdminPlanificacion.jsx:220`, `AtletaCard.jsx:126,288`, `EvaluacionModal.jsx:38,294,307`, `Login.jsx:25`, `ModoCanchaModal.jsx:183`, `api/atletasService.js:28,151`, `api/authService.js:38,40,63`, `api/misionesService.js:126-130`, más los ~7 `pages/*Page.jsx` que dependen de `PrivateRoute`.

### RLS y migraciones
- Único lugar con `CREATE POLICY` en todo el repo: `supabase_migration_v18_comunicaciones_eventos.sql:299-309`, cuatro políticas (`eventos`, `evento_convocados`, `evento_recordatorios`, `atleta_grupo`), todas `FOR ALL USING (true) WITH CHECK (true)`.
- El propio archivo lo justifica en un comentario (líneas 287-292): como la app no usa Supabase Auth, `auth.uid()` es `NULL`, así que cualquier política real bloquearía toda la app — por eso se optó por RLS permisiva "temporalmente".
- Tablas base (`usuarios`, `atletas`, `evaluaciones_pruebas`, `padres_atletas`, `asistencia`, `pagos`, `misiones`, `recompensas`) **no tienen `CREATE TABLE` versionado** en el repo; su estado de RLS es literalmente desconocido desde el código — solo se puede auditar en el dashboard de Supabase.
- Migraciones versionadas confirmadas (orden real): `Dashboard_Premium/supabase_migration_v13.sql` → `v14_cleanup.sql` → `v15_ai_integration.sql` → `v16_carga_sueno.sql` → `supabase_migration_v17_misiones_pilares.sql` (raíz del repo) → `supabase_migration_v18_comunicaciones_eventos.sql` (raíz). Más sueltos sin versión: `add_cols.sql`, `fix_rls.sql` (encoding corrupto, ilegible), `migracion_fase1.sql` (encoding corrupto), `poblar_atleta_grupo.sql`, `seed_massive.sql`, `seed_op_histograms.sql`.
- Ya existe un proyecto Supabase CLI parcialmente enlazado: `Dashboard_Premium/supabase/.temp/project-ref` existe, `Dashboard_Premium/supabase/migrations/` ya tiene 2 archivos (`add_ai_flag_to_misiones.sql`, `setup_webhook_ia.sql`), pero **falta `config.toml`**.
- `blackgold-mcp/src/index.js:9-17` usa `SUPABASE_ANON_KEY` (no service role) — no escala privilegios, queda sujeto a las mismas políticas que el frontend.
- `supabase/functions/generar-misiones-ia/index.ts:33-35,73-74` sí lee `SUPABASE_SERVICE_ROLE_KEY` y `GEMINI_API_KEY` de `Deno.env` — es el patrón correcto a imitar.

### Secretos y scripts sueltos
- **31 scripts operativos están trackeados en git** en `Dashboard_Premium/` (confirmado con `git ls-files`): `check_athletes.js`, `check_columns.js`, `check_excel_genders.js`, `check_raw_user.js`, `check_schema.js`, `check_schema_scratch.js`, `fetch_atletas.js`, `fetch_names.js`, `fetch_users.js`, `find_mission_component.js`, `find_pilares.js`, `find_sql_files.js`, `fix_genders_in_db.js`, `fix_rls.sql`, `generate_baremos_sql.js`, `generate_histogram_seed.js`, `generate_seed.js`, `get_check_constraint.js`, `get_credentials.js`, `get_existing_misiones.js`, `get_openapi.js`, `limpiar_base_datos.js`, `migrar_deportistas.js`, `search_misiones_schema.js`, `search_mission_tables.js`, `simulate.js`, `temp_migrate.js`, `test_ai_missions.js`, `test_assigned_misiones.js`, `test_db.js`, `test_fetch.js`, `test_misiones_insertion.js`.
- De esos, al menos 3 tienen la anon key **hardcodeada en el código fuente** (no en env): `check_athletes.js`, `check_raw_user.js`, `fetch_users.js`.
- `fetch_users.js` es el más grave: selecciona explícitamente `nombre,rol,correo,telefono,cedula,contrasena_hash` — un volcado completo de credenciales de todos los roles, ejecutable por cualquiera que tenga la anon key (que ya está en el bundle público).
- Buena noticia verificada: **ningún `.env*` está trackeado en git** (`git ls-files | grep env` → vacío) y `.gitignore` sí los cubre correctamente en ambos niveles (raíz y `Dashboard_Premium/`). El riesgo de secretos está concentrado en los scripts, no en archivos de entorno commiteados.

### Estado del repo / OneDrive
- **Dato que corrige a la evaluación:** el repo ya **no** vive en OneDrive — está en `C:\Users\jorge\dev\BlackGoldAPP`, es un repo git real (`git rev-parse` confirma), con `da5f5c1` como último commit. `CLAUDE.md:35` todavía dice "el repo vive dentro de OneDrive", lo cual está desactualizado. **El punto P1-7 del roadmap original ya está resuelto de facto**; solo falta actualizar la nota en `CLAUDE.md`.

---

## Fases de ejecución

### Fase 0 — Higiene de secretos (sin riesgo, sin tocar Supabase en vivo)
Puedo ejecutarla directamente, es local y reversible por git.

1. Mover los 31 scripts sueltos de `Dashboard_Premium/` a una carpeta `scripts/` fuera del build de Vite (o a `.tools/`, ignorada en el bundle), separando:
   - **Descartables** (ya cumplieron su propósito puntual: `check_*`, `fetch_*`, `test_*`, `find_*`, `search_*`, `get_openapi.js`, `simulate.js`) → eliminar del repo tras confirmar con el usuario que no se necesitan más.
   - **Reutilizables** (`fix_genders_in_db.js`, `migrar_deportistas.js`, `limpiar_base_datos.js`, `temp_migrate.js`, `generate_seed.js`, `generate_baremos_sql.js`, `generate_histogram_seed.js`, `poblar_atleta_grupo.sql`) → mover a `scripts/` con lectura de credenciales exclusivamente desde variables de entorno, nunca hardcodeadas.
2. Eliminar la anon key hardcodeada de `check_athletes.js`, `check_raw_user.js`, `fetch_users.js` antes de decidir si se conservan o se borran.
3. Actualizar `CLAUDE.md:35` para reflejar que el repo ya no está en OneDrive.
4. **Acción del usuario (fuera de mi alcance):** rotar la anon key en el dashboard de Supabase, ya que estuvo expuesta en texto plano en el repo y en el bundle público — rotarla no depende del código, depende de su panel de Supabase.

### Fase 1 (P0) — Migración a Supabase Auth ✅ código + datos completos, pendiente desplegar

1. ✅ **Usuario:** Supabase Auth habilitado, "Confirm email" desactivado.
2. ✅ **Yo:** `supabase_migration_v19_auth.sql` (columna `usuarios.auth_user_id` + función `resolver_email_login()`), aplicada por el usuario.
3. ✅ **Yo:** `AuthContext.jsx` reescrito sobre `supabase.auth.getSession()`/`onAuthStateChange()` — ya no existe `localStorage['bg_session']`. Verificado en local: la sesión persiste al refrescar la página, y forjar `bg_session` en localStorage ya no tiene ningún efecto (el ataque original del hallazgo P0 ya no funciona).
4. ✅ **Yo:** `authService.js` reescrito — `loginUsuario()` resuelve el identificador (correo/teléfono/cédula) a un email vía RPC y llama a `supabase.auth.signInWithPassword()`.
5. ✅ **Yo:** `registroPublicoService.js` actualizado para crear también la cuenta de Auth en el registro público (con email sintético si no hay correo real).
6. ✅ Los ~35 puntos de verificación de rol **no necesitaron cambios** — siguen leyendo `user.rol` del mismo objeto de contexto.
7. ✅ **Usuario:** corrió `scripts/migrar_usuarios_a_auth.js` contra producción — 819 migrados, 1 omitido (padre sin hijos vinculados, sin contraseña resoluble), 0 fallidos. Login probado y confirmado con una cuenta de staff real.
8. ⬜ **Pendiente:** eliminar la columna `contrasena_hash` de `usuarios` (dejarla para cuando se confirme que ningún flujo la sigue leyendo — hoy ya no la usa el código, pero conviene una migración v20 aparte en vez de mezclarla con RLS).
9. ⬜ **Pendiente:** desplegar este código a producción (Vercel) — no se ha hecho todavía; el trabajo hasta ahora fue solo local + base de datos real.

### Fase 2 (P0) — RLS real basada en `auth.uid()` y rol
Depende de que la Fase 1 esté desplegada (si se activa RLS real antes de que `auth.uid()` exista, la app se rompe — confirmado por el propio comentario en v18).

1. **Yo:** diseñar el modelo de autorización: tabla `usuarios` (ya con `auth_user_id`) como fuente de rol/club, y una función `SECURITY DEFINER` (p. ej. `current_user_rol()`, `current_user_club()`) para usar en policies sin recursión.
2. **Yo:** escribir `supabase_migration_v20_rls.sql` reemplazando las 4 políticas permisivas de v18 (`eventos_all`, `convocados_all`, `recordatorios_all`, `atleta_grupo_all`) por políticas por rol/propiedad/club.
3. **Yo:** escribir políticas nuevas para las tablas base sin RLS conocida (`usuarios`, `atletas`, `evaluaciones_pruebas`, `padres_atletas`, `asistencia`, `pagos`, `misiones`, `recompensas`) — esto requiere que el usuario confirme primero el estado actual de RLS de esas tablas en el dashboard, porque el repo no lo documenta.
4. **Usuario:** aplicar la migración en el proyecto real (SQL Editor o CLI) y validar con las cuentas de prueba de cada rol.
5. **Yo:** verificar que `blackgold-mcp` y la Edge Function `generar-misiones-ia` (que usa `service_role`, así que no le afecta RLS) siguen funcionando.

### Fase 3 (P0, cierre) — Confirmación de purga de secretos
1. **Usuario:** confirmar que la anon key fue rotada (Fase 0) y que la key vieja ya no funciona.
2. **Yo:** grep final sobre el repo completo para confirmar cero keys hardcodeadas remanentes.

### Fase 4 (P1) — Línea base de esquema versionada
1. ✅ **Yo:** consolidé `add_cols.sql`, `fix_rls.sql` (recuperado su contenido real desde UTF-16, sintaxis inválida — se conserva solo como registro histórico, no ejecutable), `migracion_fase1.sql` (stub incompleto), `poblar_atleta_grupo.sql` y los `supabase_migration_v13..v19*.sql` sueltos dentro de `Dashboard_Premium/supabase/migrations/` con timestamps de CLI (`npx supabase migration new`-style), preservando el orden reconstruido por commit/dependencias. También moví `seed_massive.sql`/`seed_op_histograms.sql` a `Dashboard_Premium/scripts/` junto a sus generadores.
2. ✅ **Yo:** generé `Dashboard_Premium/supabase/config.toml` con `npx supabase init` (el proyecto ya estaba vinculado vía `supabase/.temp/project-ref`) y actualicé `CLAUDE.md` con el flujo `supabase db push` reemplazando "aplicar a mano en el SQL Editor".
3. ⬜ **Hallazgo nuevo:** `misiones.autor_id` se usa en producción (`misionesService.js` y otros) pero su `ALTER TABLE` real nunca quedó en ningún archivo — solo existe un stub vacío. La línea base real (paso 4) debe capturar su definición exacta.
4. ⬜ **Usuario:** ejecutar `npx supabase db dump --schema public -f supabase/migrations/00000000000000_baseline.sql` (requiere `supabase login` de su CLI) para capturar el estado real de las tablas base que hoy no están versionadas (`usuarios`, `atletas`, `evaluaciones_pruebas`, `padres_atletas`, `asistencia`, `pagos`, `misiones`, `recompensas`…), incluyendo el estado real de RLS en cada una — el repo no lo documenta y hace falta para diseñar la Fase 2.

### Fase 5 (P1) — Tests de la lógica pura
1. ✅ **Yo:** instalé Vitest (`npm run test`) y escribí 83 tests para `baremosEngine.js`, `radarCalc.js`, `xpProgress.js` y `utilsAtletas.js::calcularCategoriaFEB()` (casos límite de cada categoría FEB, verificados contra los umbrales de `calcular_categoria_feb()` en SQL — coinciden, sin divergencia).
2. ✅ **Hallazgo crítico corregido (con aprobación explícita del usuario):** `normalizarValor()` en `baremosEngine.js` buscaba la categoría del atleta con `categoria.includes('Sub12'|'Sub15'|'Sub18'|'Senior')`, pero **ninguna categoría FEB real coincide** (todas llevan guión: "Premini (Sub-9)", "Juvenil (Sub-18)"...), así que **todos los atletas, sin importar su edad, caían al fallback fijo `'Sub15'`**. Se agregó un mapeo explícito `categoriaABucketBaremo()` (mapeo por "techo", documentado en el propio archivo) y se corrigió también `didacticEngine.js::getFaseBiologica()`, que tenía el mismo bug. Pendiente: validar la correspondencia de edades con el cuerpo técnico del club.
3. ✅ **Yo:** revisé los 3 specs Cypress en rojo. La causa real NO era la migración de Auth (el formulario de login no cambió): eran bugs estructurales previos — regex de botón que no coincidía con el texto real ("Desbloquear Poneglyph"), password nunca llenado en 2 de los 3 specs, y una aserción de URL `/cancha` que nunca pudo pasar porque Modo Cancha es un modal, no una ruta (no existe en `main.jsx`). Se corrigieron los selectores (agregado `data-testid="btn-logout"` a los 3 layouts), se movieron las credenciales reales a `cypress.env.json` (gitignored, con `cypress.env.json.example` como plantilla) en vez de dejarlas hardcodeadas en el spec versionado, y se eliminó `core_flows.cy.js` por ser un subconjunto estricto de `qa_flow.cy.js` con los mismos bugs. Verificación end-to-end real (contra Supabase en vivo) pendiente de que el usuario complete `cypress.env.json` con cuentas de prueba.

### Fase 6 (P1) — Quitar placeholders de producción
1. ✅ **Yo:** `whatsappReport.js` — la URL ya no es un placeholder fijo: usa `window.location.origin` (se adapta solo al dominio real donde corra la app, sin necesitar configuración). La asistencia ya no es un valor "mocked" (contaba evaluaciones físicas, un dato completamente distinto): ahora usa `fetchHistorialAtleta()` (tabla `asistencia` real, últimos 30 días). Se corrigió también un bug de mismatch de IDs que la reescritura habría introducido (`atleta.id` es el id de usuario, `atleta.atleta_id` es la fila real de `atletas` que espera `asistencia`).
2. ✅ **Hallazgo más amplio de lo esperado:** la inconsistencia `Sub6`/`Sub-6` no era solo un typo — **ninguna** de las variantes ad-hoc (`Sub6`, `Sub8`, `Sub10`, `Sub12`, `Sub15`, `Sub18`, `Senior`, `Femenino`) usadas en 4 archivos coincide jamás con las 6 categorías FEB reales que devuelve `calcularCategoriaFEB()`. Esto dejaba **funcionalidad rota en producción**, no solo cosmética:
   - `App.jsx:356` — la tarjeta simplificada `MicroCard` (pensada para Premini/Mini) nunca se mostraba para nadie; corregido a `['Premini (Sub-9)', 'Mini (Sub-11)']`.
   - `pages/AdminAsistencia.jsx` — el filtro de categoría en Control de Asistencia devolvía **cero atletas** para cualquier valor que no fuera "Todas"; corregido con las 6 categorías FEB reales.
   - `pages/OwnerKPIsPage.jsx` — el desglose por categoría en el panel de KPIs del dueño mostraba todas las categorías en gris (color por defecto) en vez de sus colores distintivos; corregido.
   - `components/MicroCard.jsx` — mismo problema de color, acotado a Premini/Mini (las únicas categorías que llegan a este componente).
   - `components/Sidebar.jsx` — una lista `categorias` con la misma inconsistencia resultó ser código muerto (nunca se usaba en el JSX); eliminada.
   - `components/AdminMisiones.jsx` (`categoria_objetivo`) se dejó sin tocar: es solo una etiqueta descriptiva al crear una misión, no se compara contra `atleta.categoria` en ningún punto, así que no hay bug funcional ahí — pendiente de decisión del club si quiere alinear esa etiqueta a futuro.
   - `genero || 'Masculino'`: revisado y dejado como está a propósito. Hoy no afecta el cálculo de baremos (ninguna tabla en `BAREMOS` tiene umbrales separados por género todavía — ver `baremosEngine.js`), así que el default no está distorsionando puntuaciones. Sí puede ocultar registros históricos con género nunca capturado (ver `check_excel_genders.js`/`fix_genders_in_db.js`); corregir la *visualización* de esto es una decisión de producto (¿mostrar "Sin dato"? ¿bloquear el guardado sin género?) que no tomé unilateralmente. Recomendado: una pasada de limpieza de datos con esos scripts existentes antes de decidir el tratamiento en UI.

### Fase 7 (P2) — `analytics-core` compartido ✅
1. ✅ **Yo:** creé `packages/analytics-core/` (`baremos.js`, `categoriaFEB.js`, `radar.js`, `index.js`) con la lógica real de baremos, categoría FEB y agregación de pilares/radar. `Dashboard_Premium/src/lib/baremosEngine.js`, `radarCalc.js` y `src/api/utilsAtletas.js` quedaron como shims (`export * from '../../../packages/analytics-core/...'`) para no tocar los ~20 archivos que ya importaban de esas rutas.
2. ✅ **Decisión de diseño:** no se usó un workspace npm real (no había `package.json` raíz; introducir uno y depender de symlinks de `node_modules` para el build de `Dashboard_Premium` en Vercel era un riesgo de despliegue no verificable sin acceso al dashboard de Vercel). En su lugar, ambos consumidores importan el paquete por **ruta relativa** (ES modules planos, sin `package.json` de por medio). Se ajustó `vite.config.js` (`server.fs.allow`) para que el dev server pueda servir archivos fuera de `Dashboard_Premium/`. Verificado: `npm run build`, `npx vitest run` (83/83) y `npm run dev` (HMR conecta, sin errores de resolución) en Dashboard_Premium; `node src/index.js` en blackgold-mcp resuelve el import sin error (falla solo por falta de credenciales Supabase, esperado).
3. ✅ **Hallazgo y fix en `blackgold-mcp`:** la herramienta `analyze_athlete_pillars` hacía `SELECT nombre, categoria_actual, posicion FROM usuarios` — ninguna de esas dos columnas existe ahí (el resto del repo usa `usuarios.categoria` y `atletas.posicion`), así que la consulta fallaba con un error de Postgres en cada invocación (herramienta 100% rota). Corregido: ahora consulta `atletas` (join a `usuarios` por `fecha_nacimiento`/`nombre`) y deriva la categoría real con `calcularCategoriaFEB()` del paquete compartido, en vez de una columna inexistente.

### Fase 8 (P2) — Refactor de componentes "dios" ✅ (parcial)
1. ✅ **Yo (vía workflow multi-agente con doble verificación adversarial por componente):** dividí los 4 componentes en piezas más chicas, preservando comportamiento:
   - `App.jsx`: 393 → 133 líneas. Extraído `hooks/useAppAtletasData.js` (carga/filtro/orden/paginación de atletas) y `components/AppHeader.jsx`, `AppToolbar.jsx`, `AppAthleteGrid.jsx`, `AppAthleteProfileModal.jsx`, `AppSecondaryModals.jsx`.
   - `MisionesPanel.jsx`: 648 → 192 líneas. Extraído `MisionesPanelXPProgressBar.jsx`, `MisionesPanelSesionDelDia.jsx`, `MisionesPanelInteligenciaBlackGold.jsx`, `MisionesPanelListasEstado.jsx`, `MisionesPanelMisionCard.jsx`.
   - `AdminAtletas.jsx`: 855 → 195 líneas. Extraído `useAdminAtletasForm.js`, `useAdminAtletasFiltros.js`, `AdminAtletasHeader/FiltersPanel/FilterSelect/Form/InputField/SelectField/GridCard/ListRow/GrupoNivel/ActionButton.jsx`, `AdminAtletasConstants.js`.
   - `ModoCanchaModal.jsx`: 823 → 490 líneas (la reducción más chica a propósito — es el de mayor riesgo por mutar datos de sesiones/asistencia en vivo). Todo el estado y la lógica de negocio (`handleStartSession`, `handleResumeSession`, `handleSubmitEvaluation`, `handleCerrarClase`, etc.) se quedó intacta en el archivo principal; solo se extrajo el JSX de presentación de cada paso del wizard (`ModoCanchaModalHeader/SesionesActivas/TipoClase/ConfigPilar/Asistencia/GridAtletas/EvaluarAtleta.jsx`) y el ticker de reloj (`useModoCanchaModalClock.js`).
   - **Verificación real (no solo el reporte de los agentes):** `npm run build`, `npx vitest run` (83/83) y `eslint` sobre los 36 archivos tocados/nuevos — quedaron 8 problemas de lint, los 8 confirmados como preexistentes comparando contra `git show HEAD` (no introducidos por el refactor). Además hice diff línea por línea manual del bloque de lógica de negocio de `ModoCanchaModal.jsx` (creación/cierre de sesión, evaluación) y de `AdminAtletas.jsx` (`handleSubmit`/`handleDelete`) contra el original: idénticos salvo espacios en blanco.
   - Limpieza menor aplicada durante la verificación: quité el import `React` sin usar (patrón heredado del archivo original, ya no necesario con el JSX runtime automático) en los 20 archivos nuevos/tocados, y una variable `currentTime` que quedó sin usar tras extraer el hook del reloj (el cálculo real sigue funcionando vía `calcularTiemposSession`/`formatTiempo`, verificado que sí llegan a `ModoCanchaModalSesionesActivas.jsx`).
   - ⬜ **Pendiente:** verificación visual manual en la app real (el agente y yo no tenemos credenciales de Supabase ni cuentas de prueba para hacer QA interactivo) — probar especialmente Modo Cancha (iniciar clase, marcar asistencia, cerrar clase, evaluar atleta) antes de confiar en el refactor en producción.
   - ⬜ **No hecho:** unificar la convención `*Page.jsx` (wrappers delgados vs páginas-implementación completas) — se dejó fuera de esta pasada para no ampliar el radio de cambio ya grande; es un cambio de bajo riesgo pero toca imports de `main.jsx` y se prefirió no mezclarlo con el refactor de los componentes-dios.
2. ⬜ **Evaluado, no implementado:** mover paginación/filtrado de `fetchTodosLosAtletas` (`atletasService.js`) al servidor. Con ~500 atletas de prueba sembrados (no miles), y dado que implementarlo cambia la UX de los filtros (de instantáneo en cliente a queries de servidor con loading states), se trata como una mejora de producto a decidir aparte, no como parte de esta limpieza.

---

## Qué requiere tu acción directa (no lo puedo hacer yo)

- Rotar la anon key en el dashboard de Supabase (Fase 0).
- Confirmar/habilitar Supabase Auth en el proyecto (Fase 1.1).
- Ejecutar el script de migración de usuarios contra la base real con la `service_role` key (Fase 1.3) — no debo tener ni usar esa key.
- Aplicar las migraciones SQL de RLS en el proyecto real y validar con cuentas de prueba (Fase 2.4).
- Ejecutar `supabase db dump` con tu CLI logueado (Fase 4.1) — necesito el resultado para poder versionar el esquema real.

Todo lo demás (código de React, scripts, migraciones SQL como archivos de texto, tests) lo puedo escribir directamente; lo que cambia es que **no puedo aplicarlo yo mismo contra tu proyecto Supabase en producción** sin tus credenciales, y aunque las tuviera, ejecutar cambios de auth/RLS contra datos reales de menores es una acción que te corresponde confirmar y disparar tú.

## Verificación por fase

- **Fase 0:** `git grep` de la anon key debe devolver cero resultados en `Dashboard_Premium/*.js`; build de Vite sigue pasando.
- **Fase 1:** login manual con una cuenta de cada rol usando `supabase.auth.signInWithPassword`; confirmar que `localStorage` ya no contiene `bg_session` con datos falsificables (probar el ataque de la evaluación — escribir un rol falso en localStorage — y confirmar que ya no funciona).
- **Fase 2:** con una cuenta de coach, confirmar que NO puede leer/escribir filas de otro club; con una cuenta de padre, confirmar que solo ve a su(s) hijo(s); repetir el intento de "volcar la tabla `usuarios`" con la anon key y confirmar que RLS lo bloquea.
- **Fase 4-6:** `npm run test` (Vitest) en verde; specs Cypress en verde; revisión visual del reporte de WhatsApp con datos reales.
- **Fase 7-8:** `blackgold-mcp` sigue respondiendo igual tras consumir `analytics-core`; regresión visual de las páginas refactorizadas.

## Orden recomendado para arrancar

1. Fase 0 (hoy mismo, sin riesgo, sin depender de ti salvo la rotación de key).
2. Fase 1 (necesita tu coordinación en el dashboard y la ejecución del script de migración).
3. Fase 2 inmediatamente después de que la Fase 1 esté en producción (no antes — romper esto en el orden equivocado tira la app abajo).
4. Fases 4-8 en paralelo, sin bloquear entre sí, una vez cerrado el P0.
