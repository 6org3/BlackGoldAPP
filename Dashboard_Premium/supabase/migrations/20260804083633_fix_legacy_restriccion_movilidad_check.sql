-- Corrige la secuencia histórica de v15: aquella migración intentaba cambiar
-- valores antes de ampliar el CHECK heredado, por lo que una base con atletas
-- reales podía detenerse a mitad de actualización. Esta migración forward no
-- modifica v15 ni convierte valores desconocidos silenciosamente.
DO $$
DECLARE
  v_valor_desconocido text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'atletas'
      AND column_name = 'restriccion_movilidad'
  ) THEN
    RETURN;
  END IF;

  ALTER TABLE public.atletas
    DROP CONSTRAINT IF EXISTS atletas_intolerancia_milo_check;
  ALTER TABLE public.atletas
    DROP CONSTRAINT IF EXISTS atletas_restriccion_movilidad_check;

  UPDATE public.atletas
     SET restriccion_movilidad = CASE restriccion_movilidad
       WHEN 'Intolerancia a la Flexión' THEN 'Déficit Cadena Posterior'
       WHEN 'Intolerancia a la Extensión' THEN 'Déficit Cadena Anterior'
       WHEN 'Intolerancia a la Carga' THEN 'Intolerancia a Carga Axial'
       ELSE restriccion_movilidad
     END
   WHERE restriccion_movilidad IN (
     'Intolerancia a la Flexión',
     'Intolerancia a la Extensión',
     'Intolerancia a la Carga'
   );

  SELECT restriccion_movilidad
  INTO v_valor_desconocido
  FROM public.atletas
  WHERE restriccion_movilidad IS NOT NULL
    AND restriccion_movilidad NOT IN (
      'Ninguna',
      'Déficit Cadena Posterior',
      'Déficit Cadena Anterior',
      'Intolerancia a la Rotación con Extensión',
      'Intolerancia a Carga Axial',
      'Limitación Articular (ROM)'
    )
  LIMIT 1;

  IF v_valor_desconocido IS NOT NULL THEN
    RAISE EXCEPTION
      'Valor desconocido de restriccion_movilidad: "%". Corrige el dato antes de aplicar la taxonomía canónica.',
      v_valor_desconocido;
  END IF;

  ALTER TABLE public.atletas
    ADD CONSTRAINT atletas_restriccion_movilidad_check CHECK (
      restriccion_movilidad = ANY (ARRAY[
        'Ninguna'::text,
        'Déficit Cadena Posterior'::text,
        'Déficit Cadena Anterior'::text,
        'Intolerancia a la Rotación con Extensión'::text,
        'Intolerancia a Carga Axial'::text,
        'Limitación Articular (ROM)'::text
      ])
    );

  COMMENT ON COLUMN public.atletas.restriccion_movilidad IS
    'Taxonomía canónica de restricciones de movilidad; no usar los valores legacy de intolerancia_milo.';
END;
$$;
