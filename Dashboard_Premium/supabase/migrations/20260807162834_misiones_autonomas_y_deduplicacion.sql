-- Misiones = trabajo autónomo fuera de la cancha y del gimnasio.
-- Los ejercicios se planifican en sesiones; no se modelan como misiones.
-- Las misiones históricas con contexto de cancha/ambos se preservan, pero se
-- desactivan hasta que un coach las convierta realmente en una tarea autónoma.

UPDATE public.misiones
   SET activa = false
 WHERE activa
   AND contexto IS DISTINCT FROM 'casa';

ALTER TABLE public.misiones
  ALTER COLUMN contexto SET DEFAULT 'casa';

ALTER TABLE public.misiones
  DROP CONSTRAINT IF EXISTS misiones_contexto_check;
ALTER TABLE public.misiones
  ADD CONSTRAINT misiones_contexto_check
  CHECK (contexto IN ('casa', 'cancha', 'ambos'));

ALTER TABLE public.misiones
  DROP CONSTRAINT IF EXISTS misiones_activas_contexto_autonomo_check;
ALTER TABLE public.misiones
  ADD CONSTRAINT misiones_activas_contexto_autonomo_check
  CHECK (NOT activa OR contexto = 'casa');

COMMENT ON COLUMN public.misiones.contexto IS
  'Una misión activa debe ejecutarse autónomamente fuera de cancha/gimnasio. ''cancha'' y ''ambos'' solo se conservan en registros históricos inactivos.';

-- Impide que dos misiones activas expresen la misma tarea para el mismo
-- segmento. La similitud semántica no se decide en SQL: Edison/Shaka deben
-- revisar propuestas antes de activarlas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_misiones_activas_clave_canonica
  ON public.misiones (
    pilar,
    lower(regexp_replace(btrim(titulo), '\s+', ' ', 'g')),
    coalesce(nivel_objetivo, ''),
    coalesce(categoria_bucket, ''),
    coalesce(fase_temporada, '')
  )
  WHERE activa;

-- El esquema consolidado ya cuenta con estas restricciones/índices equivalentes.
-- Retiramos los duplicados para que las consultas de progreso no paguen doble coste.
DROP INDEX IF EXISTS public.uniq_progreso_atleta_mision;
DROP INDEX IF EXISTS public.idx_progreso_atleta;
