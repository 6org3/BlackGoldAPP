-- ====================================================================
-- MIGRACIÓN V15: INTEGRACIÓN IA Y BIOMECÁNICA
-- ====================================================================

-- 1. Eliminar etapa_formacion ya que es redundante con nivel_desarrollo
ALTER TABLE atletas DROP COLUMN IF EXISTS etapa_formacion;

-- 2. Renombrar alerta_talon a prevencion_impacto
ALTER TABLE atletas RENAME COLUMN alerta_talon TO prevencion_impacto;

-- 3. Renombrar intolerancia_milo a restriccion_movilidad
-- (La columna es booleana en el ERD anterior o TEXT en la práctica?
-- En el código fuente vimos que guarda strings: 'Ninguna', 'Intolerancia a la Flexión', etc.
-- Asumimos que es TEXT. El re-nombre de columna no afecta el tipo de dato).
ALTER TABLE atletas RENAME COLUMN intolerancia_milo TO restriccion_movilidad;

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
