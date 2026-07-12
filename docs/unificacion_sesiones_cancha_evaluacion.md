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

**Decisión del owner (2026-07-05, revisada tras el baseline de P1): reutilizar
`catalogo_sesiones`**, NO crear `sesiones_plantilla` desde cero (y tampoco el flag
`es_plantilla` en `sesiones_control`).

**Hallazgo del baseline (§7, P1):** el `npx supabase db dump` reveló una tabla
`catalogo_sesiones` que **ni el documento original ni el código mencionaban** —
verificado con `grep -r catalogo_sesiones` en `Dashboard_Premium` y `blackgold-mcp`:
**cero referencias en ningún archivo**. Es una tabla huérfana, con **0 filas**
(confirmado por query), que ya tiene casi exactamente la forma de una plantilla:

```sql
-- YA EXISTE en producción (ver supabase/migrations/00000000000000_baseline.sql:258-267), vacía y sin código que la use
CREATE TABLE IF NOT EXISTS "public"."catalogo_sesiones" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "titulo" "text" NOT NULL,
    "enfoque_principal" "text",
    "descripcion" "text",
    "ejercicios_ids" "jsonb",
    "creado_por" "uuid",
    "club_id" "text",
    "fecha_creacion" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);
```

Dado que está vacía y sin código dependiente, reutilizarla es estrictamente más seguro
que crear una tabla nueva (cero filas que migrar, cero riesgo) y evita sumar una octava
tabla de sesión/plantilla al esquema cuando ya hay una construida para esto. Extensión
aditiva propuesta:

```sql
-- ADITIVO, propuesto — NO aplicado todavía
ALTER TABLE catalogo_sesiones
  ADD COLUMN IF NOT EXISTS pilar     TEXT,   -- valida contra PILARES de taxonomia.js
  ADD COLUMN IF NOT EXISTS sub_pilar TEXT,   -- valida contra SUB_PILARES de taxonomia.js (incluye 'resistencia' tras P1.5)
  ADD COLUMN IF NOT EXISTS tipo_clase TEXT,  -- 'Grupal (Niveles)' | 'Grupal Individualizada' | 'Privada 1v1' | NULL=cualquiera
  ADD COLUMN IF NOT EXISTS activa    BOOLEAN DEFAULT true;
-- ejercicios_ids ya existe (jsonb) — Modo Cancha/AdminSesiones lo leen como array de ids de ejercicios_catalogo.
-- titulo/enfoque_principal/descripcion/creado_por/fecha_creacion ya cubren nombre + objetivo libre + notas + autor.
```

`enfoque_principal` (texto libre, ya existe) puede quedar como la descripción humana del
objetivo, mientras `pilar`/`sub_pilar` (nuevos) son el valor canónico que consume
`taxonomia.js`. `club_id` (ya existe, tipo `text` no `uuid` — revisar si el club es
mono-tenant hoy y ese campo es vestigial de un diseño multi-club) se puede ignorar por
ahora o limpiar aparte; no bloquea esta fase.

**Por qué no `es_plantilla` en `sesiones_control` (esa parte de la decisión no cambió):**
una fila de `sesiones_control` representa una sesión *concreta* (fecha, grupo/atleta,
evaluación `se_logro`). Una plantilla no tiene fecha ni atleta ni evaluación — es
reutilizable. Meter ambos conceptos en la misma tabla obliga a que columnas
obligatorias-en-espíritu (`fecha`, `grupo_id`/`atleta_id`) queden huérfanas en las
filas-plantilla, y cada query de historial (`fetchSesionesControl`, ya usado en
`AdminSesiones.jsx:369`) necesitaría un `WHERE es_plantilla = false` que hoy no existe y
es fácil de olvidar en queries nuevas.

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
tocar su query.

**Sobre el riesgo de duplicados (revisado tras el baseline, P1):** confirmado en el
baseline (`asistencia_atleta_id_fecha_key`, línea 729 de
`supabase/migrations/00000000000000_baseline.sql`) — el nombre real de la constraint
coincide exactamente con lo asumido arriba. Además, **el `ALTER` no puede fallar por
datos existentes**: relajar `UNIQUE(atleta_id, fecha)` a `UNIQUE(atleta_id, fecha,
sesion_id)` solo añade una columna a la clave — cualquier par que ya cumplía la
restricción vieja (más estricta) automáticamente cumple la nueva (más laxa); Postgres ya
viene garantizando desde antes que no hay duplicados (atleta_id, fecha) en las 3936 filas
actuales de `asistencia`, así que no hace falta auditar duplicados antes de aplicar este
`ALTER` en particular.

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
- ~~**Pendiente (contenido):** el catálogo aún no tiene misiones `pilar='recuperacion'`~~
  ✅ HECHO (2026-07-05): 8 misiones de recuperación insertadas (1 por cada trigger +
  1 multi `sueno_deficiente,hidratacion_baja`), fundadas en AASM (sueño), ACSM/NATA
  (hidratación) y Vinueza/NSCA (gestión de carga). Requirió el **hotfix v24**: el CHECK
  `misiones_pilar_check` (v17) no admitía `recuperacion` NI `resistencia` — por eso el
  catálogo tenía 0 de ambas; todo INSERT fallaba. v24 amplió el CHECK. Nacen
  `activa=false` → el coach las activa en AdminMisiones.
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

### 6.3 BUG — XP de Modo Cancha nunca se guardaba — ✅ CORREGIDO (2026-07-05, fase P2)

Hallado al tocar `ModoCanchaModal.jsx` para la fase P2 (no estaba buscándolo). La
migración `20260622000003_v14_cleanup_legacy.sql` eliminó de `atletas` las columnas
`fisico_atletico`, `eficiencia_tactica`, `resiliencia_psicologica` (limpieza legacy,
intencional — el `overall_score` ahora se calcula dinámicamente desde
`evaluaciones_pruebas`). Pero `handleCerrarClase` y `handleSubmitEvaluation` en
`ModoCanchaModal.jsx` seguían llamando a `otorgarXP(atletaId, xp, { resiliencia_psicologica: ..., eficiencia_tactica: ... })` (o `fisico_atletico`).

`otorgarXP` (`src/api/xpService.js`) hace un único `SELECT` que incluye `xp_total` +
las columnas del `statBoosts` recibido. Si alguna de esas columnas no existe, el
`SELECT` entero falla y la función retorna `null` **antes de tocar nada** — ni siquiera
`xp_total` se actualiza. Como las 7 opciones de `OBJETIVOS_CLASE` siempre disparaban un
`statToBoost` no-nulo (todas contienen "Físico", "Táctica", "Resiliencia" o
"Liderazgo"), **cada cierre de clase y cada evaluación subjetiva en Modo Cancha fallaba
en silencio**: el coach veía el `alert` de éxito, pero ningún atleta recibía XP.
Alcance: desde que se aplicó v14 (2026-06-22) hasta este fix.

**Corregido:** se quitaron los `statBoosts` de ambas llamadas (las columnas destino ya
no existen y no hay reemplazo vigente — revivir un "bonus de stat" por objetivo de
clase requeriría diseñar columnas/lógica nuevas, fuera de alcance aquí). Ahora ambas
funciones solo otorgan `xp_total`, que es lo que sí existe y sí debe funcionar. El
`alert` de `handleCerrarClase` dejó de prometer un "bonus" que nunca ocurría.

### 6.4 Hallazgo: `sesiones_programadas.pilar_objetivo` existe y no se usa

Al revisar el esquema para P2 apareció una columna real `pilar_objetivo TEXT` en
`sesiones_programadas` (baseline línea 696) que **`handleStartSession` nunca escribe**
— el pilar de la clase se sigue codificando solo dentro de `notas`
(`[EN_CURSO] Pilar:X | tipo`, ver §2.5). No se tocó en esta fase (leer/escribir esa
columna en vez del hack de `notas` es tema de la fase P3, "retirar el parseo de
notas"), pero acelera esa fase: la columna de destino ya existe, no hace falta
migrarla.

### 6.5 Quinto vocabulario de "qué se entrena": `AdminPlanificacion.jsx`

Hallado de pasada al revisar referencias cruzadas de `OBJETIVOS_CLASE`. Existe
`AdminPlanificacion.jsx` con su propia lista `METAS = ['Fuerza', 'Velocidad',
'Resistencia', 'Coordinación', 'Flexibilidad', 'Recuperación Activa']` y un campo
`meta_entrenamiento` (usado también por `src/lib/trainingRules.js`) — un **quinto**
vocabulario paralelo, no los 4 de §2.2. **No está ruteado en `main.jsx`** (confirmado
por grep): es código muerto, ningún coach lo ve hoy. No se tocó — se registra para
cuando se decida limpiar código muerto o si algún día se reactiva ese módulo.

---

## 7. Plan por fases (actualizado 2026-07-05 — las 4 decisiones de producto ya están tomadas, §8)

Alineado con la convención P0/P1/P2 del repo. Los ítems tachados con ✅ ya están hechos
(ver §2.4/§2.6/§4.1 y memoria del proyecto); lo demás sigue **sin iniciar** — esta
sesión fue solo diseño + decisiones, **cero código y cero migraciones**.

- ~~**P0 — Quick wins de UI**~~ ✅ HECHO: fix baremo Sub-14, UX móvil de evaluación,
  catálogos espejo (código), taxonomía única `pilar→sub_pilar`, servicio único de XP,
  recuperación→MCP→misiones.
- ~~**P1 — Baseline técnico**~~ ✅ HECHO (2026-07-05): `npx supabase db dump --schema
  public -f supabase/migrations/00000000000000_baseline.sql` capturado (1922 líneas).
  Bloqueado dos veces en el camino (ambos resueltos): CLI necesitaba Docker Desktop
  (instalado); luego la conexión a Postgres colgaba en el protocolo por la IP de salida
  de una VPN activa (ProtonVPN) — se resolvió desconectándola. Hallazgos del baseline:
  - Constraint real de `asistencia` confirmada: `asistencia_atleta_id_fecha_key` (línea
    729), coincide con lo asumido en §3.3.a. Filas actuales: `asistencia` 3936,
    `sesiones_control` 312, `sesiones_programadas` 15.
  - **Relajar `UNIQUE(atleta_id, fecha)`→`UNIQUE(atleta_id, fecha, sesion_id)` no
    requiere auditar duplicados**: es una relajación estricta→laxa, matemáticamente no
    puede fallar con datos que ya cumplían la restricción vieja (§3.3.a, corregido).
  - **Hallazgo nuevo que cambió una decisión ya tomada:** existe `catalogo_sesiones`
    (`titulo, enfoque_principal, descripcion, ejercicios_ids jsonb, creado_por,
    club_id`), **0 filas, sin ninguna referencia en el código** (`Dashboard_Premium` ni
    `blackgold-mcp`) — una tabla de plantillas ya construida y nunca conectada. Decisión
    de plantillas (§3.2, §8) **revisada**: reutilizarla en vez de crear
    `sesiones_plantilla` desde cero.
- ~~**P1.5 — Autoría de pruebas/baremos vía MCP**~~ ✅ COMPLETA (2026-07-05): tooling
  + CONTENIDO. El lote de pruebas fue redactado con la guía Vinueza, **aprobado
  explícitamente por el owner** e insertado en producción **llamando a la tool real del
  MCP** (`insertar_pruebas_evaluacion` vía cliente stdio — e2e del tooling):
  - 6 pruebas nuevas con capas género×nivel: Course Navette (Léger/Tomkinson 2017),
    Carrera 600m y 1000m (batería Vinueza, cortes provisionales a calibrar con datos
    del club — así marcado en su justificación), Salto de Longitud sin Impulso (Sub12
    anclado en la tabla Vinueza 2002 con datos ecuatorianos reales), Carrera 30m
    (ídem, convertida de su tabla de 40m) y Abdominales en 30s (batería Vinueza +
    FitnessGram). Regla de niveles: Desarrollo = norma poblacional, Micro -10% /
    Elite +10% (metodología interna documentada en cada justificación).
  - 2 reclasificaciones aprobadas: Yo-Yo IR1 `recuperacion`→`resistencia` y
    Dorsiflexión (WBLT) `flexibilidad`→`movilidad` (ambas eran invisibles al radar).
  - **`resistencia` entró a `SUB_PILARES` en `taxonomia.js` → el radar es de 8 ejes**
    (tests actualizados: 7→8). Catálogo final: 8 sub-pilares canónicos, 0 huérfanos,
    resistencia con 4 pruebas.
  - Verificado e2e contra producción: 6 paliers de Navette = `average` 55 para chica
    Sub-16 Desarrollo vs `poor` 15 para chico Sub-16 Elite (género y nivel operando);
    Yo-Yo IR1 revivido (`above_avg` con su shape legacy por género). Suite 229/229.
  - Pendiente de contenido futuro (no bloquea): conseguir las tablas originales de
    Vinueza para reemplazar los cortes provisionales de 600m/1000m; ~~misiones de
    resistencia~~ ✅ HECHAS (2026-07-05: 8 misiones `pilar='resistencia'`, 4 buckets ×
    general/especifica, nivel_objetivo=null, fundadas en Vinueza/NSCA; verificado que
    `seleccionarMisiones` las alcanza; nacen inactivas — requirió v24, ver §4.1);
    pruebas para `tactica` (solo 1, rating subjetivo).

  Lo construido (tooling):
  - `blackgold-mcp/knowledge/fundamentos_iniciacion_vinueza.md` — la guía metodológica
    ecuatoriana (Vinueza) aportada por el owner, como base de conocimiento del MCP.
  - Tools nuevas: `consultar_metodologia_iniciacion` (devuelve la guía),
    `generar_catalogo_pruebas` (cobertura del catálogo por sub-pilar — detecta también
    pruebas con umbrales irresolubles y sub_pilares fuera de taxonomía — + contexto
    metodológico + instrucciones), `insertar_pruebas_evaluacion` (inserción validada:
    sub_pilar canónico +'resistencia', cortes ascendentes, capas por género/nivel).
    El MCP ahora deriva sus SUB_PILARES de `taxonomia.js` (antes lista local duplicada)
    y la matriz de misiones (84 celdas) crece sola cuando entre `resistencia`.
  - **`resolverUmbrales` en `analytics-core/baremos.js`** — hallazgo del inventario de
    producción (30 pruebas): convivían TRES convenciones de `thresholds` y dos eran
    irresolubles para el motor (10/30 pruebas muertas, siempre `noAplica`): la canónica
    `bucket→array` (20), `Todas→{tier_1..4}` (8, legacy) y `género→Todas→array` (2, las
    crea `NuevaPruebaModal`). El resolver nuevo entiende las tres + las dos dimensiones
    nuevas (nivel de desarrollo y género) con fallbacks seguros; `normalizarValor` gana
    el 4º parámetro `perfil` y `EvaluacionModal` (guard `categoryAvailable` + preview)
    lo propaga desde `atleta.nivel_desarrollo`/`atleta.genero`. Nota: el parámetro
    `genero` que se había retirado por no tener umbrales que consultar
    (baremos_cientificos.md) vuelve ahora con umbrales reales que sí lo usan.
  - Suite 229/229 (14 tests nuevos de resolverUmbrales/perfil); `functions:sync`
    corrido (Edge `_shared` alineado); MCP arranca y registra las tools.

  Diseño original de la redefinición (referencia):
  - **Alcance nuevo:** el `blackgold-mcp` gana herramienta(s) de **autoría de pruebas de
    evaluación con sus baremos**, no solo para `resistencia` sino para **los 3 pilares /
    8 sub-pilares** (los 7 del radar + `resistencia`), con umbrales categorizados por
    **edad** (categoría FEB → bucket `Sub12/Sub15/Sub18/Senior`, mecanismo actual) **y
    por nivel de desarrollo** (`atletas.nivel_desarrollo`: Micro/Desarrollo/Elite —
    dimensión nueva).
  - Nueva tool MCP (patrón de `insertar_misiones_recuperacion`: schema zod + inserción
    validada, nace inactiva/curable): p.ej. `insertar_prueba_evaluacion` — valida
    `pilar`/`sub_pilar` contra `taxonomia.js`, exige `thresholds` bien formados y
    escribe en `catalogo_ejercicios` (TABLA_PRUEBAS_EVALUACION). El contenido
    científico (qué prueba, qué cortes, con qué fuente) lo propone el MCP en
    conversación con el owner/cuerpo técnico — igual que se hizo con las misiones de
    recuperación.
  - **Extensión del shape de `thresholds` (retrocompatible, verificado en código):**
    hoy `normalizarValor` (`baremos.js:422-437`) indexa `thresholds[bucket]` y **exige
    un array** de 4 cortes; si no lo es devuelve `noAplica` (falla segura). La
    extensión: admitir opcionalmente `{ bucket: { Micro: [...], Desarrollo: [...],
    Elite: [...] } }` — si `thresholds[bucket]` es array → conducta actual; si es
    objeto → indexar por `nivel_desarrollo` del atleta con fallback a `'Desarrollo'`.
    Requiere pasar `nivel_desarrollo` como 4º parámetro opcional de `normalizarValor`
    (retrocompatible) y propagarlo en EvaluacionModal, el guard `categoryAvailable`,
    el MCP (`analyze_athlete_pillars`) y la Edge Function (`functions:sync`
    obligatorio tras tocar analytics-core). Las pruebas existentes no cambian.
  - `resistencia` se añade a `SUB_PILARES` (`taxonomia.js`, radar 7→8 automático)
    cuando existan sus primeras pruebas con baremos — igual que antes, pero la vía de
    creación ahora es el MCP.
- ~~**P2 — Migraciones aditivas**~~ ✅ APLICADA A PRODUCCIÓN (2026-07-05, confirmado
  por el owner). El baseline (`00000000000000`) se marcó `applied` en el historial
  remoto vía `supabase migration repair` (sin ejecutar su SQL — ya reflejaba el estado
  real) antes del push, para que `db push` no intentara recrear políticas/objetos ya
  existentes. `db push` mostró un warning no-fatal ("failed to cache migrations
  catalog", un contenedor auxiliar de `edge-runtime` sin certificado SSL para su caché
  propia) — **verificado aparte, directamente contra producción vía API**, que la
  migración sí aplicó: las 7 filas de `catalogo_sesiones` y la columna
  `asistencia.sesion_id` existen y son consultables en la BD real.
  1. ✅ `Dashboard_Premium/supabase/migrations/20260705165638_v21_unificacion_sesiones_fase_p2.sql`:
     `ALTER TABLE catalogo_sesiones ADD pilar/sub_pilar/tipo_clase/activa` (§3.2,
     decisión revisada) + siembra de 7 plantillas (una por objetivo actual de Modo
     Cancha, `club_id=NULL`=global, `sub_pilar` de Resistencia queda `NULL` a propósito
     hasta P1.5) + fix de una política RLS obsoleta en `catalogo_sesiones`
     ("Insertar Sesiones" usaba roles `coach_head`/`coach_asistente` que ya no existen
     — el `CHECK` de `usuarios.rol` solo permite `superadmin/owner/coach/atleta/padre`;
     sin este fix ningún coach real podría crear una plantilla en la fase P3) +
     `ALTER TABLE asistencia ADD sesion_id` y swap de `UNIQUE` (§3.3.a, decidida).
     **Validada localmente**: aplicada sin errores contra un Postgres 17.6.1 desechable
     en Docker (misma versión que producción), reconstruido desde el baseline de P1 —
     cero impacto en datos reales, se descartó el contenedor después.
  2. ✅ `ModoCanchaModalConstants.jsx`: `OBJETIVOS_CLASE` — "Físico - Velocidad/Agilidad"
     → "Técnico - Agilidad" (decisión #1, agilidad ya no se agrupa con Físico).
  3. ✅ Bug encontrado y corregido de paso (§6.3): `handleCerrarClase`/
     `handleSubmitEvaluation` en `ModoCanchaModal.jsx` otorgaban XP con `statBoosts` a
     columnas que v14 ya había eliminado de `atletas` — el `SELECT` fallaba entero y
     **ningún atleta recibía XP al cerrar una clase o evaluar en Modo Cancha**, desde
     2026-06-22 hasta ahora. Corregido: se quitaron esos `statBoosts`, queda solo el
     otorgamiento de `xp_total`.
  4. **No se tocó todavía** `AdminSesiones.TIPOS` ni el "tipo_actividad" separado de
     decisión #4 (§3.4): `TIPOS` filtra datos reales de `ejercicios_catalogo.tipo`
     (`e.tipo === form.objetivoTipo`), y tocarlo sin revisar los valores reales de esa
     columna en producción podría romper el filtro de ejercicios para los coaches —
     se dejó para revisar con más cuidado en P3, junto con la reescritura de flujo.
  - **Verificación:** suite de tests 215/215 sin regresiones; lint de los 2 archivos
    editados sin problemas nuevos (los 2 errores/1 warning que reporta ESLint en
    `ModoCanchaModal.jsx` ya existían antes de este cambio, confirmado con
    `git stash`/`git stash pop`, no relacionados). **No se pudo verificar en navegador**:
    el subsistema de preview de esta sesión quedó anclado al worktree original
    (`gracious-meninsky-05daeb`, otra rama, sin `node_modules` instalado) y no siguió el
    cambio de `EnterWorktree` — confirmado con una marca de prueba en `launch.json`.
- **P3a — Reescritura de flujo** ✅ CÓDIGO LISTO (2026-07-05; commit pendiente de
  deploy). Antes de empezar se detectó y corrigió una ROTURA VIVA que v21 había
  introducido (ver v22 abajo). Lo hecho:
  - **HOTFIX v22 (aplicado a producción con autorización del owner):** v21 rompió el
    guardado del pase de lista diario — su `ON CONFLICT (atleta_id, fecha)` dejó de
    encontrar constraint (reproducido en Docker y verificado contra producción antes
    del fix). Además con `UNIQUE` estándar las filas diarias (`sesion_id NULL`) no se
    deduplicaban (NULLs distintos). v22: `UNIQUE NULLS NOT DISTINCT (atleta_id, fecha,
    sesion_id)` + `upsertAsistencia` acepta `sesion_id` y apunta a la terna. Verificado
    en prod: target viejo falla (diagnóstico), nuevo upsertea idempotente. **Lección:
    validar migraciones también contra las QUERIES existentes (upserts con
    onConflict), no solo contra el esquema.**
  - ✅ `ModoCanchaModalConfigPilar` elige **plantilla** de `catalogo_sesiones`
    (agrupadas por pilar canónico, sub-pilar visible, `aria-pressed`), con fallback a
    `OBJETIVOS_CLASE` si la biblioteca no carga. Siguiente deshabilitado sin elección.
  - ✅ Paso "Pasar Lista" escribe **asistencia real** (`upsertAsistencia` con
    `sesion_id`; registra Presente Y Ausente explícitos) además del historial
    `sesiones_entrenamiento` (solo presentes) — todo en un `Promise.all`.
  - ✅ `sesiones_programadas.pilar_objetivo` (columna real, §6.4) guarda la key
    canónica (`sub_pilar || pilar` de la plantilla); las notas quedan
    `[EN_CURSO] <tipo>` (el marker se CONSERVA: `checkActiveSession` y el badge del
    Sidebar filtran por él — retirarlo requeriría ampliar el CHECK de `estado`, se
    difiere). `checkActiveSession` deriva la etiqueta de la columna con
    `labelSubPilar`, con fallback al parseo legacy `Pilar:X | tipo` para sesiones en
    curso iniciadas antes del deploy.
  - ✅ `handleResumeSession` lee presentes de `asistencia` por `sesion_id`, con doble
    fallback legacy (`[MODO_CANCHA: id]` en notas → todos los de hoy).
  - ✅ `AdminSesiones` gana "Guardar como plantilla del Modo Cancha" (`crearPlantilla`
    con `club_id` del usuario, exigido por la RLS; mapa `TIPO_A_OBJETIVO` de TIPOS →
    pilar/sub_pilar canónico; Evaluación/Recuperación quedan sin objetivo, son
    formatos). También se completó `sub_pilar='resistencia'` en la plantilla semilla
    que quedó NULL en v21.
  - `AdminSesiones.TIPOS` se queda como está: filtra `ejercicios_catalogo.tipo`, y ese
    catálogo está **VACÍO en producción (0 filas)** — hallazgo de esta fase; poblarlo
    es contenido pendiente, no refactor.
  - Verificación: suite 229/229, build de producción OK, lint sin problemas nuevos
    (los preexistentes confirmados con git stash).
- **P3b — Programar pruebas por grupo** ✅ CÓDIGO LISTO (2026-07-05; migración v23
  pendiente de `db push` + deploy, con autorización del owner). Decisiones del owner:
  **captura por estación/prueba** (se monta una prueba y se capturan todos los
  presentes, luego la siguiente) y **doble origen** (programada desde AdminSesiones +
  inmediata desde Modo Cancha). Lo construido:
  - **Migración v23** (`20260705221730`): `sesiones_programadas ADD pruebas_ids JSONB`
    — `pruebas_ids` NO NULL es el discriminador de "sesión de evaluación" (sin marker
    nuevo ni cambio del CHECK de estado/tipo). Columna separada de `ejercicios_ids`
    para no mezclar los catálogos espejo (§2.3). Validada en Docker
    (baseline+v21+v22+v23).
  - **Servicios**: `fetchPruebasEvaluacion` (catálogo de pruebas),
    `programarEvaluacionGrupal` (fila Programada con hora `00:00:00` hasta iniciarse),
    `fetchEvaluacionesProgramadasHoy` (las de hoy sin `[EN_CURSO]`),
    `guardarEvaluacionesLote(registros, {recalcular})` — inserta el lote y recalcula
    overall UNA vez por atleta (no por prueba: cada `recalcularOverall` dispara el
    pipeline de misiones de la Edge).
  - **AdminSesiones**: con tipo "Evaluación" el selector muestra PRUEBAS (no los
    ejercicios de entrenamiento, catálogo vacío) y al registrar crea también la sesión
    ejecutable con fecha/grupo/pruebas_ids.
  - **Modo Cancha**: 4ª opción "Evaluación Grupal" en el paso 1 → paso 2 selector de
    pruebas (el orden de selección = orden de estaciones) → pasa lista (asistencia
    real de P3a) → **paso 6: captura por estaciones**
    (`ModoCanchaModalCapturaEvaluacion`): input por atleta con tier/puntuación en vivo
    (mismo `normalizarValor` + perfil género/nivel del modal individual), atletas sin
    resultado se saltan, "Guardar estación" por lote y "Finalizar" recalcula y cierra
    la sesión como Completada. Las programadas de hoy aparecen en el paso 0 con
    "Iniciar" (premarca la asistencia con los atletas del grupo, ratificable);
    reanudar una evaluación `[EN_CURSO]` va a la captura, no al grid subjetivo.
  - Una evaluación NO escribe `sesiones_entrenamiento` (no es historial de
    entrenamiento) ni otorga XP base en el MVP (pendiente decisión de producto si
    asistir a evaluación debe dar XP).
  - Verificación: suite 229/229, build de producción OK, lint sin problemas nuevos.
  - **Orden de despliegue**: `db push` v23 ANTES del deploy web (el código consulta
    `pruebas_ids`; sin la columna, `fetchEvaluacionesProgramadasHoy` fallaría).

---

## 8. Decisiones del owner (2026-07-05) — ya no son preguntas abiertas

1. **Agilidad → Técnico.** (§3.4.1) Modo Cancha se alinea con
   `taxonomia.js`/`baremos.js`/radar; sin cambio de cálculo, solo de agrupación/UI.
2. **Liderazgo y Comunicación → sub-pilar `resiliencia`.** (§3.4.2) Sin cambio de
   conducta — formaliza el mapeo que ya hace `handleCerrarClase` hoy.
3. **Resistencia → sub-pilar físico NUEVO** con pruebas/baremos/misiones propios, no un
   tag transversal. (§3.4.3) Es el ítem con más trabajo pendiente: requiere diseño de
   baremos reales (ver P1.5) antes de tocar `taxonomia.js`/radar.
4. **Plantillas → reutilizar `catalogo_sesiones`** (tabla existente, vacía, sin código
   que la use — hallazgo del baseline de P1), no crear `sesiones_plantilla` desde cero.
   (§3.2, revisada 2026-07-05)
5. **Asistencia → extender la tabla `asistencia` ya existente** con `sesion_id` +
   relajar su `UNIQUE`. (§3.3.a)

**Preguntas de la fase anterior, ya resueltas y no reabiertas:** rol atleta en
Carga/Sueño (§4.1, conserva acceso); catálogos espejo (§2.3, dominios separados, no se
fusionan); XP (§2.4, ya consolidado en `analytics-core/xp.js`).

**Direcciones nuevas del owner (2026-07-05, tras aplicar P2):**

6. **Autoría de pruebas/baremos → vía `blackgold-mcp`, para los 8 sub-pilares.** La
   creación de pruebas de evaluación y baremos deja de ser un ejercicio manual de
   "definir con el cuerpo técnico y escribir seeds": el MCP gana tooling de autoría
   (P1.5 redefinida en §7) y cubre los 3 pilares / 8 sub-pilares, con umbrales por
   **edad (categoría FEB) y nivel de desarrollo (Micro/Desarrollo/Elite)** — esta
   segunda dimensión es nueva en el modelo de baremos.
7. **Programación de pruebas por grupo.** La evaluación deja de estar limitada a la
   tarjeta individual del atleta: el coach podrá programar pruebas específicas para un
   grupo y capturarlas en un solo flujo (P3 en §7).

~~**Sigue pendiente de decisión (no bloquea el resto, ver P1.5):** qué prueba(s) exactas
por sub-pilar y sus cortes.~~ ✅ RESUELTO (2026-07-05): el owner aprobó el lote completo
propuesto (6 pruebas + 2 reclasificaciones) — ver P1.5 en §7. `resistencia` ya es el 8º
eje del radar. Quedan como contenido futuro los cortes definitivos de 600m/1000m (tablas
originales de Vinueza) y ampliar `tactica`.
