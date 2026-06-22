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
