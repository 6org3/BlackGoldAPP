-- v26: misiones con contexto de ejecución (cancha/casa/ambos) y fase de temporada,
-- + misiones_pilar_check al día con la taxonomía.
--
-- contexto: dónde se ejecuta la misión. 'ambos' es un comodín EXPLÍCITO (NOT NULL):
--   toda misión tiene contexto por definición, a diferencia de nivel_objetivo /
--   categoria_bucket donde NULL significa "aplica a todos".
-- fase_temporada: etiqueta de periodización (preparatoria/competitiva/transicion).
--   NULL = comodín (válida todo el año). La lógica de selección por fase se difiere
--   hasta que el club registre en qué fase está cada grupo (ver plan de misiones).

-- ------------------------------------------------------------
-- 1. Columnas nuevas
-- ------------------------------------------------------------
ALTER TABLE misiones
  ADD COLUMN IF NOT EXISTS contexto TEXT NOT NULL DEFAULT 'ambos',
  ADD COLUMN IF NOT EXISTS fase_temporada TEXT;

ALTER TABLE misiones DROP CONSTRAINT IF EXISTS misiones_contexto_check;
ALTER TABLE misiones
  ADD CONSTRAINT misiones_contexto_check
  CHECK (contexto IN ('cancha', 'casa', 'ambos'));

ALTER TABLE misiones DROP CONSTRAINT IF EXISTS misiones_fase_temporada_check;
ALTER TABLE misiones
  ADD CONSTRAINT misiones_fase_temporada_check
  CHECK (fase_temporada IS NULL OR fase_temporada IN ('preparatoria', 'competitiva', 'transicion'));

-- ------------------------------------------------------------
-- 2. misiones_pilar_check al día con la taxonomía compartida
--    (packages/analytics-core/taxonomia.js):
--    - 'resistencia' entró al radar el 2026-07-05 (fase P1.5).
--    - 'recuperacion' lo insertaba insertar_misiones_recuperacion (MCP)
--      pero el CHECK de v17 nunca lo permitió — bug latente.
-- ------------------------------------------------------------
ALTER TABLE misiones DROP CONSTRAINT IF EXISTS misiones_pilar_check;
ALTER TABLE misiones
  ADD CONSTRAINT misiones_pilar_check
  CHECK (pilar IN (
    'youtube',
    'articulo',
    'fuerza',
    'explosividad',
    'resistencia',
    'movilidad',
    'tiro',
    'agilidad',
    'tactica',
    'resiliencia',
    'recuperacion'
  ));

-- ------------------------------------------------------------
-- 3. Backfill de contexto para el catálogo existente.
--    Orden: del criterio más seguro al más específico. El resto queda
--    'ambos' A PROPÓSITO ('ambos' nunca es incorrecto, solo menos preciso;
--    el coach refina desde AdminMisiones).
-- ------------------------------------------------------------

-- Hábitos de recuperación y contenido de consumo (video/artículo) se hacen en casa.
UPDATE misiones SET contexto = 'casa'
 WHERE pilar IN ('recuperacion', 'youtube', 'articulo');

-- Misiones con quiz = estudio/teoría → casa.
UPDATE misiones SET contexto = 'casa'
 WHERE contexto = 'ambos'
   AND quiz IS NOT NULL
   AND jsonb_typeof(quiz) = 'array'
   AND jsonb_array_length(quiz) > 0;

-- Tiro sin quiz requiere aro → cancha.
UPDATE misiones SET contexto = 'cancha'
 WHERE contexto = 'ambos' AND pilar = 'tiro';
