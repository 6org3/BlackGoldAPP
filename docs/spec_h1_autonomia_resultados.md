# Spec: H1 Autonomía — loop autónomo, reporte al padre y conciliación de cobros

**Fecha:** 2026-07-16
**Estado:** Propuesta — pendiente de decisiones del owner
**Contexto:** continúa `docs/spec_loop_misiones_baremo.md` (loop evaluación→misión→XP, ya en producción) y ataca los pendientes #8, #9 y #10 de `docs/pendientes_post_beta.md`, condicionado por su P0 #1 (RLS). Es la fase **H1** del doc "Ideas — El Fin del Software aplicado a BlackGold y Miami Store" (2026-07-16): primero *resultado demostrado*, después garantías, nunca promesas sobre muestras chicas. Tres features (F1, F2, F3) comparten un principio: **el humano audita por excepción, no aprueba por defecto** — y sus corolarios por feature: *demostrar > prometer* (F2) y *detectar/preparar > ejecutar dinero* (F3).

---

## Decisiones propuestas (2026-07-16)

> Todas son **PROPUESTAS** que Jorge (owner) debe ratificar antes de implementar. Ninguna toca dinero ni escritura autónoma sin que el prerrequisito H1-D1 esté cerrado.

**Transversal**

- **H1-D1** (prerrequisito, bloqueante) — Aclarar la contradicción de RLS antes de dar a cualquier agente permiso de escritura. `pendientes_post_beta.md` #1 (2026-07-04) marca RLS como P0 sin resolver (4 tablas v18 `FOR ALL USING (true)`), pero `blackgold-mcp/src/index.js` y `pagos_diseno.md` §7.2 asumen "RLS v24" vigente con helpers (`es_staff()`, `current_user_rol()`, `mis_atletas()`, `current_user_club()`, `es_superadmin()`). Se verifica el estado real, por tabla, de cada tabla que un agente H1 toca (`progreso_misiones`, `misiones`, `pagos`, `pago_transacciones`, `pago_comprobantes`, `comunicaciones`) y no se activa autonomía hasta tener esa verificación escrita.
- **H1-D2** — Regla estadística **n<3** como función pura nueva `confianzaSubPilar(pruebas) → { n, nivel: 'firme'|'provisional' }` en `packages/analytics-core` (deriva `n` de `pruebas.length`, el mismo array que `detectarDebilidades` ya agrega por `sub_pilar`). El doc de rack `blackgold-mcp/knowledge/sesgo_muestra_pequena.md` **ya existe** (recreado el 2026-07-29). Se verificó que nunca llegó a entrar a git — `git log --all -S "sesgo_muestra"` solo devuelve los commits que lo *mencionan* (este spec y el del MCP de negocio), ninguno que lo añada — así que no se perdió: no se había creado. Cabo cerrado. La regla vive en el rack (conocimiento del deporte) y en la función pura (cálculo), nunca hardcodeada en `src/index.js`.
- **H1-D3** — **Kill-switch por feature** en `club_config`: columnas booleanas nuevas `autonomia_misiones`, `reporte_padre_auto`, `conciliador_activo` (nueva), **default `false`** (OFF). Cada feature H1 verifica su flag antes de actuar; apagar una no apaga las otras.

**F1 — Loop autónomo con auditoría por excepción**

- **H1-D4** — Matriz de autonomía: **(i)** `origen='auto_baremo'` + `complejidad='general'` → **auto** (es el comportamiento actual, D4 del spec de misiones, `estado='pendiente'`). **(ii)** `origen='auto_baremo'` + `complejidad='especifica'` + confianza `firme` (n≥3 en el sub-pilar) + misión del catálogo curado (`activa=true`, **no** `is_ai_generated` bajo demanda) → **NUEVA auto-aprobación**: se inserta con `estado='aprobada'`, `asignado_por`=usuario sistema y fila de auditoría. **(iii) EXCEPCIONES** (siempre `estado='pendiente_aprobacion'`): `origen='ia'` (Gemini bajo demanda), confianza `provisional` (n<3), sub-pilar en `sinCobertura`, o misión idéntica rechazada por el coach en los últimos 90 días.
- **H1-D5** — La cola **"Asignaciones Propuestas"** pasa a contener **solo excepciones**. Se añade una pestaña/feed informativo **"Auto-aprobadas"** con acción de reversión 1-tap: `revertirAsignacion()` (nueva) devuelve la fila a `estado='pendiente_aprobacion'` y registra motivo.
- **H1-D6** — El badge del pendiente **#8** se implementa contando **solo excepciones** (`estado='pendiente_aprobacion'`) — subconjunto pequeño y accionable, no toda la producción del loop.
- **H1-D7** — **Auto-degradación (guardrail):** si el coach revierte **>20%** de las auto-aprobadas en 30 días, el sistema apaga **solo** `autonomia_misiones` y notifica al owner. Reutiliza como umbral de calibración la métrica ya definida en el spec de misiones ("≥70% de específicas aprobadas sin editar").
- **H1-D8** — **Auditoría:** tabla `misiones_auditoria` (nueva), espejo del patrón `pagos_auditoria` v30 (`tg_registrar_auditoria_pago()`), con trigger `AFTER INSERT/UPDATE` sobre `progreso_misiones`.

**F2 — Reporte de resultado al padre (resultado demostrado)**

- **H1-D9** — **Cadencia combinada:** mensual **informativo** (misiones completadas, XP, asistencia — **sin deltas**) + trimestral **con delta real**, disparado por **EVENTO** (cierre de la evaluación trimestral), no por cron.
- **H1-D10** — **Granularidad trimestral:** solo los sub-pilares **trabajados en el período** (los `sub_pilar_objetivo` de las misiones del trimestre) + una línea de resumen general. **Máximo 3 líneas de delta. Nunca los 8 ejes** del radar.
- **H1-D11** — **Guardrails estadísticos obligatorios:** si `n<3` en la ventana (`confianzaSubPilar` = `provisional`) → **no** se reporta delta numérico, se reporta "en evaluación" (lenguaje de tendencia, no de promesa); **nunca** comparar contra otros atletas (longitudinal individual, regla de `baremos_cientificos.md`); **silenciar** alarmas por caídas de movilidad/`sit_reach` en ventanas de estirón (PHV) con un mensaje neutro predefinido.
- **H1-D12** — **Canal:** el **portal del padre es la fuente de verdad** ("Estado de Progreso", espejo del "Estado de Cuenta" de `pagos_diseno.md` §7.2); WhatsApp = resumen de 1–3 líneas vía nueva clave `reporte_progreso_trimestral` (nueva) en `PLANTILLAS` de `src/lib/plantillasWhatsApp.js`, registrado en `comunicaciones`, dirigido con `resolver_audiencia()`/`padres_atletas` (al atleta si es Mayores sin representante). Cálculo con funciones puras existentes (`calcularDelta`, `ultimasPorPrueba`) + `confianzaSubPilar` (nueva); **cero lógica en la UI**.

**F3 — Agente de conciliación de cobros (v1 = detectar y preparar, NUNCA ejecutar dinero)**

- **H1-D13** — **Alcance v1 estricto:** el agente es **READ-ONLY** sobre `pagos`, `pago_transacciones` y `pago_comprobantes`. **No** crea transacciones, **no** cambia estados financieros, **no** aprueba comprobantes (datos financieros de familias con menores; `resolver_comprobante` sigue 100% humano).
- **H1-D14** — **Qué hace:** corre tras `marcar_pagos_vencidos()` (pg_cron existente, `'15 5 * * *'`; el agente a las 6:00) y produce: **(a)** cola de mensajes W2 pre-redactados por familia con `recordatorio_pago`/`pago_vencido`, personalizados por historial (primera vez vs reincidente = tono distinto); el staff dispara el lote con **1 tap por revisión**. **(b)** digest **semanal** de morosidad **por familia** al owner (patrón, no agregado: familia, meses seguidos con atraso, monto acumulado, si tiene `recordatorios_pausados`). **(c)** detección de incoherencias para el arqueo (pagos `Por Verificar` >72h, comprobantes `pendiente` >48h, transacciones de efectivo sin comprobante).
- **H1-D15** — **Respeta siempre** `atletas.recordatorios_pausados` (jamás redacta mensaje para un pausado). Si un pausado acumula **>45 días** vencido, aparece **solo** en el digest del owner con su `recordatorios_pausados_motivo`, nunca en la cola de mensajes.
- **H1-D16** — **Permisos:** **no** reutilizar `es_staff()`. Función `SECURITY DEFINER` acotada de solo lectura + `INSERT` únicamente en la tabla nueva `cola_recordatorios` (estado `borrador`|`enviado`|`descartado`) y en `comunicaciones` al confirmarse el envío. Precedente: MCP con `service_role`, pero **acotado por función, no key abierta**.
- **H1-D17** — **Escalamiento W2→W3** (Cloud API) se decide con los umbrales **ya definidos** en `pagos_diseno.md` §6.5; el agente **instrumenta** esas métricas (mensajes/mes generados, morosidad día 15) para que la decisión sea con datos.

---

## 1. Problema

El loop de misiones y el ciclo de cobros funcionan, pero **frenan siempre en un humano que debe abrir una pantalla** para que algo avance, y el valor demostrado (mejora medida) **nunca llega al padre**. En una operación de ~40 familias eso genera tres cuellos:

- **(a) F1 — aprobación universal.** Hoy toda misión `especifica` y toda `ia` entra a `pendiente_aprobacion` (D4 del spec de misiones). El coach no se entera si no abre "Asignaciones Propuestas" (pendiente #8, badge aún no implementado). No hay señal de confianza (`n` por sub-pilar) ni criterio de excepción: se trata igual una recomendación firme de catálogo curado que una generación IA sobre 1 sola prueba.
- **(b) F2 — el resultado no se demuestra.** Las funciones de delta (`calcularDelta`, `agregarDebilidadesGrupo`) existen desde Fase 3 y el panel grupal del coach ya las consume, pero **el padre y el owner no ven nada** (pendientes #10 y #9). El club no puede *demostrar* que las misiones mueven la aguja — solo *prometerlo* —, y con muestras chicas prometer es estadísticamente irresponsable (no hay regla `n<3` implementada en `analytics-core` ni en el MCP — hueco verificado en el código el 2026-07-16).
- **(c) F3 — la cobranza es 80+ taps/mes.** `marcar_pagos_vencidos()` marca `Vencido` por fecha pura; no hay score de morosidad por familia ni cola de recordatorios. `pagos_diseno.md` §6.5: "con ~40 familias, recordatorios + confirmaciones son 80+ taps/mes — en la práctica las confirmaciones se omitirán". El arqueo de efectivo y las incoherencias (comprobantes viejos sin resolver) se detectan a ojo.

**Costo de no resolverlo:** el activo estratégico (baremos + loop) queda como una demo que nadie audita con criterio; el club sigue vendiendo *futuro* en vez de *resultado demostrado* (bloqueando H2 del doc de Ideas, que depende de tener resultado antes de ofrecer garantías); y el owner gasta su atención en cobranza mecánica en vez de en las 3–4 familias que de verdad necesitan una conversación.

## 2. Objetivos (verificables)

1. **F1:** una fracción medible de las misiones específicas del catálogo curado se **auto-aprueba** cuando la confianza es `firme`, sin pasar por la cola; la cola contiene solo excepciones y el coach puede revertir cualquier auto-aprobación en 1 tap, con auditoría completa en `misiones_auditoria`.
2. **F1 (guardrail):** si la calidad de las auto-aprobaciones cae (reversión >20% en 30 días), el sistema se **auto-degrada** apagando `autonomia_misiones` y avisa al owner — sin intervención manual.
3. **F2:** cada padre con evaluación trimestral cerrada recibe un **Estado de Progreso** en su portal (fuente de verdad) + resumen WhatsApp, mostrando **solo** los sub-pilares trabajados con delta real **cuando `n≥3`**, y "en evaluación" cuando no — sin comparar contra otros atletas ni alarmar por PHV.
4. **F2 (owner):** `OwnerKPIsPage` muestra el KPI del pendiente #10 (delta en sub-pilares objetivo vs no objetivo) — la validación del spec de misiones entero.
5. **F3:** los taps de staff en cobranza bajan de **80+/mes a ≤10/mes** (una revisión diaria de la cola), con **0 escrituras del agente en tablas financieras** (verificable en `pagos_auditoria`), respetando siempre `recordatorios_pausados`.
6. **F3 (owner):** digest semanal de morosidad **por familia** (patrón, no agregado) + detección de incoherencias de arqueo, más las métricas que instrumentan la decisión W2→W3.

## 3. No-objetivos (v1)

- **Precio por resultado o garantías comerciales** (H2 del doc de Ideas): bloqueado por muestra chica hasta tener resultado demostrado y estable.
- **Envío automático de WhatsApp sin humano en el loop** (W3/Cloud API): F3 v1 llega hasta *preparar la cola*; el humano dispara.
- **Que el agente F3 toque dinero o estados financieros:** no crea transacciones, no cambia `pagos.estado`, no aprueba comprobantes.
- **Generación de misiones nuevas por IA sin aprobación:** `origen='ia'` sigue **siempre** en la cola de excepciones.
- **Deltas a nivel de 8 ejes al padre:** máximo 3 líneas de sub-pilares trabajados + resumen.
- **Moras/recargos automáticos, prorrateo, comisión de pasarela:** fuera de alcance (igual que v27).

## 4. Historias de usuario

- Como **atleta**, quiero ver de inmediato la misión que ataca mi punto débil cuando la recomendación es firme, sin esperar a que el coach abra una pantalla — pero que un humano pueda corregir si se equivocó el sistema.
- Como **coach**, quiero que la cola solo me muestre lo que de verdad necesita mi criterio (IA, poca muestra, sin cobertura), y poder deshacer cualquier auto-aprobación con un tap; si empiezo a deshacer mucho, quiero que el sistema se apague solo y avise, no que siga insistiendo.
- Como **padre**, quiero ver en mi portal en qué trabajó mi hijo este trimestre y si mejoró de verdad — con lenguaje honesto ("en evaluación" cuando hay pocos datos), sin compararlo con otros y sin que me alarmen por una baja pasajera del estirón.
- Como **owner**, quiero (a) ver si las misiones completadas correlacionan con mejora en baremos, para defender el club con datos; y (b) que un agente me prepare la cobranza y me señale, por familia, quién lleva meses atrasado y qué comprobantes llevan días sin resolver — sin que ese agente toque un centavo.

## 5. Estado actual relevante (verificado en código)

| Pieza | Estado |
|---|---|
| `progreso_misiones` | `atleta_id, mision_id, completada, estado (pendiente/pendiente_aprobacion/aprobada/rechazada), fecha_completada, asignado_por, tipo_asignacion, fecha_asignacion, origen (coach/auto_baremo/ia), sub_pilar_objetivo, evaluacion_id`. Sin auditoría propia. |
| `misiones` (catálogo) | Fase 1: `nivel_objetivo, categoria_bucket, justificacion, complejidad (general/especifica), activa`; v26: `contexto, fase_temporada`; `is_ai_generated` separa catálogo curado vs generación bajo demanda. 56 misiones activas curadas (2026-07-04). |
| Flujo de aprobación (D4) | `complejidad='general'`→`pendiente` (auto); `complejidad='especifica'`→`pendiente_aprobacion`; `sinCobertura`→IA `origen='ia'`, siempre `pendiente_aprobacion`. Cola "Asignaciones Propuestas" en "Gestionar Misiones". **Badge #8 no implementado.** |
| Señal de confianza `n` | **Existe** desde el 2026-07-29: `confianzaSubPilar(pruebas)` en `packages/analytics-core/recomendaciones.js` (reexportada por `index.js` y sincronizada a las Edge Functions). Ningún consumidor la usa todavía — F1 y F2 siguen pendientes de ratificación. |
| `blackgold-mcp/knowledge/sesgo_muestra_pequena.md` | **Existe** (recreado 2026-07-29). Se verificó que nunca estuvo en git: no se perdió, no se había creado. Fundamenta la regla n<3 (firme vs. provisional); la función pura `confianzaSubPilar` sigue pendiente. |
| `analytics-core/tendencias.js` | `calcularDelta(antes, después)→[{sub_pilar, antes, despues, delta}]` (granularidad sub-pilar) y `agregarDebilidadesGrupo(...)` **ya existen**; panel grupal del coach ya las consume. Falta exponer al padre (#10a) y al owner (#10b). |
| Canales al padre | Portal `PadreDashboard.jsx` (patrón "Estado de Cuenta" `pagos_diseno.md` §7.2); `src/lib/plantillasWhatsApp.js` con `PLANTILLAS` (12 claves) + `renderPlantilla`/`linkWhatsApp`. **No hay plantilla de progreso/delta.** Todo envío registra fila en `comunicaciones.proposito`; `resolver_audiencia()` (v18) segmenta. |
| Ciclo de cobro (v27) | `pagos` (estados `Pagado/Pendiente/Vencido/Becado/Por Verificar/Abonado/Anulado`), `pago_transacciones` (trigger recalcula `pagos.monto_pagado`/`estado`), `pago_comprobantes` (RPC `resolver_comprobante` SECURITY DEFINER, solo `es_staff()`). |
| `marcar_pagos_vencidos()` | pg_cron `'15 5 * * *'`, marca `Vencido` por fecha pura. Sin score de morosidad por familia ni cola. |
| `atletas.recordatorios_pausados` + `_motivo` | Pausa por acuerdo verbal; cualquier agente conciliador DEBE respetarla. `atletas.beca_pct`, `padres_atletas.es_rep_pagos` (a quién van los recordatorios). |
| `pagos_auditoria` (v30) | `tg_registrar_auditoria_pago()` ya existe (`20260712054353_v30_pagos_auditoria.sql`) — **verificar estado real** (§9 de `pagos_diseno.md` la ponía en P2). |
| `club_config` | `whatsapp_club, cuenta_bancaria_texto, qr_deuna_path, dia_vencimiento (5), descuento_hermanos_pct, pasarela`. Sin flags de autonomía. |
| RLS | **Contradicción abierta** (H1-D1): #1 P0 sin resolver (4 tablas v18 `FOR ALL USING (true)`) vs "RLS v24" que asumen el MCP y `pagos_diseno.md`. `pagos_staff` = `FOR ALL` a `es_staff()` sin filtro por club (deuda declarada). |

## 6. Fases

> Migraciones tentativas siguiendo `YYYYMMDDHHMMSS_vNN_descripcion.sql`; la secuencia real va hasta v32 (`20260713160924_v32_ocupacion_cancha.sql`), así que la **próxima es v33** (numeración tentativa). Todos los bloques SQL/JS son **ilustrativos** y aditivos (`IF NOT EXISTS`). Ninguna columna citada sin `(nueva)` existe hoy.

### Fase 0 — Prerrequisitos transversales (P0, bloqueante de F1/F3)

- **P0 (H1-D1)** — **Verificación de RLS real.** Documento corto por tabla que un agente H1 escribe (`progreso_misiones`, `comunicaciones`, `cola_recordatorios` nueva) o lee sensible (`pagos`, `pago_transacciones`, `pago_comprobantes`): ¿qué policy aplica hoy, con qué helper, con qué filtro por club? Cerrar la contradicción #1 vs v24. **Sin este cierre no se activa ningún flag de autonomía de escritura.**
- **P0 (H1-D2)** — ✅ **HECHO (2026-07-29).** Las dos mitades están en `main`: el fundamento deportivo en `blackgold-mcp/knowledge/sesgo_muestra_pequena.md` y la función pura `confianzaSubPilar(pruebas, { umbral })` en `packages/analytics-core/recomendaciones.js`, con el umbral exportado como `UMBRAL_CONFIANZA_FIRME` (un solo valor que cambiar cuando se ratifique Q1) y 9 tests en `Dashboard_Premium/src/lib/recomendaciones.test.js`.

```js
// packages/analytics-core/recomendaciones.js — IMPLEMENTADO
export const UMBRAL_CONFIANZA_FIRME = 3; // ratificable, ver Q1

export function confianzaSubPilar(pruebas = [], { umbral = UMBRAL_CONFIANZA_FIRME } = {}) {
  const n = Array.isArray(pruebas) ? pruebas.filter(Boolean).length : 0;
  return { n, nivel: n >= umbral ? 'firme' : 'provisional' };
}
```

> **Precisión de semántica que el spec no explicitaba:** `n` cuenta pruebas **distintas** que miden el sub-pilar (amplitud), no mediciones repetidas en el tiempo. Es consecuencia de la entrada elegida: la lista `pruebas` de `detectarDebilidades` viene de `ultimasPorPrueba`, que ya se queda con la última fila de cada `prueba_tipo`. Un atleta con tres sentadillas en tres fechas da **n=1**, no 3. Para F2 (delta trimestral al padre, H1-D11) eso es lo que se quiere — el delta se calcula sobre una ventana, no sobre historial —, pero **la confianza de una tendencia (cuántos puntos hacen creíble una pendiente) sigue sin resolver**: `tendencias.js` construye las series pero ninguna función declara ese umbral.

- **P0 (H1-D3)** — Kill-switch por feature en `club_config` (columnas nuevas, default OFF).

```sql
-- 2026MMDDHHMMSS_v33_h1_kill_switch.sql — ILUSTRATIVO (v33 tentativo)
ALTER TABLE club_config
  ADD COLUMN IF NOT EXISTS autonomia_misiones  BOOLEAN NOT NULL DEFAULT false,  -- (nueva)
  ADD COLUMN IF NOT EXISTS reporte_padre_auto  BOOLEAN NOT NULL DEFAULT false,  -- (nueva)
  ADD COLUMN IF NOT EXISTS conciliador_activo  BOOLEAN NOT NULL DEFAULT false;  -- (nueva)
```

**Given/When/Then:** Given un club recién migrado a v33, When cualquier feature H1 arranca, Then lee su flag en `club_config`, lo encuentra en `false` y no escribe nada (autonomía apagada por defecto).

### Fase 1 — F1: loop autónomo con auditoría por excepción

**P0 — Tabla de auditoría (H1-D8).** Espejo de `pagos_auditoria` v30.

```sql
-- 2026MMDDHHMMSS_v34_misiones_auditoria.sql — ILUSTRATIVO
CREATE TABLE IF NOT EXISTS misiones_auditoria (   -- (nueva)
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  progreso_id   UUID,               -- FK a progreso_misiones
  atleta_id     UUID,
  accion        TEXT,               -- 'auto_aprobada' | 'revertida' | 'estado_cambiado'
  estado_antes  TEXT,
  estado_despues TEXT,
  origen        TEXT,               -- copia de progreso_misiones.origen
  actor         TEXT,               -- usuario sistema | uuid del coach
  motivo        TEXT,               -- obligatorio en 'revertida'
  creado_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Trigger AFTER INSERT/UPDATE sobre progreso_misiones, patrón tg_registrar_auditoria_pago().
```

**P0 — Matriz de autonomía en el orquestador (H1-D4).** Solo la rama (ii) es nueva; (i) ya existe y (iii) es el comportamiento por defecto conservado. Se decide en el orquestador `generar-misiones-ia` (Edge Function), no en la UI. `asignado_por` usa un **usuario sistema** (fila centinela en `usuarios`, ver Q2).

```js
// Edge Function generar-misiones-ia — ILUSTRATIVO, coherente con esquema real
const { n, nivel } = confianzaSubPilar(debilidad.pruebas);         // (nueva)
const esCatalogoCurado = mision.activa === true && !mision.is_ai_generated;
const rechazada90d = await misionRechazadaRecientemente(atleta_id, mision.id, 90);

let estado;
if (origen === 'ia' || nivel === 'provisional' || enSinCobertura || rechazada90d) {
  estado = 'pendiente_aprobacion';                                 // (iii) EXCEPCIÓN → cola
} else if (mision.complejidad === 'general') {
  estado = 'pendiente';                                            // (i) auto, ya es así hoy
} else if (mision.complejidad === 'especifica' && nivel === 'firme' && esCatalogoCurado
           && clubConfig.autonomia_misiones) {
  estado = 'aprobada';                                             // (ii) NUEVA auto-aprobación
}
await insertProgreso({ atleta_id, mision_id: mision.id, estado, origen,
  sub_pilar_objetivo: debilidad.sub_pilar, evaluacion_id,
  asignado_por: estado === 'aprobada' ? USUARIO_SISTEMA : null });
```

**P1 — Feed "Auto-aprobadas" + reversión 1-tap (H1-D5).** `revertirAsignacion()` (nueva) en `misionesService.js` vuelve la fila a `pendiente_aprobacion`, exige `motivo` y deja fila `accion='revertida'` en `misiones_auditoria`. La cola "Asignaciones Propuestas" filtra `estado='pendiente_aprobacion'` (ahora solo excepciones); el feed "Auto-aprobadas" lista `estado='aprobada'` con `asignado_por`=usuario sistema (para no mezclar con las aprobadas a mano por el coach).

```js
// misionesService.js — ILUSTRATIVO (nueva)
export async function revertirAsignacion(progresoId, motivo) {
  if (!motivo) throw new Error('motivo obligatorio'); // trazabilidad para la auto-degradación
  await supabase.from('progreso_misiones')
    .update({ estado: 'pendiente_aprobacion', asignado_por: null })
    .eq('id', progresoId);
  // el trigger de misiones_auditoria registra accion='revertida' con el motivo
}
```

**P1 — Badge #8 (H1-D6).** Contador en "Gestionar Misiones" del sidebar = `COUNT(*) FROM progreso_misiones WHERE estado='pendiente_aprobacion'` — ahora un número chico y accionable.

**P2 — Auto-degradación (H1-D7).** Job (pg_cron o al abrir el panel) que mide reversión de auto-aprobadas en 30 días.

```sql
-- ILUSTRATIVO: tasa de reversión de auto-aprobadas (últimos 30 días)
SELECT count(*) FILTER (WHERE accion='revertida')::numeric
       / NULLIF(count(*) FILTER (WHERE accion='auto_aprobada'), 0) AS tasa
FROM misiones_auditoria
WHERE creado_at >= now() - interval '30 days';
-- tasa > 0.20  →  UPDATE club_config SET autonomia_misiones = false;  + notificar owner
```

**Given/When/Then (F1):**
- Given un atleta con `n=4` evaluaciones del sub-pilar `movilidad` y una misión de catálogo `activa=true`, `is_ai_generated=false`, `complejidad='especifica'`, con `autonomia_misiones=true`, When se guarda la evaluación, Then la asignación se inserta con `estado='aprobada'`, `asignado_por`=usuario sistema y fila `accion='auto_aprobada'` en `misiones_auditoria`; **no** aparece en la cola.
- Given un atleta con `n=2` en `agilidad` (confianza `provisional`), When se ejecuta el orquestador, Then la asignación entra `pendiente_aprobacion` (excepción) y suma al badge #8.
- Given una debilidad en `sinCobertura` que Gemini cubre con `origen='ia'`, When se asigna, Then entra `pendiente_aprobacion` aunque el club tenga `autonomia_misiones=true`.
- Given que el coach revierte 5 de 20 auto-aprobadas del mes (25%), When corre el job de calibración, Then `club_config.autonomia_misiones` pasa a `false` y el owner recibe aviso.

### Fase 2 — F2: reporte de resultado al padre

**P0 — Cálculo puro + Estado de Progreso en el portal (H1-D9, D10, D11, D12).** Se arma con `ultimasPorPrueba` + `calcularDelta` + `confianzaSubPilar`, filtrando a los `sub_pilar_objetivo` de las misiones del trimestre. Cero lógica en la UI.

```js
// ILUSTRATIVO — construcción del reporte (función pura, sin UI)
function construirReporteProgreso(evalAntes, evalDespues, subPilaresTrabajados) {
  const deltas = calcularDelta(evalAntes, evalDespues)                 // ya existe
    .filter(d => subPilaresTrabajados.includes(d.sub_pilar));          // solo trabajados (D10)
  const lineas = deltas.slice(0, 3).map(d => {
    const { nivel } = confianzaSubPilar(d.pruebas || []);              // (nueva)
    if (nivel === 'provisional') return { sub_pilar: d.sub_pilar, texto: 'en evaluación' };
    if (esVentanaPHV(d.sub_pilar) && d.delta < 0)                      // silenciar estirón (D11)
      return { sub_pilar: d.sub_pilar, texto: MENSAJE_NEUTRO_PHV };
    return { sub_pilar: d.sub_pilar, delta: d.delta };
  });
  return { lineas, resumen: resumenGeneral(deltas) };                  // máx 3 + 1 resumen
}
```

El portal (`PadreDashboard.jsx`) muestra "Estado de Progreso" espejando el bloque "Estado de Cuenta real" de `pagos_diseno.md` §7.2 (un bloque por hijo, badges, servicio `fetch...` apoyado en la RLS del padre — cero cambios de RLS si v24 está confirmada por H1-D1). **Nunca** compara contra otros atletas.

**P1 — Cadencia y WhatsApp (H1-D9, D12).** El trimestral se dispara por **evento** (cierre de evaluación trimestral), no por cron; el mensual informativo (misiones completadas + XP + asistencia, sin deltas) puede ir por cron. Nueva clave en `PLANTILLAS`:

```js
// src/lib/plantillasWhatsApp.js — ILUSTRATIVO (clave nueva)
reporte_progreso_trimestral: {                                        // (nueva)
  proposito: 'comunicado',
  variables: ['nombre_atleta', 'sub_pilar', 'tendencia', 'periodo'],
}
// Cuerpo (1-3 líneas), tono honesto: usa "tendencia" ('mejoró', 'estable', 'en evaluación'),
// nunca un número si confianzaSubPilar = provisional. Registra fila en `comunicaciones`.
// Dirigido con resolver_audiencia()/padres_atletas (es_rep_pagos → representante;
// Mayores sin representante → variante 2ª persona al propio atleta).
```

**P2 — KPI del owner (H1-D pendiente #10b).** En `OwnerKPIsPage`: % de misiones auto-generadas completadas + delta promedio en **sub-pilares objetivo vs no objetivo** (usa `calcularDelta` + `sub_pilar_objetivo` de `progreso_misiones`). Es la métrica que valida el spec de misiones entero.

**Given/When/Then (F2):**
- Given un atleta con `n=4` en `fuerza` (sub-pilar trabajado, delta +6) y dos ventanas trimestrales, When se cierra la evaluación con `reporte_padre_auto=true`, Then el portal muestra "Estado de Progreso" con la línea `fuerza +6` y el WhatsApp `reporte_progreso_trimestral` con tendencia "mejoró", registrado en `comunicaciones`.
- Given un atleta con `n=2` en `velocidad`, When se genera el reporte, Then la línea dice "en evaluación" y **no** aparece número.
- Given una caída de `sit_reach` en un atleta en ventana PHV, When se genera el reporte, Then se muestra el mensaje neutro predefinido, no una alarma.
- Given solo una ventana de evaluación disponible, When se abre el portal, Then muestra estado vacío explícito (no pantalla en negro) y sin deltas.

### Fase 3 — F3: agente de conciliación de cobros (detectar y preparar)

**P0 — Cola + permisos acotados (H1-D13, D15, D16).** Tabla nueva y función `SECURITY DEFINER` read-only que **no** reutiliza `es_staff()`.

```sql
-- 2026MMDDHHMMSS_v35_cola_recordatorios.sql — ILUSTRATIVO
CREATE TABLE IF NOT EXISTS cola_recordatorios (   -- (nueva)
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  atleta_id     UUID,
  pago_id       UUID,                 -- FK a pagos (solo lectura del origen)
  plantilla     TEXT,                 -- 'recordatorio_pago' | 'pago_vencido' (existentes)
  destinatario  UUID,                 -- representante resuelto (padres_atletas.es_rep_pagos)
  cuerpo        TEXT,                 -- pre-redactado con renderPlantilla()
  tono          TEXT,                 -- 'primera_vez' | 'reincidente'  (H1-D14a)
  estado        TEXT NOT NULL DEFAULT 'borrador'
                CHECK (estado IN ('borrador','enviado','descartado')),
  generado_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- El agente: SELECT sobre pagos/pago_transacciones/pago_comprobantes (READ-ONLY, H1-D13)
--   + INSERT solo en cola_recordatorios; al confirmar envío, INSERT en comunicaciones.
--   Función SECURITY DEFINER acotada a esas operaciones — NO es_staff(), NO service_role abierta.
```

El agente corre **tras** `marcar_pagos_vencidos()` (pg_cron 5:15; el agente a las 6:00). Respeta `recordatorios_pausados`: un pausado **nunca** genera fila en `cola_recordatorios`. El staff revisa la cola y dispara el lote (patrón W2 de `pagos_diseno.md` §6.5), 1 tap por revisión. La personalización por historial (H1-D14a) elige tono y plantilla sin cambiar el texto base — solo se selecciona cuál de las plantillas existentes se pre-redacta:

```js
// ILUSTRATIVO — tono por historial (primera vez vs reincidente), sin escribir en pagos
function elegirRecordatorio(pago, historialAtleta) {
  const vencidosPrevios = historialAtleta.filter(p => p.estado === 'Vencido').length;
  const plantilla = pago.estado === 'Vencido' ? 'pago_vencido' : 'recordatorio_pago'; // existentes
  const tono = vencidosPrevios >= 2 ? 'reincidente' : 'primera_vez';
  return { plantilla, tono, cuerpo: renderPlantilla(plantilla, varsDe(pago)) }; // renderPlantilla ya existe
}
```

```sql
-- ILUSTRATIVO — candidatos a recordatorio (excluye pausados)
SELECT p.atleta_id, p.id AS pago_id, p.concepto, p.monto_final, p.fecha_vencimiento
FROM pagos p
JOIN atletas a ON a.id = p.atleta_id
WHERE p.estado IN ('Pendiente','Vencido','Abonado')
  AND a.recordatorios_pausados IS NOT TRUE;   -- H1-D15: jamás a pausados
```

**P1 — Digest de morosidad + incoherencias de arqueo (H1-D14b, D14c, D15).** Digest **por familia** (patrón, no agregado): familia, meses seguidos con atraso, monto acumulado, si tiene `recordatorios_pausados`. Un pausado con **>45 días** vencido aparece **solo aquí**, con su `recordatorios_pausados_motivo`. Incoherencias: `pagos` `Por Verificar` >72h, `pago_comprobantes` `pendiente` >48h, `pago_transacciones` con `forma_pago='Efectivo'` sin `comprobante_id`.

```sql
-- ILUSTRATIVO — incoherencias para el arqueo
-- Nota: "Por Verificar >72h" necesita saber cuándo el pago entró al estado; a falta de
-- columna propia, se usa la antigüedad del comprobante pendiente asociado como proxy.
SELECT 'comprobante_estancado' AS tipo, c.id, c.pago_id
FROM pago_comprobantes c
WHERE c.estado = 'pendiente' AND c.revisado_at IS NULL
  AND now() - c.created_at > interval '48 hours'
UNION ALL
SELECT 'verificar_estancado', p.id, p.id
FROM pagos p
JOIN pago_comprobantes c ON c.pago_id = p.id AND c.estado = 'pendiente'
WHERE p.estado = 'Por Verificar'
  AND now() - c.created_at > interval '72 hours'
UNION ALL
SELECT 'efectivo_sin_comprobante', t.id, t.pago_id
FROM pago_transacciones t
WHERE t.forma_pago = 'Efectivo' AND t.comprobante_id IS NULL;
```

**P2 — Instrumentar W2→W3 (H1-D17).** El agente cuenta mensajes/mes generados en `cola_recordatorios` + `comunicaciones` y calcula morosidad a día 15, para comparar contra los umbrales ya definidos (`pagos_diseno.md` §6.5: >150-200 mensajes manuales/mes, o morosidad día 15 sostenida >15%). Decisión con datos, no por intuición.

**Given/When/Then (F3):**
- Given un pago `Vencido` de una familia con historial limpio y `conciliador_activo=true`, When corre el agente a las 6:00, Then inserta una fila en `cola_recordatorios` con `plantilla='pago_vencido'`, `tono='primera_vez'` y `estado='borrador'`, y **no** inserta nada en `pagos`/`pago_transacciones`/`pago_comprobantes` (verificable: `pagos_auditoria` sin filas del agente).
- Given una familia con `recordatorios_pausados=true` y 50 días de atraso, When corre el agente, Then **no** genera fila en `cola_recordatorios` y sí aparece en el digest del owner con su `recordatorios_pausados_motivo`.
- Given un comprobante `pendiente` desde hace 3 días, When corre la detección de incoherencias, Then aparece en el reporte de arqueo como `comprobante_estancado` (el humano sigue resolviéndolo con `resolver_comprobante`).
- Given `conciliador_activo=false`, When llega la hora del agente, Then no genera cola ni digest.

## 7. Métricas de éxito

| Métrica | Tipo | Objetivo | Cuándo |
|---|---|---|---|
| Atletas con misión auto-asignada ≤48h post-evaluación (#9) | Leading | ≥90% | Primer ciclo trimestral (T3 2026) |
| Asignaciones que caen a excepción (`pendiente_aprobacion`) | Leading | <30% | T3 2026 |
| Tasa de reversión de auto-aprobadas | Guardrail | <10–20% (>20% → auto-degradación) | Rolling 30d desde F1 |
| Asignaciones específicas aprobadas sin editar (reusa spec misiones) | Leading | ≥70% (calibración) | T3 2026 |
| Padres con reporte trimestral entregado | Lagging | ≥80% | Reevaluación T4 2026 |
| Delta en sub-pilar objetivo vs no objetivo (#10, KPI owner) | Lagging | Positivo y mayor | Reevaluación T4 2026 |
| Morosidad a día 15 | Lagging | Baseline actual a medir; no empeorar | Mensual desde F3 |
| Taps/mes de staff en cobranza | Leading | de 80+ a ≤10 | Mensual desde F3 |
| Escrituras del agente F3 en tablas financieras | Guardrail (duro) | **0** (verificable en `pagos_auditoria`) | Continuo |

## 8. Preguntas abiertas

- **Q1** — ¿Ratificar el umbral **n≥3** vs n≥2 con el cuerpo técnico? Ligado a P2 #12–#16 de `pendientes_post_beta.md` (la calibración de baremos aún tiene huecos: género, movilidad por edad, `sit_reach` Sub15→Sub18, `dominadas` Sub12, mapeo categoría FEB). Un umbral demasiado alto deja casi todo en `provisional`; demasiado bajo promete sobre ruido.
- **Q2** — ¿El atleta ve la misión auto-aprobada **al instante**, o con un **delay de cortesía de 24h** para dar ventana de reversión al coach? Afecta cómo se muestra en `MisionesPanel` y la percepción de "el sistema decide solo".
- **Q3** — ¿Digest de morosidad **semanal o quincenal**? Semanal da más control; quincenal reduce ruido para el owner.
- **Q4** — ¿Dónde vive el agente F3: **Edge Function con pg_cron** (patrón `enviar-whatsapp` de W3) o **tool del MCP** invocada por un agente externo (OpenClaw)? Define dónde se acota el `SECURITY DEFINER` y quién dispara.
- **Q5** — Confirmar el **estado real de RLS v24** (H1-D1). Bloqueante de toda escritura autónoma. *(La parte de `sesgo_muestra_pequena.md` quedó resuelta el 2026-07-29: nunca estuvo en git, ya está recreado.)*
- **Q6** — ¿Cuál es la fila **usuario sistema** para `asignado_por` en auto-aprobaciones (centinela en `usuarios`) y cómo la trata la RLS?

## 9. Plan y dependencias

- **Fase 0 (transversal):** primero. H1-D1 (RLS) es bloqueante de F1 y F3; H1-D2/D3 habilitan el resto. Sin cierre de Q5 no se enciende ningún flag de escritura.
- **F1:** tras Fase 0. Auditoría (P0) antes que auto-aprobación (P0); feed + badge (P1); auto-degradación (P2) requiere ~30 días de datos de auto-aprobación para calibrar. Objetivo: encender `autonomia_misiones` en un club antes de la evaluación T3 2026.
- **F2:** tras Fase 0 (D2 `confianzaSubPilar`). El portal (P0) y WhatsApp (P1) rinden con **una** ventana para el informativo mensual; el delta trimestral y el KPI owner (P2) rinden con **dos** ventanas (T4 2026). Depende del prerrequisito ya conocido: quitar el mock de asistencia y la URL placeholder de `whatsappReport.js`.
- **F3:** tras Fase 0 (H1-D1 confirma que un agente puede leer `pagos*` sin `service_role` abierta). P0 (cola + permisos) → P1 (digest + arqueo) → P2 (instrumentar W2→W3). Reutiliza `marcar_pagos_vencidos()`, `PLANTILLAS` y `comunicaciones` existentes; no espera datos de reevaluación.
- **Dependencia dura común:** las tres features leen su flag en `club_config`; ninguna actúa con el flag en `false`. El guardrail "0 escrituras financieras del agente" se verifica contra `pagos_auditoria` v30 (confirmar su estado real, tabla §5).
