-- Migración consolidada desde Dashboard_Premium/supabase_migration_v15_ai_integration.sql (Fase 4 del plan de remediación de seguridad).
-- Contenido original sin modificar salvo este encabezado. Orden reconstruido a partir de
-- fechas de commit y dependencias declaradas entre archivos, no de un registro server-side
-- (las migraciones se aplicaron a mano en el SQL Editor de Supabase).
--
-- ====================================================================
-- MIGRACIÓN V15: INTEGRACIÓN IA Y BIOMECÁNICA
-- ====================================================================

-- 1. Eliminar etapa_formacion ya que es redundante con nivel_desarrollo
ALTER TABLE atletas DROP COLUMN IF EXISTS etapa_formacion;

-- 2. Renombrar alerta_talon a prevencion_impacto
-- El baseline consolidado ya puede incluir el nombre final. La migración
-- histórica debe poder aplicarse tanto sobre ese baseline como sobre el
-- esquema previo, sin intentar renombrar una columna inexistente.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'atletas'
      AND column_name = 'alerta_talon'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'atletas'
      AND column_name = 'prevencion_impacto'
  ) THEN
    ALTER TABLE public.atletas RENAME COLUMN alerta_talon TO prevencion_impacto;
  END IF;
END
$$;

-- 3. Renombrar intolerancia_milo a restriccion_movilidad
-- (La columna es booleana en el ERD anterior o TEXT en la práctica?
-- En el código fuente vimos que guarda strings: 'Ninguna', 'Intolerancia a la Flexión', etc.
-- Asumimos que es TEXT. El re-nombre de columna no afecta el tipo de dato).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'atletas'
      AND column_name = 'intolerancia_milo'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'atletas'
      AND column_name = 'restriccion_movilidad'
  ) THEN
    ALTER TABLE public.atletas RENAME COLUMN intolerancia_milo TO restriccion_movilidad;
  END IF;
END
$$;

-- Opcional: Actualizar datos existentes de restriccion_movilidad para la nueva nomenclatura
UPDATE atletas 
SET restriccion_movilidad = 'Déficit Cadena Posterior' 
WHERE restriccion_movilidad = 'Intolerancia a la Flexión';

UPDATE atletas 
SET restriccion_movilidad = 'Déficit Cadena Anterior' 
WHERE restriccion_movilidad = 'Intolerancia a la Extensión';

UPDATE atletas 
SET restriccion_movilidad = 'Intolerancia a Carga Axial' 
WHERE restriccion_movilidad = 'Intolerancia a la Carga';
