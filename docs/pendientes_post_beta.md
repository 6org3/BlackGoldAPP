# Pendientes post-beta — Black Gold

**Fecha:** 2026-07-04 · **Contexto:** la primera beta se publicó hoy (Vercel `black-gold-app-bwai.vercel.app`, commits hasta `fa3c3ba`) con el loop evaluación→misión→XP completo, catálogo curado (56 misiones activas), tendencias multi-punto, Auth v19 y e2e en verde. Este documento consolida TODO lo que quedó pendiente, con su porqué y cómo ejecutarlo. Fuentes: `docs/spec_loop_misiones_baremo.md`, `docs/plan_remediacion_seguridad.md`, `packages/analytics-core/baremos_cientificos.md` y los hallazgos de la sesión de publicación.

---

## P0 — Seguridad (el bloque diferido conscientemente para poder lanzar)

### 1. RLS real basada en `auth.uid()`
**Qué:** las políticas de Row Level Security siguen siendo permisivas: 4 tablas de v18 tienen `FOR ALL USING (true)` y las tablas base (`usuarios`, `atletas`, `evaluaciones_pruebas`, `padres_atletas`, `asistencia`, `pagos`, `misiones`, `recompensas`) no tienen RLS documentada.
**Por qué importa:** cualquiera con la anon key (pública por diseño, embebida en el bundle) puede leer/escribir datos de menores (cédulas, fechas de nacimiento, contactos de padres, pagos). Es el riesgo legal más serio del proyecto. Se difirió por decisión explícita para lanzar la beta con usuarios de confianza.
**Cómo:** (a) capturar el baseline del esquema (punto 6, prerequisito); (b) diseñar el modelo: función `SECURITY DEFINER` tipo `current_user_rol()`/`current_user_club()` para usar en policies sin recursión; (c) migración que reemplaza las políticas permisivas y agrega las de tablas base; (d) validar por rol: coach NO lee otro club, padre solo ve sus hijos, atleta solo lo suyo, anon key bloqueada. **Ojo:** `blackgold-mcp` usa la anon key — necesitará una policy propia o pasar a service role. Diseño de referencia: `docs/plan_remediacion_seguridad.md` §Fase 2.

### 2. Rotación de la anon key
**Qué:** la anon key histórica estuvo expuesta en ~32 scripts versionados en git (ya purgados del working tree, pero viven en el historial del repo).
**Cómo:** dashboard de Supabase → Settings → API → rotar. Después actualizar el valor en: (1) variables de entorno del proyecto en Vercel (`VITE_SUPABASE_ANON_KEY`) + redeploy, (2) `Dashboard_Premium/.env.local`, (3) `blackgold-mcp/.env`. Verificar que la key vieja devuelve 401/403.

### 3. Grep final de secretos + verificación de acceso
**Qué:** cierre formal de la Fase 0/3 del plan de seguridad: `git grep -E 'sk_live|anon.*key|pk_[a-zA-Z0-9]'` → 0 resultados, y confirmar que la key rotada ya no da acceso.

### 4. Contraseña de la cuenta coach de prueba
**Qué:** las credenciales de `carlos.coach@blackgold.com` (password `admin123`) quedaron pegadas en un chat de esta sesión de trabajo.
**Cómo:** cambiar la contraseña desde "Editar Perfil" en la app, o eliminar la cuenta si ya no se usa. Las 4 cuentas QA (`QA-OWNER-001`, `QA-COACH-001`, `QA-ATLETA-001`, `QA-PADRE-001`, club "QA Demo Club") conviene CONSERVARLAS: son las credenciales de `cypress.env.json` para el e2e.

### 5. Eliminar la columna `usuarios.contrasena_hash`
**Qué:** obsoleta desde la migración a Supabase Auth (v19); contiene contraseñas de staff en texto plano.
**Cómo:** migración corta (`ALTER TABLE usuarios DROP COLUMN contrasena_hash`) tras confirmar con grep que ningún flujo la lee ya.

---

## P1 — Datos y esquema

### 6. Baseline del esquema versionada
**Qué:** las tablas base nunca tuvieron `CREATE TABLE` en el repo — solo existen como acumulado histórico de ALTERs aplicados a mano. Sin baseline no se puede recrear la BD desde cero ni diseñar RLS con confianza.
**Cómo:** `npx supabase db dump --schema public -f supabase/migrations/00000000000000_baseline.sql` (requiere CLI logueada, ya vinculada) y commitearla. Es el prerequisito del punto 1.

### 7. Formato de thresholds de pruebas creadas por el coach
**Qué:** las pruebas creadas con `NuevaPruebaModal` guardan `thresholds` con forma `{Masculino:{Sub12:[...]}}` que `normalizarValor` no sabe leer → caen al estado `noAplica` y no se pueden evaluar.
**Cómo:** decidir el formato canónico (plano por bucket, como BAREMOS) y (a) migrar las filas existentes o (b) adaptar `NuevaPruebaModal` para guardar plano + migrar. El script `scripts/sync_catalogo_ejercicios.mjs` las reporta como "intocables" — ahí está la lista.

---

## P1 — Producto (loop de misiones, spec Fase 2-3)

### 8. Notificación al coach de asignaciones propuestas
**Qué:** cuando el loop propone misiones específicas (o la IA genera una), entran a la cola "Asignaciones Propuestas" de Gestionar Misiones, pero el coach no se entera si no abre esa pantalla.
**Cómo:** badge con contador en el ítem "Gestionar Misiones" del sidebar (count de `progreso_misiones` con `estado='pendiente_aprobacion'`). Era el P1 declarado de la Fase 2 del spec.

### 9. Métricas del primer ciclo trimestral (T3 2026)
**Qué:** el spec define las métricas que validan todo el sistema; hay que medirlas cuando corran las evaluaciones reales:
- ≥90% de atletas con misión auto-asignada ≤48h tras evaluación.
- ≥70% de asignaciones específicas aprobadas sin editar (si <50%, el catálogo o el selector están mal calibrados).
- <20% de debilidades cayendo en `sinCobertura` (generación IA).
- Tasa de completado de misiones `auto_baremo` ≥ que las manuales.
**Cómo:** queries sobre `progreso_misiones` (columnas `origen`, `estado`, `fecha_asignacion`, `evaluacion_id` existen justo para esto). Con los datos, recalibrar la dosis D6 (`maxDebilidades=3 × porDebilidad=2`).

### 10. Superficies de la Fase 3 del spec (con datos de dos ventanas)
**Qué:** las funciones ya existen (`calcularDelta`, `agregarDebilidadesGrupo` en `analytics-core/tendencias.js`) y el panel grupal del coach ya está; faltan dos superficies:
- **Padre:** una línea en el reporte WhatsApp con el sub-pilar trabajado y su delta del período.
- **Owner:** KPI en `OwnerKPIsPage` de % misiones auto-generadas completadas y delta en sub-pilares objetivo vs. no objetivo (la métrica que valida el spec entero).
**Cuándo:** rinden con datos de reevaluación (después del primer ciclo).

### 11. Completar la matriz del catálogo a niveles explícitos (opcional)
**Qué:** las 56 misiones sembradas usan `nivel_objetivo = null` (comodín: sirven para cualquier nivel del atleta; la dosis por edad va en la descripción). El spec ideal es la matriz 7×3×4 = 84 celdas con nivel Micro/Desarrollo/Elite explícito.
**Cómo:** con datos del primer ciclo, decidir si vale la pena diferenciar por nivel; si sí, usar las tools MCP `generar_catalogo_misiones` + `insertar_misiones_catalogo` para las celdas por nivel. También decidir el destino de la misión IA de demo (`[IA] Agilidad de Jaguar…`, inactiva) y de las asignaciones de prueba del atleta QA.

---

## P2 — Ciencia de los baremos (de `packages/analytics-core/baremos_cientificos.md`)

### 12. Diferenciación por género — ✅ RESUELTO (2026-07-22)
**Qué:** hoy TODOS los atletas se evalúan con el mismo set de umbrales, pese a que FitnessGram y la literatura de salto vertical juvenil diferencian por sexo (especialmente push-ups, dominadas, CMJ). El parámetro fantasma de código ya se eliminó; falta la implementación real.
**Estado:** hecho. 8 pruebas físicas se separan por sexo desde Sub15 (cmj_salto, pushups_30s, pushups_max, dominadas, sentadilla_rel, press_banca_rel, sit_reach, lane_agility) con umbrales femeninos citables + verificación adversarial; 5 quedaron unisex por evidencia insuficiente (cadera_ri/re, hombro_re/ri, zigzag_balon). El runtime ya pasa `genero` por `normalizarValor` (`EvaluacionModal.jsx`). Ver `docs/baremos_por_sexo_2026.md`. Pendiente menor: recalibrar con datos propios del club (las 5 unisex + los buckets de baja confianza pushups_30s/lane_agility) tras el primer ciclo.

### 13. Umbrales de movilidad idénticos en las 4 edades
**Qué:** `dorsiflexion`, `cadera_ri`, `cadera_re`, `hombro_re`, `hombro_ri` repiten el mismo umbral en Sub12/Sub15/Sub18/Senior. La evidencia clínica muestra variación (modesta) con la edad. Validar con el cuerpo técnico si fue intencional.

### 14. Salto brusco de `sit_reach` entre Sub15 y Sub18
**Qué:** el umbral "excellent" sube +9 cm entre buckets; la literatura del estirón (PHV) documenta pérdida transitoria de flexibilidad en esa edad. Verificar contra la fuente original antes del primer ciclo de misiones de movilidad.

### 15. Banda de tier inalcanzable en `dominadas` Sub12
**Qué:** umbrales `[0, 0, 3, 8]` → el tier `below_avg` es matemáticamente imposible (se pasa de "Debe Mejorar" con 0 a "Promedio" con 1). Decidir si es intencional (suelo razonable a esa edad) o corregir.

### 16. Validar el mapeo categoría FEB → bucket de baremo
**Qué:** el mapa `categoriaABucketBaremo` (mapeo por "techo": Premini/Mini→Sub12, Menores→Sub15, Prejuvenil/Juvenil→Sub18, Mayores→Senior) tiene un `PENDIENTE: validar con el cuerpo técnico` en el código desde su creación.

### 17. Herramienta MCP `proponer_prueba_evaluativa` (P2 del spec)
**Qué:** extender D3 a las pruebas: que el MCP proponga nuevas pruebas evaluativas con umbrales justificados por fuentes, para revisión humana antes de entrar a `BAREMOS`.

---

## Cerrado recientemente (para no volver a investigarlo)

- ✅ Loop misiones Fases 0-2 completas y verificadas E2E en producción (incl. idempotencia total y rama Gemini).
- ✅ Catálogo de 56 misiones curado y activo (2026-07-04, sesión del coach).
- ✅ Duplicados de `catalogo_ejercicios` limpiados (28 filas; respaldos en `scripts/backup_catalogo_duplicados_*.json`) + dedupe defensivo en `EvaluacionModal`.
- ✅ Bug de la cola de aprobaciones del coach (FK ambigua) — hotfix `fa3c3ba` desplegado; destapó 7 misiones completadas reales pendientes de XP.
- ✅ Columna `categoria_feb` faltante en producción (la v20 nunca se había ejecutado) — fix aplicado.
- ✅ Config Vercel para monorepo (`sourceFilesOutsideRootDirectory`) — sin esto ningún deploy compila.
- ✅ Cypress 4/4 con cuentas QA; Vitest 168/168.
