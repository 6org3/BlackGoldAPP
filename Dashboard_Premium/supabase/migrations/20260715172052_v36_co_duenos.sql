-- ============================================================================
-- v36 — Co-dueños: el dueño original invita a otros dueños de su club.
--
-- Contexto (decisiones del dueño, 2026-07-15):
--   · Un co-dueño es un `owner` más: mismos poderes, sin roles de segunda.
--   · RETIRAR a un dueño lo hace SOLO el superadmin. Si un co-dueño pudiera
--     desactivar a otro, quien invitas hoy te echa mañana de tu propio club, y
--     eso no se deshace sin intervención externa. Crear sí, echar no.
--   · Solo el dueño ORIGINAL invita co-dueños; un co-dueño no encadena más.
--
-- Cómo se sabe quién es el "original" sin inventar roles: por LINAJE. La
-- columna `creado_por` guarda quién dio de alta a cada usuario, y la sella un
-- trigger server-side — si viniera del cliente, cualquiera se declararía
-- fundador mandando NULL. Original = nadie te creó desde la app (te sembró un
-- script o te instaló el superadmin). Un owner con padrino es co-dueño.
--
-- `creado_por` vale además como auditoría: quién registró a cada atleta, a cada
-- representante y a cada coach.
--
-- Invariante que se protege aparte: un club SIN dueño activo queda inoperante
-- —desaparece de `listar_clubes_publicos` (v33), nadie puede aprobar sus
-- solicitudes ni dar de alta a su staff—, así que no se puede desactivar al
-- último. Ni siquiera el superadmin: para eso están los scripts con
-- service_role, que saltan este trigger por diseño (auth.uid() IS NULL).
-- ============================================================================


-- ------------------------------------------------------------
-- 1. Linaje: quién dio de alta a quién.
--    ON DELETE SET NULL en vez de RESTRICT: el padrino de la mayoría de filas
--    es un coach (dio de alta atletas), y RESTRICT haría imborrable a
--    cualquiera que haya registrado a alguien.
--
--    Efecto buscado — SUCESIÓN: si el superadmin borra al dueño original, sus
--    co-dueños se quedan sin padrino y pasan a contar como originales, con lo
--    que recuperan la capacidad de invitar. Es lo que conviene al club (sin
--    original, nadie podría ampliar el equipo de dueños nunca más) y solo
--    ocurre por un borrado físico, que es deliberado y solo-superadmin (v34).
--    Está fijado con un assert en validar_rls_por_rol.js: si algún día se
--    prefiere que el club se quede sin quien invite, hay que cambiarlo a
--    conciencia y no por accidente de la FK.
-- ------------------------------------------------------------

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS creado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

-- El valor NUNCA llega del cliente: lo sella el servidor en cada INSERT.
-- Lo que crea el superadmin nace SIN padrino: cuando instala al dueño de un
-- club nuevo, ese dueño es el original y debe poder invitar a los suyos.
CREATE OR REPLACE FUNCTION public.sellar_creado_por()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR es_superadmin() THEN
    NEW.creado_por := NULL;   -- script/seed, registro público o instalación del superadmin
  ELSE
    NEW.creado_por := current_usuario_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sellar_creado_por ON public.usuarios;
CREATE TRIGGER trg_sellar_creado_por
  BEFORE INSERT ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.sellar_creado_por();


-- ------------------------------------------------------------
-- 2. Dueño original = owner activo sin padrino.
--    Los owners que ya existen tienen creado_por NULL (columna nueva), así que
--    todos los actuales son originales: nadie pierde capacidades con v36.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.es_owner_principal()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT rol = 'owner' AND COALESCE(estado, 'activo') = 'activo' AND creado_por IS NULL
     FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1),
    false);
$$;

REVOKE ALL ON FUNCTION public.es_owner_principal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_owner_principal() TO authenticated, service_role;


-- ------------------------------------------------------------
-- 3. Quién puede crear a quién (cuerpo base: v35 §1).
--    Novedad: el dueño original puede crear owners de SU club.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS usuarios_insert ON public.usuarios;
CREATE POLICY usuarios_insert ON public.usuarios FOR INSERT TO authenticated
  WITH CHECK (
    (select es_superadmin())
    OR (
      (select es_staff())
      AND club = (select current_user_club())
      AND (
        rol IN ('atleta', 'padre')
        OR (rol = 'coach' AND (select current_user_rol()) = 'owner')
        -- Co-dueño: solo el original invita, y solo a su propio club (v36).
        OR (rol = 'owner' AND (select es_owner_principal()))
      )
    )
  );


-- ------------------------------------------------------------
-- 4. Guards de columnas (cuerpo base: v35/v34 §3).
--    Novedades: `creado_por` es inmutable (si no, un co-dueño se borraría el
--    padrino y ascendería a original), el estado de un dueño solo lo mueve el
--    superadmin, y nadie deja un club sin dueño activo.
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

  IF NEW.cedula IS DISTINCT FROM OLD.cedula
     OR NEW.fecha_nacimiento IS DISTINCT FROM OLD.fecha_nacimiento
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION 'No tienes permiso para modificar campos protegidos del perfil.';
  END IF;
  RETURN NEW;
END;
$$;
