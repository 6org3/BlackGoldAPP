# Comunicaciones Segmentadas y Eventos Deportivos — Diseño Técnico

*Black Gold Basketball · Dashboard Premium · v18*
*Estado: planificación · Autor del diseño: equipo de producto · Fecha: 2026-06-25*

---

## 1. Objetivo

Evolucionar el módulo de comunicaciones actual (4 tipos: Anuncio, Grupal, Personalizado, Individual) hacia un **motor de segmentación de audiencias** que cubra todos los criterios que el club necesita —individual, grupal, individualizado/custom, grupos limitados, por categoría, por edad, por género y general— y **optimizarlo para la operación de eventos deportivos** (convocatorias con confirmación, recordatorios automáticos, logística y resúmenes post-evento).

Canales de entrega de esta fase: **WhatsApp** (links `wa.me` pre-formateados, como hoy) y **notificación in-app** en el feed del Portal Padre y dashboards. Push/email quedan documentados como fase posterior.

---

## 2. Punto de partida (lo que ya existe)

El módulo vive en `src/pages/AdminComunicaciones.jsx` con su servicio `src/api/comunicacionesService.js`. Las tablas actuales son `comunicaciones` (`id, autor_id, tipo, grupo_id, atleta_id, titulo, mensaje, created_at`) y `comunicacion_destinatarios` (`comunicacion_id, usuario_id`). El feed del padre se arma en `fetchComunicacionesParaPadre()` mezclando anuncios generales, mensajes del grupo del hijo y notas individuales.

Los datos que ya tenemos para segmentar viven en `usuarios` (`nombre, rol, club, categoria, fecha_nacimiento, genero, telefono`) y `atletas` (`usuario_id, edad, posicion, overall_score`). La categoría FEB se deriva con `calcularCategoriaFEB()` a partir de la fecha de nacimiento (Premini Sub-9 → Mayores). El vínculo familiar está en `padres_atletas` (`padre_id, atleta_id`). Roles vigentes: `superadmin, owner, coach, atleta, padre`.

**Dependencia detectada:** no existe hoy una relación directa atleta ↔ `grupos_entrenamiento` (los grupos se usan en `sesiones_control` vía `grupo_id`, pero no hay tabla de pertenencia). Para que "Grupal" y "grupos limitados" funcionen de forma robusta hace falta una membresía explícita. La migración v18 la crea (`atleta_grupo`).

---

## 3. Modelo conceptual: el segmento como filtro componible

En lugar de multiplicar "tipos" de mensaje, el diseño separa **qué se comunica** (la `comunicacion`) de **a quién** (el `segmento`). Un segmento es un conjunto de criterios que, al resolverse, produce una lista concreta de destinatarios (usuarios). Esto permite que cualquier comunicado o evento reutilice la misma maquinaria de audiencia.

Cada comunicación apunta a un segmento mediante un campo `segmento_tipo` y un `segmento_params` (JSON). La audiencia efectiva se calcula resolviendo esos parámetros contra los datos del club en el momento del envío (y se "congela" en `comunicacion_destinatarios` para tener registro histórico aunque luego cambie la plantilla del club).

### 3.1 Tipos de segmento

| `segmento_tipo` | Descripción | Parámetros (`segmento_params`) | Resolución de audiencia |
|---|---|---|---|
| `general` | Todo el club | — | Todos los usuarios activos del club |
| `individual` | Una persona | `{ usuario_id }` o `{ atleta_id }` | Ese usuario (y opcionalmente su representante) |
| `individualizado` | Lista manual a la carta | `{ usuario_ids: [] }` | Exactamente esos usuarios (= "Personalizado" actual) |
| `grupo` | Un grupo de entrenamiento | `{ grupo_id }` | Atletas del grupo + sus representantes |
| `grupos_limitados` | Varios grupos seleccionados | `{ grupo_ids: [] }` | Unión de atletas de esos grupos + representantes |
| `categoria` | Por categoría FEB | `{ categorias: ["Sub-14", ...] }` | Atletas cuya categoría calculada coincide |
| `edad` | Por rango de edad | `{ edad_min, edad_max }` | Atletas con edad dentro del rango |
| `genero` | Por género | `{ genero: "Masculino"\|"Femenino" }` | Atletas de ese género |
| `compuesto` | Combinación AND de criterios | `{ filtros: {...} }` | Intersección (ej. Femenino **y** Sub-16 **y** grupo X) |

El tipo `compuesto` es el que da la potencia real para eventos: "convocar a las jugadoras **Femenino + Sub-16** del **grupo Competencia**" es un solo segmento. Los tipos simples son atajos de UX sobre el mismo motor.

### 3.2 Inclusión de representantes (padres)

Para deporte formativo, la mayoría de comunicados deben llegar **también al representante**. Cada comunicación lleva un flag `incluir_representantes` (default `true`). Cuando la audiencia resuelve atletas, la vista de resolución añade los `padre_id` vinculados en `padres_atletas`. Para mensajes dirigidos solo al jugador (ej. una nota técnica del coach), se desactiva el flag.

### 3.3 Resolución y congelado

Al enviar, el backend (o un RPC de Supabase) ejecuta la vista/función `resolver_audiencia(segmento_tipo, segmento_params, incluir_representantes)` que devuelve la lista de `usuario_id`. Esa lista se inserta en `comunicacion_destinatarios` con su estado de lectura. Ventaja: el feed in-app de cada usuario es un simple `SELECT` por `usuario_id`, y el histórico queda intacto aunque después cambien grupos o edades.

---

## 4. Optimización para eventos deportivos

Un evento es una entidad de primera clase (`eventos`) que **genera comunicaciones** en distintos momentos de su ciclo de vida. El segmento del evento define a quién se convoca; el ciclo de vida dispara los mensajes.

### 4.1 Tipos de evento

`partido`, `torneo`, `entrenamiento_especial`, `clinica` (Small Ball Camp), `reunion`, `evaluacion`, `social`. Cada uno reutiliza la misma estructura; el tipo solo cambia las plantillas y los íconos.

### 4.2 Ciclo de vida y comunicaciones disparadas

```
  CREAR EVENTO ──► CONVOCATORIA ──► RECORDATORIOS ──► CHECK-IN ──► RESULTADO
   (borrador)      (RSVP abierto)    (auto 24h/2h)    (día D)      (post-evento)
```

1. **Convocatoria + confirmación (RSVP).** Al publicar el evento se crea una comunicación de tipo convocatoria contra el segmento elegido. Cada destinatario-atleta obtiene una fila en `evento_convocados` con estado `pendiente`. El atleta/representante confirma `asiste` / `no_asiste` / `duda` desde el Portal o respondiendo por WhatsApp (en la fase WhatsApp, la confirmación la registra el coach con un toque; in-app es self-service). El panel del coach muestra el conteo en vivo (confirmados / dudas / faltas / sin responder).

2. **Recordatorios automáticos.** Reglas configurables por evento (`recordatorios`: ej. T-24h y T-2h). Un job programado revisa eventos próximos y emite la comunicación de recordatorio **solo a quienes siguen `pendiente` o `duda`**, evitando spam a los ya confirmados. (Implementable con `pg_cron` en Supabase o una tarea programada externa que llame un RPC.)

3. **Logística estructurada.** El evento guarda `sede, direccion, hora_llegada, hora_inicio, uniforme, transporte, notas_logistica`. La plantilla de WhatsApp/in-app los renderiza en un bloque fijo y legible (ver §6).

4. **Check-in día del evento.** El coach marca asistencia real (`presente`/`ausente`/`tarde`) en `evento_convocados`. Esto alimenta el historial de asistencia del atleta y permite cruzar "convocado vs. presente".

5. **Resultado y resumen post-evento.** Al cerrar, el evento guarda `marcador, resultado (ganó/perdió/empató), destacados (MVP, máximo anotador, máximo anotador de 2 puntos, máximo anotador de 3 puntos), notas`. Se dispara una comunicación de resumen al segmento (y opcionalmente al club entero para partidos). Plantilla con marcador y destacados. *(Para partidos de campeonato esto será solo la "capa de cierre" de una captura mucho más rica —la planilla de juego digital y la mesa de control— descrita como capacidad futura en §11.)*

### 4.3 Por qué encaja con la segmentación

El campo de audiencia del evento es exactamente un `segmento_tipo` + `segmento_params`. Convocar "Sub-16 Femenino" a un torneo, recordar solo a los indecisos y enviar el resultado al club entero son tres comunicaciones distintas sobre el mismo evento, cada una con su propio segmento. Cero lógica nueva de audiencia.

---

## 5. Flujos de UX (AdminComunicaciones + nueva pestaña Eventos)

### 5.1 Redactar comunicado (pantalla actual, ampliada)

El selector de tipo pasa de 4 botones a un **selector de audiencia en dos niveles**: primero el criterio (General · Individual · Lista · Grupo(s) · Categoría · Edad · Género · Combinado), luego el panel de parámetros correspondiente. Debajo, un **contador de alcance en vivo** ("Llegará a 23 atletas y 21 representantes — 44 destinatarios") calculado con la función de resolución antes de enviar. Esto evita errores de "le mandé al grupo equivocado". El toggle "Incluir representantes" y la previsualización del mensaje (WhatsApp e in-app) completan el panel.

### 5.2 Crear/gestionar evento (pestaña nueva)

Formulario con: tipo de evento, título, fecha/hora, bloque de logística, y el mismo selector de audiencia. Al guardar como borrador no se notifica; al **Publicar** se dispara la convocatoria. La vista de detalle del evento muestra el tablero de RSVP en vivo, botones para "Enviar recordatorio ahora", configuración de recordatorios automáticos, check-in del día y, al cerrar, el formulario de resultado que dispara el resumen.

### 5.3 Lado del padre/atleta (Portal Padre)

El feed in-app ya existe; se amplía para mostrar tarjetas de evento con botones **Confirmar asistencia / No puedo / Tal vez**. Las convocatorias pendientes aparecen destacadas arriba con la fecha. Cada acción escribe en `evento_convocados` y actualiza el tablero del coach en tiempo real.

---

## 6. Plantillas de mensaje (WhatsApp + in-app comparten cuerpo)

**Convocatoria a partido:**
```
🏀 *CONVOCATORIA — Black Gold*
{categoria} · vs {rival}

📅 {fecha} · 🕐 Llegada {hora_llegada} (inicio {hora_inicio})
📍 {sede} — {direccion}
👕 Uniforme: {uniforme}
🚌 Transporte: {transporte}

¿Confirmas asistencia? Responde *SÍ* / *NO* / *TAL VEZ*
```

**Recordatorio (solo pendientes):**
```
⏰ *Recordatorio* — {titulo} es {cuando} ({fecha} {hora_inicio}).
Aún no tenemos tu confirmación. 📍 {sede}. ¡Te esperamos! 🏀
```

**Resultado / resumen:**
```
🏀 *RESULTADO — Black Gold {marcador_propio} - {marcador_rival} {rival}*
{resultado_emoji} {resultado}

⭐ Destacado: {mvp}
🎯 Máximo anotador: {top_scorer} ({top_puntos} pts)
🏀 Máximo en 2 puntos: {top_dobles} ({num_dobles} de 2)
🏹 Máximo en 3 puntos: {top_triples} ({num_triples} de 3)
📝 {notas}

¡Gracias por el apoyo, familia Black Gold! 🖤💛
```

Estas plantillas viven en `comunicacionesService.js` como funciones generadoras (siguiendo el patrón existente de `generarMensajeSesion` / `generarMensajeRecordatorioPago`).

---

## 7. Modelo de datos (resumen; SQL completo en la migración v18)

- **`comunicaciones`** — se amplía con `segmento_tipo`, `segmento_params jsonb`, `incluir_representantes bool`, `evento_id` (nullable), `canal`. Se conservan `tipo`, `grupo_id`, `atleta_id` por compatibilidad.
- **`comunicacion_destinatarios`** — se amplía con `leido bool`, `leido_at`, para el feed in-app.
- **`atleta_grupo`** *(nueva)* — pertenencia atleta ↔ grupo (resuelve la dependencia de §2).
- **`eventos`** *(nueva)* — datos del evento, logística, segmento, resultado.
- **`evento_convocados`** *(nueva)* — RSVP y check-in por atleta (`estado_rsvp`, `asistencia_real`).
- **`evento_recordatorios`** *(nueva)* — reglas de recordatorio automático por evento.
- **`resolver_audiencia(...)`** *(función)* — traduce segmento → lista de `usuario_id`.

---

## 8. Plan de implementación por fases

**Fase A — Segmentación (sin eventos).** Migración de columnas `segmento_*` + tabla `atleta_grupo` + función `resolver_audiencia`. Ampliar el selector de audiencia y el contador de alcance en `AdminComunicaciones.jsx`. Entregable: cualquier comunicado se puede segmentar por los 8 criterios.

**Fase B — Eventos core.** Tablas `eventos` y `evento_convocados`. Pestaña de eventos, convocatoria con RSVP, tablero del coach, tarjetas de evento en Portal Padre. Entregable: convocar y ver confirmaciones.

**Fase C — Automatización y cierre.** `evento_recordatorios` + job (`pg_cron`/tarea programada), check-in del día, resultado y resumen post-evento.

**Fase D (posterior) — Push/Email.** Notificaciones PWA y correo reutilizando `comunicacion_destinatarios`.

---

## 9. Consideraciones

**Seguridad (RLS).** Las nuevas tablas deben tener políticas: coaches/owner/superadmin escriben comunicaciones y eventos de su `club`; atletas y padres solo leen lo dirigido a ellos y solo escriben su propio RSVP. La función de resolución debe ejecutarse con `security definer` y filtrar por club.

**Privacidad.** Segmentar por género/edad es legítimo para logística deportiva, pero la UI no debe exponer listas sensibles a roles no autorizados; el contador de alcance puede mostrar números sin nombres para coaches con permisos limitados.

**Idempotencia de recordatorios.** Cada recordatorio enviado se registra para no duplicar si el job corre dos veces.

**Compatibilidad.** Los 4 tipos actuales siguen funcionando: `Anuncio→general`, `Grupal→grupo`, `Personalizado→individualizado`, `Individual→individual`. La migración mapea los registros existentes.

---

## 11. Capacidad futura: Gestión de campeonatos y planilla de juego digital

*Solicitado por el owner. Estado: visión / no programado todavía. Esta sección define el alcance para que el modelo de eventos de §4 crezca hacia ella sin rehacer nada.*

> **Pendiente:** la imagen de referencia de la planilla impresa no llegó en este mensaje. El diseño siguiente asume la **planilla FIBA estándar** y una **mesa de control reglamentaria**. Cuando subas tu planilla, ajusto nombres de campos, número de periodos y cualquier particularidad de tu liga.

### 11.1 Objetivo

Que el owner del club pueda **crear y gestionar un campeonato de cero** —equipos, calendario, sedes— y que, partido a partido, registre de forma **fácil y fluida** toda la información que hoy se llena a mano en la planilla impresa: no solo el marcador final, sino la anotación corrida, faltas, tiempos muertos, parciales por cuarto y los datos de la mesa de control (cronómetro de juego de cada cuarto, posesión de 24" y reposición de 8"). El resultado alimenta automáticamente estadísticas, tabla de posiciones y los comunicados de resultado de §4.

### 11.2 Dos piezas que conviene separar

La operación de un partido tiene dos naturalezas distintas y es mejor no mezclarlas:

**(a) La mesa de control en vivo (cronómetros).** El cronómetro general del cuarto (10:00 en FIBA), el reloj de posesión de 24" (14" en rebote ofensivo) y los 8" de avance de media cancha son un **temporizador en tiempo real**. Es una herramienta operativa durante el juego, sensible a latencia, y normalmente la maneja una persona en la mesa. En la app esto sería un **panel de cronómetros** (game clock + shot clock sincronizados, con faltas de equipo y bonus, tiempos muertos restantes). Puede vivir como pantalla independiente y, si hay conexión, transmitir el marcador en vivo; pero su valor principal es operar el partido, no almacenar.

**(b) La planilla / acta digital (registro de datos).** Es el **registro persistente** de lo ocurrido: quién anotó, faltas, tiempos muertos, parciales. Es lo que de verdad debe guardarse y agregarse. La captura puede ser **en vivo** (cada canasta/falta se toca en el momento, y de paso mueve los cronómetros) o **diferida** (alguien digitaliza la planilla de papel después del partido, que es el flujo de "registro fácil y fluido" que pediste). El modelo de datos es el mismo en ambos casos.

El camino recomendado: empezar por **(b) la planilla digital diferida** (transcribir el papel con una UI mobile-first, ver §11.5), porque entrega estadísticas y posiciones con poco riesgo; y dejar **(a) la mesa de control en vivo** como una segunda fase opcional que, cuando exista, simplemente *escribe en la misma planilla*.

### 11.3 Modelo de datos propuesto (futuro)

Reutiliza `eventos` (un partido de campeonato es un `evento` de tipo `partido` con `campeonato_id`). Entidades nuevas:

| Tabla | Para qué | Campos clave |
|---|---|---|
| `campeonatos` | El torneo en sí | `nombre, temporada, formato (liga/eliminatoria/grupos), modalidad (3x3/5x5), max_jugadores_equipo, categoria, genero, estado` |
| `campeonato_equipos` | Equipos participantes (cada uno con un representante que carga su plantilla) | `campeonato_id, nombre, es_propio (bool), logo, representante_nombre, representante_contacto, representante_usuario_id (nullable), token_formulario, roster_completo (bool)` |
| `equipo_jugadores` | Plantilla maestra de cada equipo (fuente del roster por partido) | `equipo_id, atleta_id (nullable si rival externo), dorsal, nombre, licencia, posicion, capitan` |
| `campeonato_partidos` | Vincula evento ↔ campeonato y rivales | `evento_id, campeonato_id, equipo_local_id, equipo_visitante_id, jornada, fase` |
| `partido_roster` | Jugadores en el acta de ese partido (se pre-carga copiando la plantilla maestra de `equipo_jugadores`; se ajusta solo por cambios de último momento) | `partido_id, equipo_id, atleta_id (nullable si rival externo), dorsal, nombre, titular, capitan, licencia` |
| `partido_anotaciones` | Anotación corrida (cada canasta/tiro libre); `asistencia_roster_id` enlaza al que asistió | `partido_id, roster_id, periodo, minuto, puntos (1/2/3), tipo (TL/2P/3P), asistencia_roster_id (nullable), marcador_local, marcador_visitante` |
| `partido_acciones` | Estadísticas sin puntos: rebote (ofensivo/defensivo), robo, tapón, pérdida | `partido_id, roster_id, periodo, minuto, accion (rebote_of/rebote_def/robo/tapon/perdida)` |
| `partido_faltas` | Faltas por jugador | `partido_id, roster_id, periodo, tipo (personal/técnica/antideportiva/descalificante), minuto` |
| `partido_tiempos_muertos` | Tiempos muertos | `partido_id, equipo_id, periodo, minuto` |
| `partido_periodos` | Parciales y datos de cierre por cuarto | `partido_id, periodo, puntos_local, puntos_visitante, faltas_equipo_local, faltas_equipo_visitante` |

Con `partido_anotaciones`, `partido_acciones` y `partido_faltas` se derivan **todas** las estadísticas individuales (puntos por jugador, distribución de tiro, **asistencias**, **rebotes** ofensivos/defensivos, robos, tapones, pérdidas, faltas, +/- por periodo) y de equipo, sin guardar agregados redundantes. La **tabla de posiciones** del campeonato es una vista sobre `partido_periodos` (PJ, PG, PP, puntos a favor/en contra, diferencia, puntos de clasificación según formato).

### 11.4 Mesa de control (cuando se construya la fase en vivo)

Estado a mantener en memoria/tiempo real, no necesariamente persistido por sí mismo: `game_clock` (mm:ss del cuarto en curso), `shot_clock` (24/14/8 según situación), `periodo`, `marcador`, `faltas_equipo` por periodo (con indicador de **bonus** al llegar a la 5ª falta de equipo), `tiempos_muertos_restantes` por mitad. Cada acción del operador (canasta, falta, tiempo muerto, fin de cuarto) genera el registro correspondiente en las tablas de §11.3 — así la mesa de control "llena la planilla" automáticamente.

### 11.5 UX de "registro fácil y fluido"

**No replicar el papel: rediseñar para móvil.** La captura *no* imita la grilla de la planilla impresa (inusable en un teléfono). Es un **rediseño mobile-first**, pensado para operarse con una mano desde el celular en la banca: la acción central es elegir un jugador y registrar lo que pasó con toques grandes (+1 / +2 / +3, falta, tiempo muerto, rebote), con el marcador y el periodo siempre visibles arriba. La misma información de la planilla FIBA se sigue capturando, pero reorganizada en flujos cortos en vez de una hoja densa de dos columnas. Atajos para los casos comunes y validaciones suaves (avisar si un jugador supera 5 faltas, si la suma de parciales no cuadra con el marcador).

**Encadenar estadísticas en un solo gesto.** Para enriquecer el juego sin frenar la captura, una acción puede registrar **varias estadísticas de una vez**. Al anotar un tiro de 2 o de 3, aparece un micro-paso opcional: *¿asistencia?* → elegir al compañero que asistió, o "nadie". Así, con dos toques, queda registrada la canasta **y** la asistencia. De forma análoga, el rebote se registra seleccionando jugador y marcando ofensivo/defensivo. Esto permite derivar estadísticas importantes —puntos, **asistencias** y **rebotes** (y, si se desea, robos, tapones, pérdidas)— sin convertir la captura en un formulario lento: todo son toques rápidos y siempre saltables. Modo diferido: el owner abre el partido cerrado y transcribe; modo en vivo (futuro): los toques mueven también los cronómetros.

**Planilla pre-cargada con datos cargados por cada equipo.** La cabecera de la planilla *no se llena en el momento del partido*: se arma antes, al organizar el torneo, y la carga de jugadores **se delega a cada equipo**. Al dar de alta un equipo en `campeonato_equipos`, el owner designa un **participante/representante** (con su contacto). La app le **envía un enlace a un formulario** (in-app o público vía WhatsApp) para que ese representante llene él mismo los datos de sus jugadores —nombre, dorsal, posición, licencia— que quedan en `equipo_jugadores`. Para el equipo propio del club, los datos se heredan directo de `atletas`/`usuarios` sin formulario. El **tamaño del plantel es libre y depende de la modalidad**: configurable por campeonato, p. ej. hasta 4 jugadores en un torneo 3×3 o hasta 15 en uno 5×5 (`max_jugadores_equipo`). Así, al generar el calendario, cada `campeonato_partidos` ya conoce a local y visitante con sus rosters completos. Cuando llega la **hora programada del evento** (§4), la planilla aparece **ya pre-llenada** con ambos planteles y solo resta capturar el juego. Si hay cambios de último momento, se ajusta el roster de *ese* partido sin tocar el registro maestro del equipo.

**Activación por horario.** El estado del partido sigue el ciclo de vida de §4 (`borrador → publicado → en_curso → cerrado`). La planilla digital se habilita para captura cuando el evento entra en ventana de juego (al llegar `fecha_evento`/`hora_inicio` pasa a `en_curso`), de modo que el llenado "se inicia cuando se ejecuta el horario". Antes de esa hora la planilla está disponible solo en modo previsualización/ajuste de roster; después de cerrar, en modo lectura (con permiso de corrección para el owner).

### 11.6 Cómo se conecta con lo ya diseñado

Nada de esto rompe §1–§10. El partido sigue siendo un `evento` con su **segmento** (a quién se convoca) y su ciclo de vida (convocatoria, recordatorios, check-in). La novedad es que, al **cerrar**, en vez de teclear solo el marcador, el owner llena la planilla digital; el comunicado de resultado de §4.2 (5) se genera con datos mucho más ricos (máximo anotador real, etc.) y el campeonato actualiza su tabla de posiciones. Implica un módulo nuevo, pero apoyado en las mismas bases.

### 11.7 Resúmenes, reportes y distribución a equipos

Una vez iniciado el campeonato, **todos los equipos y sus representantes tienen acceso a los resúmenes**, no solo el club. Los reportes se generan automáticamente desde los datos capturados, en tres niveles:

1. **Resumen de partido.** Al cerrar un partido, la app genera un resumen (marcador, parciales por cuarto, destacados: máximo anotador, máximo en 2 y en 3 puntos) y lo publica para ambos equipos. Es el mismo comunicado de resultado de §4.2 (5), ahora alimentado por la planilla.

2. **Cierre de fecha / jornada.** Cuando termina una fecha, en una **liga** se **actualizan los acumulados a la fecha**: tabla de posiciones de equipos, top anotadores, top de triples, líderes por categoría. Se emite un resumen de la jornada con esos rankings actualizados.

3. **Cierre de campeonato.** Al finalizar, un **informe visual bien diseñado** con las estadísticas del evento: campeón, posiciones finales, líderes estadísticos, gráficos. Pensado para compartirse como pieza presentable.

**Distribución a quienes no usan la plataforma.** Muchos equipos rivales no tendrán cuenta en Black Gold. Por eso cada resumen/reporte debe poder **enviarse fácil por fuera**: un enlace público de solo lectura y/o una **imagen o PDF bien diseñado** (reutilizando el motor de diseño de imágenes y el patrón de plantillas WhatsApp de §6) que el owner manda al grupo del torneo. Así un representante externo recibe la tabla de posiciones o el resumen del partido sin instalar nada.

*Implementación:* las posiciones y rankings son **vistas/consultas** sobre `partido_periodos` y `partido_anotaciones` (sin tablas nuevas); el reporte visual es una plantilla renderizada a imagen/PDF; la distribución reutiliza canales de §6 (WhatsApp + in-app) más un enlace público con token de solo lectura.
