-- v67 — Catálogo explícito de clubes que aceptan registro público.
-- Un owner activo administra el club; la allowlist explícita decide si puede
-- recibir inscripciones de familias reales.

CREATE TABLE IF NOT EXISTS public.club_registro_config (
  club text PRIMARY KEY CHECK (btrim(club) <> ''),
  habilitado boolean NOT NULL DEFAULT false,
  es_demo boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.club_registro_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.club_registro_config FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.club_registro_config TO service_role;

DROP TRIGGER IF EXISTS trg_club_registro_config_updated_at ON public.club_registro_config;
CREATE TRIGGER trg_club_registro_config_updated_at
  BEFORE UPDATE ON public.club_registro_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.club_registro_config (club, habilitado, es_demo)
SELECT DISTINCT club, true, club = 'Titanes de Sucumbíos'
FROM public.usuarios
WHERE rol = 'owner' AND estado = 'activo' AND club IS NOT NULL AND btrim(club) <> ''
ON CONFLICT (club) DO NOTHING;

CREATE OR REPLACE FUNCTION public.club_acepta_registro_publico(p_club text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM club_registro_config c
      JOIN usuarios u ON u.club = c.club
      WHERE c.club = p_club AND c.habilitado
        AND u.rol = 'owner' AND u.estado = 'activo'
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.club_acepta_registro_publico(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_acepta_registro_publico(text) TO service_role;

CREATE OR REPLACE FUNCTION public.listar_clubes_publicos()
RETURNS TABLE (club text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.club
  FROM club_registro_config c
  WHERE c.habilitado
    AND EXISTS (
      SELECT 1 FROM usuarios u
      WHERE u.club = c.club AND u.rol = 'owner' AND u.estado = 'activo'
    )
  ORDER BY c.club;
$$;

REVOKE ALL ON FUNCTION public.listar_clubes_publicos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_clubes_publicos() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validar_club_registro_pendiente()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'pendiente'
     AND NEW.rol IN ('atleta', 'padre')
     AND NOT club_acepta_registro_publico(NEW.club) THEN
    RAISE EXCEPTION 'El club "%" no acepta inscripciones en línea.', NEW.club;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_club_registro_pendiente() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validar_club_registro_pendiente ON public.usuarios;
CREATE TRIGGER trg_validar_club_registro_pendiente
  BEFORE INSERT OR UPDATE OF club, rol, estado ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.validar_club_registro_pendiente();

COMMENT ON TABLE public.club_registro_config IS
  'Allowlist operativa de clubes que aceptan solicitudes públicas.';
