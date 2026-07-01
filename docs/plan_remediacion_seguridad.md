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

### Fase 1 (P0) — Migración a Supabase Auth
Esta fase mezcla código (yo) con acciones en el dashboard/CLI de Supabase (el usuario, porque requiere sus credenciales de proyecto).

1. **Usuario:** habilitar Supabase Auth en el proyecto si no lo está (verificar en dashboard).
2. **Yo:** escribir un script de migración (`scripts/migrar_usuarios_a_auth.js`) que, por cada fila de `usuarios`, cree un usuario en `auth.users` vía Admin API (`service_role`), estableciendo una contraseña temporal seguro-aleatoria y guardando el mapeo `usuarios.id ↔ auth.users.id` (columna nueva `auth_user_id` en `usuarios`, vía migración SQL aditiva `supabase_migration_v19_auth.sql`, siguiendo la convención de `CLAUDE.md:27`).
3. **Usuario:** ejecutar ese script contra el proyecto real con `SUPABASE_SERVICE_ROLE_KEY` (no yo, porque implica escritura masiva en producción con datos de menores).
4. **Yo:** reescribir `AuthContext.jsx` para usar `supabase.auth.getSession()` / `onAuthStateChange()` en vez de `localStorage['bg_session']`; el rol se lee de una tabla de perfiles (`usuarios` vía `auth_user_id`) consultada server-side, no de un JSON cacheado sin firmar.
5. **Yo:** reescribir `authService.js` — login por correo/teléfono + contraseña real vía `supabase.auth.signInWithPassword()`. Diseñar el flujo de primer acceso para atletas/padres (hoy la contraseña es la cédula) como invitación + set-password, no como comparación directa.
6. **Yo:** actualizar los ~35 puntos de verificación de rol listados arriba para leer el rol desde la sesión de Supabase Auth (o de un contexto derivado de ella), no desde `localStorage` directo.
7. **Yo:** eliminar la columna `contrasena_hash` de `usuarios` en la misma migración v19, una vez confirmado que Auth gestiona las contraseñas.

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
1. **Usuario:** ejecutar `supabase db dump --schema public -f supabase/migrations/00000000000000_baseline.sql` (requiere login de su CLI) para capturar el estado real de las tablas base que hoy no están versionadas.
2. **Yo:** una vez tenga ese dump, consolidar `add_cols.sql`, `fix_rls.sql` (recuperar su contenido real, hoy corrupto), `migracion_fase1.sql`, `poblar_atleta_grupo.sql` y los `supabase_migration_v13..v20*.sql` sueltos dentro de `Dashboard_Premium/supabase/migrations/`, crear `supabase/config.toml`, y documentar en `CLAUDE.md` el flujo `supabase db push`/`db pull` reemplazando "aplicar a mano en el SQL Editor".

### Fase 5 (P1) — Tests de la lógica pura
1. **Yo:** instalar Vitest, escribir tests para `src/lib/baremosEngine.js`, `radarCalc`, `xpProgress.js`, y `utilsAtletas.js::calcularCategoriaFEB()` (incluyendo casos límite de cada categoría FEB, comparándolos contra su gemelo SQL `calcular_categoria_feb()` para detectar divergencia).
2. **Yo:** revisar los 3 specs Cypress en rojo (capturas `(failed).png` para Atleta/Coach/Padre) — cada uno probablemente falla porque sus credenciales fijas ya no servirán tras la Fase 1; hay que reescribirlos contra el nuevo flujo de Auth, no solo "arreglarlos" contra el esquema viejo.

### Fase 6 (P1) — Quitar placeholders de producción
1. **Yo:** `whatsappReport.js` — reemplazar la URL `https://tu-dominio.com/login` por el dominio real de producción, y calcular asistencia real en vez del valor "mocked for now" (asume 12 sesiones/mes).
2. **Yo:** revisar defaults de datos (`genero || 'Masculino'`, inconsistencia `Sub6` vs `Sub-6` en `App.jsx`) y normalizar contra el catálogo real de categorías FEB.

### Fase 7 (P2) — `analytics-core` compartido
1. **Yo:** extraer `baremosEngine.js`, la lógica de pilares/radar y `calcularCategoriaFEB()` a un paquete común (p. ej. `packages/analytics-core`) consumido tanto por `Dashboard_Premium` como por `blackgold-mcp`, cumpliendo el objetivo que ya declara `CLAUDE.md:10`.

### Fase 8 (P2) — Refactor de componentes "dios"
1. **Yo:** dividir `AdminAtletas.jsx` (855 líneas), `ModoCanchaModal.jsx` (823), `MisionesPanel.jsx` (648), `App.jsx` (~430) en piezas más chicas; unificar la convención `*Page.jsx` (hoy conviven wrappers delgados y páginas-implementación completas).
2. **Yo:** mover paginación/filtrado de `fetchTodosLosAtletas` (`atletasService.js`) al servidor cuando el volumen de atletas lo justifique.

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
