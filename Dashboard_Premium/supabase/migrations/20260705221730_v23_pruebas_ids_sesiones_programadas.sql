-- ============================================================
-- MIGRACIÓN v23 — Evaluaciones grupales (fase P3b)
-- Diseño: docs/unificacion_sesiones_cancha_evaluacion.md (§7 P3b)
-- ============================================================
-- Una sesión programada puede ser una SESIÓN DE EVALUACIÓN: lleva la lista de
-- pruebas (catalogo_ejercicios, el catálogo de pruebas de evaluación) que el
-- grupo ejecutará. pruebas_ids NO NULL es el discriminador: no hace falta
-- marker en notas ni tipo nuevo (el CHECK de estado/tipo no se toca).
-- Columna separada de cualquier ejercicios_ids a propósito, para no mezclar
-- los catálogos espejo (ejercicios_catalogo vs catalogo_ejercicios, §2.3).

ALTER TABLE sesiones_programadas
  ADD COLUMN IF NOT EXISTS pruebas_ids JSONB DEFAULT NULL;
