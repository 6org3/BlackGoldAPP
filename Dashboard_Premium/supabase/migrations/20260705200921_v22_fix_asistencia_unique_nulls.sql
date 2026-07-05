-- ============================================================
-- MIGRACIÓN v22 — HOTFIX: unique de asistencia con NULLS NOT DISTINCT
-- ============================================================
-- v21 cambió UNIQUE(atleta_id, fecha) → UNIQUE(atleta_id, fecha, sesion_id) y eso
-- introdujo DOS defectos (reproducidos contra el esquema real en Postgres local):
--
--   1. ROTURA VIVA: el upsert del pase de lista diario (AdminAsistencia →
--      asistenciaService, ON CONFLICT (atleta_id, fecha)) dejó de encontrar una
--      constraint que coincida → "no unique or exclusion constraint matching the
--      ON CONFLICT specification" → el guardado de asistencia diaria falla.
--   2. Con UNIQUE estándar los NULL son distintos entre sí: las filas del pase
--      diario (sesion_id NULL) no se deduplican — (atleta, fecha, NULL) podía
--      repetirse infinitamente.
--
-- Fix: UNIQUE NULLS NOT DISTINCT (Postgres 15+; producción corre 17). Con eso
-- (atleta, fecha, NULL) es único de verdad, y el upsert puede apuntar a la
-- constraint completa (asistenciaService pasa sesion_id explícito, NULL para el
-- pase diario). Cero cambio de datos.

ALTER TABLE asistencia DROP CONSTRAINT IF EXISTS asistencia_atleta_fecha_sesion_key;
ALTER TABLE asistencia
  ADD CONSTRAINT asistencia_atleta_fecha_sesion_key
  UNIQUE NULLS NOT DISTINCT (atleta_id, fecha, sesion_id);
