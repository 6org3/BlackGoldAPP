-- ============================================================
-- Limpieza — revierte plantilla_id (diseño descartado a favor del PR #130)
-- ============================================================
-- Contexto: dos sesiones de Claude Code resolvieron en paralelo la misma
-- mejora opcional del PR #127 (persistir la plantilla del Modo Cancha para
-- que sobreviva al reanudar). Esta sesión (PR #129, cerrado sin mergear)
-- añadió `ejercicios_ids` + `plantilla_id` (FK); el PR #130 (elegido por el
-- owner, más completo — incluye además la mejora del padre viendo sesiones
-- grupales) añadió solo `ejercicios_ids`, derivando el título desde
-- `pilar_objetivo` en vez de una referencia a la plantilla.
--
-- `ejercicios_ids` la necesitan ambos diseños con el mismo nombre/tipo — se
-- conserva (la migración v49 del PR #130 la encontrará ya creada, ADD COLUMN
-- IF NOT EXISTS es no-op). `plantilla_id` es exclusiva del diseño descartado:
-- se elimina para no dejar una columna huérfana sin código que la use.

ALTER TABLE sesiones_programadas
  DROP COLUMN IF EXISTS plantilla_id;
