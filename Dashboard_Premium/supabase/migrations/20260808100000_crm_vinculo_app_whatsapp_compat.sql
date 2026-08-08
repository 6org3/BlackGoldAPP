-- Compatibilidad hacia delante del vínculo explícito App <-> WhatsApp.
--
-- El servidor tiene la primera versión de correlación (vía
-- crm_codigos_vinculacion); la PWA y los Edge Functions actuales usan el
-- contrato crm_enlaces_app_whatsapp. Este cambio agrega el contrato nuevo sin
-- inferir identidad por teléfono, correo o nombre y sin retirar el anterior.

CREATE TABLE IF NOT EXISTS public.crm_enlaces_app_whatsapp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club text NOT NULL CHECK (btrim(club) <> ''),
  app_usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'consumido', 'revocado', 'expirado')),
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
REVOKE ALL ON TABLE public.crm_enlaces_app_whatsapp
  FROM PUBLIC, anon, authenticated, service_role;

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
REVOKE ALL ON TABLE public.crm_enlaces_app_whatsapp_auditoria
  FROM PUBLIC, anon, authenticated, service_role;

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

  RETURN jsonb_build_object(
    'enlace_id', v_enlace.id,
    'club', v_enlace.club,
    'expira_at', v_enlace.expira_at
  );
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
    UPDATE public.crm_enlaces_app_whatsapp
       SET estado = 'expirado', updated_at = now()
     WHERE id = v_enlace.id;
    INSERT INTO public.crm_enlaces_app_whatsapp_auditoria (enlace_id, accion, actor)
    VALUES (v_enlace.id, 'expirado', v_actor);
    RETURN jsonb_build_object('estado', 'expirado');
  END IF;
  IF v_enlace.estado <> 'pendiente' THEN
    RETURN jsonb_build_object('estado', v_enlace.estado);
  END IF;

  INSERT INTO public.crm_enlaces_app_whatsapp_auditoria (enlace_id, accion, actor)
  VALUES (v_enlace.id, 'resuelto', v_actor);
  RETURN jsonb_build_object(
    'estado', 'pendiente',
    'enlace_id', v_enlace.id,
    'app_usuario_id', v_enlace.app_usuario_id
  );
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
  IF p_enlace_id IS NULL OR p_contact_id IS NULL
     OR v_actor !~ '^[a-z0-9_-]{2,64}$' THEN
    RAISE EXCEPTION 'Consumo de vínculo inválido.';
  END IF;

  SELECT * INTO v_enlace
  FROM public.crm_enlaces_app_whatsapp
  WHERE id = p_enlace_id
  FOR UPDATE;
  IF v_enlace.id IS NULL OR v_enlace.estado <> 'pendiente'
     OR v_enlace.expira_at <= now() THEN
    RAISE EXCEPTION 'El código de vínculo no está disponible.';
  END IF;

  SELECT * INTO v_contacto
  FROM public.crm_contactos
  WHERE id = p_contact_id
  FOR UPDATE;
  IF v_contacto.id IS NULL OR v_contacto.club <> v_enlace.club THEN
    RAISE EXCEPTION 'El contacto no corresponde al vínculo.';
  END IF;

  SELECT id INTO v_conflicto
  FROM public.crm_contactos
  WHERE club = v_enlace.club
    AND app_usuario_id = v_enlace.app_usuario_id
    AND id <> v_contacto.id
  LIMIT 1
  FOR UPDATE;
  IF v_conflicto IS NOT NULL THEN
    RAISE EXCEPTION 'La cuenta ya está vinculada a otro contacto CRM.';
  END IF;
  IF v_contacto.app_usuario_id IS NOT NULL
     AND v_contacto.app_usuario_id <> v_enlace.app_usuario_id THEN
    RAISE EXCEPTION 'El canal pertenece a otra cuenta de la app.';
  END IF;

  UPDATE public.crm_contactos
     SET app_usuario_id = v_enlace.app_usuario_id, updated_at = now()
   WHERE id = v_contacto.id;
  UPDATE public.crm_contacto_canales
     SET verificado_at = coalesce(verificado_at, now()), updated_at = now()
   WHERE contact_id = v_contacto.id AND canal = 'whatsapp';
  UPDATE public.crm_enlaces_app_whatsapp
     SET estado = 'consumido',
         consumido_at = now(),
         contact_id = v_contacto.id,
         updated_at = now()
   WHERE id = v_enlace.id;
  INSERT INTO public.crm_enlaces_app_whatsapp_auditoria (enlace_id, accion, actor)
  VALUES (v_enlace.id, 'consumido', v_actor);

  RETURN jsonb_build_object(
    'contact_id', v_contacto.id,
    'app_usuario_id', v_enlace.app_usuario_id,
    'estado', 'consumido'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_emitir_enlace_app_whatsapp(uuid, text, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_resolver_enlace_app_whatsapp(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_consumir_enlace_app_whatsapp(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_emitir_enlace_app_whatsapp(uuid, text, timestamptz, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_resolver_enlace_app_whatsapp(text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_consumir_enlace_app_whatsapp(uuid, uuid, text)
  TO service_role;

COMMENT ON TABLE public.crm_enlaces_app_whatsapp IS
  'Vínculos de corta duración App-WhatsApp; conserva solo hash del código.';
