-- ============================================================
-- MIGRACIÓN — Loop Misiones Fase 1 (docs/spec_loop_misiones_baremo.md §Fase 1)
-- Ejecutar en: Supabase → SQL Editor (o `supabase db push`)
-- ============================================================
-- El catálogo de misiones ES la tabla misiones; se le agrega metadata
-- para selección determinista (sin tabla nueva de plantillas).
--
-- Nota consciente sobre `activa DEFAULT true`: el banco legacy de misiones
-- queda elegible para el selector, lo cual es aceptable porque (a) su
-- `complejidad` default es 'especifica' → toda asignación pasa por
-- aprobación del coach (D4), y (b) la mayoría tiene pilar 'youtube' o
-- 'articulo', fuera de los 7 sub-pilares del radar → nunca son candidatas
-- de seleccionarMisiones. Las misiones nuevas propuestas por el MCP o por
-- IA nacen explícitamente con activa=false (curaduría humana, D3).
-- ============================================================

ALTER TABLE misiones
  ADD COLUMN IF NOT EXISTS nivel_objetivo TEXT
    CHECK (nivel_objetivo IN ('Micro','Desarrollo','Elite')),
  -- (D3) individualización por edad: bucket de baremo de la categoría FEB
  ADD COLUMN IF NOT EXISTS categoria_bucket TEXT
    CHECK (categoria_bucket IN ('Sub12','Sub15','Sub18','Senior')),
  -- (D3) justificación científica, mismo estándar que los baremos
  ADD COLUMN IF NOT EXISTS justificacion TEXT,
  -- (D4) decide el flujo de aprobación de la asignación
  ADD COLUMN IF NOT EXISTS complejidad TEXT DEFAULT 'especifica'
    CHECK (complejidad IN ('general','especifica')),
  -- Las misiones propuestas por el MCP/IA nacen inactivas hasta que
  -- el coach las active (curaduría humana del catálogo):
  ADD COLUMN IF NOT EXISTS activa BOOLEAN DEFAULT true;

-- Trazabilidad del loop en la asignación:
ALTER TABLE progreso_misiones
  ADD COLUMN IF NOT EXISTS origen TEXT DEFAULT 'coach'
    CHECK (origen IN ('coach','auto_baremo','ia')),
  ADD COLUMN IF NOT EXISTS sub_pilar_objetivo TEXT,
  ADD COLUMN IF NOT EXISTS evaluacion_id UUID REFERENCES evaluaciones_pruebas(id);

-- Hardening de idempotencia (H3): una sesión de evaluación son N submits
-- del modal → N invocaciones de la Edge Function. El dedup de
-- seleccionarMisiones es la primera línea; este índice único es la red de
-- seguridad a nivel de datos. Verificado antes de esta migración: cero
-- pares (atleta_id, mision_id) duplicados en producción (21 filas).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_progreso_atleta_mision
  ON progreso_misiones (atleta_id, mision_id);

-- Clave estable para el sync BAREMOS ↔ catalogo_ejercicios
-- (scripts/sync_catalogo_ejercicios.mjs): la clave del objeto BAREMOS
-- ('cmj_salto', 'lane_agility', …). Las filas gestionadas a mano (p.ej.
-- 'Carga Subjetiva y Sueño', pruebas creadas por el coach) quedan con
-- NULL y el sync nunca las toca.
ALTER TABLE catalogo_ejercicios
  ADD COLUMN IF NOT EXISTS baremo_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_catalogo_baremo_key
  ON catalogo_ejercicios (baremo_key) WHERE baremo_key IS NOT NULL;
