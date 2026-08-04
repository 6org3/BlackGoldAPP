-- Prueba local, transaccional y sin datos persistentes del CRM Black Gold.
-- Ejecutar con: npx supabase db query --local --file supabase/tests/crm_relaciones_local.sql
BEGIN;

DO $$
DECLARE
  v_entrada jsonb;
  v_duplicado_pendiente jsonb;
  v_confirmacion jsonb;
  v_duplicado_entregado jsonb;
  v_etapa jsonb;
  v_interaccion jsonb;
  v_preferencias jsonb;
  v_actividad jsonb;
  v_bloqueo jsonb;
  v_reentrada jsonb;
  v_contacto uuid;
  v_oportunidad uuid;
  v_usuario_app uuid;
  v_entrada_confirmada jsonb;
  v_contacto_confirmado uuid;
  v_oportunidad_confirmada uuid;
  v_interno jsonb;
  v_contacto_interno uuid;
  v_oportunidades_internas_abiertas integer;
  v_actividades_pendientes integer;
  v_interacciones_entrada integer;
  v_consentimientos_revocados integer;
  v_oportunidades_con_proximo_paso integer;
  v_tablas_rls integer;
BEGIN
  SELECT public.crm_recibir_contacto_interno_canal(
    'Black Gold',
    'whatsapp',
    '+15555550199',
    'Contacto interno de prueba',
    'otro',
    'crm-local-interno-001',
    'jorge'
  ) INTO v_interno;
  v_contacto_interno := (v_interno->>'contact_id')::uuid;
  IF v_interno->>'ruta' <> 'interno'
     OR v_interno->>'rol_interno' <> 'jorge'
     OR COALESCE((v_interno->>'debe_responder')::boolean, true) THEN
    RAISE EXCEPTION 'La allowlist interna no bloqueó la ruta a Lily: %', v_interno;
  END IF;
  IF (SELECT tipo_relacion FROM public.crm_contactos WHERE id = v_contacto_interno) <> 'interno'
     OR (SELECT rol_interno FROM public.crm_contactos WHERE id = v_contacto_interno) <> 'jorge' THEN
    RAISE EXCEPTION 'El contacto interno no conservó su rol mínimo.';
  END IF;
  SELECT count(*) INTO v_oportunidades_internas_abiertas
  FROM public.crm_oportunidades
  WHERE contact_id = v_contacto_interno
    AND etapa_codigo NOT IN ('ganado', 'perdido', 'no_contactar');
  IF v_oportunidades_internas_abiertas <> 0 THEN
    RAISE EXCEPTION 'Un contacto interno dejó una oportunidad comercial abierta.';
  END IF;

  SELECT public.crm_recibir_contacto_canal(
    'Black Gold',
    'whatsapp',
    '+15555550100',
    'Contacto de prueba',
    'horarios',
    'crm-local-test-001',
    NULL
  )
  INTO v_entrada;

  IF v_entrada->>'ruta' <> 'lead'
     OR NOT COALESCE((v_entrada->>'debe_responder')::boolean, false) THEN
    RAISE EXCEPTION 'La primera entrada no se clasificó como lead: %', v_entrada;
  END IF;

  v_contacto := (v_entrada->>'contact_id')::uuid;
  v_oportunidad := (v_entrada->>'oportunidad_id')::uuid;

  IF v_contacto IS NULL OR v_oportunidad IS NULL THEN
    RAISE EXCEPTION 'La entrada no generó contacto y oportunidad: %', v_entrada;
  END IF;

  SELECT public.crm_recibir_contacto_canal(
    'Black Gold',
    'whatsapp',
    '+15555550100',
    'Contacto de prueba',
    'horarios',
    'crm-local-test-001',
    NULL
  )
  INTO v_duplicado_pendiente;

  IF NOT COALESCE((v_duplicado_pendiente->>'ya_procesado')::boolean, false)
     OR NOT COALESCE((v_duplicado_pendiente->>'debe_responder')::boolean, false)
     OR (v_duplicado_pendiente->>'contact_id')::uuid <> v_contacto
     OR (v_duplicado_pendiente->>'oportunidad_id')::uuid <> v_oportunidad THEN
    RAISE EXCEPTION 'Pending retry did not preserve idempotency: %', v_duplicado_pendiente;
  END IF;

  SELECT public.crm_confirmar_entrega_lily('whatsapp', 'crm-local-test-001', 'adaptador')
  INTO v_confirmacion;

  IF COALESCE((v_confirmacion->>'ya_entregado')::boolean, true) THEN
    RAISE EXCEPTION 'First Lily confirmation should record a new delivery: %', v_confirmacion;
  END IF;

  SELECT public.crm_recibir_contacto_canal(
    'Black Gold',
    'whatsapp',
    '+15555550100',
    'Contacto de prueba',
    'horarios',
    'crm-local-test-001',
    NULL
  )
  INTO v_duplicado_entregado;

  IF NOT COALESCE((v_duplicado_entregado->>'ya_procesado')::boolean, false)
     OR COALESCE((v_duplicado_entregado->>'debe_responder')::boolean, true) THEN
    RAISE EXCEPTION 'Confirmed delivery would be resent to Lily: %', v_duplicado_entregado;
  END IF;

  SELECT count(*)
  INTO v_interacciones_entrada
  FROM public.crm_interacciones
  WHERE canal = 'whatsapp' AND mensaje_externo_ref = 'crm-local-test-001';

  IF v_interacciones_entrada <> 1 THEN
    RAISE EXCEPTION 'Idempotency created % interactions for one message', v_interacciones_entrada;
  END IF;

  SELECT public.crm_actualizar_etapa_oportunidad(
    p_oportunidad_id => v_oportunidad,
    p_etapa_codigo => 'interes_identificado',
    p_actor => 'lily',
    p_motivo => 'Prueba local de progresión',
    p_proximo_paso_en => now() + interval '1 day'
  )
  INTO v_etapa;

  IF v_etapa->>'etapa_codigo' <> 'interes_identificado' THEN
    RAISE EXCEPTION 'No avanzó a interés identificado: %', v_etapa;
  END IF;

  BEGIN
    PERFORM public.crm_actualizar_etapa_oportunidad(
      p_oportunidad_id => v_oportunidad,
      p_etapa_codigo => 'no_contactar',
      p_actor => 'lily',
      p_motivo => 'No generic shortcut',
      p_proximo_paso_en => NULL
    );
    RAISE EXCEPTION 'Generic transition allowed no_contactar';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Usa crm_marcar_no_contactar%' THEN
      RAISE;
    END IF;
  END;

  PERFORM public.crm_actualizar_etapa_oportunidad(
    p_oportunidad_id => v_oportunidad,
    p_etapa_codigo => 'calificado',
    p_actor => 'lily',
    p_motivo => 'Prueba local de calificación',
    p_proximo_paso_en => now() + interval '1 day'
  );
  PERFORM public.crm_actualizar_etapa_oportunidad(
    p_oportunidad_id => v_oportunidad,
    p_etapa_codigo => 'inscripcion_en_proceso',
    p_actor => 'lily',
    p_motivo => 'Prueba local de inscripción',
    p_proximo_paso_en => now() + interval '1 day'
  );
  SELECT public.crm_actualizar_etapa_oportunidad(
    p_oportunidad_id => v_oportunidad,
    p_etapa_codigo => 'ganado',
    p_actor => 'lily',
    p_motivo => 'Prueba local de conversión',
    p_proximo_paso_en => NULL
  ) INTO v_etapa;

  IF (SELECT tipo_relacion FROM public.crm_contactos WHERE id = v_contacto) <> 'lead' THEN
    RAISE EXCEPTION 'Un ganado sin alta verificada de app no debe promover el contacto a cliente';
  END IF;
  IF COALESCE((v_etapa->>'cliente_confirmado_por_app')::boolean, true) THEN
    RAISE EXCEPTION 'La respuesta marcó cliente confirmado sin alta de app: %', v_etapa;
  END IF;

  INSERT INTO public.usuarios (nombre, rol, club, correo)
  VALUES ('Prueba CRM app confirmada', 'owner', 'Black Gold', 'crm-app-confirmada@example.invalid')
  RETURNING id INTO v_usuario_app;

  SELECT public.crm_recibir_contacto_canal(
    'Black Gold',
    'app',
    'app-session-crm-local-001',
    'Contacto confirmado',
    'inscripcion',
    'crm-local-app-confirmada-001',
    v_usuario_app
  )
  INTO v_entrada_confirmada;
  v_contacto_confirmado := (v_entrada_confirmada->>'contact_id')::uuid;
  v_oportunidad_confirmada := (v_entrada_confirmada->>'oportunidad_id')::uuid;

  PERFORM public.crm_actualizar_etapa_oportunidad(v_oportunidad_confirmada, 'interes_identificado', 'prueba_local', NULL, NULL);
  PERFORM public.crm_actualizar_etapa_oportunidad(v_oportunidad_confirmada, 'calificado', 'prueba_local', NULL, NULL);
  PERFORM public.crm_actualizar_etapa_oportunidad(v_oportunidad_confirmada, 'inscripcion_en_proceso', 'prueba_local', NULL, NULL);
  SELECT public.crm_actualizar_etapa_oportunidad(v_oportunidad_confirmada, 'ganado', 'prueba_local', NULL, NULL)
    INTO v_etapa;

  IF (SELECT tipo_relacion FROM public.crm_contactos WHERE id = v_contacto_confirmado) <> 'cliente'
     OR NOT COALESCE((v_etapa->>'cliente_confirmado_por_app')::boolean, false) THEN
    RAISE EXCEPTION 'La alta verificada de app no promovió el contacto a cliente: %', v_etapa;
  END IF;

  SELECT public.crm_registrar_interaccion(
    v_contacto,
    v_oportunidad,
    'whatsapp',
    'nota_interna',
    'seguimiento',
    'Resumen de prueba sin datos personales.',
    'prueba_local'
  )
  INTO v_interaccion;

  IF (v_interaccion->>'interaccion_id') IS NULL THEN
    RAISE EXCEPTION 'No se registró la interacción: %', v_interaccion;
  END IF;

  SELECT public.crm_actualizar_preferencias(
    p_contact_id => v_contacto,
    p_tratamiento_preferido => 'Cliente',
    p_canal_preferido => 'whatsapp',
    p_estilo_mensaje_preferido => 'directo y breve',
    p_actor => 'lily'
  )
  INTO v_preferencias;

  IF v_preferencias->>'estilo_mensaje_preferido' <> 'directo y breve' THEN
    RAISE EXCEPTION 'No se guardó la preferencia: %', v_preferencias;
  END IF;

  SELECT public.crm_programar_actividad(
    p_contact_id => v_contacto,
    p_oportunidad_id => v_oportunidad,
    p_tipo => 'seguimiento',
    p_asunto => 'Seguimiento de prueba',
    p_vencimiento_at => now() + interval '2 days',
    p_asignado_a => 'lily',
    p_actor => 'lily'
  )
  INTO v_actividad;

  IF (v_actividad->>'actividad_id') IS NULL THEN
    RAISE EXCEPTION 'No se programó la actividad: %', v_actividad;
  END IF;

  SELECT public.crm_marcar_no_contactar(
    p_contact_id => v_contacto,
    p_motivo => 'Prueba local de consentimiento',
    p_actor => 'lily'
  )
  INTO v_bloqueo;

  IF v_bloqueo->>'tipo_relacion' <> 'no_contactar' THEN
    RAISE EXCEPTION 'No se aplicó no contactar: %', v_bloqueo;
  END IF;

  SELECT count(*)
  INTO v_actividades_pendientes
  FROM public.crm_actividades
  WHERE contact_id = v_contacto
    AND estado = 'pendiente';

  IF v_actividades_pendientes <> 0 THEN
    RAISE EXCEPTION 'Quedaron actividades pendientes para un contacto bloqueado';
  END IF;

  SELECT count(*)
  INTO v_consentimientos_revocados
  FROM public.crm_consentimientos
  WHERE contact_id = v_contacto
    AND alcance IN ('seguimiento', 'marketing')
    AND estado = 'revocado';

  IF v_consentimientos_revocados <> 2 THEN
    RAISE EXCEPTION 'No-contact did not revoke both proactive consents';
  END IF;

  SELECT count(*)
  INTO v_oportunidades_con_proximo_paso
  FROM public.crm_oportunidades
  WHERE contact_id = v_contacto AND proximo_paso_en IS NOT NULL;

  IF v_oportunidades_con_proximo_paso <> 0 THEN
    RAISE EXCEPTION 'Blocked contact retains active next steps';
  END IF;

  SELECT public.crm_recibir_contacto_canal(
    'Black Gold',
    'whatsapp',
    '+15555550100',
    'Contacto de prueba',
    'horarios',
    'crm-local-test-002',
    NULL
  )
  INTO v_reentrada;

  IF v_reentrada->>'ruta' <> 'no_contactar'
     OR COALESCE((v_reentrada->>'debe_responder')::boolean, true) THEN
    RAISE EXCEPTION 'El contacto bloqueado pudo reingresar: %', v_reentrada;
  END IF;

  IF has_table_privilege('anon', 'public.crm_contactos', 'SELECT')
     OR has_table_privilege('authenticated', 'public.crm_contactos', 'SELECT') THEN
    RAISE EXCEPTION 'Un rol de navegador conserva lectura directa sobre crm_contactos';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.crm_recibir_contacto_canal(text,text,text,text,text,text,uuid)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.crm_recibir_contacto_canal(text,text,text,text,text,text,uuid)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.crm_recibir_contacto_interno_canal(text,text,text,text,text,text,text)'::regprocedure,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Un rol de navegador conserva ejecución de la recepción CRM';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.crm_confirmar_entrega_lily(text,text,text)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.crm_confirmar_entrega_lily(text,text,text)'::regprocedure,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'A browser role can execute the private Lily confirmation';
  END IF;

  SELECT count(*)
  INTO v_tablas_rls
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
    AND relname IN (
      'crm_contactos',
      'crm_contacto_canales',
      'crm_etapas_oportunidad',
      'crm_oportunidades',
      'crm_interacciones',
      'crm_actividades',
      'crm_preferencias',
      'crm_consentimientos',
      'crm_auditoria'
    )
    AND relrowsecurity;

  IF v_tablas_rls <> 9 THEN
    RAISE EXCEPTION 'RLS no está habilitado en las nueve tablas CRM: %', v_tablas_rls;
  END IF;
END
$$;

ROLLBACK;
