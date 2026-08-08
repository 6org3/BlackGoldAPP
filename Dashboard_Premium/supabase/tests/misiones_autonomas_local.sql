-- Prueba transaccional: las misiones activas son autónomas y no se duplican.
BEGIN;

DO $$
DECLARE
  v_duplicada_bloqueada boolean := false;
  v_cancha_bloqueada boolean := false;
BEGIN
  INSERT INTO public.misiones (titulo, pilar, contexto, activa, nivel_objetivo, categoria_bucket)
  VALUES ('Movilidad de tobillo en casa', 'movilidad', 'casa', true, 'Micro', 'Sub12');

  BEGIN
    INSERT INTO public.misiones (titulo, pilar, contexto, activa, nivel_objetivo, categoria_bucket)
    VALUES ('  movilidad   de tobillo en casa  ', 'movilidad', 'casa', true, 'Micro', 'Sub12');
  EXCEPTION WHEN unique_violation THEN
    v_duplicada_bloqueada := true;
  END;
  IF NOT v_duplicada_bloqueada THEN
    RAISE EXCEPTION 'Se permitió una misión activa duplicada.';
  END IF;

  BEGIN
    INSERT INTO public.misiones (titulo, pilar, contexto, activa)
    VALUES ('Tiro en cancha', 'tiro', 'cancha', true);
  EXCEPTION WHEN check_violation THEN
    v_cancha_bloqueada := true;
  END;
  IF NOT v_cancha_bloqueada THEN
    RAISE EXCEPTION 'Se permitió una misión activa de cancha.';
  END IF;
END
$$;

ROLLBACK;
