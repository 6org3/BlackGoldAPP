-- Migración consolidada desde Dashboard_Premium/supabase/migrations/add_ai_flag_to_misiones.sql (ya versionado, solo renombrado) (Fase 4 del plan de remediación de seguridad).
-- Contenido original sin modificar salvo este encabezado. Orden reconstruido a partir de
-- fechas de commit y dependencias declaradas entre archivos, no de un registro server-side
-- (las migraciones se aplicaron a mano en el SQL Editor de Supabase).
--
-- Agrega la columna is_ai_generated a la tabla de misiones
ALTER TABLE public.misiones 
ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT false;
