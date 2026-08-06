-- Prueba transaccional de la outbox Lily. No llama a Meta y termina en rollback.
BEGIN;

DO $$
DECLARE
  v_entrada jsonb;
  v_entrada_seguimiento jsonb;
  v_reserva jsonb;
  v_despacho jsonb;
  v_autorizacion jsonb;
  v_final jsonb;
  v_repetida jsonb;
  v_bloqueada jsonb;
  v_pendiente_cancelada jsonb;
  v_revision jsonb;
  v_contacto uuid;
  v_contacto_seguimiento uuid;
  v_estado text;
  v_hash_respuesta text := repeat('a', 64);
  v_hash_pendiente text := repeat('b', 64);
  v_hash_seguimiento text := repeat('c', 64);
  v_hash_contexto text := repeat('d', 64);
  v_hash_terminal text := repeat('e', 64);
  v_hash_reintentable text := repeat('f', 64);
  v_hash_desconocido text := repeat('1', 64);
BEGIN
  SELECT public.crm_recibir_contacto_canal(
    'Black Gold', 'whatsapp', '+15555550101', 'Salida local',
    'horarios', 'crm-outbox-in-001', NULL
  ) INTO v_entrada;
  v_contacto := (v_entrada->>'contact_id')::uuid;
  PERFORM public.crm_confirmar_entrega_lily('whatsapp', 'crm-outbox-in-001', 'adaptador');

  SELECT public.crm_reservar_salida_lily(
    v_contacto, 'whatsapp', 'crm-outbox-response-001', v_hash_respuesta,
    'horarios', 'respuesta', 'crm-outbox-in-001', 'lily'
  ) INTO v_reserva;
  IF v_reserva->>'estado' <> 'pendiente' THEN
    RAISE EXCEPTION 'La respuesta contextual no quedÃ³ pendiente: %', v_reserva;
  END IF;

  SELECT public.crm_despachar_salida_lily(
    'crm-outbox-response-001', v_hash_respuesta, 'lily'
  ) INTO v_despacho;
  IF v_despacho->>'estado' <> 'enviando' OR v_despacho ? 'destinatario' THEN
    RAISE EXCEPTION 'El despacho filtrÃ³ el destinatario o no adquiriÃ³ el lease: %', v_despacho;
  END IF;

  SELECT public.crm_despachar_salida_lily(
    'crm-outbox-response-001', v_hash_respuesta, 'lily'
  ) INTO v_repetida;
  IF v_repetida->>'estado' <> 'enviando_otro_proceso' THEN
    RAISE EXCEPTION 'Un segundo proceso podrÃ­a despachar el mismo mensaje: %', v_repetida;
  END IF;

  SELECT public.crm_autorizar_envio_lily(
    'crm-outbox-response-001', v_hash_respuesta, 'lily'
  ) INTO v_autorizacion;
  IF v_autorizacion->>'estado' <> 'autorizada' OR v_autorizacion->>'destinatario' IS NULL THEN
    RAISE EXCEPTION 'La autorizaciÃ³n final no permitiÃ³ el envÃ­o: %', v_autorizacion - 'destinatario';
  END IF;

  SELECT public.crm_finalizar_salida_lily(
    'crm-outbox-response-001', v_hash_respuesta, true,
    'wamid.crm-local-001', NULL, 'lily'
  ) INTO v_final;
  IF v_final->>'estado' <> 'aceptada_meta' THEN
    RAISE EXCEPTION 'No se registrÃ³ la aceptaciÃ³n de Meta: %', v_final;
  END IF;

  SELECT public.crm_reservar_salida_lily(
    v_contacto, 'whatsapp', 'crm-outbox-response-001', v_hash_respuesta,
    'horarios', 'respuesta', 'crm-outbox-in-001', 'lily'
  ) INTO v_repetida;
  IF v_repetida->>'estado' <> 'aceptada_meta'
     OR NOT COALESCE((v_repetida->>'repetida')::boolean, false) THEN
    RAISE EXCEPTION 'Un reintento aceptarÃ­a una salida ya confirmada: %', v_repetida;
  END IF;

  SELECT public.crm_recibir_contacto_canal(
    'Black Gold', 'whatsapp', '+15555550101', 'Salida local',
    'horarios', 'crm-outbox-in-002', NULL
  ) INTO v_entrada;
  PERFORM public.crm_confirmar_entrega_lily('whatsapp', 'crm-outbox-in-002', 'adaptador');
  SELECT public.crm_reservar_salida_lily(
    v_contacto, 'whatsapp', 'crm-outbox-pending-002', v_hash_pendiente,
    'horarios', 'respuesta', 'crm-outbox-in-002', 'lily'
  ) INTO v_pendiente_cancelada;
  IF v_pendiente_cancelada->>'estado' <> 'pendiente' THEN
    RAISE EXCEPTION 'No se reservÃ³ la salida que debe cancelarse: %', v_pendiente_cancelada;
  END IF;

  PERFORM public.crm_despachar_salida_lily('crm-outbox-pending-002', v_hash_pendiente, 'lily');

  PERFORM public.crm_marcar_no_contactar(v_contacto, 'Prueba de cancelaciÃ³n durable.', 'lily');
  SELECT estado INTO v_estado
  FROM public.crm_salidas_lily
  WHERE canal = 'whatsapp' AND idempotency_key = 'crm-outbox-pending-002';
  IF v_estado <> 'cancelada' THEN
    RAISE EXCEPTION 'No contactar no cancelÃ³ la salida pendiente: %', v_estado;
  END IF;
  SELECT public.crm_autorizar_envio_lily(
    'crm-outbox-pending-002', v_hash_pendiente, 'lily'
  ) INTO v_autorizacion;
  IF v_autorizacion->>'estado' <> 'cancelada' THEN
    RAISE EXCEPTION 'Una salida cancelada todavÃ­a podrÃ­a obtener destinatario: %', v_autorizacion;
  END IF;

  -- La reactivación es una decisión humana fuera del adaptador. Aun así, el
  -- contexto de respuesta anterior al no-contactar no puede reutilizarse.
  UPDATE public.crm_contactos
     SET tipo_relacion = 'lead', estado = 'activo'
   WHERE id = v_contacto;
  SELECT public.crm_reservar_salida_lily(
    v_contacto, 'whatsapp', 'crm-outbox-contexto-antiguo-002', v_hash_contexto,
    'horarios', 'respuesta', 'crm-outbox-in-002', 'lily'
  ) INTO v_bloqueada;
  IF v_bloqueada->>'estado' <> 'bloqueada' THEN
    RAISE EXCEPTION 'Se reutilizó contexto anterior a no contactar: %', v_bloqueada;
  END IF;

  SELECT public.crm_recibir_contacto_canal(
    'Black Gold', 'whatsapp', '+15555550101', 'Salida local',
    'horarios', 'crm-outbox-in-003', NULL
  ) INTO v_entrada;
  PERFORM public.crm_confirmar_entrega_lily('whatsapp', 'crm-outbox-in-003', 'adaptador');
  -- La prueba es una sola transacción y now() es estable en PostgreSQL. Para
  -- afirmar orden real frente a la auditoría de no-contactar usamos reloj.
  UPDATE public.crm_interacciones
     SET created_at = clock_timestamp()
   WHERE canal = 'whatsapp' AND mensaje_externo_ref = 'crm-outbox-in-003';

  SELECT public.crm_reservar_salida_lily(
    v_contacto, 'whatsapp', 'crm-outbox-lease-003', v_hash_contexto,
    'horarios', 'respuesta', 'crm-outbox-in-003', 'lily'
  ) INTO v_reserva;
  IF v_reserva->>'estado' <> 'pendiente' THEN
    RAISE EXCEPTION 'El contexto posterior a no contactar no fue aceptado: %', v_reserva;
  END IF;
  PERFORM public.crm_despachar_salida_lily('crm-outbox-lease-003', v_hash_contexto, 'lily');
  UPDATE public.crm_salidas_lily
     SET enviando_hasta = clock_timestamp() - interval '1 second'
   WHERE canal = 'whatsapp' AND idempotency_key = 'crm-outbox-lease-003';
  SELECT public.crm_despachar_salida_lily(
    'crm-outbox-lease-003', v_hash_contexto, 'lily'
  ) INTO v_revision;
  IF v_revision->>'estado' <> 'revision_manual' THEN
    RAISE EXCEPTION 'Un lease vencido quedó disponible para reenvío: %', v_revision;
  END IF;
  SELECT public.crm_reservar_salida_lily(
    v_contacto, 'whatsapp', 'crm-outbox-lease-003', v_hash_contexto,
    'horarios', 'respuesta', 'crm-outbox-in-003', 'lily'
  ) INTO v_repetida;
  IF v_repetida->>'estado' <> 'revision_manual'
     OR NOT COALESCE((v_repetida->>'repetida')::boolean, false) THEN
    RAISE EXCEPTION 'Un lease vencido pudo volver a prepararse: %', v_repetida;
  END IF;

  SELECT public.crm_reservar_salida_lily(
    v_contacto, 'whatsapp', 'crm-outbox-terminal-003', v_hash_terminal,
    'horarios', 'respuesta', 'crm-outbox-in-003', 'lily'
  ) INTO v_reserva;
  PERFORM public.crm_despachar_salida_lily('crm-outbox-terminal-003', v_hash_terminal, 'lily');
  SELECT public.crm_finalizar_salida_lily(
    'crm-outbox-terminal-003', v_hash_terminal, false,
    NULL, 'meta_terminal_http_400', 'lily'
  ) INTO v_final;
  IF v_final->>'estado' <> 'error_terminal' THEN
    RAISE EXCEPTION 'Un fallo Meta terminal no quedó bloqueado: %', v_final;
  END IF;
  SELECT ultimo_error INTO v_estado
  FROM public.crm_salidas_lily
  WHERE canal = 'whatsapp' AND idempotency_key = 'crm-outbox-terminal-003';
  IF v_estado <> 'meta_terminal_http_400' THEN
    RAISE EXCEPTION 'El resultado Meta terminal no quedó saneado: %', v_estado;
  END IF;
  SELECT public.crm_reservar_salida_lily(
    v_contacto, 'whatsapp', 'crm-outbox-terminal-003', v_hash_terminal,
    'horarios', 'respuesta', 'crm-outbox-in-003', 'lily'
  ) INTO v_repetida;
  IF v_repetida->>'estado' <> 'error_terminal'
     OR NOT COALESCE((v_repetida->>'repetida')::boolean, false) THEN
    RAISE EXCEPTION 'Un fallo terminal admite reintento automático: %', v_repetida;
  END IF;

  SELECT public.crm_reservar_salida_lily(
    v_contacto, 'whatsapp', 'crm-outbox-reintentable-003', v_hash_reintentable,
    'horarios', 'respuesta', 'crm-outbox-in-003', 'lily'
  ) INTO v_reserva;
  PERFORM public.crm_despachar_salida_lily('crm-outbox-reintentable-003', v_hash_reintentable, 'lily');
  SELECT public.crm_finalizar_salida_lily(
    'crm-outbox-reintentable-003', v_hash_reintentable, false,
    NULL, 'meta_reintentable_http_429', 'lily'
  ) INTO v_final;
  IF v_final->>'estado' <> 'revision_manual' THEN
    RAISE EXCEPTION 'Un fallo Meta potencialmente ambiguo no quedó en revisión: %', v_final;
  END IF;
  SELECT public.crm_reservar_salida_lily(
    v_contacto, 'whatsapp', 'crm-outbox-reintentable-003', v_hash_reintentable,
    'horarios', 'respuesta', 'crm-outbox-in-003', 'lily'
  ) INTO v_repetida;
  IF v_repetida->>'estado' <> 'revision_manual'
     OR NOT COALESCE((v_repetida->>'repetida')::boolean, false) THEN
    RAISE EXCEPTION 'Un fallo Meta potencialmente ambiguo pudo volver a enviarse: %', v_repetida;
  END IF;

  SELECT public.crm_reservar_salida_lily(
    v_contacto, 'whatsapp', 'crm-outbox-desconocido-003', v_hash_desconocido,
    'horarios', 'respuesta', 'crm-outbox-in-003', 'lily'
  ) INTO v_reserva;
  PERFORM public.crm_despachar_salida_lily('crm-outbox-desconocido-003', v_hash_desconocido, 'lily');
  SELECT public.crm_finalizar_salida_lily(
    'crm-outbox-desconocido-003', v_hash_desconocido, false,
    NULL, 'meta_resultado_desconocido', 'lily'
  ) INTO v_final;
  IF v_final->>'estado' <> 'revision_manual' THEN
    RAISE EXCEPTION 'Un resultado Meta ambiguo no quedó en revisión: %', v_final;
  END IF;

  SELECT public.crm_recibir_contacto_canal(
    'Black Gold', 'whatsapp', '+15555550102', 'Consentimiento local',
    'clases', 'crm-outbox-in-101', NULL
  ) INTO v_entrada_seguimiento;
  v_contacto_seguimiento := (v_entrada_seguimiento->>'contact_id')::uuid;
  PERFORM public.crm_confirmar_entrega_lily('whatsapp', 'crm-outbox-in-101', 'adaptador');

  SELECT public.crm_reservar_salida_lily(
    v_contacto_seguimiento, 'whatsapp', 'crm-outbox-followup-101', v_hash_seguimiento,
    'seguimiento', 'seguimiento', NULL, 'lily'
  ) INTO v_bloqueada;
  IF v_bloqueada->>'estado' <> 'bloqueada' THEN
    RAISE EXCEPTION 'Un seguimiento sin consentimiento fue reservado: %', v_bloqueada;
  END IF;

  INSERT INTO public.crm_consentimientos (
    contact_id, alcance, estado, version_politica, registrado_por
  ) VALUES (
    v_contacto_seguimiento, 'seguimiento', 'otorgado', 'crm-test-v1', 'prueba_local'
  );
  SELECT public.crm_reservar_salida_lily(
    v_contacto_seguimiento, 'whatsapp', 'crm-outbox-followup-102', repeat('d', 64),
    'seguimiento', 'seguimiento', NULL, 'lily'
  ) INTO v_pendiente_cancelada;
  IF v_pendiente_cancelada->>'estado' <> 'pendiente' THEN
    RAISE EXCEPTION 'El seguimiento con consentimiento no se reservÃ³: %', v_pendiente_cancelada;
  END IF;

  UPDATE public.crm_consentimientos
     SET estado = 'revocado'
   WHERE contact_id = v_contacto_seguimiento AND alcance = 'seguimiento';
  SELECT estado INTO v_estado
  FROM public.crm_salidas_lily
  WHERE canal = 'whatsapp' AND idempotency_key = 'crm-outbox-followup-102';
  IF v_estado <> 'cancelada' THEN
    RAISE EXCEPTION 'Revocar consentimiento no cancelÃ³ el seguimiento pendiente: %', v_estado;
  END IF;

  IF has_table_privilege('anon', 'public.crm_salidas_lily', 'SELECT')
     OR has_function_privilege(
       'authenticated',
       'public.crm_despachar_salida_lily(text,text,text)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.crm_autorizar_envio_lily(text,text,text)'::regprocedure,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Un rol de navegador conserva acceso a la outbox Lily';
  END IF;
END
$$;

ROLLBACK;
