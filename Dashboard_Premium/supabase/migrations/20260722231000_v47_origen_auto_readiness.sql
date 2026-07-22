-- ============================================================================
-- v47 — ORIGEN 'auto_readiness' EN progreso_misiones (recuperación → auto-assign)
-- ============================================================================
-- Decisión del owner 2026-07-22: el check-in diario de recuperación
-- (atleta_readiness: sueño/fatiga/hidratación) pasa a alimentar el auto-assign
-- de misiones en la Edge generar-misiones-ia. Las asignaciones que nacen de una
-- alerta de recuperación llevan origen='auto_readiness' para distinguirlas de
-- las de baremo ('auto_baremo'), las del coach ('coach') y las de IA ('ia').
--
-- El CHECK original nació inline con la columna (loop_misiones_fase1) con el
-- nombre autogenerado progreso_misiones_origen_check; se recrea con el valor
-- nuevo. Aditivo: ninguna fila existente viola el CHECK ampliado.
-- ============================================================================

ALTER TABLE public.progreso_misiones
  DROP CONSTRAINT IF EXISTS progreso_misiones_origen_check;

ALTER TABLE public.progreso_misiones
  ADD CONSTRAINT progreso_misiones_origen_check
  CHECK (origen IN ('coach', 'auto_baremo', 'ia', 'auto_readiness'));
