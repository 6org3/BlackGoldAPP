# Evaluación de Ingeniería de Producto — Black Gold

**Fecha:** 2026-07-01
**Alcance revisado:** `Dashboard_Premium/` (app React+Vite/PWA sobre Supabase), `blackgold-mcp/` (servidor MCP), migraciones SQL y `docs/`.
**Estado del repo:** último commit `da5f5c1` (WIP UI), migraciones hasta v18. ~15.700 líneas de fuente, 22 servicios de API, ~35 componentes, ~17 páginas.
**Método:** lectura directa del código y las migraciones. Cada hallazgo cita el archivo donde se observa.

---

## 1. Visión integral

Black Gold es, para el tamaño del equipo que lo construye, un producto **ambicioso y sorprendentemente completo**. No es un CRUD de club: es una plataforma de rendimiento deportivo con evaluación físico-técnica basada en baremos científicos por categoría de edad, gamificación (XP, rangos, misiones, tienda de recompensas), check-in diario de recuperación (*readiness*), portal de padres con reporte por WhatsApp, comunicaciones segmentadas, eventos con convocatoria/RSVP, KPIs para el dueño e integración de IA (Edge Function con Gemini + servidor MCP). Todo eso está efectivamente construido, no solo diseñado.

El producto tiene un **núcleo de dominio fuerte**: el motor de baremos (`src/lib/baremosEngine.js`, 515 líneas) codifica umbrales reales por prueba y categoría (Sub12/Sub15/Sub18/Senior) citando NSCA, FitnessGram y NBA Combine. Esa es la pieza más valiosa y diferenciadora del proyecto, y está bien separada de la UI.

La debilidad dominante es de **seguridad y modelo de confianza**: la autenticación es un esquema propio del lado del cliente, las contraseñas del staff se guardan en claro y las políticas de base de datos son permisivas. Para una base que contiene datos personales de **menores de edad** (nombres, fechas de nacimiento, cédulas, antropometría, contactos de padres, pagos), esto es el riesgo #1 y debe resolverse antes que cualquier funcionalidad nueva.

En una frase: **producto de gran alcance y buen criterio deportivo, montado sobre una base de seguridad e infraestructura de datos que todavía es de prototipo.** El trabajo de aquí en adelante no es construir más, sino **endurecer** lo que ya existe.

### Cuadro de puntuación

| Dimensión | Valoración | Síntesis |
|---|---|---|
| Alcance y ambición de producto | 🟢 Muy alto | Cobertura funcional amplia y coherente por rol. |
| Rigor del dominio (baremos, categorías FEB) | 🟢 Alto | Modelo de scoring con fuentes científicas y por edad. |
| Arquitectura frontend | 🟡 Media | Buena capa de servicios; componentes "dios" y estado global escaso. |
| Capa de datos / backend | 🟠 Media-baja | Esquema parcialmente fuera de control de versiones; RLS permisiva. |
| **Seguridad y autenticación** | 🔴 **Crítica** | Auth cliente-side, contraseñas en claro, sesión falsificable. |
| Calidad de código / mantenibilidad | 🟡 Media | Servicios limpios; duplicación, 35 scripts sueltos, componentes largos. |
| Testing y QA | 🟠 Baja | 3 pruebas e2e mínimas (con evidencia de fallo); sin tests unitarios. |
| Higiene de repositorio / DevEx | 🟠 Media-baja | OneDrive, scripts scratch versionados, migraciones aplicadas a mano. |

Leyenda: 🟢 fortaleza · 🟡 aceptable con deuda · 🟠 requiere atención · 🔴 bloqueante.

---

## 2. Evaluación técnica y de código

### 2.1 Stack y arquitectura

Stack moderno y sensato: React 19, Vite 8, Tailwind 4, React Router 7, Framer Motion, Recharts, PWA (`vite-plugin-pwa`), Supabase como backend, despliegue en Vercel. Buenas decisiones de base.

**Fortaleza — capa de servicios por dominio.** `src/api/*Service.js` está bien organizado: un servicio por dominio (atletas, sesiones, pagos, comunicaciones, eventos, misiones, readiness…). Los componentes llaman a servicios, no a Supabase directamente, tal como establece `CLAUDE.md`. La lógica de dominio vive en `src/lib/` (baremos, radar, reglas de entrenamiento, didáctica, XP). Esta separación es la parte más madura de la arquitectura.

**Deuda — componentes "dios".** Varios archivos concentran demasiada responsabilidad: `AdminAtletas.jsx` (855 líneas), `ModoCanchaModal.jsx` (823), `MisionesPanel.jsx` (648), `EvaluacionModal.jsx` (520). `App.jsx` (~430) mezcla carga de datos, filtrado, orden, paginación, conmutación de vista atleta/staff y varios modales en un solo componente. Son mantenibles hoy, pero cada uno es un punto de fricción creciente.

**Inconsistencia — patrón de páginas.** Conviven dos convenciones: páginas "envoltorio" delgadas (`AdminAtletasPage.jsx`, 28 líneas, que solo montan `Sidebar` + el componente real) y páginas que son implementaciones completas (`PadreDashboard.jsx` 561, `AdminSesiones.jsx` 446). El nombrado `AdminAtletas.jsx` vs `AdminAtletasPage.jsx` es confuso. Elegir una convención reduciría carga cognitiva.

**Rendimiento / escalabilidad.** `fetchTodosLosAtletas` (`atletasService.js`) trae todos los atletas y luego filtra, ordena y pagina **en memoria del cliente** (ver también `App.jsx`). Para decenas o cientos de atletas es correcto; no escala a miles, y hace que el navegador reciba datos de todo el club aunque el coach solo vea una categoría (el filtro por categoría del coach ocurre en JS *después* de recibir los datos).

### 2.2 Seguridad — hallazgo bloqueante (P0)

Este es el punto central de la evaluación. La cadena de decisiones se refuerza entre sí y termina anulando cualquier control de acceso.

**(a) Autenticación propia del lado del cliente.** `AuthContext.jsx` no usa Supabase Auth. Guarda un objeto de sesión como JSON plano en `localStorage` (`bg_session`) **sin token firmado**. Como el rol se lee de ese objeto, cualquiera puede abrir la consola del navegador y escribir `localStorage.bg_session = '{"rol":"superadmin",...}'` para hacerse administrador. **El control de rol es 100% cliente y es falsificable.**

**(b) Contraseñas.** En `authService.js → loginUsuario`:
- Atletas: `password === usuario.cedula` — la contraseña *es* la cédula (semipública).
- Padres: la contraseña es la cédula de un hijo.
- Staff (coach/owner/superadmin): `password === usuario.contrasena_hash`. Pese al nombre de la columna, se compara en igualdad directa contra el texto: **son contraseñas en claro**, sin hash. Las pruebas Cypress lo confirman con credenciales reales (`coach123`, cédula=cédula).

**(c) La `anon key` es pública y da acceso de lectura a `usuarios`.** El login hace `supabase.from('usuarios').select('*')` con la anon key. Esa clave viaja en el bundle del cliente **y** está incrustada en ~11 scripts versionados (`fetch_users.js`, `check_athletes.js`, etc.). En consecuencia, cualquiera puede volcar toda la tabla `usuarios` — incluyendo `contrasena_hash` en claro del owner/superadmin — y tomar el control de cualquier cuenta.

**(d) RLS permisiva.** Las políticas que se pueden inspeccionar (migración v18) son `CREATE POLICY ... FOR ALL USING (true) WITH CHECK (true)` sobre `eventos`, `evento_convocados`, `evento_recordatorios` y `atleta_grupo`. El historial de git incluye *"fix RLS permisivas v18"*. Como no existe contexto de usuario autenticado (`auth.uid()` es nulo con el esquema propio), la RLS **no puede** discriminar por usuario y en la práctica no ofrece protección de fila.

**Impacto combinado:** lectura y escritura arbitraria de toda la base (datos de menores) por cualquier persona que tenga la anon key, más toma de control de cuentas administrativas. Es una exposición seria de datos personales, no solo una mala práctica.

> Esto es común en un MVP que priorizó velocidad, y es totalmente reparable. La corrección estándar: migrar a **Supabase Auth** (JWT real), almacenar contraseñas con hash gestionado por Auth, y reescribir la RLS en función de `auth.uid()` y del rol (claims o tabla de perfiles). Es la inversión de mayor retorno del proyecto.

### 2.3 Datos y backend

- **Esquema parcialmente fuera de control de versiones.** Las migraciones del repo van de v13 a v18 (más `migracion_fase1.sql`, `add_cols.sql`), pero tablas base referidas por el código (`usuarios`, `atletas`, `evaluaciones_pruebas`, `atleta_readiness`, `padres_atletas`, `asistencia`, `pagos`, `misiones`, `recompensas`…) no aparecen en un `CREATE TABLE` versionado. Reconstruir la base desde cero hoy no es posible solo con el repo. Recomendación: exportar el esquema completo (`supabase db dump`) y versionarlo como línea base.
- **Migraciones aplicadas a mano** en el SQL Editor (según `CLAUDE.md`). Funciona, pero es frágil y no reproducible; conviene mover a Supabase CLI / migraciones gestionadas.
- **Lógica duplicada JS↔SQL.** `calcularCategoriaFEB()` (`utilsAtletas.js`) tiene gemelo SQL `calcular_categoria_feb()`. `CLAUDE.md` ya lo marca como riesgo de divergencia. Es un candidato ideal para la "capa de analítica compartida".
- **MCP: la capa compartida aún no existe.** `blackgold-mcp/src/index.js` (165 líneas) no reutiliza `baremosEngine.js`: sus herramientas leen la BD y **arman prompts de texto** ("INSTRUCCIÓN PARA LA IA: …"), delegando todo el análisis al LLM que consume el MCP. No hay duplicación *todavía*, pero tampoco existe el módulo común que plantea `CLAUDE.md`. Si el MCP algún día calcula scores, reimplementará baremos. Extraer un paquete común (p. ej. `packages/analytics-core`) consumido por web y MCP cumpliría el objetivo declarado.
- **Buen patrón en la Edge Function.** `supabase/functions/generar-misiones-ia/index.ts` sí lee `SUPABASE_SERVICE_ROLE_KEY` y `GEMINI_API_KEY` desde `Deno.env` (no hay claves incrustadas). Es el ejemplo a seguir para el resto.

### 2.4 Calidad de código, testing e higiene

- **35 scripts sueltos versionados** en `Dashboard_Premium/` (`check_*.js`, `fetch_*.js`, `test_*.js`, `fix_genders_in_db.js`, `limpiar_base_datos.js`, `migrar_deportistas.js`…). Son utilidades operativas de un solo uso, con anon key incrustada, y algunas **destructivas**, mezcladas con el código de la app. Deberían salir a `scripts/` (ignorado o separado) o eliminarse.
- **Testing mínimo y en rojo.** Hay 3 specs Cypress (22/29/47 líneas) y **capturas versionadas que muestran los tests de roles fallando** (`cypress/screenshots/.../(failed).png` para Atleta, Coach y Padre). No hay framework de test unitario (sin Vitest/Jest), pese a que `baremosEngine`, `radarCalc` y `xpProgress` son lógica pura ideal para pruebas unitarias.
- **Restos de placeholder en producción.** `whatsappReport.js` envía `https://tu-dominio.com/login` (URL de marcador) y calcula la asistencia con un valor "mocked for now" (asume 12 sesiones/mes). Es un bug visible para el padre que recibe el mensaje.
- **Señales de calidad de datos.** `genero || 'Masculino'` por defecto, categorías con nombres inconsistentes (`Sub6` vs `Sub-6` en `App.jsx`) y la existencia de `check_excel_genders.js`/`fix_genders_in_db.js` sugieren un historial de importación desordenado.
- **`window.location.reload()` como refresco** (p. ej. tras editar perfil en `App.jsx`) — recarga completa en vez de refrescar estado; funciona pero es un *smell* de UX/arquitectura.
- **OneDrive.** Según `CLAUDE.md`, la copia de trabajo vive en OneDrive, con vaivén CRLF↔LF y bloqueos de `.git`. Mover el repo fuera de OneDrive elimina una clase entera de problemas.

---

## 3. Evaluación de producto y UX

### 3.1 Cobertura por rol

| Rol | Qué puede hacer hoy | Notas |
|---|---|---|
| **Atleta** | Panel propio (`AthleteLayout`), radar de 7 pilares, misiones gamificadas, check-in diario de readiness, tienda de recompensas, eventos/RSVP, animaciones de subida de nivel, quizzes | Experiencia rica y motivacional. |
| **Coach** | Grid de "tripulación", evaluaciones físicas con baremos, `ModoCanchaModal` (evaluación en cancha), asignador de misiones, planificación de sesiones, asistencia, notas, scouting | Núcleo operativo del día a día. |
| **Owner** | `OwnerKPIsPage`: total de atletas, promedio integral, asistencia semanal, misiones completadas, métrica más débil, desglose por categoría, top-5, pagos | Buena mirada ejecutiva. |
| **Padre** | `PadreDashboard`, progreso del hijo, reporte mensual por WhatsApp | Cierra el círculo con la familia. |
| **Superadmin** | Alcance multi-club (scoping por `club`) | Prevé escalar a más de un club. |

Esta amplitud, cubierta y coherente por rol, es una fortaleza real de producto.

### 3.2 Fortalezas de experiencia

- **Identidad visual fuerte y consistente** (negro/oro, tipografía condensada, *glows*, Framer Motion). El producto se siente premium y con carácter, alineado con la "Mamba Mentality" del club.
- **Gamificación bien pensada.** `xpProgress.js` define una progresión limpia (Rookie → Prospecto → Desarrollo → Élite → Leyenda Mamba). Encaja con la motivación de deportistas jóvenes.
- **Modelo científico como diferenciador.** Que el radar y los rangos salgan de baremos por edad (no de números inventados) es defendible ante padres y federaciones, y es difícil de copiar.
- **Cierre del círculo familiar.** El reporte por WhatsApp y el portal de padres son un acierto de retención en el contexto local.

### 3.3 Riesgos y fricciones de UX

- **Onboarding/seguridad percibida.** Que la contraseña del atleta sea su cédula es cómodo pero frágil y poco privado; cuando se migre a Auth habrá que rediseñar el primer acceso (invitaciones, set-password).
- **Confianza del dato mostrado.** Defaults como género "Masculino" o la asistencia *mocked* del WhatsApp erosionan la confianza si un padre detecta el error. La exactitud visible importa más que una feature más.
- **Estados vacíos y de error.** El patrón es "pantalla en negro" mitigado con filtros defensivos (`.filter(a => a.usuarios)` en `atletasService.js`); conviene estandarizar estados de carga/vacío/error (hay `ErrorBoundary.jsx`, extenderlo).
- **`docs/` como fundamento de producto.** La metodología (táctica, mentalidad, baremos, comunicaciones) está documentada pero varios archivos son muy cortos (15–32 líneas); el diseño de comunicaciones/eventos (249 líneas) sí está maduro. Alinear producto ↔ documento es una ventaja que conviene mantener.

---

## 4. Estrategia y hoja de ruta

Recomendación de fondo: **congelar funcionalidades nuevas hasta cerrar la seguridad.** El proyecto ya entrega mucho valor; el riesgo no está en lo que falta, sino en la base de confianza de lo que ya existe. Prioridad por retorno/riesgo:

### P0 — Bloqueante (hacer antes que nada)

1. **Migrar a Supabase Auth.** Sustituir el login propio por `supabase.auth`, con contraseñas gestionadas y hasheadas por Auth. Reescribir `AuthContext` para usar la sesión/JWT de Supabase en lugar del JSON en `localStorage`.
2. **Reescribir RLS sobre `auth.uid()` y rol.** Políticas por tabla que restrinjan por propiedad, club y rol. Eliminar las `USING (true)`. Verificar que `usuarios` **no** expone `contrasena_hash` (idealmente, eliminar esa columna al migrar a Auth).
3. **Purgar secretos y scripts del repo.** Sacar los ~35 scripts operativos, rotar la anon key si corresponde, y confirmar que ningún `.env*` ni clave quede versionado.

### P1 — Alto (siguientes semanas)

4. **Línea base del esquema versionada** (`supabase db dump`) y adopción de migraciones por CLI en vez de aplicarlas a mano.
5. **Tests de la lógica pura.** Vitest sobre `baremosEngine`, `radarCalc`, `xpProgress`, `utilsAtletas` (y su gemelo SQL). Arreglar o retirar los specs Cypress en rojo.
6. **Quitar placeholders/mocks de producción**: URL real en `whatsappReport.js`, asistencia calculada de verdad, revisar defaults de datos (género, categorías `Sub6`/`Sub-6`).
7. **Sacar el repo de OneDrive** para eliminar el ruido CRLF y los bloqueos de `.git`.

### P2 — Medio (consolidación)

8. **Extraer `analytics-core` compartido** (baremos, pilares, categoría FEB) consumido por la web **y** el MCP — cumpliendo el objetivo declarado en `CLAUDE.md` y eliminando la duplicación JS↔SQL.
9. **Refactor de componentes-dios** (`AdminAtletas`, `ModoCanchaModal`, `MisionesPanel`, `App`) en piezas más pequeñas; unificar la convención `*Page`.
10. **Paginación/filtrado en servidor** en `fetchTodosLosAtletas` cuando el volumen lo justifique.

### Norte de producto

El activo estratégico es el **modelo de evaluación por baremos + gamificación**. Una vez asegurada la base, la diferenciación defendible está en profundizar ahí: histórico longitudinal por atleta, comparativas por categoría, recomendaciones de entrenamiento automáticas (ya iniciadas con la IA), y la capa analítica compartida que permita ofrecer el mismo rigor a la web, al MCP y a futuros clientes (otros clubes vía multi-club, que la arquitectura ya anticipa).

---

## Resumen ejecutivo

Black Gold es un producto de **alcance y criterio deportivo notables** construido con un stack correcto y una capa de servicios limpia, cuyo mayor activo es el motor de baremos científicos. Su mayor riesgo es una **base de seguridad de prototipo**: autenticación cliente-side, contraseñas de staff en claro, sesión falsificable y RLS permisiva sobre datos de menores. La recomendación es clara y de alto retorno: **pausar features, migrar a Supabase Auth + RLS real, y versionar/limpiar la infraestructura de datos.** Hecho eso, el proyecto pasa de "prototipo impresionante" a "producto en el que se puede confiar" — y la inversión ya realizada en producto rinde de verdad.
