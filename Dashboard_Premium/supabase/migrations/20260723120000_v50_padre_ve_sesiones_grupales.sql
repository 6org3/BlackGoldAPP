-- ============================================================================
-- v50 — El padre ve las SESIONES GRUPALES del grupo de su hijo
-- ============================================================================
-- Cierra el hueco anotado en v24:568-573: sesiones_control con atleta_id NULL
-- (las sesiones GRUPALES, guardadas con grupo_id) las "ve solo staff — el
-- portal del padre consulta por atleta_id". La PR #127 añadió a la Vista Padre
-- Arcade la sección "ÚLTIMAS SESIONES", que hoy solo lista las sesiones
-- INDIVIDUALES del hijo (ses_control_select_propio = atleta_id IN mis_atletas()),
-- así que el trabajo grupal del hijo quedaba invisible para su representante.
--
-- Fix ADITIVO (NO toca ses_control_select_propio ni ses_control_staff): una
-- segunda política de SELECT que concede las grupales (atleta_id IS NULL) cuyo
-- grupo pertenece a alguno de sus atletas. Las políticas permisivas de Postgres
-- se combinan con OR, así que esta suma visibilidad sin ampliar en nada la de
-- las sesiones individuales.
--
-- `grupos_de_mis_atletas()` replica el criterio "grupos de mis atletas" que ya
-- corre en producción en comunicaciones_select_audiencia (v24:651-655 y su
-- reescritura v44:35-39): UNION de atleta_grupo.grupo_id (fuente canónica de la
-- membresía desde v38) y atletas.grupo_id (caché derivada de la básica). Se
-- conservan AMBAS ramas a propósito, igual que esas políticas: un atleta legacy
-- sin fila en atleta_grupo sigue cubierto por su grupo_id, y el UNION deduplica
-- cuando coinciden. No se "duplica" nada: es exactamente el mismo patrón vivo.
--
-- Aplicar con: npx supabase db push
-- ============================================================================

-- Grupos (uuid[]) a los que pertenece alguno de "mis atletas" (el propio atleta
-- + los hijos vinculados, via mis_atletas()). SECURITY DEFINER para no
-- re-disparar la RLS de atleta_grupo/atletas dentro de la subconsulta, mismo
-- patrón que mis_atletas()/usuarios_de_mis_atletas() (v24). Devuelve uuid[]
-- para usar con unnest(...) en la política de abajo.
CREATE OR REPLACE FUNCTION public.grupos_de_mis_atletas()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(grupo_id), '{}'::uuid[])
  FROM (
    SELECT ag.grupo_id
    FROM atleta_grupo ag
    WHERE ag.atleta_id = ANY (mis_atletas())
    UNION
    SELECT a.grupo_id
    FROM atletas a
    WHERE a.id = ANY (mis_atletas()) AND a.grupo_id IS NOT NULL
  ) t;
$$;

REVOKE ALL ON FUNCTION public.grupos_de_mis_atletas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grupos_de_mis_atletas() TO authenticated, service_role;

-- Política aditiva: el padre/atleta ve las sesiones GRUPALES (atleta_id NULL)
-- del grupo de su atleta. Complementa ses_control_select_propio (v24:572-573),
-- que sigue cubriendo las individuales; ses_control_staff queda intacta. El
-- DROP previo la hace idempotente para re-corridas del push.
DROP POLICY IF EXISTS ses_control_select_grupo_propio ON public.sesiones_control;
CREATE POLICY ses_control_select_grupo_propio ON public.sesiones_control FOR SELECT TO authenticated
  USING (
    atleta_id IS NULL
    AND grupo_id IN (SELECT unnest(grupos_de_mis_atletas()))
  );

-- La nota de v24:568 ("las grupales solo las ve staff — el portal del padre
-- consulta por atleta_id") queda SUPERADA por esta política: ahora el padre
-- también ve las grupales de los grupos de sus atletas.
COMMENT ON POLICY ses_control_select_grupo_propio ON public.sesiones_control IS
  'v50: el padre/atleta ve las sesiones grupales (atleta_id NULL) del grupo de su atleta. Supera la nota de v24:568 (grupales solo-staff). Aditiva sobre ses_control_select_propio.';
