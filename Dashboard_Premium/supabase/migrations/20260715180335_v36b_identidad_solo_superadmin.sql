-- ============================================================================
-- v36b — La IDENTIDAD de una cuenta (a qué usuario de Auth resuelve, y con qué
--        cédula se identifica) solo la cambia el superadmin.
--
-- Encontrado por la revisión adversarial de v36. Es la MISMA clase de fallo que
-- v33 cerró para `estado`, v34 para `rol`/`club` y v36 para `creado_por`: el
-- guard vivía DEBAJO del `IF es_staff() THEN RETURN NEW`, así que nunca se
-- aplicaba al staff. Quedaba vivo justo el más peligroso.
--
-- El ataque no cambia atributos: cambia a QUÉ FILA apunta tu sesión.
--   1. Un coach (o co-dueño) del club BG hace, con su propia sesión:
--        PATCH /rest/v1/usuarios?id=eq.<fila del dueño>  { "auth_user_id": "<su uid>" }
--      `usuarios_update` (v24) admite a cualquier es_staff() sobre cualquier
--      fila de su club, y el trigger lo dejaba salir por el atajo de staff.
--   2. Vuelve a entrar: su JWT ahora resuelve a la fila del dueño.
--      current_user_rol() = 'owner', es_owner_principal() = true.
--   3. Es el dueño. Sin tocar `rol` (v34), ni `estado` (v33), ni `creado_por`
--      (v36) — todos esos guards quedan sin efecto, porque el atacante no los
--      cruza: se muda a una fila que ya los tiene como quiere.
--
-- Variante del mismo primitivo: el atacante crea un atleta de su club (lo
-- permite usuarios_insert), le emite acceso con crear-acceso-usuario (rol
-- atleta = cualquier staff) eligiendo correo y cédula, y luego reasigna ese
-- auth_user_id a la fila del dueño. El índice único de auth_user_id es parcial
-- (WHERE NOT NULL), así que liberarlo antes de reasignarlo ni siquiera colisiona.
--
-- `cedula` sube con él: es el identificador con el que resolver_email_login
-- (v19) traduce un login a un email, y la contraseña inicial que deriva
-- crear-acceso-usuario. `correo` y `fecha_nacimiento` NO suben: el staff los
-- corrige legítimamente en la ficha de sus atletas (useAdminAtletasForm), y sin
-- poder tocar auth_user_id no abren ninguna vía — la Edge Function responde
-- `ya_existia` y no emite nada.
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
