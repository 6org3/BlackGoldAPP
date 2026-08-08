-- Los triggers no son endpoints RPC. PostgreSQL valida EXECUTE al crear el
-- trigger; una invocación posterior no requiere que anon o authenticated
-- puedan llamar directamente a la función.

BEGIN;

ALTER FUNCTION public.calcular_categoria_feb(date)
  SET search_path = pg_catalog;
ALTER FUNCTION public.touch_updated_at()
  SET search_path = pg_catalog;
ALTER FUNCTION public.tg_set_updated_at()
  SET search_path = pg_catalog;

DO $block$
DECLARE
  trigger_function record;
BEGIN
  FOR trigger_function IN
    SELECT DISTINCT p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_trigger t ON t.tgfoid = p.oid AND NOT t.tgisinternal
    WHERE n.nspname = 'public'
      AND p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      trigger_function.signature
    );
  END LOOP;
END;
$block$;

DO $verify$
DECLARE
  exposed_trigger text;
  mutable_function text;
BEGIN
  SELECT p.oid::regprocedure::text
    INTO exposed_trigger
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_trigger t ON t.tgfoid = p.oid AND NOT t.tgisinternal
  WHERE n.nspname = 'public'
    AND p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
    AND (
      has_function_privilege('anon', p.oid, 'execute')
      OR has_function_privilege('authenticated', p.oid, 'execute')
    )
  LIMIT 1;

  IF exposed_trigger IS NOT NULL THEN
    RAISE EXCEPTION 'Trigger function remains exposed as RPC: %', exposed_trigger;
  END IF;

  SELECT p.oid::regprocedure::text
    INTO mutable_function
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('calcular_categoria_feb', 'touch_updated_at', 'tg_set_updated_at')
    AND NOT coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=pg_catalog']
  LIMIT 1;

  IF mutable_function IS NOT NULL THEN
    RAISE EXCEPTION 'Function still has mutable search_path: %', mutable_function;
  END IF;
END;
$verify$;

COMMIT;
