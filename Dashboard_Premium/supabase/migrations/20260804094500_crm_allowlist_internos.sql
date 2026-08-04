-- La clasificación de Jorge, padre y hermano se resuelve antes de que el
-- webhook entregue el evento a Lily. Los números viven exclusivamente en un
-- secreto del adaptador; la base sólo conserva el rol operativo mínimo.
ALTER TABLE public.crm_contactos
  ADD COLUMN IF NOT EXISTS rol_interno text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crm_contactos_rol_interno_check'
      AND conrelid = 'public.crm_contactos'::regclass
  ) THEN
    ALTER TABLE public.crm_contactos
      ADD CONSTRAINT crm_contactos_rol_interno_check
      CHECK (rol_interno IS NULL OR rol_interno IN ('jorge', 'padre', 'hermano'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_recibir_contacto_interno_canal(
  p_club text,
  p_canal text,
  p_identificador_normalizado text,
  p_nombre_preferido text,
  p_interes_principal text,
  p_mensaje_externo_ref text,
  p_rol_interno text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol text := btrim(COALESCE(p_rol_interno, ''));
  v_entrada jsonb;
  v_contacto_id uuid;
  v_ya_procesado boolean := false;
  v_rol_previo text;
BEGIN
  IF p_canal <> 'whatsapp' OR v_rol NOT IN ('jorge', 'padre', 'hermano') THEN
    RAISE EXCEPTION 'Parámetros de contacto interno inválidos.';
  END IF;

  -- Las dos funciones se ejecutan dentro de la misma transacción de esta RPC:
  -- aunque el ingreso base cree transitoriamente la oportunidad técnica, ningún
  -- consumidor puede verla como lead antes de que se cierre y rote a interno.
  SELECT public.crm_recibir_contacto_canal(
    p_club,
    p_canal,
    p_identificador_normalizado,
    p_nombre_preferido,
    p_interes_principal,
    p_mensaje_externo_ref,
    NULL
  ) INTO v_entrada;

  v_contacto_id := NULLIF(v_entrada->>'contact_id', '')::uuid;
  v_ya_procesado := COALESCE((v_entrada->>'ya_procesado')::boolean, false);
  IF v_contacto_id IS NULL THEN
    RAISE EXCEPTION 'El ingreso interno no devolvió un contacto válido.';
  END IF;
  IF v_entrada->>'ruta' = 'no_contactar' THEN
    -- La baja explícita de privacidad prevalece incluso si la allowlist se
    -- configura después; nunca se reactiva desde un webhook.
    RETURN jsonb_build_object(
      'contact_id', v_contacto_id,
      'ruta', 'no_contactar',
      'tipo_relacion', 'no_contactar',
      'ya_procesado', v_ya_procesado,
      'debe_responder', false
    );
  END IF;

  SELECT rol_interno INTO v_rol_previo
  FROM public.crm_contactos
  WHERE id = v_contacto_id
  FOR UPDATE;
  IF v_rol_previo IS NOT NULL AND v_rol_previo <> v_rol THEN
    RAISE EXCEPTION 'La allowlist interna no coincide con la clasificación existente.';
  END IF;

  IF NOT v_ya_procesado OR v_entrada->>'ruta' <> 'interno' THEN
    PERFORM public.crm_configurar_contacto_interno(v_contacto_id, 'adaptador');
  END IF;
  UPDATE public.crm_contactos
     SET rol_interno = v_rol
   WHERE id = v_contacto_id
     AND rol_interno IS DISTINCT FROM v_rol;

  IF NOT v_ya_procesado OR v_rol_previo IS DISTINCT FROM v_rol THEN
    INSERT INTO public.crm_auditoria (club, entidad_tipo, entidad_id, accion, actor, metadata)
    SELECT club, 'contacto', id, 'contacto_interno_allowlist_validado', 'adaptador',
      jsonb_build_object('rol_interno', v_rol)
    FROM public.crm_contactos
    WHERE id = v_contacto_id;
  END IF;

  RETURN jsonb_build_object(
    'contact_id', v_contacto_id,
    'ruta', 'interno',
    'tipo_relacion', 'interno',
    'rol_interno', v_rol,
    'ya_procesado', v_ya_procesado,
    'debe_responder', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_recibir_contacto_interno_canal(text, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_recibir_contacto_interno_canal(text, text, text, text, text, text, text)
  TO service_role;

COMMENT ON FUNCTION public.crm_recibir_contacto_interno_canal(text, text, text, text, text, text, text) IS
  'Ingreso WhatsApp de una allowlist interna ya validada en el adaptador. Devuelve ruta interna y nunca entrega el evento a Lily.';
