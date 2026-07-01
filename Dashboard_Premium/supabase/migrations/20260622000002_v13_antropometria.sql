-- Migración consolidada desde Dashboard_Premium/supabase_migration_v13.sql (Fase 4 del plan de remediación de seguridad).
-- Contenido original sin modificar salvo este encabezado. Orden reconstruido a partir de
-- fechas de commit y dependencias declaradas entre archivos, no de un registro server-side
-- (las migraciones se aplicaron a mano en el SQL Editor de Supabase).
--
-- Añadir columnas para medidas antropométricas avanzadas
ALTER TABLE atletas ADD COLUMN IF NOT EXISTS talla_sentado_cm NUMERIC;
ALTER TABLE atletas ADD COLUMN IF NOT EXISTS envergadura_cm NUMERIC;
