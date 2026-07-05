# Unificación: Sesiones · Modo Cancha · Evaluación Científica

Documento de diseño (2026-07-04). Origen: revisión de incongruencias reportadas por
el owner del club. Fuente de verdad para la unificación de los módulos de
entrenamiento y evaluación. **Es un documento de diseño: no se ha tocado código de
producción todavía.**

Documentos hermanos:
- `docs/comunicaciones_eventos.md` — eventos/convocatorias (migración v18).
- `docs/evaluacion_ingenieria_producto.md` — evaluación de ingeniería P0/P1/P2.
- `docs/baremos_cientificos.md` — baremos y sus fuentes.

---

## 1. El problema en una frase

Lo que el usuario percibe como "incongruencia" es real: **hoy conviven dos sistemas
paralelos de "sesión" que escriben en tablas distintas y no se comunican**, y **cuatro
vocabularios diferentes** para nombrar lo mismo ("qué se entrena"). La planificación
vive en un módulo y la ejecución + asistencia en otro.

---

## 2. Estado actual (lo que hay hoy)

### 2.1 Dos sistemas de sesión desconectados

| | **Modo Cancha** (`ModoCanchaModal.jsx`) | **Control de Sesiones** (`AdminSesiones.jsx`) |
|---|---|---|
| Tablas | `sesiones_programadas` + `sesiones_entrenamiento` | `sesiones_control` |
| Rol | Ejecución **en vivo, en la cancha** | Planificación / registro |
| Flujo | tipo clase → pilar → **asistencia** → evaluación subjetiva (estrellas) → XP | grupo/atleta → tipo → **ejercicios del catálogo** → objetivo → "¿se logró? Sí/Parcial/No" |
| Tiene | Asistencia, XP, insignias | El **catálogo de ejercicios** y los **grupos** |
| Le falta | No conoce ejercicios ni un plan estructurado | No conoce asistencia ni alimenta evaluación científica |

Son las dos mitades de un mismo proceso. El plan y los ejercicios están en un lado; la
asistencia y la evaluación en vivo en el otro.

### 2.2 Cuatro vocabularios para "qué se entrena"

- `ModoCancha` → `OBJETIVOS_CLASE`: *Físico-Fuerza, Físico-Explosividad,
  Físico-Velocidad/Agilidad, Físico-Resistencia, Eficiencia Táctica, Resiliencia
  Psicológica, Liderazgo y Comunicación*.
- `AdminSesiones` → `TIPOS`: *Técnico, Físico, Táctico, Evaluación, Recuperación*.
- `EvaluacionModal` → `OBJETIVOS`: *fuerza, explosividad, movilidad, tiro, agilidad,
  táctica, resiliencia, recuperación (Carga/Sueño)*.
- `analytics-core/baremos.js` → pilares **fisico / tecnico / mental**, con sub-pilares
  *explosividad, fuerza, movilidad, tiro, agilidad, tactica, resiliencia*
  (+ `recuperacion`, `composicion_corporal`, fuera del radar).

Cuatro listas hardcodeadas que nombran el mismo dominio de forma distinta. **Este es el
origen técnico de la sensación de incongruencia.**

### 2.3 Dos catálogos de ejercicios con nombres espejo

Trampa de mantenimiento real:

- `ejercicios_catalogo` — ejercicios de **entrenamiento** (`tipo`, `grupos_recomendados`,
  `descripcion`). Lo consume `AdminSesiones` vía `sesionesService.fetchEjercicios`.
- `catalogo_ejercicios` — pruebas de **evaluación** (`thresholds`, `baremo_key`, `pilar`,
  `sub_pilar`, `tren`, `invertido`, `inputs_requeridos`). Lo consume `EvaluacionModal`.

Los nombres son casi idénticos e invertidos (`ejercicios_catalogo` vs
`catalogo_ejercicios`), lo que garantiza confusión futura.

**Estado (2026-07-05):** son **dominios distintos, NO duplicados** — no se fusionan. Para
matar la trampa del nombre espejo a nivel de código se centralizaron los literales en
`src/api/tablas.js` (`TABLA_PRUEBAS_EVALUACION` = `catalogo_ejercicios`,
`TABLA_EJERCICIOS_ENTRENAMIENTO` = `ejercicios_catalogo`), consumidos por EvaluacionModal,
NuevaPruebaModal y sesionesService. **Pendiente (opt-in):** renombrar la tabla física en
producción para eliminar el espejo requiere una migración + coordinación de deploy (RLS y
scripts que la referencian) — no hecho por su riesgo en datos reales.

### 2.4 Tres caminos que otorgan XP / mueven stats

1. `ModoCanchaModal.handleCerrarClase` — +XP base por tipo de clase + bonus al pilar.
2. `ModoCanchaModal.handleSubmitEvaluation` — XP por estrellas + insignias, sube
   `resiliencia_psicologica` / `eficiencia_tactica`.
3. `sesionesService.evaluarSesion` — +XP si `se_logro` es Sí/Parcial.
4. `evaluacionesService.recalcularOverall` — recalcula overall/rango desde
   `evaluaciones_pruebas` y dispara misiones (Edge Function).

Cuatro reglas de puntuación distintas, no unificadas, fáciles de descuadrar entre sí.

### 2.5 La asistencia es un *hack* de string

Modo Cancha no usa una tabla de asistencia: infiere quién asistió por la **presencia de
filas** en `sesiones_entrenamiento` con la nota `[MODO_CANCHA: <id>]`, y marca la sesión
"en curso" con `[EN_CURSO]` dentro de `sesiones_programadas.notas` (además de codificar
el pilar como `Pilar:X | tipo` en el mismo texto). Frágil: cualquier cambio de copy
rompe el parseo (`match(/Pilar:([^|]+)/)`).

---

## 3. Visión unificada (a dónde queremos llegar)

### 3.1 Una sola taxonomía compartida

`analytics-core` es la única fuente de verdad de `pilar → sub_pilar`. Los tres módulos
(Sesiones, Cancha, Evaluación) deben **consumir esa taxonomía**, no declarar su propia
lista. Un `objetivo` de sesión pasa a ser `{ pilar, sub_pilar }` canónico en vez de un
string libre distinto por pantalla.

Esto hace que "cuadre" todo: una sesión cuyo objetivo es *tiro* usa las mismas pruebas de
*tiro* de la evaluación científica y el mismo eje del radar.

### 3.2 "Modo Sesiones" = biblioteca de plantillas que alimenta al Modo Cancha

- **Modo Sesiones** deja de ser un registro paralelo y pasa a ser una **biblioteca de
  sesiones preestablecidas** (plantillas): cada plantilla tiene un objetivo canónico
  (pilar/sub_pilar), una lista de ejercicios del catálogo y notas metodológicas.
- En el **paso "Objetivo de la Sesión"** del Modo Cancha (hoy `ModoCanchaModalConfigPilar`),
  en vez de elegir solo un pilar abstracto, el coach **elige/sugiere una plantilla**
  según el pilar → así la sesión que se da en cancha queda planificada y trazable.
- La **asistencia se ratifica en Modo Cancha** a la hora del entrenamiento, para los tres
  formatos (Grupal por niveles / Grupal individualizada / Privada 1v1), contra una
  **tabla de asistencia real** (no el hack de notas).

### 3.3 Convergencia de datos (propuesta, aditiva)

Siguiendo la convención del repo (migraciones aditivas, `IF NOT EXISTS`):

- **Tabla de plantillas de sesión** (`sesiones_plantilla` o reutilizar `sesiones_control`
  marcando `es_plantilla=true`): objetivo canónico + `ejercicios_ids`.
- **Tabla de asistencia real** (`asistencia`, ya mencionada en CLAUDE.md como existente
  pero no poblada por Modo Cancha): `sesion_id`, `atleta_id`, `presente`, `hora`.
- **Un solo catálogo o una relación explícita** entre `ejercicios_catalogo` (entrenamiento)
  y `catalogo_ejercicios` (pruebas), o al menos renombrar para eliminar el espejo. Decisión
  pendiente: ¿una prueba de evaluación es un tipo de ejercicio, o son dominios separados?
- **Una sola regla de XP/stats**: consolidar los 3-4 caminos en un servicio único de
  puntuación para evitar descuadres.

> ⚠️ El esquema base (`sesiones_programadas`, `sesiones_entrenamiento`, `sesiones_control`,
> ambos catálogos, `atletas`, `evaluaciones_pruebas`…) **aún no tiene migración baseline
> versionada** (ver CLAUDE.md). Antes de reestructurar conviene capturar el baseline con
> `npx supabase db dump` para saber exactamente qué columnas existen hoy.

---

## 4. Decisiones tomadas

### 4.1 Carga/Sueño (sub-pilar `recuperacion`): **conservar y conectar al MCP**

**Contexto:** el sub-pilar `recuperacion` (pestaña "Carga/Sueño") se captura en
`EvaluacionModal`, pero hoy no alimenta nada: `calcularOverall` solo agrupa
`fisico/tecnico/mental`, y `recomendaciones.js` documenta explícitamente que
`recuperacion` "no forma parte del radar ni tiene misiones asociadas". Se guarda y muere
ahí.

**Decisión (owner, 2026-07-04, revisada):** **el atleta NO pierde acceso** — la pestaña
Carga/Sueño se conserva como la vía por la que el propio atleta reporta su estado. Además,
**esa información debe alimentar el MCP de la app para recomendar misiones según los
resultados**. Es decir, deja de ser un dato muerto y se vuelve una entrada del motor de
recomendación de misiones.

**Estado (2026-07-05):** implementado el camino **MCP dedicada** + consolidación del
motor en un solo cerebro:
- La recuperación real vive en la tabla **`atleta_readiness`** (check-in diario: sueño,
  fatiga, hidratación), leída hoy solo por el `didacticEngine` de la web. La pestaña
  "Carga/Sueño" de `EvaluacionModal` (sub_pilar `recuperacion`) está vacía porque el
  catálogo no tiene pruebas de recuperación — se conserva pero no es la fuente.
- **`analytics-core/readiness.js`** (nuevo, puro, compartido): `calcularReadinessScore` +
  `detectarAlertasRecuperacion`.
- **`analytics-core/didactica.js`** (nuevo): `evaluarDeficits`/`getAutoMissions`/
  `getFaseBiologica` movidos desde el `didacticEngine` solo-web (que quedó como shim),
  con la detección de recuperación delegada a `readiness.js`. Ahora web, MCP y Edge usan
  el MISMO motor.
- **`blackgold-mcp`**: nueva tool `analyze_athlete_readiness` (lee `atleta_readiness`,
  calcula score+alertas y recomienda misiones de recuperación) + `insertar_misiones_recuperacion`
  (autoría de misiones `pilar='recuperacion'`, agnósticas de nivel/edad).
- **Pendiente (contenido):** el catálogo aún no tiene misiones `pilar='recuperacion'`; hay
  que redactarlas (higiene de sueño, hidratación, recuperación activa, gestión de carga)
  vía `insertar_misiones_recuperacion` para que la recomendación tenga qué proponer.
- **Pendiente (consolidación profunda):** unificar el loop automático de la Edge Function
  (`detectarDebilidades`/`seleccionarMisiones`, baremo-driven) con este motor de déficits
  por `condicion_trigger` — siguen siendo dos mecanismos (§2.4).

**Implicaciones / trabajo derivado (histórico):**
- **Se conserva** la pestaña `recuperacion` en `EvaluacionModal` y el acceso del rol
  `atleta` (default `activeTab` y filtro en `EvaluacionModal.jsx:86` y `:342`). La barra
  móvil sigue con sus objetivos completos → la mejora de la barra (§5) debe funcionar con
  todos los tabs, no apoyarse en retirar uno.
- **Nuevo flujo `recuperacion → MCP → misiones`** (workstream aparte, no es la UX móvil):
  la data de Carga/Sueño de `evaluaciones_pruebas` (sub_pilar `recuperacion`) debe entrar
  al pipeline de recomendación. Hoy `recomendaciones.detectarDebilidades` **excluye**
  `recuperacion` a propósito (solo agrega los 7 sub-pilares del radar). Hay que decidir
  cómo pondera la recuperación una misión (¿penaliza carga alta / sueño bajo? ¿sugiere
  misiones de descanso/movilidad?) y exponerlo tanto en `analytics-core` (consumido por el
  Dashboard) como en `blackgold-mcp` (que reexporta `analytics-core`). Requiere baremos o
  reglas de recuperación que hoy no existen en `baremos.js`.
- Los datos ya guardados con `sub_pilar='recuperacion'` se conservan y pasan a ser útiles.

---

## 5. UX de la Evaluación Científica en móvil — ✅ HECHO (2026-07-04)

Reproducido y corregido en `EvaluacionModal.jsx`, verificado en preview a 375×812 con la
cuenta QA-COACH-001 sobre un atleta Prejuvenil (Sub-16):

1. **Barra de pilares incómoda** — ✅ La fila de objetivos pasó de `overflow-x-auto`
   (swipe horizontal, tabs cortados) a **chips que envuelven en varias filas**
   (`flex flex-wrap` + estilo pill con `aria-pressed`). Todos los objetivos visibles sin
   deslizar. Funciona con el set completo (Carga/Sueño incluido, §4.1).
2. **Detalle cortado a la mitad** — ✅ Causa raíz hallada empíricamente: el modal se
   renderiza **anidado dentro del modal de perfil del atleta**, cuyo `glass-card` tiene
   `backdrop-filter` → ese ancestro crea un *containing block* que atrapa el
   `position: fixed` del modal. Con `h-dvh` centrado contra un contenedor más alto que el
   viewport, la tarjeta arrancaba en `top≈337` y su mitad inferior (inputs + botón
   "Registrar Evaluación") quedaba fuera de pantalla. **Fix: `createPortal(…, document.body)`**
   → la tarjeta queda `top:0 → bottom:812` y todo el formulario es alcanzable. (No era el
   `min-h-0` que sugería el análisis estático; se descartó midiendo en vivo.)
3. **Extra:** el botón "+ Nueva Prueba" se cortaba a la derecha → `min-w-0` en el input de
   búsqueda para que ceda espacio (fix estándar de flexbox).

Verificación end-to-end: con 30 reps en Push-ups Máx. (Sub-16→bucket Sub18 `[20,29,34,45]`)
el modal muestra tier **Promedio 55/100** y habilita el guardado.

---

## 6. Deuda técnica capturada (no en el alcance elegido, pero registrada)

### 6.1 BUG — "no tiene baremo para la categoría (Sub-14/Sub-16)" — ✅ CORREGIDO (2026-07-04)

`EvaluacionModal.jsx` (`categoryAvailable`) hacía
`Object.keys(thresholds).find(k => cat.includes(k))` con `cat="Menores (Sub-14)"` /
`"Prejuvenil (Sub-16)"` y llaves `Sub12/Sub15/Sub18/Senior`. Como
`"Prejuvenil (Sub-16)".includes("Sub18")` es `false`, marcaba "no hay baremo" **aunque sí
existía**.

Era el **mismo bug ya resuelto dentro de `normalizarValor`** vía `categoriaABucketBaremo()`
(ver `packages/analytics-core/baremos.js:342`), pero el guard `categoryAvailable` del modal
quedó con la lógica vieja. **No era problema de documentación ni del MCP.** Corregido: el
guard ahora replica exactamente el mapeo FEB→bucket de `normalizarValor`
(`categoriaABucketBaremo(cat) || …find(k=>cat.includes(k)) || 'Sub15'`), así aviso y
guardado coinciden. Se incluyó en el pase de UX móvil por bloquear el mismo modal.
(Verificado: Push-ups Máx. en Sub-16 ya no muestra aviso y calcula Promedio 55/100.)

### 6.2 Nombres espejo de catálogos (§2.3) y 4 caminos de XP (§2.4)

Fuentes de bugs futuros. Consolidar en la fase de datos (§3.3).

---

## 7. Plan por fases (propuesto)

Alineado con la convención P0/P1/P2 del repo. **Ninguna fase está iniciada.**

- **P0 — Quick wins de UI (bajo riesgo, sin migración):**
  - Fix del baremo Sub-14 (§6.1).
  - UX móvil de evaluación + retiro de la pestaña Carga/Sueño (§4.1, §5).
  - Decisión de producto: acceso del rol atleta a la evaluación científica.
- **P1 — Taxonomía compartida (§3.1):** que Sesiones/Cancha/Evaluación consuman
  `pilar → sub_pilar` de `analytics-core` en vez de listas locales.
- **P2 — Unificación de datos (§3.2, §3.3):** baseline del esquema → plantillas de sesión
  → tabla de asistencia real → servicio único de XP → limpieza de catálogos espejo.

---

## 8. Preguntas abiertas (requieren decisión del owner antes de codificar)

1. **Rol atleta**: al retirar Carga/Sueño, ¿el atleta pierde acceso a la evaluación
   científica (recomendado) o se le da otra vista?
2. **Catálogos**: ¿una prueba de evaluación es un tipo de ejercicio de entrenamiento, o
   son dominios que deben permanecer separados (solo renombrar)?
3. **XP**: ¿se acepta consolidar las 3-4 reglas de XP en un único servicio, aun si cambia
   ligeramente cuánta XP se otorga hoy?
4. **Plantillas**: ¿tabla nueva `sesiones_plantilla` o reutilizar `sesiones_control` con
   flag `es_plantilla`?
