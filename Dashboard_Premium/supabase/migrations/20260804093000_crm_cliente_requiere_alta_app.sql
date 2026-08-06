-- Una venta ganada y un cliente activo no son equivalentes.  La relación pasa
-- a cliente únicamente cuando el contacto ya fue correlacionado, desde un
-- adaptador confiable, con una alta de usuarios en la app.  Así Dirección puede
-- cerrar la oportunidad comercial sin inventar una identidad de cliente.
CREATE OR REPLACE FUNCTION public.crm_actualizar_etapa_oportunidad(
  p_oportunidad_id uuid,
  p_etapa_codigo text,
  p_actor text,
  p_motivo text DEFAULT NULL,
  p_proximo_paso_en timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_oportunidad public.crm_oportunidades%ROWTYPE;
  v_etapa text := btrim(COALESCE(p_etapa_codigo, ''));
  v_actor text := btrim(COALESCE(p_actor, ''));
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_etapa_anterior text;
  v_permitida boolean := false;
  v_actividades_canceladas integer := 0;
  v_alta_app_confirmada boolean := false;
BEGIN
  IF p_oportunidad_id IS NULL OR v_etapa = '' OR v_actor !~ '^[a-z0-9_-]{2,64}$' THEN
    RAISE EXCEPTION 'Parámetros CRM inválidos.';
  END IF;
  IF v_motivo IS NOT NULL AND char_length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'Motivo demasiado largo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_etapas_oportunidad WHERE codigo = v_etapa) THEN
    RAISE EXCEPTION 'Etapa CRM inexistente.';
  END IF;
  IF v_etapa = 'no_contactar' THEN
    RAISE EXCEPTION 'Usa crm_marcar_no_contactar para bloquear seguimiento.';
  END IF;

  SELECT * INTO v_oportunidad
  FROM public.crm_oportunidades
  WHERE id = p_oportunidad_id
  FOR UPDATE;
  IF v_oportunidad.id IS NULL THEN
    RAISE EXCEPTION 'Oportunidad CRM inexistente.';
  END IF;

  v_etapa_anterior := v_oportunidad.etapa_codigo;
  v_permitida := v_etapa = v_oportunidad.etapa_codigo OR CASE v_oportunidad.etapa_codigo
    WHEN 'nuevo' THEN v_etapa IN ('interes_identificado', 'perdido')
    WHEN 'interes_identificado' THEN v_etapa IN ('calificado', 'perdido')
    WHEN 'calificado' THEN v_etapa IN ('prueba_o_visita', 'inscripcion_en_proceso', 'perdido')
    WHEN 'prueba_o_visita' THEN v_etapa IN ('inscripcion_en_proceso', 'perdido')
    WHEN 'inscripcion_en_proceso' THEN v_etapa IN ('ganado', 'perdido')
    ELSE false
  END;
  IF NOT v_permitida THEN
    RAISE EXCEPTION 'Transición CRM no permitida: % a %.', v_oportunidad.etapa_codigo, v_etapa;
  END IF;

  UPDATE public.crm_oportunidades
     SET etapa_codigo = v_etapa,
         proximo_paso_en = CASE
           WHEN v_etapa IN ('ganado', 'perdido') THEN NULL
           ELSE COALESCE(p_proximo_paso_en, proximo_paso_en)
         END,
         etapa_actualizada_at = CASE
           WHEN v_etapa = v_oportunidad.etapa_codigo THEN etapa_actualizada_at
           ELSE now()
         END,
         cerrada_at = CASE
           WHEN v_etapa IN ('ganado', 'perdido', 'no_contactar') THEN COALESCE(cerrada_at, now())
           ELSE NULL
         END
   WHERE id = p_oportunidad_id
  RETURNING * INTO v_oportunidad;

  IF v_etapa = 'ganado' THEN
    SELECT c.app_usuario_id IS NOT NULL
      INTO v_alta_app_confirmada
      FROM public.crm_contactos c
     WHERE c.id = v_oportunidad.contact_id
     FOR UPDATE;

    IF v_alta_app_confirmada THEN
      UPDATE public.crm_contactos
         SET tipo_relacion = 'cliente', estado = 'activo'
       WHERE id = v_oportunidad.contact_id;
    END IF;
  END IF;

  IF v_etapa IN ('ganado', 'perdido') AND v_etapa <> v_etapa_anterior THEN
    UPDATE public.crm_actividades
       SET estado = 'cancelada'
     WHERE oportunidad_id = v_oportunidad.id
       AND estado = 'pendiente';
    GET DIAGNOSTICS v_actividades_canceladas = ROW_COUNT;
  END IF;

  INSERT INTO public.crm_auditoria (club, entidad_tipo, entidad_id, accion, actor, metadata)
  VALUES (v_oportunidad.club, 'oportunidad', v_oportunidad.id, 'etapa_actualizada', v_actor,
    jsonb_strip_nulls(jsonb_build_object(
      'etapa_anterior', v_etapa_anterior,
      'etapa_nueva', v_etapa,
      'motivo', v_motivo,
      'proximo_paso_en', p_proximo_paso_en,
      'actividades_canceladas', v_actividades_canceladas,
      'cliente_confirmado_por_app', CASE WHEN v_etapa = 'ganado' THEN v_alta_app_confirmada ELSE NULL END
    )));

  RETURN jsonb_build_object(
    'oportunidad_id', v_oportunidad.id,
    'contact_id', v_oportunidad.contact_id,
    'etapa_codigo', v_oportunidad.etapa_codigo,
    'proximo_paso_en', v_oportunidad.proximo_paso_en,
    'cliente_confirmado_por_app', CASE WHEN v_etapa = 'ganado' THEN v_alta_app_confirmada ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_actualizar_etapa_oportunidad(uuid, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_actualizar_etapa_oportunidad(uuid, text, text, text, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.crm_actualizar_etapa_oportunidad(uuid, text, text, text, timestamptz) IS
  'Actualiza una etapa comercial. Ganado sólo promociona a cliente cuando el contacto tiene app_usuario_id verificado por un adaptador confiable.';

-- Filas de versiones anteriores que hubieran quedado como reintentables no se
-- reabren automáticamente: antes de reenviar se deben conciliar con Meta.
UPDATE public.crm_salidas_lily
   SET estado = 'revision_manual',
       enviando_hasta = NULL,
       ultimo_error = COALESCE(ultimo_error, 'historico_sin_conciliacion')
 WHERE estado = 'error';
