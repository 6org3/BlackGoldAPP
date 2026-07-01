-- Migración consolidada desde Dashboard_Premium/supabase_migration_v14_cleanup.sql (Fase 4 del plan de remediación de seguridad).
-- Contenido original sin modificar salvo este encabezado. Orden reconstruido a partir de
-- fechas de commit y dependencias declaradas entre archivos, no de un registro server-side
-- (las migraciones se aplicaron a mano en el SQL Editor de Supabase).
--
-- ========================================================================================
-- MIGRACIÓN V14: DEPURACIÓN DEL SISTEMA LEGACY (Eliminación de columnas obsoletas)
-- ========================================================================================
-- ATENCIÓN: Este script elimina definitivamente las columnas de métricas planas
-- de la tabla "atletas". Asegúrate de que las evaluaciones nuevas estén operando
-- correctamente antes de ejecutar esto.

ALTER TABLE atletas
  DROP COLUMN IF EXISTS fuerza,
  DROP COLUMN IF EXISTS explosividad,
  DROP COLUMN IF EXISTS flexibilidad,
  DROP COLUMN IF EXISTS eficiencia_tactica,
  DROP COLUMN IF EXISTS resiliencia_psicologica,
  DROP COLUMN IF EXISTS nutricion,
  DROP COLUMN IF EXISTS hidratacion;

-- Nota: La puntuación overall_score se mantiene ya que ahora se calcula
-- dinámicamente a partir de las pruebas nuevas y luego se inserta o 
-- puede dejarse como caché.
