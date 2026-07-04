-- ============================================================
-- MIGRACIÓN — Fase 0 del spec docs/spec_loop_misiones_baremo.md (D1)
-- Ejecutar en: Supabase → SQL Editor
-- ============================================================
-- El trigger on_new_evaluation_generate_mission (creado en
-- 20260626093100_setup_webhook_ia.sql) está roto en producción desde v17:
--   (a) invoke_ai_mission_generator() llama a la Edge Function
--       generar-misiones-ia, que inserta `tipo: 'youtube'` en `misiones`,
--       pero v17 renombró esa columna a `pilar` → el INSERT falla desde
--       entonces. No se genera ninguna misión IA.
--   (b) el trigger dispara AFTER INSERT FOR EACH ROW: una sesión de
--       evaluación con 8 pruebas dispara 8 llamadas HTTP para el mismo
--       atleta en vez de una tanda consolidada.
--   (c) la función tenía hardcodeado un placeholder `Bearer YOUR_ANON_KEY`.
--
-- Se deshabilita en vez de parchear (D1): el disparo pasa a ser una
-- invocación explícita desde la app (D2, Fase 2) — `recalcularOverall`
-- llama una vez a la Edge Function al cerrar la evaluación, sin trigger
-- de base de datos ni token embebido en SQL.
-- ============================================================

DROP TRIGGER IF EXISTS on_new_evaluation_generate_mission ON public.evaluaciones_pruebas;
DROP FUNCTION IF EXISTS public.invoke_ai_mission_generator();
