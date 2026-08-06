-- Verifica la taxonomía final de movilidad sin conservar datos de prueba.
BEGIN;

DO $$
BEGIN
  INSERT INTO public.atletas (id, edad, posicion, restriccion_movilidad)
  VALUES (gen_random_uuid(), 14, 'Base', U&'D\00E9ficit Cadena Posterior');

  BEGIN
    INSERT INTO public.atletas (id, edad, posicion, restriccion_movilidad)
    VALUES (gen_random_uuid(), 14, 'Base', U&'Intolerancia a la Flexi\00F3n');
    RAISE EXCEPTION 'La taxonomía final aún acepta un valor legacy.';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;

ROLLBACK;
