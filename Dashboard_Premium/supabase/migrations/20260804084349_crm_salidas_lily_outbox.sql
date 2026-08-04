-- Outbox durable de Lily. Guarda una huella del payload, no el texto del
-- mensaje ni el número del destinatario, y reserva cada salida antes de llamar
-- a Meta para que los reintentos sobrevivan a reinicios de Edge Functions.
CREATE TABLE IF NOT EXISTS public.crm_salidas_lily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.crm_contactos(id) ON DELETE RESTRICT,
  club text NOT NULL,
  canal text NOT NULL DEFAULT 'whatsapp' CHECK (canal = 'whatsapp'),
  idempotency_key text NOT NULL CHECK (
    char_length(idempotency_key) BETWEEN 8 AND 180
    AND idempotency_key ~ '^[A-Za-z0-9._:-]+$'
  ),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  intencion text NOT NULL CHECK (intencion IN (
    'informacion_general', 'clases', 'horarios', 'inscripcion',
    'prueba', 'soporte', 'seguimiento', 'otro'
  )),
  modo text NOT NULL CHECK (modo IN ('respuesta', 'seguimiento')),
  respuesta_a_ref text CHECK (
    respuesta_a_ref IS NULL
    OR (char_length(respuesta_a_ref) BETWEEN 1 AND 180 AND respuesta_a_ref ~ '^[A-Za-z0-9._:-]+$')
  ),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN (
    'pendiente', 'enviando', 'aceptada_meta', 'error', 'error_terminal',
    'revision_manual', 'cancelada'
  )),
  intentos integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  enviando_at timestamptz,
  enviando_hasta timestamptz,
  aceptada_meta_at timestamptz,
  meta_mensaje_id text CHECK (
    meta_mensaje_id IS NULL
    OR (char_length(meta_mensaje_id) BETWEEN 1 AND 180 AND meta_mensaje_id ~ '^[A-Za-z0-9._:-]+$')
  ),
  ultimo_error text CHECK (ultimo_error IS NULL OR char_length(ultimo_error) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_salidas_lily_contacto_club_fkey
    FOREIGN KEY (contact_id, club)
    REFERENCES public.crm_contactos(id, club)
    ON DELETE RESTRICT,
  UNIQUE (canal, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_crm_salidas_lily_contacto_estado
  ON public.crm_salidas_lily (contact_id, estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_salidas_lily_reclamar
  ON public.crm_salidas_lily (estado, enviando_hasta)
  WHERE estado IN ('pendiente', 'enviando', 'error');

-- La auditoría existente ya distingue sus entidades operativas. Se añade la
-- outbox como entidad propia para mantener trazabilidad sin sobrecargar el
-- historial del contacto ni exponer mensaje, teléfono o idempotency_key.
ALTER TABLE public.crm_auditoria
  DROP CONSTRAINT IF EXISTS crm_auditoria_entidad_tipo_check;
ALTER TABLE public.crm_auditoria
  ADD CONSTRAINT crm_auditoria_entidad_tipo_check CHECK (entidad_tipo IN (
    'contacto', 'oportunidad', 'preferencia', 'consentimiento', 'actividad', 'salida_lily'
  ));

ALTER TABLE public.crm_salidas_lily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.crm_salidas_lily FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_tocar_salidas_lily_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_salidas_lily_updated_at ON public.crm_salidas_lily;
CREATE TRIGGER trg_crm_salidas_lily_updated_at
BEFORE UPDATE ON public.crm_salidas_lily
FOR EACH ROW EXECUTE FUNCTION public.crm_tocar_salidas_lily_updated_at();

-- Sólo se devuelve el destinatario dentro de una función SECURITY DEFINER a
-- otra función del mismo esquema. No se concede EXECUTE a service_role ni a
-- ningún rol de navegador sobre este helper.
CREATE OR REPLACE FUNCTION public.crm_validar_salida_lily(
  p_contact_id uuid,
  p_canal text,
  p_intencion text,
  p_modo text,
  p_respuesta_a_ref text
)
RETURNS TABLE (club text, destinatario text, bloqueo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contacto public.crm_contactos%ROWTYPE;
  v_destinatario text;
  v_atencion text;
  v_seguimiento text;
BEGIN
  IF p_canal IS DISTINCT FROM 'whatsapp' THEN
    RETURN QUERY SELECT NULL::text, NULL::text, 'canal_no_permitido';
    RETURN;
  END IF;
  IF p_modo IS NULL OR p_modo NOT IN ('respuesta', 'seguimiento') THEN
    RETURN QUERY SELECT NULL::text, NULL::text, 'modo_no_permitido';
    RETURN;
  END IF;
  IF p_intencion IS NULL OR p_intencion NOT IN (
    'informacion_general', 'clases', 'horarios', 'inscripcion',
    'prueba', 'soporte', 'seguimiento', 'otro'
  ) OR (p_modo = 'seguimiento' AND p_intencion <> 'seguimiento') THEN
    RETURN QUERY SELECT NULL::text, NULL::text, 'intencion_no_permitida';
    RETURN;
  END IF;

  SELECT * INTO v_contacto
  FROM public.crm_contactos
  WHERE id = p_contact_id
  FOR UPDATE;
  IF v_contacto.id IS NULL THEN
    RETURN QUERY SELECT NULL::text, NULL::text, 'contacto_no_disponible';
    RETURN;
  END IF;
  IF v_contacto.tipo_relacion = 'no_contactar' OR v_contacto.estado <> 'activo' THEN
    RETURN QUERY SELECT NULL::text, NULL::text, 'contacto_no_admite_salida';
    RETURN;
  END IF;

  SELECT estado INTO v_atencion
  FROM public.crm_consentimientos
  WHERE contact_id = v_contacto.id AND alcance = 'atencion';
  IF v_atencion = 'revocado' THEN
    RETURN QUERY SELECT NULL::text, NULL::text, 'atencion_revocada';
    RETURN;
  END IF;

  -- Una respuesta libre sólo es válida dentro de 24 h de un evento entrante
  -- real, entregado a Lily, del mismo contacto y canal. Además, cualquier
  -- no-contactar posterior invalida ese contexto aunque alguien haya
  -- reactivado manualmente el registro después.
  IF p_modo = 'respuesta' THEN
    IF p_respuesta_a_ref IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.crm_interacciones i
      WHERE i.contact_id = v_contacto.id
        AND i.canal = p_canal
        AND i.sentido = 'entrada'
        AND i.mensaje_externo_ref = p_respuesta_a_ref
        AND i.lily_entregado_at IS NOT NULL
        AND i.created_at >= now() - interval '24 hours'
        AND NOT EXISTS (
          SELECT 1
          FROM public.crm_auditoria a
          WHERE a.entidad_tipo = 'contacto'
            AND a.entidad_id = v_contacto.id
            AND a.accion = 'marcado_no_contactar'
            AND a.created_at >= i.created_at
        )
    ) THEN
      RETURN QUERY SELECT NULL::text, NULL::text, 'respuesta_fuera_de_contexto';
      RETURN;
    END IF;
  ELSIF v_contacto.tipo_relacion = 'interno' THEN
    RETURN QUERY SELECT NULL::text, NULL::text, 'interno_sin_salida_proactiva';
    RETURN;
  ELSE
    SELECT estado INTO v_seguimiento
    FROM public.crm_consentimientos
    WHERE contact_id = v_contacto.id AND alcance = 'seguimiento';
    IF v_seguimiento IS DISTINCT FROM 'otorgado' THEN
      RETURN QUERY SELECT NULL::text, NULL::text, 'seguimiento_sin_consentimiento';
      RETURN;
    END IF;
  END IF;

  SELECT ch.identificador_normalizado INTO v_destinatario
  FROM public.crm_contacto_canales ch
  WHERE ch.contact_id = v_contacto.id
    AND ch.club = v_contacto.club
    AND ch.canal = p_canal
  ORDER BY ch.es_principal DESC, ch.updated_at DESC
  LIMIT 1;
  IF v_destinatario IS NULL THEN
    RETURN QUERY SELECT NULL::text, NULL::text, 'sin_canal_whatsapp';
    RETURN;
  END IF;

  RETURN QUERY SELECT v_contacto.club, v_destinatario, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_cancelar_salidas_lily_contacto_bloqueado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.tipo_relacion = 'no_contactar' OR NEW.estado = 'archivado' THEN
    UPDATE public.crm_salidas_lily
       SET estado = 'cancelada',
           ultimo_error = 'contacto_bloqueado'
     WHERE contact_id = NEW.id
       AND estado IN ('pendiente', 'error', 'enviando');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_cancelar_salidas_lily_contacto ON public.crm_contactos;
CREATE TRIGGER trg_crm_cancelar_salidas_lily_contacto
AFTER UPDATE OF tipo_relacion, estado ON public.crm_contactos
FOR EACH ROW EXECUTE FUNCTION public.crm_cancelar_salidas_lily_contacto_bloqueado();

CREATE OR REPLACE FUNCTION public.crm_cancelar_salidas_lily_consentimiento_revocado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.estado = 'revocado' AND NEW.alcance IN ('atencion', 'seguimiento') THEN
    UPDATE public.crm_salidas_lily
       SET estado = 'cancelada',
           ultimo_error = CASE
             WHEN NEW.alcance = 'atencion' THEN 'atencion_revocada'
             ELSE 'seguimiento_revocado'
           END
     WHERE contact_id = NEW.contact_id
       AND estado IN ('pendiente', 'error', 'enviando')
       AND (
         NEW.alcance = 'atencion'
         OR (NEW.alcance = 'seguimiento' AND modo = 'seguimiento')
       );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_cancelar_salidas_lily_consentimiento ON public.crm_consentimientos;
CREATE TRIGGER trg_crm_cancelar_salidas_lily_consentimiento
AFTER INSERT OR UPDATE OF estado ON public.crm_consentimientos
FOR EACH ROW EXECUTE FUNCTION public.crm_cancelar_salidas_lily_consentimiento_revocado();

CREATE OR REPLACE FUNCTION public.crm_reservar_salida_lily(
  p_contact_id uuid,
  p_canal text,
  p_idempotency_key text,
  p_payload_hash text,
  p_intencion text,
  p_modo text,
  p_respuesta_a_ref text DEFAULT NULL,
  p_actor text DEFAULT 'lily'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_canal text := btrim(COALESCE(p_canal, ''));
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_hash text := lower(btrim(COALESCE(p_payload_hash, '')));
  v_intencion text := btrim(COALESCE(p_intencion, ''));
  v_modo text := btrim(COALESCE(p_modo, ''));
  v_respuesta_ref text := NULLIF(btrim(COALESCE(p_respuesta_a_ref, '')), '');
  v_actor text := btrim(COALESCE(p_actor, ''));
  v_salida public.crm_salidas_lily%ROWTYPE;
  v_validacion record;
BEGIN
  IF p_contact_id IS NULL
     OR v_canal <> 'whatsapp'
     OR char_length(v_key) NOT BETWEEN 8 AND 180 OR v_key !~ '^[A-Za-z0-9._:-]+$'
     OR v_hash !~ '^[a-f0-9]{64}$'
     OR v_intencion NOT IN ('informacion_general', 'clases', 'horarios', 'inscripcion', 'prueba', 'soporte', 'seguimiento', 'otro')
     OR v_modo NOT IN ('respuesta', 'seguimiento')
     OR (v_modo = 'seguimiento' AND v_intencion <> 'seguimiento')
     OR (v_modo = 'respuesta' AND v_respuesta_ref IS NULL)
     OR (v_respuesta_ref IS NOT NULL AND (char_length(v_respuesta_ref) > 180 OR v_respuesta_ref !~ '^[A-Za-z0-9._:-]+$'))
     OR v_actor !~ '^[a-z0-9_-]{2,64}$' THEN
    RAISE EXCEPTION 'Parámetros de salida Lily inválidos.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('crm_salida_lily' || E'\x1f' || v_canal || E'\x1f' || v_key));
  SELECT * INTO v_salida
  FROM public.crm_salidas_lily
  WHERE canal = v_canal AND idempotency_key = v_key
  FOR UPDATE;

  IF v_salida.id IS NOT NULL THEN
    IF v_salida.contact_id <> p_contact_id OR v_salida.payload_hash <> v_hash THEN
      RETURN jsonb_build_object('estado', 'conflicto', 'repetida', true);
    END IF;
    IF v_salida.estado IN (
      'aceptada_meta', 'cancelada', 'enviando', 'error_terminal', 'revision_manual'
    ) THEN
      RETURN jsonb_build_object(
        'salida_id', v_salida.id,
        'estado', v_salida.estado,
        'repetida', true
      );
    END IF;
  END IF;

  SELECT * INTO v_validacion
  FROM public.crm_validar_salida_lily(
    p_contact_id, v_canal, v_intencion, v_modo, v_respuesta_ref
  );
  IF v_validacion.bloqueo IS NOT NULL THEN
    IF v_salida.id IS NOT NULL THEN
      UPDATE public.crm_salidas_lily
         SET estado = 'cancelada', ultimo_error = v_validacion.bloqueo
       WHERE id = v_salida.id;
    END IF;
    RETURN jsonb_build_object('estado', 'bloqueada', 'repetida', v_salida.id IS NOT NULL);
  END IF;

  IF v_salida.id IS NULL THEN
    INSERT INTO public.crm_salidas_lily (
      contact_id, club, canal, idempotency_key, payload_hash,
      intencion, modo, respuesta_a_ref
    ) VALUES (
      p_contact_id, v_validacion.club, v_canal, v_key, v_hash,
      v_intencion, v_modo, v_respuesta_ref
    )
    RETURNING * INTO v_salida;

    INSERT INTO public.crm_auditoria (club, entidad_tipo, entidad_id, accion, actor, metadata)
    VALUES (v_salida.club, 'salida_lily', v_salida.id, 'salida_lily_reservada', v_actor,
      jsonb_build_object('contact_id', p_contact_id, 'intencion', v_intencion, 'modo', v_modo));
  ELSIF v_salida.estado = 'error' THEN
    UPDATE public.crm_salidas_lily
       SET estado = 'pendiente', ultimo_error = NULL, enviando_hasta = NULL
     WHERE id = v_salida.id
    RETURNING * INTO v_salida;
  END IF;

  RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', v_salida.estado, 'repetida', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_despachar_salida_lily(
  p_idempotency_key text,
  p_payload_hash text,
  p_actor text DEFAULT 'lily'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_hash text := lower(btrim(COALESCE(p_payload_hash, '')));
  v_actor text := btrim(COALESCE(p_actor, ''));
  v_salida public.crm_salidas_lily%ROWTYPE;
  v_validacion record;
BEGIN
  IF char_length(v_key) NOT BETWEEN 8 AND 180 OR v_key !~ '^[A-Za-z0-9._:-]+$'
     OR v_hash !~ '^[a-f0-9]{64}$'
     OR v_actor !~ '^[a-z0-9_-]{2,64}$' THEN
    RAISE EXCEPTION 'Parámetros para despachar salida Lily inválidos.';
  END IF;

  SELECT * INTO v_salida
  FROM public.crm_salidas_lily
  WHERE canal = 'whatsapp' AND idempotency_key = v_key
  FOR UPDATE;
  IF v_salida.id IS NULL THEN
    RETURN jsonb_build_object('estado', 'no_reservada');
  END IF;
  IF v_salida.payload_hash <> v_hash THEN
    RETURN jsonb_build_object('estado', 'conflicto');
  END IF;
  IF v_salida.estado = 'aceptada_meta' THEN
    RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', 'aceptada_meta');
  END IF;
  IF v_salida.estado = 'cancelada' THEN
    RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', 'cancelada');
  END IF;
  IF v_salida.estado IN ('error_terminal', 'revision_manual') THEN
    RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', v_salida.estado);
  END IF;
  IF v_salida.estado = 'enviando' THEN
    IF v_salida.enviando_hasta IS NOT NULL AND v_salida.enviando_hasta > now() THEN
      RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', 'enviando_otro_proceso');
    END IF;

    -- No se recupera un lease vencido reenviando. Si la función cayó después
    -- de que Meta recibió la solicitud, no podemos distinguirlo de un fallo
    -- de red; se pone en cuarentena para conciliación humana.
    UPDATE public.crm_salidas_lily
       SET estado = 'revision_manual',
           enviando_hasta = NULL,
           ultimo_error = 'lease_expirado_sin_confirmacion'
     WHERE id = v_salida.id
    RETURNING * INTO v_salida;

    INSERT INTO public.crm_auditoria (club, entidad_tipo, entidad_id, accion, actor, metadata)
    VALUES (v_salida.club, 'salida_lily', v_salida.id, 'salida_lily_requiere_revision', v_actor,
      jsonb_build_object('resultado', 'lease_expirado_sin_confirmacion'));

    RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', 'revision_manual');
  END IF;

  SELECT * INTO v_validacion
  FROM public.crm_validar_salida_lily(
    v_salida.contact_id, v_salida.canal, v_salida.intencion,
    v_salida.modo, v_salida.respuesta_a_ref
  );
  IF v_validacion.bloqueo IS NOT NULL THEN
    UPDATE public.crm_salidas_lily
       SET estado = 'cancelada', ultimo_error = v_validacion.bloqueo, enviando_hasta = NULL
     WHERE id = v_salida.id;
    RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', 'bloqueada');
  END IF;

  UPDATE public.crm_salidas_lily
     SET estado = 'enviando',
         intentos = intentos + 1,
         enviando_at = now(),
         enviando_hasta = now() + interval '5 minutes',
         ultimo_error = NULL
   WHERE id = v_salida.id
  RETURNING * INTO v_salida;

  RETURN jsonb_build_object(
    'salida_id', v_salida.id,
    'estado', 'enviando'
  );
END;
$$;

-- La autorización que entrega el destinatario se mantiene separada de la
-- reserva. El adaptador la llama inmediatamente antes de fetch(Meta), de modo
-- que una cancelación ocurrida durante el lease de despacho se detecta antes
-- de que el número salga del proceso confiable.
CREATE OR REPLACE FUNCTION public.crm_autorizar_envio_lily(
  p_idempotency_key text,
  p_payload_hash text,
  p_actor text DEFAULT 'lily'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_hash text := lower(btrim(COALESCE(p_payload_hash, '')));
  v_actor text := btrim(COALESCE(p_actor, ''));
  v_salida public.crm_salidas_lily%ROWTYPE;
  v_validacion record;
BEGIN
  IF char_length(v_key) NOT BETWEEN 8 AND 180 OR v_key !~ '^[A-Za-z0-9._:-]+$'
     OR v_hash !~ '^[a-f0-9]{64}$'
     OR v_actor !~ '^[a-z0-9_-]{2,64}$' THEN
    RAISE EXCEPTION 'Parámetros para autorizar envío Lily inválidos.';
  END IF;

  SELECT * INTO v_salida
  FROM public.crm_salidas_lily
  WHERE canal = 'whatsapp' AND idempotency_key = v_key
  FOR UPDATE;
  IF v_salida.id IS NULL THEN
    RETURN jsonb_build_object('estado', 'no_reservada');
  END IF;
  IF v_salida.payload_hash <> v_hash THEN
    RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', 'conflicto');
  END IF;
  IF v_salida.estado = 'aceptada_meta' THEN
    RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', 'aceptada_meta');
  END IF;
  IF v_salida.estado = 'cancelada' THEN
    RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', 'cancelada');
  END IF;
  IF v_salida.estado IN ('error_terminal', 'revision_manual') THEN
    RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', v_salida.estado);
  END IF;
  IF v_salida.estado = 'enviando'
     AND (v_salida.enviando_hasta IS NULL OR v_salida.enviando_hasta <= now()) THEN
    -- La autorización es la última barrera antes de revelar el destinatario.
    -- Un lease vencido se conserva para revisión, nunca se reabre ni reenvía.
    UPDATE public.crm_salidas_lily
       SET estado = 'revision_manual',
           enviando_hasta = NULL,
           ultimo_error = 'lease_expirado_sin_confirmacion'
     WHERE id = v_salida.id
    RETURNING * INTO v_salida;

    INSERT INTO public.crm_auditoria (club, entidad_tipo, entidad_id, accion, actor, metadata)
    VALUES (v_salida.club, 'salida_lily', v_salida.id, 'salida_lily_requiere_revision', v_actor,
      jsonb_build_object('resultado', 'lease_expirado_sin_confirmacion'));

    RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', 'revision_manual');
  END IF;
  IF v_salida.estado <> 'enviando' THEN
    RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', 'requiere_despacho');
  END IF;

  SELECT * INTO v_validacion
  FROM public.crm_validar_salida_lily(
    v_salida.contact_id, v_salida.canal, v_salida.intencion,
    v_salida.modo, v_salida.respuesta_a_ref
  );
  IF v_validacion.bloqueo IS NOT NULL THEN
    UPDATE public.crm_salidas_lily
       SET estado = 'cancelada', ultimo_error = v_validacion.bloqueo, enviando_hasta = NULL
     WHERE id = v_salida.id;
    RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', 'bloqueada');
  END IF;

  RETURN jsonb_build_object(
    'salida_id', v_salida.id,
    'estado', 'autorizada',
    'destinatario', v_validacion.destinatario
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_finalizar_salida_lily(
  p_idempotency_key text,
  p_payload_hash text,
  p_aceptada boolean,
  p_meta_mensaje_id text DEFAULT NULL,
  p_error_resumido text DEFAULT NULL,
  p_actor text DEFAULT 'lily'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_hash text := lower(btrim(COALESCE(p_payload_hash, '')));
  v_meta_ref text := NULLIF(btrim(COALESCE(p_meta_mensaje_id, '')), '');
  v_error text := NULLIF(btrim(COALESCE(p_error_resumido, '')), '');
  v_actor text := btrim(COALESCE(p_actor, ''));
  v_salida public.crm_salidas_lily%ROWTYPE;
  v_cancelada_previa boolean := false;
BEGIN
  IF char_length(v_key) NOT BETWEEN 8 AND 180 OR v_key !~ '^[A-Za-z0-9._:-]+$'
     OR v_hash !~ '^[a-f0-9]{64}$'
     OR p_aceptada IS NULL
     OR (p_aceptada AND (v_meta_ref IS NULL OR char_length(v_meta_ref) > 180 OR v_meta_ref !~ '^[A-Za-z0-9._:-]+$'))
     OR (NOT p_aceptada AND (
       v_error IS NULL
       OR v_error !~ '^(meta_(terminal|reintentable)_http_[0-9]{3}|meta_resultado_desconocido)$'
     ))
     OR v_actor !~ '^[a-z0-9_-]{2,64}$' THEN
    RAISE EXCEPTION 'Parámetros para finalizar salida Lily inválidos.';
  END IF;

  SELECT * INTO v_salida
  FROM public.crm_salidas_lily
  WHERE canal = 'whatsapp' AND idempotency_key = v_key
  FOR UPDATE;
  IF v_salida.id IS NULL THEN
    RETURN jsonb_build_object('estado', 'no_reservada');
  END IF;
  IF v_salida.payload_hash <> v_hash THEN
    RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', 'conflicto');
  END IF;
  IF v_salida.estado = 'aceptada_meta' THEN
    RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', 'aceptada_meta');
  END IF;
  IF v_salida.estado = 'error_terminal' THEN
    RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', 'error_terminal');
  END IF;
  IF v_salida.estado = 'revision_manual' AND NOT p_aceptada THEN
    RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', 'revision_manual');
  END IF;
  v_cancelada_previa := v_salida.estado = 'cancelada';
  IF v_cancelada_previa AND NOT p_aceptada THEN
    RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', 'cancelada');
  END IF;

  IF p_aceptada THEN
    UPDATE public.crm_salidas_lily
       SET estado = 'aceptada_meta',
           aceptada_meta_at = now(),
           meta_mensaje_id = v_meta_ref,
           enviando_hasta = NULL,
           ultimo_error = CASE
             WHEN v_cancelada_previa THEN 'aceptada_meta_despues_de_cancelacion'
             ELSE NULL
           END
     WHERE id = v_salida.id
    RETURNING * INTO v_salida;

    INSERT INTO public.crm_auditoria (club, entidad_tipo, entidad_id, accion, actor, metadata)
    VALUES (v_salida.club, 'salida_lily', v_salida.id, 'salida_lily_aceptada_meta', v_actor,
      jsonb_build_object(
        'contact_id', v_salida.contact_id,
        'intencion', v_salida.intencion,
        'cancelacion_previa', v_cancelada_previa
      ));
  ELSE
    UPDATE public.crm_salidas_lily
       SET estado = CASE
             -- Sin una garantía de idempotencia del proveedor, un 408/429/5xx
             -- también puede haber ocurrido tras aceptar el mensaje. Se
             -- conserva para conciliación en vez de permitir otro fetch.
             WHEN v_error = 'meta_resultado_desconocido'
               OR v_error ~ '^meta_reintentable_http_[0-9]{3}$' THEN 'revision_manual'
             WHEN v_error ~ '^meta_terminal_http_[0-9]{3}$' THEN 'error_terminal'
             ELSE 'error'
           END,
           enviando_hasta = NULL,
           ultimo_error = v_error
     WHERE id = v_salida.id
    RETURNING * INTO v_salida;

    INSERT INTO public.crm_auditoria (club, entidad_tipo, entidad_id, accion, actor, metadata)
    VALUES (
      v_salida.club,
      'salida_lily',
      v_salida.id,
      CASE v_salida.estado
        WHEN 'error_terminal' THEN 'salida_lily_fallo_terminal'
        WHEN 'revision_manual' THEN 'salida_lily_requiere_revision'
        ELSE 'salida_lily_fallo_reintentable'
      END,
      v_actor,
      jsonb_build_object('resultado', v_error)
    );
  END IF;

  RETURN jsonb_build_object('salida_id', v_salida.id, 'estado', v_salida.estado);
END;
$$;

REVOKE ALL ON FUNCTION public.crm_validar_salida_lily(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crm_cancelar_salidas_lily_contacto_bloqueado()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crm_cancelar_salidas_lily_consentimiento_revocado()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.crm_reservar_salida_lily(uuid, text, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_despachar_salida_lily(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_autorizar_envio_lily(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_finalizar_salida_lily(text, text, boolean, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_reservar_salida_lily(uuid, text, text, text, text, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_despachar_salida_lily(text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_autorizar_envio_lily(text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_finalizar_salida_lily(text, text, boolean, text, text, text)
  TO service_role;

COMMENT ON TABLE public.crm_salidas_lily IS
  'Outbox duradera de Lily: conserva sólo hash y estados operativos, nunca el texto del mensaje ni el número WhatsApp.';
COMMENT ON FUNCTION public.crm_reservar_salida_lily(uuid, text, text, text, text, text, text, text) IS
  'Reserva idempotente de salida Lily y valida consentimiento antes de la llamada a Meta.';
