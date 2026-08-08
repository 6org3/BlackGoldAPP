-- Prueba transaccional del vínculo App <-> WhatsApp y de la cola de asistencia.
-- Ejecutar con PostgreSQL local; termina en rollback y no llama a Meta ni a Lily.
BEGIN;

DO $$
DECLARE
  v_usuario uuid;
  v_contacto uuid;
  v_enlace jsonb;
  v_resuelto jsonb;
  v_consumido jsonb;
  v_parent uuid;
  v_atleta_usuario uuid;
  v_atleta uuid;
  v_coach uuid;
  v_contacto_parent jsonb;
  v_asistencia uuid;
  v_notificacion text;
  v_hash text := repeat('a', 64);
BEGIN
  INSERT INTO public.usuarios (nombre, rol, club, correo)
  VALUES ('Cuenta local vínculo', 'owner', 'Black Gold', 'crm-link-local@example.invalid')
  RETURNING id INTO v_usuario;

  SELECT public.crm_recibir_contacto_canal(
    'Black Gold', 'whatsapp', '+15555550901', 'Contacto vínculo local',
    'horarios', 'crm-link-local-in-001', NULL
  ) INTO v_enlace;
  v_contacto := (v_enlace->>'contact_id')::uuid;

  SELECT public.crm_emitir_enlace_app_whatsapp(
    v_usuario, v_hash, now() + interval '15 minutes', 'prueba_local'
  ) INTO v_enlace;
  SELECT public.crm_resolver_enlace_app_whatsapp(
    'Black Gold', v_hash, 'prueba_local'
  ) INTO v_resuelto;
  IF v_resuelto->>'estado' <> 'pendiente'
     OR (v_resuelto->>'app_usuario_id')::uuid <> v_usuario THEN
    RAISE EXCEPTION 'No se resolvió el vínculo seguro: %', v_resuelto;
  END IF;

  SELECT public.crm_consumir_enlace_app_whatsapp(
    (v_resuelto->>'enlace_id')::uuid, v_contacto, 'prueba_local'
  ) INTO v_consumido;
  IF v_consumido->>'estado' <> 'consumido'
     OR (SELECT app_usuario_id FROM public.crm_contactos WHERE id = v_contacto) <> v_usuario THEN
    RAISE EXCEPTION 'No se consumió o asoció el vínculo: %', v_consumido;
  END IF;
  IF (SELECT count(*) FROM public.crm_enlaces_app_whatsapp
      WHERE id = (v_resuelto->>'enlace_id')::uuid AND token_hash = v_hash) <> 1 THEN
    RAISE EXCEPTION 'El CRM no conservó únicamente el hash del código.';
  END IF;

  INSERT INTO public.usuarios (nombre, rol, club, correo)
  VALUES ('Padre local notificación', 'padre', 'Black Gold', 'crm-parent-local@example.invalid')
  RETURNING id INTO v_parent;
  INSERT INTO public.usuarios (nombre, rol, club, cedula, correo)
  VALUES ('Atleta local notificación', 'atleta', 'Black Gold', 'CRM-LOCAL-ATHLETE', 'crm-athlete-local@example.invalid')
  RETURNING id INTO v_atleta_usuario;
  INSERT INTO public.usuarios (nombre, rol, club, correo)
  VALUES ('Coach local notificación', 'coach', 'Black Gold', 'crm-coach-local@example.invalid')
  RETURNING id INTO v_coach;
  INSERT INTO public.atletas (usuario_id, edad, posicion)
  VALUES (v_atleta_usuario, 12, 'Base')
  RETURNING id INTO v_atleta;
  INSERT INTO public.padres_atletas (padre_id, atleta_id) VALUES (v_parent, v_atleta);

  SELECT public.crm_recibir_contacto_canal(
    'Black Gold', 'app', 'crm-parent-app-local-001', 'Padre local',
    'soporte', 'crm-parent-app-local-event-001', v_parent
  ) INTO v_contacto_parent;
  INSERT INTO public.crm_consentimientos (contact_id, alcance, estado, version_politica, registrado_por)
  VALUES ((v_contacto_parent->>'contact_id')::uuid, 'atencion', 'otorgado', 'crm-local-v1', 'prueba_local');

  INSERT INTO public.asistencia (atleta_id, coach_id, fecha, estado)
  VALUES (v_atleta, v_coach, current_date, 'Presente')
  RETURNING id INTO v_asistencia;
  SELECT estado INTO v_notificacion
  FROM public.crm_notificaciones_operativas
  WHERE tipo = 'asistencia_actualizada' AND asistencia_id = v_asistencia AND app_usuario_id = v_parent;
  IF v_notificacion <> 'autorizada' THEN
    RAISE EXCEPTION 'La asistencia del staff no dejó una notificación autorizada: %', v_notificacion;
  END IF;

  IF has_table_privilege('anon', 'public.crm_enlaces_app_whatsapp', 'SELECT')
     OR has_table_privilege('authenticated', 'public.crm_notificaciones_operativas', 'SELECT')
     OR has_function_privilege(
       'authenticated',
       'public.crm_resolver_enlace_app_whatsapp(text,text,text)'::regprocedure,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Un rol de navegador conserva acceso al vínculo o a notificaciones operativas.';
  END IF;
END
$$;

ROLLBACK;
