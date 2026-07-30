-- ============================================================================
-- MIGRACIÓN v58 — RESTAURA EL GUARD DE v40 SOBRE `usuarios.telefono`
-- Fecha: 2026-07-30 · regresión introducida por v56 (entrega 3)
--
-- v40 blindó `correo` Y `telefono` de un miembro del staff que todavía no tiene
-- `auth_user_id`. El motivo: son su identidad futura. `crear-acceso-usuario` le
-- emitirá la cuenta a ese contacto, el trigger de v24 vincula por él, y
-- `resolver_email_login` (v19) acepta correo, teléfono O cédula como
-- identificador — así que el teléfono abre la misma puerta que el correo, y
-- cambiar cualquiera de los dos es quedarse con la cuenta sin tocar
-- `auth_user_id`, que es el hueco que v36b había dado por inocuo.
--
-- v56 reescribió `proteger_columnas_usuarios()` completa para añadir el guard
-- general de `correo` y no reprodujo la mitad del teléfono. Nada lo decidió: se
-- perdió al copiar el cuerpo. Es el riesgo conocido de mantener esta función con
-- CREATE OR REPLACE de cuerpo completo, y esta vez se materializó.
--
-- Comprobado conductualmente antes de escribir el arreglo, no deducido del SQL
-- (scripts/tmp_verificar_guard_telefono.mjs): con una sesión de COACH real,
-- `PATCH /rest/v1/usuarios {telefono}` sobre un compañero de su club sin acceso
-- PASA y devuelve la fila cambiada, mientras el mismo PATCH sobre `correo` sigue
-- rechazado por el guard de v56. Es decir: v56 está bien aplicada y lo único que
-- falta es esta mitad.
--
-- Se restaura el bloque de v40 tal cual, con una sola diferencia: ya no nombra
-- `correo`. El guard de v56 lo bloquea para todo el mundo —hasta para el dueño,
-- que ahora pasa por la Edge Function `actualizar-correo`— unas líneas antes, así
-- que incluirlo aquí sería código inalcanzable.
--
-- El cuerpo es el TEXTUAL de v56 más ese bloque. El trigger
-- trg_proteger_columnas_usuarios (v24) NO se recrea: apunta a la función por
-- nombre, así que la tabla no queda desprotegida ni un instante.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proteger_columnas_usuarios()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caminos sin sesión de app: service_role (Edge Functions, seeds) y el
  -- trigger trg_vincular_auth_usuario (v24), que es justo quien tiene que
  -- poder escribir auth_user_id al crearse la cuenta.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Identidad de la cuenta (v36b): a qué usuario de Auth resuelve esta fila y
  -- con qué cédula se identifica. Cambiarlas es apoderarse de la cuenta, así
  -- que ni el staff de su propio club.
  IF (NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
      OR NEW.cedula IS DISTINCT FROM OLD.cedula)
     AND NOT es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadmin puede cambiar la identidad de una cuenta.';
  END IF;

  -- El correo es identidad tanto como la cédula (v56): es lo que
  -- `resolver_email_login` traduce a la cuenta de Auth, y el buzón que gobierna
  -- la recuperación. Cambiarlo aquí a secas separa la tabla de Auth y deja a
  -- esa persona sin poder entrar. La Edge Function `actualizar-correo` mueve
  -- las dos mitades a la vez; como corre con service_role, sale por el
  -- early-return de arriba y no pasa por esta comprobación.
  IF NEW.correo IS DISTINCT FROM OLD.correo THEN
    RAISE EXCEPTION 'El correo se cambia desde tu perfil, no editando la ficha: hay que actualizarlo también en el acceso.';
  END IF;

  -- v40, restaurado aquí (ver cabecera). El teléfono de un staff que aún no
  -- tiene acceso es su identidad futura igual que el correo. Se pide el mismo
  -- rango que para crear la fila: al coach lo invita el dueño; al co-dueño, solo
  -- el dueño original. Una vez vinculada la cuenta, vuelve a ser un dato de
  -- contacto y el staff lo corrige con normalidad.
  IF NEW.telefono IS DISTINCT FROM OLD.telefono
     AND OLD.auth_user_id IS NULL
     AND OLD.rol IN ('coach', 'owner')
     AND NOT es_superadmin() THEN
    IF current_user_rol() <> 'owner' THEN
      RAISE EXCEPTION 'Solo el dueño del club puede cambiar el contacto de un miembro del staff que todavía no tiene acceso.';
    END IF;
    IF OLD.rol = 'owner' AND NOT es_owner_principal() THEN
      RAISE EXCEPTION 'Solo el dueño original puede cambiar el contacto de un co-dueño que todavía no tiene acceso.';
    END IF;
  END IF;

  -- Linaje inmutable: define quién puede invitar co-dueños (v36).
  IF NEW.creado_por IS DISTINCT FROM OLD.creado_por AND NOT es_superadmin() THEN
    RAISE EXCEPTION 'No tienes permiso para modificar el origen de una cuenta.';
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF current_user_rol() NOT IN ('owner', 'superadmin') THEN
      RAISE EXCEPTION 'Solo el dueño del club puede cambiar el estado de una cuenta.';
    END IF;
    -- Retirar o reactivar a un DUEÑO es del superadmin: entre co-dueños, el
    -- primero que pulsara el botón se quedaría con el club (v36).
    IF OLD.rol = 'owner' AND NOT es_superadmin() THEN
      RAISE EXCEPTION 'Solo el superadmin puede activar o desactivar a un dueño.';
    END IF;
    -- Un club sin dueño activo no puede aprobar solicitudes, dar de alta staff
    -- ni recibir inscripciones: no se desactiva al último que queda.
    IF OLD.rol = 'owner' AND OLD.estado = 'activo' AND NEW.estado <> 'activo'
       AND NOT EXISTS (
         SELECT 1 FROM usuarios u
         WHERE u.club = OLD.club AND u.rol = 'owner' AND u.estado = 'activo' AND u.id <> OLD.id
       ) THEN
      RAISE EXCEPTION 'No puedes desactivar al último dueño de "%": el club se quedaría sin quien lo administre.', OLD.club;
    END IF;
  END IF;

  IF NEW.club IS DISTINCT FROM OLD.club AND NOT es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadmin puede cambiar de club a un usuario.';
  END IF;
  IF NEW.rol IS DISTINCT FROM OLD.rol AND NOT es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadmin puede cambiar el rol de un usuario.';
  END IF;

  IF es_staff() THEN
    RETURN NEW;
  END IF;

  -- Solo para atleta/padre: el staff sí corrige la fecha de nacimiento de sus
  -- atletas (cambia su categoría FEB), pero el propio atleta no.
  IF NEW.fecha_nacimiento IS DISTINCT FROM OLD.fecha_nacimiento THEN
    RAISE EXCEPTION 'No tienes permiso para modificar campos protegidos del perfil.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.proteger_columnas_usuarios() IS
  'Columnas de `usuarios` que no se cambian con un UPDATE de sesión de app: '
  'identidad (auth_user_id, cedula, correo), linaje, estado, club, rol, y el '
  'teléfono de un staff sin acceso todavía. v58 restaura esta última, que v56 '
  'perdió al reescribir el cuerpo para añadir el guard de correo.';
