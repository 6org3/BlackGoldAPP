-- Vínculo seguro App <-> WhatsApp y cola de notificaciones operativas.
--
-- No se correlaciona un teléfono por nombre, correo o una coincidencia implícita.
-- La persona autenticada inicia el vínculo desde la app; el código efímero se
-- presenta voluntariamente por WhatsApp y el adaptador de servidor lo consume.

CREATE TABLE IF NOT EXISTS public.crm_enlaces_app_whatsapp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club text NOT NULL CHECK (btrim(club) <> ''),
  app_usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'consumido', 'revocado', 'expirado')),
  expira_at timestamptz NOT NULL,
  consumido_at timestamptz,
  contact_id uuid REFERENCES public.crm_contactos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expira_at > created_at),
  CHECK ((estado = 'consumido') = (consumido_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_enlaces_app_whatsapp_token
  ON public.crm_enlaces_app_whatsapp (token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_enlaces_app_whatsapp_pendiente
  ON public.crm_enlaces_app_whatsapp (club, app_usuario_id)
  WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_crm_enlaces_app_whatsapp_expira
  ON public.crm_enlaces_app_whatsapp (estado, expira_at);

ALTER TABLE public.crm_enlaces_app_whatsapp ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.crm_enlaces_app_whatsapp FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.crm_enlaces_app_whatsapp_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enlace_id uuid NOT NULL REFERENCES public.crm_enlaces_app_whatsapp(id) ON DELETE CASCADE,
  accion text NOT NULL CHECK (accion IN ('emitido', 'resuelto', 'consumido', 'rechazado', 'expirado')),
  actor text NOT NULL CHECK (actor ~ '^[a-z0-9_-]{2,64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_enlaces_app_whatsapp_auditoria_enlace
  ON public.crm_enlaces_app_whatsapp_auditoria (enlace_id, created_at DESC);
ALTER TABLE public.crm_enlaces_app_whatsapp_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.crm_enlaces_app_whatsapp_auditoria FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_emitir_enlace_app_whatsapp(
  p_app_usuario_id uuid,
  p_token_hash text,
  p_expira_at timestamptz,
  p_actor text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_usuario public.usuarios%ROWTYPE;
  v_enlace public.crm_enlaces_app_whatsapp%ROWTYPE;
  v_hash text := lower(btrim(coalesce(p_token_hash, '')));
  v_actor text := btrim(coalesce(p_actor, ''));
BEGIN
  IF p_app_usuario_id IS NULL OR v_hash !~ '^[a-f0-9]{64}$'
     OR v_actor !~ '^[a-z0-9_-]{2,64}$'
     OR p_expira_at <= now() + interval '4 minutes'
     OR p_expira_at > now() + interval '20 minutes' THEN
    RAISE EXCEPTION 'Solicitud de vínculo inválida.';
  END IF;

  SELECT * INTO v_usuario
  FROM public.usuarios
  WHERE id = p_app_usuario_id AND estado = 'activo'
  FOR UPDATE;
  IF v_usuario.id IS NULL THEN
    RAISE EXCEPTION 'La cuenta no puede vincular WhatsApp.';
  END IF;

  UPDATE public.crm_enlaces_app_whatsapp
     SET estado = 'revocado', updated_at = now()
   WHERE club = v_usuario.club
     AND app_usuario_id = v_usuario.id
     AND estado = 'pendiente';

  INSERT INTO public.crm_enlaces_app_whatsapp (club, app_usuario_id, token_hash, expira_at)
  VALUES (v_usuario.club, v_usuario.id, v_hash, p_expira_at)
  RETURNING * INTO v_enlace;

  INSERT INTO public.crm_enlaces_app_whatsapp_auditoria (enlace_id, accion, actor)
  VALUES (v_enlace.id, 'emitido', v_actor);

  RETURN jsonb_build_object('enlace_id', v_enlace.id, 'club', v_enlace.club, 'expira_at', v_enlace.expira_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_resolver_enlace_app_whatsapp(
  p_club text,
  p_token_hash text,
  p_actor text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enlace public.crm_enlaces_app_whatsapp%ROWTYPE;
  v_hash text := lower(btrim(coalesce(p_token_hash, '')));
  v_actor text := btrim(coalesce(p_actor, ''));
BEGIN
  IF btrim(coalesce(p_club, '')) = '' OR v_hash !~ '^[a-f0-9]{64}$'
     OR v_actor !~ '^[a-z0-9_-]{2,64}$' THEN
    RAISE EXCEPTION 'Solicitud de vínculo inválida.';
  END IF;

  SELECT * INTO v_enlace
  FROM public.crm_enlaces_app_whatsapp
  WHERE club = p_club AND token_hash = v_hash
  FOR UPDATE;
  IF v_enlace.id IS NULL THEN
    RETURN jsonb_build_object('estado', 'no_encontrado');
  END IF;
  IF v_enlace.estado = 'pendiente' AND v_enlace.expira_at <= now() THEN
    UPDATE public.crm_enlaces_app_whatsapp SET estado = 'expirado', updated_at = now() WHERE id = v_enlace.id;
    INSERT INTO public.crm_enlaces_app_whatsapp_auditoria (enlace_id, accion, actor) VALUES (v_enlace.id, 'expirado', v_actor);
    RETURN jsonb_build_object('estado', 'expirado');
  END IF;
  IF v_enlace.estado <> 'pendiente' THEN
    RETURN jsonb_build_object('estado', v_enlace.estado);
  END IF;

  INSERT INTO public.crm_enlaces_app_whatsapp_auditoria (enlace_id, accion, actor) VALUES (v_enlace.id, 'resuelto', v_actor);
  RETURN jsonb_build_object('estado', 'pendiente', 'enlace_id', v_enlace.id, 'app_usuario_id', v_enlace.app_usuario_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_consumir_enlace_app_whatsapp(
  p_enlace_id uuid,
  p_contact_id uuid,
  p_actor text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enlace public.crm_enlaces_app_whatsapp%ROWTYPE;
  v_contacto public.crm_contactos%ROWTYPE;
  v_conflicto uuid;
  v_actor text := btrim(coalesce(p_actor, ''));
BEGIN
  IF p_enlace_id IS NULL OR p_contact_id IS NULL OR v_actor !~ '^[a-z0-9_-]{2,64}$' THEN
    RAISE EXCEPTION 'Consumo de vínculo inválido.';
  END IF;
  SELECT * INTO v_enlace FROM public.crm_enlaces_app_whatsapp WHERE id = p_enlace_id FOR UPDATE;
  IF v_enlace.id IS NULL OR v_enlace.estado <> 'pendiente' OR v_enlace.expira_at <= now() THEN
    RAISE EXCEPTION 'El código de vínculo no está disponible.';
  END IF;
  SELECT * INTO v_contacto FROM public.crm_contactos WHERE id = p_contact_id FOR UPDATE;
  IF v_contacto.id IS NULL OR v_contacto.club <> v_enlace.club THEN
    RAISE EXCEPTION 'El contacto no corresponde al vínculo.';
  END IF;
  SELECT id INTO v_conflicto FROM public.crm_contactos
   WHERE club = v_enlace.club AND app_usuario_id = v_enlace.app_usuario_id AND id <> v_contacto.id
   LIMIT 1 FOR UPDATE;
  IF v_conflicto IS NOT NULL THEN
    RAISE EXCEPTION 'La cuenta ya está vinculada a otro contacto CRM.';
  END IF;
  IF v_contacto.app_usuario_id IS NOT NULL AND v_contacto.app_usuario_id <> v_enlace.app_usuario_id THEN
    RAISE EXCEPTION 'El canal pertenece a otra cuenta de la app.';
  END IF;

  UPDATE public.crm_contactos SET app_usuario_id = v_enlace.app_usuario_id, updated_at = now() WHERE id = v_contacto.id;
  UPDATE public.crm_contacto_canales
     SET verificado_at = coalesce(verificado_at, now()), updated_at = now()
   WHERE contact_id = v_contacto.id AND canal = 'whatsapp';
  UPDATE public.crm_enlaces_app_whatsapp
     SET estado = 'consumido', consumido_at = now(), contact_id = v_contacto.id, updated_at = now()
   WHERE id = v_enlace.id;
  INSERT INTO public.crm_enlaces_app_whatsapp_auditoria (enlace_id, accion, actor) VALUES (v_enlace.id, 'consumido', v_actor);
  RETURN jsonb_build_object('contact_id', v_contacto.id, 'app_usuario_id', v_enlace.app_usuario_id, 'estado', 'consumido');
END;
$$;

REVOKE ALL ON FUNCTION public.crm_emitir_enlace_app_whatsapp(uuid, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_resolver_enlace_app_whatsapp(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_consumir_enlace_app_whatsapp(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_emitir_enlace_app_whatsapp(uuid, text, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_resolver_enlace_app_whatsapp(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_consumir_enlace_app_whatsapp(uuid, uuid, text) TO service_role;

CREATE TABLE IF NOT EXISTS public.crm_notificaciones_operativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club text NOT NULL CHECK (btrim(club) <> ''),
  tipo text NOT NULL CHECK (tipo IN ('asistencia_actualizada')),
  asistencia_id uuid NOT NULL REFERENCES public.asistencia(id) ON DELETE CASCADE,
  atleta_id uuid NOT NULL REFERENCES public.atletas(id) ON DELETE CASCADE,
  app_usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.crm_contactos(id) ON DELETE SET NULL,
  estado text NOT NULL CHECK (estado IN ('sin_vinculo_whatsapp', 'pendiente_consentimiento_operacion', 'pendiente_revision', 'autorizada', 'enviada', 'fallida', 'cancelada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, asistencia_id, app_usuario_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_notificaciones_operativas_estado
  ON public.crm_notificaciones_operativas (club, estado, created_at);
ALTER TABLE public.crm_notificaciones_operativas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.crm_notificaciones_operativas FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_encolar_notificaciones_asistencia()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;
  SELECT u.club INTO v_club
  FROM public.atletas a JOIN public.usuarios u ON u.id = a.usuario_id
  WHERE a.id = NEW.atleta_id;
  IF v_club IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.crm_notificaciones_operativas (club, tipo, asistencia_id, atleta_id, app_usuario_id, contact_id, estado)
  SELECT
    v_club,
    'asistencia_actualizada',
    NEW.id,
    NEW.atleta_id,
    pa.padre_id,
    c.id,
    CASE
      WHEN c.id IS NULL THEN 'sin_vinculo_whatsapp'
      WHEN EXISTS (
        SELECT 1 FROM public.crm_consentimientos co
        WHERE co.contact_id = c.id AND co.alcance = 'atencion' AND co.estado = 'otorgado'
      ) THEN 'autorizada'
      ELSE 'pendiente_consentimiento_operacion'
    END
  FROM public.padres_atletas pa
  LEFT JOIN public.crm_contactos c ON c.club = v_club AND c.app_usuario_id = pa.padre_id AND c.estado = 'activo'
  WHERE pa.atleta_id = NEW.atleta_id
  ON CONFLICT (tipo, asistencia_id, app_usuario_id) DO UPDATE
    SET contact_id = EXCLUDED.contact_id,
        estado = CASE WHEN public.crm_notificaciones_operativas.estado IN ('enviada', 'cancelada') THEN public.crm_notificaciones_operativas.estado ELSE EXCLUDED.estado END,
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_encolar_notificaciones_asistencia ON public.asistencia;
CREATE TRIGGER trg_crm_encolar_notificaciones_asistencia
AFTER INSERT OR UPDATE OF estado ON public.asistencia
FOR EACH ROW EXECUTE FUNCTION public.crm_encolar_notificaciones_asistencia();

REVOKE ALL ON FUNCTION public.crm_encolar_notificaciones_asistencia() FROM PUBLIC, anon, authenticated;
