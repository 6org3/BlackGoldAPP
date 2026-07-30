-- ============================================================================
-- v56 — `usuarios.correo` deja de escribirse desde una sesión de la app.
--
-- HALLAZGO (revisión adversarial del PR #159).
-- Desde la entrega 3, el correo NO es un dato de contacto más: es la dirección
-- con la que se entra y, en cuanto haya SMTP, el buzón al que llega el enlace
-- de recuperación. El login lo resuelve desde ESTA columna
-- (`resolver_email_login`, v19/v52) mientras Auth guarda el suyo aparte, así
-- que las dos tienen que moverse juntas — para eso existe la Edge Function
-- `actualizar-correo`.
--
-- Pero encauzar el cliente no basta. `usuarios_update` (v24) deja a cualquier
-- autenticado escribir su propia fila y a cualquier staff escribir cualquier
-- fila de su club, y `correo` no estaba entre las columnas protegidas. O sea
-- que un simple
--
--     PATCH /rest/v1/usuarios?id=eq.<fila del dueño>   {"correo": "x@x.com"}
--
-- con la sesión normal de un coach bastaba para separar las dos mitades. A
-- partir de ahí el dueño mete su contraseña correcta y recibe "Correo,
-- teléfono, cédula o contraseña incorrectos" para siempre: `resolver_email_login`
-- devuelve una dirección que Auth no conoce. Ni cambiar la contraseña ni pedir
-- el enlace de recuperación lo desatascan, porque el login sigue resolviendo a
-- la dirección envenenada. Hace falta un superadmin que corrija la fila a mano.
--
-- Con esto, la ÚNICA vía de cambiar un correo es la Edge Function (que corre
-- con service_role y por tanto entra por el early-return de `auth.uid() IS NULL`),
-- donde sí se mueven las dos mitades, se valida la dirección y se aplica el
-- gate de rol. El alta no se ve afectada: este trigger es de UPDATE, así que un
-- INSERT con correo sigue funcionando igual.
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
  -- con qué cédula se identifica. Ver cabecera: cambiarlas es apoderarse de la
  -- cuenta, así que ni el staff de su propio club.
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
