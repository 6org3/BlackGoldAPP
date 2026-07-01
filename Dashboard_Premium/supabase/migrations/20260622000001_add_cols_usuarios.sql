-- Migración consolidada desde Dashboard_Premium/add_cols.sql (Fase 4 del plan de remediación de seguridad).
-- Contenido original sin modificar salvo este encabezado. Orden reconstruido a partir de
-- fechas de commit y dependencias declaradas entre archivos, no de un registro server-side
-- (las migraciones se aplicaron a mano en el SQL Editor de Supabase).
--
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS correo TEXT;
