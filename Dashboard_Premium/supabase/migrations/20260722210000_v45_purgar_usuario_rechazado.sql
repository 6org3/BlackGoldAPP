-- ============================================================================
-- v45 — Purgar una cuenta rechazada (libera la cédula para siempre).
--
-- Problema (detectado revisando el ciclo de vida de solicitudes, 2026-07-22):
--   `resolver_solicitud_registro` (v33) solo tiene dos salidas para una
--   solicitud: aprobar o rechazar. Rechazar deja `usuarios.estado =
--   'rechazado'` — la fila y su cuenta de Supabase Auth quedan vivas PARA
--   SIEMPRE. Como `usuarios.cedula` es UNIQUE, esa persona (o cualquiera que
--   comparta esa cédula, p.ej. corrigiendo un typo del primer intento) nunca
--   más puede registrarse: `registrar_publico` (v33 línea ~167) le devuelve
--   'La cédula "%" ya se encuentra registrada...' para siempre. No existía
--   ningún panel ni función para deshacer eso.
--
-- Fix: una función SECURITY DEFINER, solo-superadmin, que borra por completo
-- una cuenta YA rechazada (fila `usuarios`, su `atletas` si aplica, y sus
-- vínculos `padres_atletas` en cualquiera de los dos sentidos) y devuelve el
-- `auth_user_id` que tenía para que el llamador borre también la cuenta de
-- Auth (esta función no puede tocar `auth.users`: eso es Admin API, vive en
-- la Edge Function `purgar-usuario-rechazado`).
--
-- El guard de `estado <> 'rechazado'` es el más importante de la función:
-- sin él, un superadmin (o un bug del cliente) podría borrar una cuenta
-- activa o pendiente sin que exista ningún "deshacer".
-- ============================================================================


CREATE OR REPLACE FUNCTION public.purgar_usuario_rechazado(p_usuario_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target        usuarios%ROWTYPE;
  v_atleta_id     uuid;
  v_hijos_activos int;
  v_auth_user_id  uuid;
  v_cedula        text;
BEGIN
  IF NOT es_superadmin() THEN
    RAISE EXCEPTION 'Solo un superadministrador puede liberar una cédula rechazada.';
  END IF;

  SELECT * INTO v_target FROM usuarios WHERE id = p_usuario_id;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Usuario inexistente.';
  END IF;

  -- Guard más importante de toda la función: esta vía NUNCA toca una cuenta
  -- activa o pendiente. Solo lo ya rechazado (sin "deshacer" posible) es
  -- purgable.
  IF v_target.estado <> 'rechazado' THEN
    RAISE EXCEPTION 'Solo se puede purgar una cuenta rechazada (estado actual: "%").', v_target.estado;
  END IF;

  -- Defensiva: si es un padre, que no deje huérfano a un hijo que siga
  -- activo/pendiente. No debería poder pasar (el rechazo en cascada de v33
  -- solo tumba al padre si ya no le queda ningún hijo activo/pendiente),
  -- pero un padre pudo ganar un hijo nuevo entre el rechazo y esta purga.
  IF v_target.rol = 'padre' THEN
    SELECT count(*) INTO v_hijos_activos
    FROM padres_atletas pa
    JOIN atletas a ON a.id = pa.atleta_id
    JOIN usuarios hu ON hu.id = a.usuario_id
    WHERE pa.padre_id = p_usuario_id
      AND hu.estado <> 'rechazado';
    IF v_hijos_activos > 0 THEN
      RAISE EXCEPTION 'Este representante tiene % hijo(s) activo(s) o pendiente(s): no se puede purgar.', v_hijos_activos;
    END IF;
  END IF;

  v_auth_user_id := v_target.auth_user_id;
  v_cedula := v_target.cedula;

  -- Fila de atletas del usuario (si rol='atleta') y sus vínculos como hijo.
  SELECT id INTO v_atleta_id FROM atletas WHERE usuario_id = p_usuario_id;
  IF v_atleta_id IS NOT NULL THEN
    DELETE FROM padres_atletas WHERE atleta_id = v_atleta_id;
    DELETE FROM atletas WHERE id = v_atleta_id;
  END IF;

  -- Vínculos del usuario como padre (si rol='padre').
  DELETE FROM padres_atletas WHERE padre_id = p_usuario_id;

  DELETE FROM usuarios WHERE id = p_usuario_id;

  RETURN jsonb_build_object(
    'usuario_id', p_usuario_id,
    'auth_user_id', v_auth_user_id,
    'cedula', v_cedula
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purgar_usuario_rechazado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purgar_usuario_rechazado(uuid) TO authenticated, service_role;
