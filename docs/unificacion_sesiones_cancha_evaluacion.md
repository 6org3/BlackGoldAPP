# Unificación: Sesiones · Modo Cancha · Evaluación Científica

Documento de diseño (2026-07-04, ampliado 2026-07-05). Origen: revisión de
incongruencias reportadas por el owner del club. Fuente de verdad para la unificación
de los módulos de entrenamiento y evaluación. **Es un documento de diseño: no se ha
tocado código de producción todavía.**

**Actualización 2026-07-05:** se retomó la consolidación para atacar el ítem grande
pendiente (§2, §3, §7): unificar los 2 (en realidad **3**, ver §2.6) sistemas de
sesión/asistencia. Esta sesión NO tocó código ni BD — solo diseño + decisiones
pedidas al owner (§8).

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

### 2.6 Descubrimiento (2026-07-05): existe un TERCER sistema, ya real y en producción

Al verificar en código (no en el documento anterior, que no lo mencionaba) apareció
`src/api/asistenciaService.js` + `src/components/AdminAsistencia.jsx`, ruteado en
`/admin/asistencia` (roles `superadmin/owner/coach`, ver `main.jsx:154-161`) — **no es
un prototipo, es una pantalla de pase de lista diario que ya está en uso**:

- Tabla real **`asistencia`**: `id, atleta_id, coach_id, fecha, estado, notas`, con
  **`UNIQUE(atleta_id, fecha)`** (un solo registro de asistencia por atleta por día,
  vía `upsert(..., { onConflict: 'atleta_id,fecha' })`).
- `estado` ∈ `Presente | Ausente | Justificada | Lesionado` (4 valores, más rico que el
  booleano `presente/no` de Modo Cancha).
- **La consume `OwnerKPIsPage.jsx:88`** para calcular el KPI "asistencia % (7 días)" del
  dashboard del owner, y `whatsappReport.js` para reportes.
- **No tiene ninguna relación con `sesiones_programadas`, `sesiones_entrenamiento` ni
  `sesiones_control`.** Un coach que pasa lista en Modo Cancha (hack de notas) y nunca
  entra a `/admin/asistencia` deja esa tabla vacía para sus atletas — **el KPI de
  asistencia del owner probablemente está incompleto o mal calculado hoy**, según cuánto
  se use en la práctica cada pantalla (no verificable desde el código: requiere mirar
  datos reales).

**Implicación para el diseño:** la pregunta abierta original ("¿tabla real de asistencia
vs hack de notas?") ya tenía una respuesta parcial — **la tabla real ya existía**. La
decisión pasó a ser "¿Modo Cancha escribe en esta misma tabla `asistencia`, o crea una
tabla paralela nueva?" — resuelto a favor de extender la existente (ver §3.3.a y §8).

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
  **tabla de asistencia real** (no el hack de notas) — ver §3.3, la tabla ya existe.

**Decisión del owner (2026-07-05): tabla nueva `sesiones_plantilla`** (no el flag
`es_plantilla` en `sesiones_control`):

```sql
-- ADITIVO, propuesto — NO aplicado todavía
CREATE TABLE IF NOT EXISTS sesiones_plantilla (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre             TEXT NOT NULL,
  pilar              TEXT REFERENCES ... ,   -- valida contra PILARES de taxonomia.js
  sub_pilar          TEXT,                   -- valida contra SUB_PILARES de taxonomia.js (incluye 'resistencia' tras P1.5)
  tipo_clase         TEXT,                   -- 'Grupal (Niveles)' | 'Grupal Individualizada' | 'Privada 1v1' | NULL=cualquiera
  ejercicios_ids     UUID[] DEFAULT '{}',    -- referencias a ejercicios_catalogo
  descripcion        TEXT,
  notas_metodologicas TEXT,
  creado_por         UUID REFERENCES usuarios(id),
  activa             BOOLEAN DEFAULT true,
  created_at         TIMESTAMPTZ DEFAULT now()
);
```

**Por qué tabla nueva y no `es_plantilla` en `sesiones_control`:** una fila de
`sesiones_control` representa una sesión *concreta* (fecha, grupo/atleta, evaluación
`se_logro`). Una plantilla no tiene fecha ni atleta ni evaluación — es reutilizable. Meter
ambos conceptos en la misma tabla obliga a que columnas obligatorias-en-espíritu
(`fecha`, `grupo_id`/`atleta_id`) queden huérfanas en las filas-plantilla, y cada query
de historial (`fetchSesionesControl`, ya usado en `AdminSesiones.jsx:369`) necesitaría
un `WHERE es_plantilla = false` que hoy no existe y es fácil de olvidar en queries
nuevas.

### 3.3 Convergencia de datos (propuesta concreta, aditiva)

Siguiendo la convención del repo (migraciones aditivas, `IF NOT EXISTS`):

**a) Asistencia — decisión del owner (2026-07-05): extender la tabla `asistencia` YA
EXISTENTE (§2.6), no crear una tercera.** Modo Cancha debe dejar de inferir presencia
por `notas` y escribir en la misma tabla que ya alimenta `OwnerKPIsPage`:

```sql
-- ADITIVO, propuesto — NO aplicado todavía
ALTER TABLE asistencia
  ADD COLUMN IF NOT EXISTS sesion_id UUID REFERENCES sesiones_programadas(id) ON DELETE SET NULL;

-- La UNIQUE(atleta_id, fecha) actual asume 1 registro/atleta/día (pase de lista
-- diario de AdminAsistencia). Si un atleta puede tener 2 clases el mismo día
-- (ej. grupal + privada 1v1), hay que relajarla:
ALTER TABLE asistencia DROP CONSTRAINT IF EXISTS asistencia_atleta_id_fecha_key;
ALTER TABLE asistencia
  ADD CONSTRAINT asistencia_atleta_fecha_sesion_key UNIQUE (atleta_id, fecha, sesion_id);
```

Con esto: `AdminAsistencia.jsx` sigue funcionando exactamente igual (sigue escribiendo
con `sesion_id = NULL`, pase de lista manual del día); Modo Cancha, al "Pasar Lista"
(paso 3), hace upsert por cada presente con `estado='Presente'` + `sesion_id` de la
clase; `OwnerKPIsPage` automáticamente empieza a contar la asistencia de Modo Cancha sin
tocar su query. Riesgo a validar con datos reales antes de aplicar: si ya existen días
con más de un registro por atleta que dependían de la unicidad vieja, el `ALTER` de la
constraint podría fallar — hay que revisar duplicados existentes primero.

*(Alternativa descartada: tabla nueva `sesion_asistencia` separada solo para Modo
Cancha. Más simple pero deja a `OwnerKPIsPage` ciega a las clases de Modo Cancha a
menos que se le enseñe a unir dos tablas — el owner prefirió resolver la desconexión
de raíz.)*

**b) Catálogos de ejercicios:** ya resuelto (§2.3) — son dominios distintos, no se
fusionan; `src/api/tablas.js` mata el nombre espejo a nivel de código.

**c) XP/stats:** ya resuelto (§2.4, commit `3175186`) — `analytics-core/xp.js` +
`xpService.otorgarXP` son la fuente única. Falta solo migrar a RPC atómico (deuda menor,
no bloquea esta fase).

**d) Taxonomía de "qué se entrena" en Modo Cancha y Control de Sesiones — ver §3.4.**

> ⚠️ El esquema base (`sesiones_programadas`, `sesiones_entrenamiento`, `sesiones_control`,
> `asistencia`, ambos catálogos, `atletas`, `evaluaciones_pruebas`…) **aún no tiene
> migración baseline versionada** (ver CLAUDE.md). Antes de aplicar cualquiera de los
> `ALTER`/`CREATE` de esta sección, capturar el baseline con `npx supabase db dump
> --schema public -f supabase/migrations/00000000000000_baseline.sql` (requiere
> `supabase login` del usuario) para saber exactamente qué columnas/constraints existen
> hoy y no adivinar el nombre real de la constraint `UNIQUE(atleta_id, fecha)`.

### 3.4 Taxonomía única para Modo Cancha y Control de Sesiones (decisiones #1 y #2 de §8)

`OBJETIVOS_CLASE` (Modo Cancha, `ModoCanchaModalConstants.jsx:10-18`) y `TIPOS`
(`AdminSesiones.jsx:15`) deben dejar de ser listas propias y consumir
`packages/analytics-core/taxonomia.js`. Verificado en código: hoy son **incompatibles
entre sí y con la taxonomía**, no solo distintas en nombre:

| Objetivo hoy (ModoCancha / AdminSesiones) | En `taxonomia.js` | Conflicto |
|---|---|---|
| "Físico - Fuerza" / "Físico - Explosividad" / "Físico - Velocidad/Agilidad" | `fuerza`, `explosividad` → `fisico`; **`agilidad` → `tecnico`** | ModoCancha mete Agilidad dentro de "Físico"; la taxonomía (y baremos/radar) la clasifica como **técnico**. Incongruencia real, no cosmética — **decisión #1**. |
| "Físico - Resistencia" | *(no existe ningún sub_pilar `resistencia`)* | No mapea a nada — **decisión #2**. |
| "Eficiencia Táctica" | `tactica` → `mental` | Mapea limpio. |
| "Resiliencia Psicológica" | `resiliencia` → `mental` | Mapea limpio. |
| "Liderazgo y Comunicación" | *(no existe)* | No mapea a nada — **decisión #2**. |
| `TIPOS` = Técnico/Físico/Táctico/Evaluación/Recuperación | pilares son `fisico/tecnico/mental` (+ `recuperacion` monitoreo) | "Evaluación" no es un pilar, es un *tipo de actividad* (la sesión ES una evaluación, no entrena un pilar) — estos dos ejes (¿qué pilar se entrena? vs ¿qué clase de actividad es?) están mezclados en una sola lista plana. |

**Decisión del owner (2026-07-05):**

1. **Agilidad → Técnico.** Modo Cancha se alinea con `taxonomia.js`/`baremos.js`/radar.
   Cambia solo la agrupación/etiqueta del botón "Físico - Velocidad/Agilidad" en Modo
   Cancha; no toca baremos ni radar (ya clasificaban `agilidad` como técnico).
2. **Liderazgo y Comunicación → sub-pilar `resiliencia`** (mental). Mantiene el
   comportamiento actual de `handleCerrarClase`/`handleSubmitEvaluation` (ya sube
   `resiliencia_psicologica` cuando el objetivo incluye "Liderazgo") — sin cambio de
   conducta, solo formaliza el mapeo en la taxonomía compartida.
3. **Resistencia → sub-pilar físico NUEVO, real** (no un tag transversal): el owner
   señaló que ningún sub-pilar existente mide resistencia cardiovascular
   anaeróbica/aeróbica, y quiere que `resistencia` sea un sub-pilar de pleno derecho
   dentro de `fisico`, con **sus propias pruebas, baremos y misiones** — al mismo nivel
   que `fuerza`/`explosividad`/`movilidad`. Verificado en código
   (`packages/analytics-core/baremos.js:474-504`, `calcularOverall`): el pilar `fisico`
   se calcula como **promedio simple** de los sub-pilares con evaluación registrada
   (no hay pesos por sub-pilar hoy) → agregar un 4º sub-pilar físico **no requiere
   rebalancear `PILLAR_WEIGHTS`**, solo:
   - Añadir `{ key: 'resistencia', label: 'Resistencia', pilar: 'fisico' }` a
     `SUB_PILARES` en `taxonomia.js` (el radar pasa de 7 a **8 ejes**, derivado
     automáticamente ahí — `radar.js` no necesita tocarse).
   - **Diseñar baremos reales** (umbrales por categoría FEB) para al menos una prueba de
     resistencia — pendiente decidir con el owner **qué prueba(s)** (ej. Course
     Navette/Léger, Test de Cooper, Yo-Yo IR1, sprints repetidos/RSA para la
     componente anaeróbica) y si aeróbica/anaeróbica son un solo sub_pilar con una
     prueba compuesta o si conviven varias pruebas bajo el mismo `sub_pilar=resistencia`
     (como ya ocurre hoy con otros sub-pilares que tienen múltiples pruebas).
   - Nueva(s) fila(s) en `catalogo_ejercicios` (pruebas de evaluación, `pilar='fisico'`,
     `sub_pilar='resistencia'`) con sus `thresholds`.
   - Contenido: misiones nuevas `pilar='fisico'` orientadas a resistencia (mismo patrón
     que falta hoy para `recuperacion`, ver §4.1).
   - **Esto es un workstream de contenido/ciencia deportiva, no solo ingeniería** —
     depende de qué prueba(s) y umbrales por categoría defina el cuerpo técnico del
     club. Se registra como fase propia (§7, "P1.5") separada de la unificación de
     sesiones para no bloquearla.
4. Separar en dos ejes independientes lo que hoy es una sola lista: **`pilar`/`sub_pilar`
   canónico** (qué se entrena, de `taxonomia.js`, incluyendo el nuevo `resistencia`) +
   **`tipo_actividad`** opcional (Evaluación/Recuperación como *formato* de la sesión, no
   como pilar). Esto resuelve también la mezcla en `TIPOS` de `AdminSesiones`.

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

## 7. Plan por fases (actualizado 2026-07-05 — las 4 decisiones de producto ya están tomadas, §8)

Alineado con la convención P0/P1/P2 del repo. Los ítems tachados con ✅ ya están hechos
(ver §2.4/§2.6/§4.1 y memoria del proyecto); lo demás sigue **sin iniciar** — esta
sesión fue solo diseño + decisiones, **cero código y cero migraciones**.

- ~~**P0 — Quick wins de UI**~~ ✅ HECHO: fix baremo Sub-14, UX móvil de evaluación,
  catálogos espejo (código), taxonomía única `pilar→sub_pilar`, servicio único de XP,
  recuperación→MCP→misiones.
- **P1 — Baseline técnico (bloquea P2 y P1.5, siguiente sesión):**
  - Capturar `npx supabase db dump --schema public` antes de tocar `asistencia`,
    `sesiones_control` o crear `sesiones_plantilla` (requiere `supabase login`).
  - Revisar datos reales de `asistencia` por posibles duplicados atleta+fecha antes de
    relajar su `UNIQUE(atleta_id, fecha)` (§3.3.a).
- **P1.5 — Contenido de resistencia (independiente, puede correr en paralelo a P2/P3):**
  - Definir con el cuerpo técnico qué prueba(s) miden `resistencia` (Course
    Navette/Léger, Cooper, Yo-Yo IR1, RSA…) y sus umbrales por categoría FEB (§3.4.3).
  - Diseñar los baremos (mismo formato que `baremos.js`/`catalogo_ejercicios` ya usan).
  - Redactar misiones `pilar='fisico'` orientadas a resistencia.
  - Solo entonces: añadir `resistencia` a `SUB_PILARES` (`taxonomia.js`) — el radar pasa
    de 7 a 8 ejes automáticamente.
- **P2 — Migraciones aditivas (tras el baseline de P1):**
  1. `CREATE TABLE sesiones_plantilla` (§3.2, decidida) + poblarla con las plantillas
     que hoy son objetivos de Modo Cancha.
  2. `ALTER TABLE asistencia ADD sesion_id` + ajuste de `UNIQUE` (§3.3.a, decidida).
  3. Migrar `OBJETIVOS_CLASE`/`TIPOS` a consumir `taxonomia.js`: Agilidad→Técnico,
     Liderazgo→`resiliencia` (§3.4, decididas), separando `pilar/sub_pilar` de
     `tipo_actividad`.
- **P3 — Reescritura de flujo (código, tras P2 en producción):**
  - `ModoCanchaModalConfigPilar` pasa de "elegir pilar" a "elegir/sugerir plantilla".
  - Paso "Pasar Lista" de Modo Cancha escribe en `asistencia` en vez de inferir por
    `notas`/`[MODO_CANCHA: id]`.
  - `AdminSesiones` gana un botón "Guardar como plantilla".
  - Retirar el parseo de `notas` (`[EN_CURSO]`, `Pilar:X | tipo`) una vez que
    `sesiones_programadas`/`sesiones_control` tengan columnas reales para lo mismo.

---

## 8. Decisiones del owner (2026-07-05) — ya no son preguntas abiertas

1. **Agilidad → Técnico.** (§3.4.1) Modo Cancha se alinea con
   `taxonomia.js`/`baremos.js`/radar; sin cambio de cálculo, solo de agrupación/UI.
2. **Liderazgo y Comunicación → sub-pilar `resiliencia`.** (§3.4.2) Sin cambio de
   conducta — formaliza el mapeo que ya hace `handleCerrarClase` hoy.
3. **Resistencia → sub-pilar físico NUEVO** con pruebas/baremos/misiones propios, no un
   tag transversal. (§3.4.3) Es el ítem con más trabajo pendiente: requiere diseño de
   baremos reales (ver P1.5) antes de tocar `taxonomia.js`/radar.
4. **Plantillas → tabla nueva `sesiones_plantilla`.** (§3.2)
5. **Asistencia → extender la tabla `asistencia` ya existente** con `sesion_id` +
   relajar su `UNIQUE`. (§3.3.a)

**Preguntas de la fase anterior, ya resueltas y no reabiertas:** rol atleta en
Carga/Sueño (§4.1, conserva acceso); catálogos espejo (§2.3, dominios separados, no se
fusionan); XP (§2.4, ya consolidado en `analytics-core/xp.js`).

**Sigue pendiente de decisión (no bloquea el resto, ver P1.5):** qué prueba(s) exactas
miden `resistencia` y sus umbrales por categoría — requiere input del cuerpo técnico,
no es una decisión de ingeniería.
