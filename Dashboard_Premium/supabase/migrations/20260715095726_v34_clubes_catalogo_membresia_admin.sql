-- ============================================================================
-- v34 — Catálogo de clubes para el superadmin + membresía como decisión del
--       dueño + borrado físico reservado al superadmin.
--
-- Contexto (petición del dueño, 2026-07-15): "quiero poder SELECCIONAR los
-- clubes, no escribir el nombre" — v33 ya lo resolvió en el registro público,
-- pero el panel /admin/atletas conservaba el último input de texto libre (el
-- campo "Club (Admin)" que solo ve el superadmin) y no tenía forma de
-- desactivar/reactivar a un atleta.
--
-- 1. `listar_clubes_todos()`: catálogo COMPLETO de clubes para el select del
--    superadmin. No sirve `listar_clubes_publicos()` (v33), que solo devuelve
--    clubes con owner activo: el superadmin necesita ver también los clubes
--    históricos sin owner (LAGO AGRIO, PUTUMAYO, SHUSHUFINDI…) justamente para
--    poder sacar atletas de ahí. Tampoco sirve `club_config` (se sembró una vez
--    desde grupos_entrenamiento en v27 y nada la mantiene).
--
-- 2. Membresía (`atletas.estado_membresia`/`fecha_alta`/`fecha_baja`) pasa a ser
--    decisión de owner/superadmin, no de cualquier staff. Simetría con
--    `usuarios.estado` (v33): quien decide quién entra decide quién sale. El
--    trigger v31 listaba estas columnas como protegidas pero el early-return de
--    `es_staff()` dejaba pasar al coach antes de llegar al guard.
--
-- 3. `usuarios.club` solo lo cambia el superadmin: mover a alguien de club es
--    una operación cross-club y la UI ya la reserva al superadmin. (RLS ya lo
--    impedía de facto — un owner falla el WITH CHECK del club destino — pero el
--    trigger lo hace explícito en vez de depender de ese efecto lateral.)
--
-- 4. DELETE físico de atletas/usuarios: solo superadmin. Con "desactivar"
--    disponible (reversible, conserva histórico de asistencia/evaluaciones/
--    pagos/XP), el borrado deja de ser la herramienta del staff del club.
--    Cierra además un bug real: `atletas_delete` (v29) admitía a cualquier
--    staff pero `usuarios_delete` (v24) no, así que el botón "Eliminar" de un
--    coach borraba la ficha de atleta y dejaba el usuario huérfano (el cliente
--    no comprobaba el error del segundo delete).
-- ============================================================================


-- ------------------------------------------------------------
-- 1. Catálogo completo de clubes (select del superadmin).
--    El gate va DENTRO del cuerpo: al ser SECURITY DEFINER la función salta
--    RLS, así que sin `es_superadmin()` cualquier authenticated (un atleta)
--    podría enumerar todos los clubes de la plataforma. `listar_clubes_publicos`
--    puede prescindir del gate porque su salida es deliberadamente pública.
--    El club vive denormalizado en varias tablas sin FK: la UNION es el único
--    modo de no perder un club que exista solo en una de ellas.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.listar_clubes_todos()
RETURNS TABLE (club text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT c FROM (
    SELECT club AS c FROM usuarios
    UNION SELECT club FROM grupos_entrenamiento
    UNION SELECT club FROM club_config
    UNION SELECT club FROM eventos
  ) t
  WHERE es_superadmin()
    AND c IS NOT NULL AND btrim(c) <> ''
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.listar_clubes_todos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_clubes_todos() TO authenticated, service_role;


-- ------------------------------------------------------------
-- 2. Membresía del atleta: solo owner/superadmin.
--    Cuerpo base: v31 §2. El guard nuevo va ANTES del early-return de staff
--    (mismo patrón que el guard de `usuarios.estado` en v33); las 3 columnas de
--    membresía salen de la lista de abajo porque el guard nuevo ya las cubre
--    para todos los roles. El trigger trg_proteger_columnas_atletas no se recrea.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.proteger_columnas_atletas()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caminos sin sesión de app (service_role, SECURITY DEFINER internos como
  -- resolver_solicitud_registro cuando lo llama el cron, triggers) pasan.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Dar de baja / reactivar es decisión del dueño del club (v34): ni el coach.
  IF (NEW.estado_membresia IS DISTINCT FROM OLD.estado_membresia
      OR NEW.fecha_alta IS DISTINCT FROM OLD.fecha_alta
      OR NEW.fecha_baja IS DISTINCT FROM OLD.fecha_baja)
     AND current_user_rol() NOT IN ('owner', 'superadmin') THEN
    RAISE EXCEPTION 'Solo el dueño del club puede cambiar el estado de membresía de un atleta.';
  END IF;
  IF es_staff() THEN
    RETURN NEW;
  END IF;
  IF NEW.xp_total IS DISTINCT FROM OLD.xp_total
     OR NEW.overall_score IS DISTINCT FROM OLD.overall_score
     OR NEW.rango IS DISTINCT FROM OLD.rango
     OR NEW.rango_tier IS DISTINCT FROM OLD.rango_tier
     OR NEW.nivel_desarrollo IS DISTINCT FROM OLD.nivel_desarrollo
     OR NEW.es_becado IS DISTINCT FROM OLD.es_becado
     OR NEW.descuento_pct IS DISTINCT FROM OLD.descuento_pct
     OR NEW.grupo_id IS DISTINCT FROM OLD.grupo_id
     OR NEW.grupo_nombre IS DISTINCT FROM OLD.grupo_nombre
     OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id THEN
    RAISE EXCEPTION 'No tienes permiso para modificar campos protegidos del atleta.';
  END IF;
  RETURN NEW;
END;
$$;


-- ------------------------------------------------------------
-- 3. Cambio de club de un usuario: solo superadmin.
--    Cuerpo base: v33 §2 (que ya reservaba `estado` a owner/superadmin).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.proteger_columnas_usuarios()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND current_user_rol() NOT IN ('owner', 'superadmin') THEN
    RAISE EXCEPTION 'Solo el dueño del club puede cambiar el estado de una cuenta.';
  END IF;
  -- Mover a un usuario de club es cross-club: solo superadmin (v34).
  IF NEW.club IS DISTINCT FROM OLD.club AND NOT es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadmin puede cambiar de club a un usuario.';
  END IF;
  IF es_staff() THEN
    RETURN NEW;
  END IF;
  IF NEW.rol IS DISTINCT FROM OLD.rol
     OR NEW.cedula IS DISTINCT FROM OLD.cedula
     OR NEW.fecha_nacimiento IS DISTINCT FROM OLD.fecha_nacimiento
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION 'No tienes permiso para modificar campos protegidos del perfil.';
  END IF;
  RETURN NEW;
END;
$$;


-- ------------------------------------------------------------
-- 4. Borrado físico: solo superadmin (el staff del club desactiva).
-- ------------------------------------------------------------

DROP POLICY IF EXISTS atletas_delete ON public.atletas;
CREATE POLICY atletas_delete ON public.atletas FOR DELETE TO authenticated
  USING ((select es_superadmin()));

DROP POLICY IF EXISTS usuarios_delete ON public.usuarios;
CREATE POLICY usuarios_delete ON public.usuarios FOR DELETE TO authenticated
  USING ((select es_superadmin()));
