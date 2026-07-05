


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."calcular_categoria_feb"("p_fecha_nac" "date") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_fecha_nac IS NULL THEN NULL
    WHEN date_part('year', age(p_fecha_nac)) <= 9  THEN 'Premini (Sub-9)'
    WHEN date_part('year', age(p_fecha_nac)) <= 11 THEN 'Mini (Sub-11)'
    WHEN date_part('year', age(p_fecha_nac)) <= 14 THEN 'Menores (Sub-14)'
    WHEN date_part('year', age(p_fecha_nac)) <= 16 THEN 'Prejuvenil (Sub-16)'
    WHEN date_part('year', age(p_fecha_nac)) <= 18 THEN 'Juvenil (Sub-18)'
    ELSE 'Mayores'
  END;
$$;


ALTER FUNCTION "public"."calcular_categoria_feb"("p_fecha_nac" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolver_audiencia"("p_segmento_tipo" "text", "p_params" "jsonb" DEFAULT '{}'::"jsonb", "p_incluir_reps" boolean DEFAULT true, "p_club" "text" DEFAULT NULL::"text") RETURNS TABLE("usuario_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH atletas_base AS (
    SELECT a.id AS atleta_id, u.id AS usuario_id
    FROM atletas a
    JOIN usuarios u ON u.id = a.usuario_id
    WHERE (p_club IS NULL OR u.club = p_club)
      AND CASE p_segmento_tipo

        WHEN 'general' THEN true

        WHEN 'individual' THEN
          a.id = (p_params->>'atleta_id')::uuid
          OR u.id = (p_params->>'usuario_id')::uuid

        WHEN 'individualizado' THEN
          u.id IN (SELECT (jsonb_array_elements_text(p_params->'usuario_ids'))::uuid)

        WHEN 'grupo' THEN
          a.id IN (SELECT ag.atleta_id FROM atleta_grupo ag
                   WHERE ag.grupo_id = (p_params->>'grupo_id')::uuid)

        WHEN 'grupos_limitados' THEN
          a.id IN (SELECT ag.atleta_id FROM atleta_grupo ag
                   WHERE ag.grupo_id IN (
                     SELECT (jsonb_array_elements_text(p_params->'grupo_ids'))::uuid))

        WHEN 'categoria' THEN
          calcular_categoria_feb(u.fecha_nacimiento) = ANY (
            SELECT jsonb_array_elements_text(p_params->'categorias'))

        WHEN 'edad' THEN
          date_part('year', age(u.fecha_nacimiento))
            BETWEEN COALESCE((p_params->>'edad_min')::int, 0)
                AND COALESCE((p_params->>'edad_max')::int, 200)

        WHEN 'genero' THEN
          u.genero = (p_params->>'genero')

        WHEN 'compuesto' THEN
          (NOT (p_params->'filtros' ? 'genero')
             OR u.genero = (p_params->'filtros'->>'genero'))
          AND (NOT (p_params->'filtros' ? 'grupo_id')
             OR a.id IN (SELECT ag.atleta_id FROM atleta_grupo ag
                         WHERE ag.grupo_id = (p_params->'filtros'->>'grupo_id')::uuid))
          AND (NOT (p_params->'filtros' ? 'categoria')
             OR calcular_categoria_feb(u.fecha_nacimiento) = (p_params->'filtros'->>'categoria'))
          AND (NOT (p_params->'filtros' ? 'edad_min')
             OR date_part('year', age(u.fecha_nacimiento)) >= (p_params->'filtros'->>'edad_min')::int)
          AND (NOT (p_params->'filtros' ? 'edad_max')
             OR date_part('year', age(u.fecha_nacimiento)) <= (p_params->'filtros'->>'edad_max')::int)

        ELSE false
      END
  )
  -- Atletas resueltos
  SELECT ab.usuario_id FROM atletas_base ab
  UNION
  -- + representantes vinculados (si se solicita)
  SELECT pa.padre_id FROM padres_atletas pa
  JOIN atletas_base ab ON ab.atleta_id = pa.atleta_id
  WHERE p_incluir_reps = true;
END;
$$;


ALTER FUNCTION "public"."resolver_audiencia"("p_segmento_tipo" "text", "p_params" "jsonb", "p_incluir_reps" boolean, "p_club" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolver_email_login"("p_identificador" "text") RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(correo, cedula || '@sinacceso.blackgoldapp.internal')
  FROM usuarios
  WHERE correo = p_identificador
     OR telefono = p_identificador
     OR cedula = p_identificador
  LIMIT 1;
$$;


ALTER FUNCTION "public"."resolver_email_login"("p_identificador" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."asistencia" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "atleta_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "fecha" "date" DEFAULT CURRENT_DATE NOT NULL,
    "estado" "text" DEFAULT 'Presente'::"text" NOT NULL,
    "notas" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "asistencia_estado_check" CHECK (("estado" = ANY (ARRAY['Presente'::"text", 'Ausente'::"text", 'Justificada'::"text", 'Lesionado'::"text"])))
);


ALTER TABLE "public"."asistencia" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."atleta_grupo" (
    "atleta_id" "uuid" NOT NULL,
    "grupo_id" "uuid" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."atleta_grupo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."atleta_readiness" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "atleta_id" "uuid",
    "fecha" "date" DEFAULT CURRENT_DATE NOT NULL,
    "sueno_calidad" integer,
    "fatiga_fisica" integer,
    "color_orina" integer,
    "readiness_score" numeric GENERATED ALWAYS AS ((((("sueno_calidad")::numeric * 0.4) + (("fatiga_fisica")::numeric * 0.4)) + (((9 - "color_orina"))::numeric * 0.2))) STORED,
    "creado_en" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "atleta_readiness_color_orina_check" CHECK ((("color_orina" >= 1) AND ("color_orina" <= 8))),
    CONSTRAINT "atleta_readiness_fatiga_fisica_check" CHECK ((("fatiga_fisica" >= 1) AND ("fatiga_fisica" <= 10))),
    CONSTRAINT "atleta_readiness_sueno_calidad_check" CHECK ((("sueno_calidad" >= 1) AND ("sueno_calidad" <= 10)))
);


ALTER TABLE "public"."atleta_readiness" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."atletas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid",
    "edad" integer NOT NULL,
    "posicion" "text" NOT NULL,
    "xp_total" integer DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "perfil_mental" "text" DEFAULT 'Estable / Resistente'::"text",
    "estado_recuperacion" "text" DEFAULT 'Óptimo'::"text",
    "restriccion_movilidad" "text" DEFAULT 'Ninguna'::"text",
    "prevencion_impacto" boolean DEFAULT false,
    "deporte" "text" DEFAULT 'Baloncesto'::"text",
    "altura_cm" numeric(5,1) DEFAULT NULL::numeric,
    "peso_kg" numeric(5,1) DEFAULT NULL::numeric,
    "altura_padre_cm" integer,
    "altura_madre_cm" integer,
    "longitud_torso_cm" numeric(5,1) DEFAULT NULL::numeric,
    "longitud_piernas_cm" numeric(5,1) DEFAULT NULL::numeric,
    "wingspan_cm" numeric(5,1) DEFAULT NULL::numeric,
    "standing_reach_cm" numeric(5,1) DEFAULT NULL::numeric,
    "vertical_jump_cm" numeric(5,1) DEFAULT NULL::numeric,
    "vertical_jump_max_cm" numeric(5,1) DEFAULT NULL::numeric,
    "lane_agility_sec" numeric(4,2) DEFAULT NULL::numeric,
    "sprint_34_court_sec" numeric(4,2) DEFAULT NULL::numeric,
    "grupo_id" "uuid",
    "grupo_nombre" "text",
    "es_becado" boolean DEFAULT false,
    "descuento_pct" integer DEFAULT 0,
    "nivel_desarrollo" "text" DEFAULT 'Desarrollo'::"text",
    "overall_score" integer DEFAULT 0,
    "rango" "text" DEFAULT 'rookie'::"text",
    "talla_cm" numeric,
    "rango_tier" "text",
    "talla_sentado_cm" numeric,
    "envergadura_cm" numeric,
    "modo_vista" "text" DEFAULT 'cientifico'::"text",
    CONSTRAINT "atletas_estado_recuperacion_check" CHECK (("estado_recuperacion" = ANY (ARRAY['Óptimo'::"text", 'Agotamiento Activo'::"text", 'Fatiga Silenciosa'::"text"]))),
    CONSTRAINT "atletas_intolerancia_milo_check" CHECK (("restriccion_movilidad" = ANY (ARRAY['Ninguna'::"text", 'Intolerancia a la Flexión'::"text", 'Intolerancia a la Extensión'::"text", 'Intolerancia a la Rotación con Extensión'::"text", 'Intolerancia a la Carga'::"text"]))),
    CONSTRAINT "atletas_perfil_mental_check" CHECK (("perfil_mental" = ANY (ARRAY['Competitivo / Intenso'::"text", 'Estable / Resistente'::"text", 'Explosivo / Reactivo'::"text", 'Analítico / Concentrado'::"text"]))),
    CONSTRAINT "atletas_rango_check" CHECK (("rango" = ANY (ARRAY['rookie'::"text", 'prospect'::"text", 'starter'::"text", 'all_star'::"text", 'legend'::"text"])))
);


ALTER TABLE "public"."atletas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."catalogo_ejercicios" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "pilar" "text" NOT NULL,
    "sub_pilar" "text" NOT NULL,
    "tren" "text",
    "unidad" "text" NOT NULL,
    "invertido" boolean DEFAULT false,
    "thresholds" "jsonb",
    "inputs_requeridos" "jsonb",
    "creado_por" "uuid",
    "club_id" "text",
    "fecha_creacion" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "tipo" "text",
    "descripcion_ejecucion" "text",
    "autor_id" "uuid",
    "baremo_key" "text"
);


ALTER TABLE "public"."catalogo_ejercicios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."catalogo_sesiones" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "titulo" "text" NOT NULL,
    "enfoque_principal" "text",
    "descripcion" "text",
    "ejercicios_ids" "jsonb",
    "creado_por" "uuid",
    "club_id" "text",
    "fecha_creacion" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."catalogo_sesiones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comunicacion_destinatarios" (
    "comunicacion_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "leido" boolean DEFAULT false,
    "leido_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."comunicacion_destinatarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comunicaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "autor_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "grupo_id" "uuid",
    "atleta_id" "uuid",
    "titulo" "text" DEFAULT ''::"text" NOT NULL,
    "mensaje" "text" NOT NULL,
    "wa_enviado" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "segmento_tipo" "text",
    "segmento_params" "jsonb" DEFAULT '{}'::"jsonb",
    "incluir_representantes" boolean DEFAULT true,
    "evento_id" "uuid",
    "canal" "text" DEFAULT 'whatsapp'::"text",
    "proposito" "text" DEFAULT 'comunicado'::"text",
    CONSTRAINT "comunicaciones_canal_check" CHECK (("canal" = ANY (ARRAY['whatsapp'::"text", 'in_app'::"text", 'ambos'::"text"]))),
    CONSTRAINT "comunicaciones_proposito_check" CHECK (("proposito" = ANY (ARRAY['comunicado'::"text", 'convocatoria'::"text", 'recordatorio'::"text", 'resultado'::"text"]))),
    CONSTRAINT "comunicaciones_segmento_tipo_check" CHECK (("segmento_tipo" = ANY (ARRAY['general'::"text", 'individual'::"text", 'individualizado'::"text", 'grupo'::"text", 'grupos_limitados'::"text", 'categoria'::"text", 'edad'::"text", 'genero'::"text", 'compuesto'::"text"]))),
    CONSTRAINT "comunicaciones_tipo_check" CHECK (("tipo" = ANY (ARRAY['Anuncio'::"text", 'Grupal'::"text", 'Personalizado'::"text", 'Individual'::"text"])))
);


ALTER TABLE "public"."comunicaciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ejercicios_catalogo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tipo" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text" DEFAULT ''::"text",
    "grupos_recomendados" "text"[] DEFAULT ARRAY['Micro'::"text", 'Desarrollo'::"text", 'Elite'::"text"],
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ejercicios_catalogo_tipo_check" CHECK (("tipo" = ANY (ARRAY['Técnico'::"text", 'Físico'::"text", 'Táctico'::"text", 'Evaluación'::"text", 'Recuperación'::"text"])))
);


ALTER TABLE "public"."ejercicios_catalogo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."encuestas_habitos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "atleta_id" "uuid",
    "semana" "date" NOT NULL,
    "respuestas" "jsonb" NOT NULL,
    "respondido_por" "text" DEFAULT 'atleta'::"text",
    "validado_por_padre" boolean DEFAULT false,
    "correcciones_padre" "jsonb",
    "puntuacion_calculada" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "encuestas_habitos_respondido_por_check" CHECK (("respondido_por" = ANY (ARRAY['atleta'::"text", 'padre'::"text", 'coach'::"text"])))
);


ALTER TABLE "public"."encuestas_habitos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."evaluaciones_pruebas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "atleta_id" "uuid",
    "prueba_tipo" "text" NOT NULL,
    "pilar" "text" NOT NULL,
    "sub_pilar" "text" NOT NULL,
    "lado" "text" DEFAULT 'N/A'::"text",
    "condicion" "text" DEFAULT 'N/A'::"text",
    "tren" "text",
    "valor_crudo" numeric NOT NULL,
    "unidad" "text" NOT NULL,
    "puntuacion_normalizada" integer DEFAULT 0,
    "tier" "text",
    "registrado_por" "uuid",
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "evaluaciones_pruebas_tier_check" CHECK (("tier" = ANY (ARRAY['poor'::"text", 'below_avg'::"text", 'average'::"text", 'above_avg'::"text", 'excellent'::"text"]))),
    CONSTRAINT "evaluaciones_pruebas_tren_check" CHECK (("tren" = ANY (ARRAY['superior'::"text", 'inferior'::"text", NULL::"text"])))
);


ALTER TABLE "public"."evaluaciones_pruebas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."evento_convocados" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "evento_id" "uuid",
    "atleta_id" "uuid",
    "estado_rsvp" "text" DEFAULT 'pendiente'::"text",
    "rsvp_at" timestamp with time zone,
    "rsvp_por" "uuid",
    "asistencia_real" "text",
    "checkin_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "evento_convocados_asistencia_real_check" CHECK ((("asistencia_real" = ANY (ARRAY['presente'::"text", 'ausente'::"text", 'tarde'::"text"])) OR ("asistencia_real" IS NULL))),
    CONSTRAINT "evento_convocados_estado_rsvp_check" CHECK (("estado_rsvp" = ANY (ARRAY['pendiente'::"text", 'asiste'::"text", 'no_asiste'::"text", 'duda'::"text"])))
);


ALTER TABLE "public"."evento_convocados" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."evento_recordatorios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "evento_id" "uuid",
    "minutos_antes" integer NOT NULL,
    "solo_pendientes" boolean DEFAULT true,
    "enviado_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."evento_recordatorios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."eventos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "club" "text",
    "creado_por" "uuid",
    "tipo" "text" DEFAULT 'partido'::"text" NOT NULL,
    "estado" "text" DEFAULT 'borrador'::"text" NOT NULL,
    "titulo" "text" NOT NULL,
    "descripcion" "text",
    "rival" "text",
    "segmento_tipo" "text",
    "segmento_params" "jsonb" DEFAULT '{}'::"jsonb",
    "incluir_representantes" boolean DEFAULT true,
    "fecha_evento" timestamp with time zone NOT NULL,
    "hora_llegada" time without time zone,
    "hora_inicio" time without time zone,
    "sede" "text",
    "direccion" "text",
    "uniforme" "text",
    "transporte" "text",
    "notas_logistica" "text",
    "marcador_propio" integer,
    "marcador_rival" integer,
    "resultado" "text",
    "mvp" "text",
    "top_scorer" "text",
    "top_dobles" "text",
    "top_triples" "text",
    "notas_resultado" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "eventos_estado_check" CHECK (("estado" = ANY (ARRAY['borrador'::"text", 'publicado'::"text", 'en_curso'::"text", 'cerrado'::"text", 'cancelado'::"text"]))),
    CONSTRAINT "eventos_resultado_check" CHECK ((("resultado" = ANY (ARRAY['ganado'::"text", 'perdido'::"text", 'empatado'::"text"])) OR ("resultado" IS NULL))),
    CONSTRAINT "eventos_tipo_check" CHECK (("tipo" = ANY (ARRAY['partido'::"text", 'torneo'::"text", 'entrenamiento_especial'::"text", 'clinica'::"text", 'reunion'::"text", 'evaluacion'::"text", 'social'::"text"])))
);


ALTER TABLE "public"."eventos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."grupos_entrenamiento" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "horario" "text" NOT NULL,
    "descripcion" "text" DEFAULT ''::"text",
    "precio_mensual" numeric(10,2) DEFAULT 30.00,
    "precio_sesion_ind" numeric(10,2) DEFAULT 0.00,
    "club" "text" DEFAULT 'Black Gold'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "hora_inicio" time without time zone,
    "hora_fin" time without time zone,
    "dias_semana" "text"[]
);


ALTER TABLE "public"."grupos_entrenamiento" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."grupos_mision" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "creado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."grupos_mision" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."grupos_mision_miembros" (
    "grupo_id" "uuid" NOT NULL,
    "atleta_id" "uuid" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."grupos_mision_miembros" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."misiones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "titulo" "text" NOT NULL,
    "descripcion" "text",
    "pilar" "text" DEFAULT 'youtube'::"text",
    "video_url" "text",
    "xp_recompensa" integer DEFAULT 0,
    "quiz" "jsonb" DEFAULT '[]'::"jsonb",
    "categoria_objetivo" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "condicion_trigger" "text",
    "autor_id" "uuid",
    "is_ai_generated" boolean DEFAULT false,
    "nivel_objetivo" "text",
    "categoria_bucket" "text",
    "justificacion" "text",
    "complejidad" "text" DEFAULT 'especifica'::"text",
    "activa" boolean DEFAULT true,
    CONSTRAINT "misiones_categoria_bucket_check" CHECK (("categoria_bucket" = ANY (ARRAY['Sub12'::"text", 'Sub15'::"text", 'Sub18'::"text", 'Senior'::"text"]))),
    CONSTRAINT "misiones_complejidad_check" CHECK (("complejidad" = ANY (ARRAY['general'::"text", 'especifica'::"text"]))),
    CONSTRAINT "misiones_nivel_objetivo_check" CHECK (("nivel_objetivo" = ANY (ARRAY['Micro'::"text", 'Desarrollo'::"text", 'Elite'::"text"]))),
    CONSTRAINT "misiones_pilar_check" CHECK (("pilar" = ANY (ARRAY['youtube'::"text", 'articulo'::"text", 'fuerza'::"text", 'explosividad'::"text", 'movilidad'::"text", 'tiro'::"text", 'agilidad'::"text", 'tactica'::"text", 'resiliencia'::"text"])))
);


ALTER TABLE "public"."misiones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notas_coach" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "atleta_id" "uuid",
    "coach_id" "uuid",
    "fecha" "date" DEFAULT CURRENT_DATE,
    "nota" "text" NOT NULL,
    "leida" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notas_coach" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."observaciones_cancha" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "atleta_id" "uuid",
    "coach_id" "uuid",
    "fecha" "date" DEFAULT CURRENT_DATE,
    "esfuerzo" integer DEFAULT 0,
    "actitud" integer DEFAULT 0,
    "foco" integer DEFAULT 0,
    "notas" "text",
    "xp_ganada" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "trabajo_equipo" integer DEFAULT 0,
    "insignia" "text",
    CONSTRAINT "observaciones_cancha_actitud_check" CHECK ((("actitud" >= 0) AND ("actitud" <= 10))),
    CONSTRAINT "observaciones_cancha_esfuerzo_check" CHECK ((("esfuerzo" >= 0) AND ("esfuerzo" <= 10))),
    CONSTRAINT "observaciones_cancha_foco_check" CHECK ((("foco" >= 0) AND ("foco" <= 10))),
    CONSTRAINT "observaciones_cancha_trabajo_equipo_check" CHECK ((("trabajo_equipo" >= 0) AND ("trabajo_equipo" <= 10)))
);


ALTER TABLE "public"."observaciones_cancha" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."padres_atletas" (
    "padre_id" "uuid" NOT NULL,
    "atleta_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."padres_atletas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pagos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "atleta_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "mes" integer,
    "anio" integer,
    "monto_base" numeric(10,2) DEFAULT 30.00 NOT NULL,
    "descuento_pct" integer DEFAULT 0,
    "monto_final" numeric(10,2),
    "estado" "text" DEFAULT 'Pendiente'::"text" NOT NULL,
    "fecha_vencimiento" "date",
    "fecha_pago" "date",
    "forma_pago" "text",
    "referencia_comprobante" "text" DEFAULT ''::"text",
    "notas" "text" DEFAULT ''::"text",
    "registrado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "pagos_estado_check" CHECK (("estado" = ANY (ARRAY['Pagado'::"text", 'Pendiente'::"text", 'Vencido'::"text", 'Becado'::"text"]))),
    CONSTRAINT "pagos_forma_pago_check" CHECK (("forma_pago" = ANY (ARRAY['Efectivo'::"text", 'Transferencia'::"text", 'Make-Auto'::"text", 'Otro'::"text"]))),
    CONSTRAINT "pagos_mes_check" CHECK ((("mes" >= 1) AND ("mes" <= 12))),
    CONSTRAINT "pagos_tipo_check" CHECK (("tipo" = ANY (ARRAY['Mensualidad'::"text", 'Sesion Individual'::"text", 'Otro'::"text"])))
);


ALTER TABLE "public"."pagos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."progreso_misiones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "atleta_id" "uuid",
    "mision_id" "uuid",
    "completada" boolean DEFAULT false,
    "fecha_completada" timestamp with time zone,
    "quiz_score" integer,
    "estado" "text" DEFAULT 'aprobada'::"text",
    "evidencia_url" "text",
    "feedback_coach" "text",
    "asignado_por" "uuid",
    "tipo_asignacion" "text",
    "fecha_asignacion" timestamp with time zone DEFAULT "now"(),
    "origen" "text" DEFAULT 'coach'::"text",
    "sub_pilar_objetivo" "text",
    "evaluacion_id" "uuid",
    CONSTRAINT "progreso_misiones_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'pendiente_aprobacion'::"text", 'aprobada'::"text", 'rechazada'::"text"]))),
    CONSTRAINT "progreso_misiones_origen_check" CHECK (("origen" = ANY (ARRAY['coach'::"text", 'auto_baremo'::"text", 'ia'::"text"]))),
    CONSTRAINT "progreso_misiones_tipo_asignacion_check" CHECK (("tipo_asignacion" = ANY (ARRAY['individual'::"text", 'categoria'::"text", 'grupo'::"text", 'todos'::"text"])))
);


ALTER TABLE "public"."progreso_misiones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recompensas_desbloqueadas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "atleta_id" "uuid",
    "rango_alcanzado" "text" NOT NULL,
    "recompensa" "text" NOT NULL,
    "descripcion" "text",
    "entregado" boolean DEFAULT false,
    "fecha_desbloqueo" timestamp with time zone DEFAULT "now"(),
    "fecha_entrega" timestamp with time zone,
    CONSTRAINT "recompensas_desbloqueadas_rango_alcanzado_check" CHECK (("rango_alcanzado" = ANY (ARRAY['prospect'::"text", 'starter'::"text", 'all_star'::"text", 'legend'::"text"])))
);


ALTER TABLE "public"."recompensas_desbloqueadas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."screening_funcional" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "atleta_id" "uuid" NOT NULL,
    "fecha" "date" DEFAULT CURRENT_DATE,
    "bodyweight_squat_status" "text" DEFAULT 'Correcto'::"text",
    "single_leg_squat_status" "text" DEFAULT 'Estable'::"text",
    "test_pared_izq_cm" integer DEFAULT 0,
    "test_pared_der_cm" integer DEFAULT 0,
    "dolor_postura_flexion" boolean DEFAULT false,
    "dolor_postura_extension" boolean DEFAULT false,
    "dolor_rotacion" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "screening_funcional_bodyweight_squat_status_check" CHECK (("bodyweight_squat_status" = ANY (ARRAY['Correcto'::"text", 'Hip Shift'::"text", 'Butt Wink'::"text"]))),
    CONSTRAINT "screening_funcional_single_leg_squat_status_check" CHECK (("single_leg_squat_status" = ANY (ARRAY['Estable'::"text", 'Valgo Dinámico'::"text"])))
);


ALTER TABLE "public"."screening_funcional" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sesiones_control" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tipo" "text" NOT NULL,
    "grupo_id" "uuid",
    "atleta_id" "uuid",
    "coach_id" "uuid" NOT NULL,
    "fecha" "date" DEFAULT CURRENT_DATE NOT NULL,
    "objetivo_tipo" "text",
    "objetivo_descripcion" "text" DEFAULT ''::"text" NOT NULL,
    "ejercicios_ids" "uuid"[],
    "ejercicios_notas" "text" DEFAULT ''::"text",
    "se_logro" "text",
    "notas_evaluacion" "text" DEFAULT ''::"text",
    "es_pago_extra" boolean DEFAULT false,
    "monto_extra" numeric(10,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "sesiones_control_objetivo_tipo_check" CHECK (("objetivo_tipo" = ANY (ARRAY['Técnico'::"text", 'Físico'::"text", 'Táctico'::"text", 'Evaluación'::"text", 'Recuperación'::"text"]))),
    CONSTRAINT "sesiones_control_se_logro_check" CHECK (("se_logro" = ANY (ARRAY['Sí'::"text", 'Parcial'::"text", 'No'::"text"]))),
    CONSTRAINT "sesiones_control_tipo_check" CHECK (("tipo" = ANY (ARRAY['Grupal'::"text", 'Individual'::"text"])))
);


ALTER TABLE "public"."sesiones_control" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sesiones_entrenamiento" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "atleta_id" "uuid" NOT NULL,
    "coach_id" "uuid",
    "fecha" "date" DEFAULT CURRENT_DATE,
    "volumen_series_reps" "text" DEFAULT ''::"text",
    "eva_registro" integer DEFAULT 0,
    "notas" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "pilar_objetivo" "text",
    CONSTRAINT "sesiones_entrenamiento_eva_registro_check" CHECK ((("eva_registro" >= 0) AND ("eva_registro" <= 10)))
);


ALTER TABLE "public"."sesiones_entrenamiento" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sesiones_programadas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fecha" "date" NOT NULL,
    "hora_inicio" time without time zone NOT NULL,
    "hora_fin" time without time zone NOT NULL,
    "tipo" "text" NOT NULL,
    "estado" "text" DEFAULT 'Programada'::"text" NOT NULL,
    "atleta_id" "uuid",
    "grupo_id" "uuid",
    "coach_id" "uuid",
    "pagada" boolean DEFAULT false,
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "pilar_objetivo" "text",
    CONSTRAINT "sesiones_programadas_estado_check" CHECK (("estado" = ANY (ARRAY['Programada'::"text", 'Completada'::"text", 'Cancelada'::"text"]))),
    CONSTRAINT "sesiones_programadas_tipo_check" CHECK (("tipo" = ANY (ARRAY['Grupal'::"text", 'Individual'::"text"])))
);


ALTER TABLE "public"."sesiones_programadas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cedula" "text",
    "nombre" "text" NOT NULL,
    "rol" "text" NOT NULL,
    "club" "text" DEFAULT 'Black Gold'::"text",
    "categoria" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "telefono" "text",
    "correo" "text",
    "contrasena_hash" "text",
    "fecha_nacimiento" "date",
    "genero" "text" DEFAULT 'Masculino'::"text",
    "auth_user_id" "uuid",
    "categoria_feb" "text" GENERATED ALWAYS AS ("public"."calcular_categoria_feb"("fecha_nacimiento")) STORED,
    CONSTRAINT "cedula_requerida_atletas" CHECK ((("rol" <> 'atleta'::"text") OR (("cedula" IS NOT NULL) AND ("cedula" <> ''::"text")))),
    CONSTRAINT "usuarios_rol_check" CHECK (("rol" = ANY (ARRAY['superadmin'::"text", 'owner'::"text", 'coach'::"text", 'atleta'::"text", 'padre'::"text"])))
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";


ALTER TABLE ONLY "public"."asistencia"
    ADD CONSTRAINT "asistencia_atleta_id_fecha_key" UNIQUE ("atleta_id", "fecha");



ALTER TABLE ONLY "public"."asistencia"
    ADD CONSTRAINT "asistencia_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."atleta_grupo"
    ADD CONSTRAINT "atleta_grupo_pkey" PRIMARY KEY ("atleta_id", "grupo_id");



ALTER TABLE ONLY "public"."atleta_readiness"
    ADD CONSTRAINT "atleta_readiness_atleta_id_fecha_key" UNIQUE ("atleta_id", "fecha");



ALTER TABLE ONLY "public"."atleta_readiness"
    ADD CONSTRAINT "atleta_readiness_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."atletas"
    ADD CONSTRAINT "atletas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."catalogo_ejercicios"
    ADD CONSTRAINT "catalogo_ejercicios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."catalogo_sesiones"
    ADD CONSTRAINT "catalogo_sesiones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comunicacion_destinatarios"
    ADD CONSTRAINT "comunicacion_destinatarios_pkey" PRIMARY KEY ("comunicacion_id", "usuario_id");



ALTER TABLE ONLY "public"."comunicaciones"
    ADD CONSTRAINT "comunicaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ejercicios_catalogo"
    ADD CONSTRAINT "ejercicios_catalogo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."encuestas_habitos"
    ADD CONSTRAINT "encuestas_habitos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evaluaciones_pruebas"
    ADD CONSTRAINT "evaluaciones_pruebas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evento_convocados"
    ADD CONSTRAINT "evento_convocados_evento_id_atleta_id_key" UNIQUE ("evento_id", "atleta_id");



ALTER TABLE ONLY "public"."evento_convocados"
    ADD CONSTRAINT "evento_convocados_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evento_recordatorios"
    ADD CONSTRAINT "evento_recordatorios_evento_id_minutos_antes_key" UNIQUE ("evento_id", "minutos_antes");



ALTER TABLE ONLY "public"."evento_recordatorios"
    ADD CONSTRAINT "evento_recordatorios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."eventos"
    ADD CONSTRAINT "eventos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."grupos_entrenamiento"
    ADD CONSTRAINT "grupos_entrenamiento_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."grupos_entrenamiento"
    ADD CONSTRAINT "grupos_entrenamiento_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."grupos_mision_miembros"
    ADD CONSTRAINT "grupos_mision_miembros_pkey" PRIMARY KEY ("grupo_id", "atleta_id");



ALTER TABLE ONLY "public"."grupos_mision"
    ADD CONSTRAINT "grupos_mision_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."misiones"
    ADD CONSTRAINT "misiones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notas_coach"
    ADD CONSTRAINT "notas_coach_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."observaciones_cancha"
    ADD CONSTRAINT "observaciones_cancha_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."padres_atletas"
    ADD CONSTRAINT "padres_atletas_pkey" PRIMARY KEY ("padre_id", "atleta_id");



ALTER TABLE ONLY "public"."pagos"
    ADD CONSTRAINT "pagos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."progreso_misiones"
    ADD CONSTRAINT "progreso_misiones_atleta_id_mision_id_key" UNIQUE ("atleta_id", "mision_id");



ALTER TABLE ONLY "public"."progreso_misiones"
    ADD CONSTRAINT "progreso_misiones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recompensas_desbloqueadas"
    ADD CONSTRAINT "recompensas_desbloqueadas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."screening_funcional"
    ADD CONSTRAINT "screening_funcional_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sesiones_control"
    ADD CONSTRAINT "sesiones_control_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sesiones_entrenamiento"
    ADD CONSTRAINT "sesiones_entrenamiento_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sesiones_programadas"
    ADD CONSTRAINT "sesiones_programadas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_cedula_key" UNIQUE ("cedula");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_correo_key" UNIQUE ("correo");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_telefono_key" UNIQUE ("telefono");



CREATE INDEX "idx_atleta_grupo_atleta" ON "public"."atleta_grupo" USING "btree" ("atleta_id");



CREATE INDEX "idx_atleta_grupo_grupo" ON "public"."atleta_grupo" USING "btree" ("grupo_id");



CREATE INDEX "idx_comdest_usuario" ON "public"."comunicacion_destinatarios" USING "btree" ("usuario_id", "leido");



CREATE INDEX "idx_convocados_atleta" ON "public"."evento_convocados" USING "btree" ("atleta_id");



CREATE INDEX "idx_convocados_evento" ON "public"."evento_convocados" USING "btree" ("evento_id", "estado_rsvp");



CREATE INDEX "idx_eventos_club" ON "public"."eventos" USING "btree" ("club");



CREATE INDEX "idx_eventos_estado" ON "public"."eventos" USING "btree" ("estado");



CREATE INDEX "idx_eventos_fecha" ON "public"."eventos" USING "btree" ("fecha_evento");



CREATE INDEX "idx_gmision_miembros" ON "public"."grupos_mision_miembros" USING "btree" ("atleta_id");



CREATE INDEX "idx_progreso_atleta" ON "public"."progreso_misiones" USING "btree" ("atleta_id");



CREATE INDEX "idx_progreso_mision" ON "public"."progreso_misiones" USING "btree" ("mision_id");



CREATE INDEX "idx_recordatorios_pendientes" ON "public"."evento_recordatorios" USING "btree" ("evento_id") WHERE ("enviado_at" IS NULL);



CREATE INDEX "idx_screening_atleta_id" ON "public"."screening_funcional" USING "btree" ("atleta_id");



CREATE INDEX "idx_sesiones_atleta_id" ON "public"."sesiones_entrenamiento" USING "btree" ("atleta_id");



CREATE INDEX "idx_sesiones_coach_id" ON "public"."sesiones_entrenamiento" USING "btree" ("coach_id");



CREATE INDEX "idx_sesiones_fecha" ON "public"."sesiones_entrenamiento" USING "btree" ("fecha");



CREATE INDEX "idx_usuarios_categoria_feb" ON "public"."usuarios" USING "btree" ("categoria_feb");



CREATE INDEX "idx_usuarios_cedula" ON "public"."usuarios" USING "btree" ("cedula") WHERE ("cedula" IS NOT NULL);



CREATE INDEX "idx_usuarios_club_categoria_feb" ON "public"."usuarios" USING "btree" ("club", "categoria_feb");



CREATE UNIQUE INDEX "uniq_catalogo_baremo_key" ON "public"."catalogo_ejercicios" USING "btree" ("baremo_key") WHERE ("baremo_key" IS NOT NULL);



CREATE UNIQUE INDEX "uniq_progreso_atleta_mision" ON "public"."progreso_misiones" USING "btree" ("atleta_id", "mision_id");



CREATE UNIQUE INDEX "usuarios_auth_user_id_key" ON "public"."usuarios" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "trg_eventos_updated" BEFORE UPDATE ON "public"."eventos" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



ALTER TABLE ONLY "public"."asistencia"
    ADD CONSTRAINT "asistencia_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "public"."atletas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asistencia"
    ADD CONSTRAINT "asistencia_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."atleta_grupo"
    ADD CONSTRAINT "atleta_grupo_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "public"."atletas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."atleta_grupo"
    ADD CONSTRAINT "atleta_grupo_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_entrenamiento"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."atleta_readiness"
    ADD CONSTRAINT "atleta_readiness_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "public"."atletas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."atletas"
    ADD CONSTRAINT "atletas_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_entrenamiento"("id");



ALTER TABLE ONLY "public"."atletas"
    ADD CONSTRAINT "atletas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catalogo_ejercicios"
    ADD CONSTRAINT "catalogo_ejercicios_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."catalogo_ejercicios"
    ADD CONSTRAINT "catalogo_ejercicios_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."catalogo_sesiones"
    ADD CONSTRAINT "catalogo_sesiones_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."comunicacion_destinatarios"
    ADD CONSTRAINT "comunicacion_destinatarios_comunicacion_id_fkey" FOREIGN KEY ("comunicacion_id") REFERENCES "public"."comunicaciones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comunicacion_destinatarios"
    ADD CONSTRAINT "comunicacion_destinatarios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."comunicaciones"
    ADD CONSTRAINT "comunicaciones_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "public"."atletas"("id");



ALTER TABLE ONLY "public"."comunicaciones"
    ADD CONSTRAINT "comunicaciones_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."comunicaciones"
    ADD CONSTRAINT "comunicaciones_evento_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comunicaciones"
    ADD CONSTRAINT "comunicaciones_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_entrenamiento"("id");



ALTER TABLE ONLY "public"."encuestas_habitos"
    ADD CONSTRAINT "encuestas_habitos_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "public"."atletas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evaluaciones_pruebas"
    ADD CONSTRAINT "evaluaciones_pruebas_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "public"."atletas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evaluaciones_pruebas"
    ADD CONSTRAINT "evaluaciones_pruebas_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."evento_convocados"
    ADD CONSTRAINT "evento_convocados_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "public"."atletas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evento_convocados"
    ADD CONSTRAINT "evento_convocados_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evento_convocados"
    ADD CONSTRAINT "evento_convocados_rsvp_por_fkey" FOREIGN KEY ("rsvp_por") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."evento_recordatorios"
    ADD CONSTRAINT "evento_recordatorios_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."eventos"
    ADD CONSTRAINT "eventos_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."grupos_mision"
    ADD CONSTRAINT "grupos_mision_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."grupos_mision_miembros"
    ADD CONSTRAINT "grupos_mision_miembros_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "public"."atletas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."grupos_mision_miembros"
    ADD CONSTRAINT "grupos_mision_miembros_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_mision"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."misiones"
    ADD CONSTRAINT "misiones_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."misiones"
    ADD CONSTRAINT "misiones_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."notas_coach"
    ADD CONSTRAINT "notas_coach_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "public"."atletas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notas_coach"
    ADD CONSTRAINT "notas_coach_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."observaciones_cancha"
    ADD CONSTRAINT "observaciones_cancha_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "public"."atletas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."observaciones_cancha"
    ADD CONSTRAINT "observaciones_cancha_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."padres_atletas"
    ADD CONSTRAINT "padres_atletas_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "public"."atletas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."padres_atletas"
    ADD CONSTRAINT "padres_atletas_padre_id_fkey" FOREIGN KEY ("padre_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pagos"
    ADD CONSTRAINT "pagos_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "public"."atletas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pagos"
    ADD CONSTRAINT "pagos_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."progreso_misiones"
    ADD CONSTRAINT "progreso_misiones_asignado_por_fkey" FOREIGN KEY ("asignado_por") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."progreso_misiones"
    ADD CONSTRAINT "progreso_misiones_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "public"."atletas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."progreso_misiones"
    ADD CONSTRAINT "progreso_misiones_evaluacion_id_fkey" FOREIGN KEY ("evaluacion_id") REFERENCES "public"."evaluaciones_pruebas"("id");



ALTER TABLE ONLY "public"."progreso_misiones"
    ADD CONSTRAINT "progreso_misiones_mision_id_fkey" FOREIGN KEY ("mision_id") REFERENCES "public"."misiones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recompensas_desbloqueadas"
    ADD CONSTRAINT "recompensas_desbloqueadas_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "public"."atletas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."screening_funcional"
    ADD CONSTRAINT "screening_funcional_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "public"."atletas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sesiones_control"
    ADD CONSTRAINT "sesiones_control_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "public"."atletas"("id");



ALTER TABLE ONLY "public"."sesiones_control"
    ADD CONSTRAINT "sesiones_control_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."sesiones_control"
    ADD CONSTRAINT "sesiones_control_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_entrenamiento"("id");



ALTER TABLE ONLY "public"."sesiones_entrenamiento"
    ADD CONSTRAINT "sesiones_entrenamiento_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "public"."atletas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sesiones_entrenamiento"
    ADD CONSTRAINT "sesiones_entrenamiento_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."sesiones_programadas"
    ADD CONSTRAINT "sesiones_programadas_atleta_id_fkey" FOREIGN KEY ("atleta_id") REFERENCES "public"."atletas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sesiones_programadas"
    ADD CONSTRAINT "sesiones_programadas_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sesiones_programadas"
    ADD CONSTRAINT "sesiones_programadas_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_entrenamiento"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Atletas pueden ver y crear sus propios readiness" ON "public"."atleta_readiness" USING ((EXISTS ( SELECT 1
   FROM "public"."atletas"
  WHERE (("atletas"."id" = "atleta_readiness"."atleta_id") AND ("atletas"."usuario_id" = "auth"."uid"())))));



CREATE POLICY "Borrado de misiones" ON "public"."misiones" FOR DELETE USING (true);



CREATE POLICY "Coaches pueden ver readiness de todos" ON "public"."atleta_readiness" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."usuarios"
  WHERE (("usuarios"."id" = "auth"."uid"()) AND ("usuarios"."rol" = 'coach'::"text")))));



CREATE POLICY "Creacion de misiones" ON "public"."misiones" FOR INSERT WITH CHECK (true);



CREATE POLICY "Delete público notas" ON "public"."notas_coach" FOR DELETE USING (true);



CREATE POLICY "Edicion de misiones" ON "public"."misiones" FOR UPDATE USING (true);



CREATE POLICY "Escritura pública atletas" ON "public"."atletas" FOR INSERT WITH CHECK (true);



CREATE POLICY "Escritura pública misiones" ON "public"."misiones" FOR INSERT WITH CHECK (true);



CREATE POLICY "Escritura pública notas" ON "public"."notas_coach" FOR INSERT WITH CHECK (true);



CREATE POLICY "Escritura pública obs" ON "public"."observaciones_cancha" FOR INSERT WITH CHECK (true);



CREATE POLICY "Escritura pública progreso" ON "public"."progreso_misiones" FOR INSERT WITH CHECK (true);



CREATE POLICY "Escritura pública usuarios" ON "public"."usuarios" FOR INSERT WITH CHECK (true);



CREATE POLICY "Insertar Ejercicios" ON "public"."catalogo_ejercicios" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."usuarios"
  WHERE (("usuarios"."id" = "auth"."uid"()) AND ("usuarios"."rol" = 'superadmin'::"text")))) OR (("club_id" = ( SELECT "usuarios"."club"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = "auth"."uid"()))) AND (EXISTS ( SELECT 1
   FROM "public"."usuarios"
  WHERE (("usuarios"."id" = "auth"."uid"()) AND ("usuarios"."rol" = ANY (ARRAY['owner'::"text", 'coach_head'::"text"]))))))));



CREATE POLICY "Insertar Sesiones" ON "public"."catalogo_sesiones" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."usuarios"
  WHERE (("usuarios"."id" = "auth"."uid"()) AND ("usuarios"."rol" = 'superadmin'::"text")))) OR (("club_id" = ( SELECT "usuarios"."club"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = "auth"."uid"()))) AND (EXISTS ( SELECT 1
   FROM "public"."usuarios"
  WHERE (("usuarios"."id" = "auth"."uid"()) AND ("usuarios"."rol" = ANY (ARRAY['owner'::"text", 'coach_head'::"text", 'coach_asistente'::"text"]))))))));



CREATE POLICY "Lectura de misiones para todos" ON "public"."misiones" FOR SELECT USING (true);



CREATE POLICY "Lectura pública atletas" ON "public"."atletas" FOR SELECT USING (true);



CREATE POLICY "Lectura pública misiones" ON "public"."misiones" FOR SELECT USING (true);



CREATE POLICY "Lectura pública notas" ON "public"."notas_coach" FOR SELECT USING (true);



CREATE POLICY "Lectura pública obs" ON "public"."observaciones_cancha" FOR SELECT USING (true);



CREATE POLICY "Lectura pública progreso" ON "public"."progreso_misiones" FOR SELECT USING (true);



CREATE POLICY "Lectura pública usuarios" ON "public"."usuarios" FOR SELECT USING (true);



CREATE POLICY "Lectura universal" ON "public"."comunicaciones" FOR SELECT USING (true);



CREATE POLICY "Lectura universal" ON "public"."observaciones_cancha" FOR SELECT USING (true);



CREATE POLICY "Lectura universal" ON "public"."padres_atletas" FOR SELECT USING (true);



CREATE POLICY "Lectura universal" ON "public"."sesiones_control" FOR SELECT USING (true);



CREATE POLICY "Lectura universal" ON "public"."sesiones_entrenamiento" FOR SELECT USING (true);



CREATE POLICY "Modificar Ejercicios" ON "public"."catalogo_ejercicios" FOR UPDATE USING ((("creado_por" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."usuarios"
  WHERE (("usuarios"."id" = "auth"."uid"()) AND ("usuarios"."rol" = 'superadmin'::"text"))))));



CREATE POLICY "Modificar Sesiones" ON "public"."catalogo_sesiones" FOR UPDATE USING ((("creado_por" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."usuarios"
  WHERE (("usuarios"."id" = "auth"."uid"()) AND ("usuarios"."rol" = 'superadmin'::"text"))))));



CREATE POLICY "Permitir DELETE a dueños" ON "public"."usuarios" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Permitir INSERT general temporal" ON "public"."usuarios" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Permitir SELECT a usuarios autenticados" ON "public"."usuarios" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Permitir UPDATE a dueños del perfil" ON "public"."usuarios" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Permitir lectura a todos" ON "public"."atleta_readiness" FOR SELECT USING (true);



CREATE POLICY "Permitir lectura a todos" ON "public"."evaluaciones_pruebas" FOR SELECT USING (true);



CREATE POLICY "Permitir todo a todos" ON "public"."sesiones_programadas" USING (true) WITH CHECK (true);



CREATE POLICY "Public com destinatarios" ON "public"."comunicacion_destinatarios" USING (true);



CREATE POLICY "Public comunicaciones" ON "public"."comunicaciones" USING (true);



CREATE POLICY "Public delete asistencia" ON "public"."asistencia" FOR DELETE USING (true);



CREATE POLICY "Public padres_atletas" ON "public"."padres_atletas" USING (true);



CREATE POLICY "Public pagos" ON "public"."pagos" USING (true);



CREATE POLICY "Public read asistencia" ON "public"."asistencia" FOR SELECT USING (true);



CREATE POLICY "Public read ejercicios" ON "public"."ejercicios_catalogo" FOR SELECT USING (true);



CREATE POLICY "Public read grupos" ON "public"."grupos_entrenamiento" FOR SELECT USING (true);



CREATE POLICY "Public sesiones" ON "public"."sesiones_control" USING (true);



CREATE POLICY "Public update asistencia" ON "public"."asistencia" FOR UPDATE USING (true);



CREATE POLICY "Public write asistencia" ON "public"."asistencia" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public write grupos" ON "public"."grupos_entrenamiento" USING (true);



CREATE POLICY "Update pública notas" ON "public"."notas_coach" FOR UPDATE USING (true);



CREATE POLICY "Update pública obs" ON "public"."observaciones_cancha" FOR UPDATE USING (true);



CREATE POLICY "Update público atletas" ON "public"."atletas" FOR UPDATE USING (true);



CREATE POLICY "Update público misiones" ON "public"."misiones" FOR UPDATE USING (true);



CREATE POLICY "Update público notas" ON "public"."notas_coach" FOR UPDATE USING (true);



CREATE POLICY "Update público progreso" ON "public"."progreso_misiones" FOR UPDATE USING (true);



CREATE POLICY "Update público usuarios" ON "public"."usuarios" FOR UPDATE USING (true);



CREATE POLICY "Ver Ejercicios de su club o globales" ON "public"."catalogo_ejercicios" FOR SELECT USING ((("club_id" IS NULL) OR ("club_id" = ( SELECT "usuarios"."club"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = "auth"."uid"())))));



CREATE POLICY "Ver Sesiones de su club o globales" ON "public"."catalogo_sesiones" FOR SELECT USING ((("club_id" IS NULL) OR ("club_id" = ( SELECT "usuarios"."club"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = "auth"."uid"())))));



ALTER TABLE "public"."asistencia" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."atleta_grupo" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "atleta_grupo_all" ON "public"."atleta_grupo" USING (true) WITH CHECK (true);



ALTER TABLE "public"."atletas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."catalogo_ejercicios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."catalogo_sesiones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comunicacion_destinatarios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comunicaciones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "convocados_all" ON "public"."evento_convocados" USING (true) WITH CHECK (true);



ALTER TABLE "public"."ejercicios_catalogo" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "encuesta_insert" ON "public"."encuestas_habitos" FOR INSERT WITH CHECK (true);



CREATE POLICY "encuesta_select" ON "public"."encuestas_habitos" FOR SELECT USING (true);



CREATE POLICY "encuesta_update" ON "public"."encuestas_habitos" FOR UPDATE USING (true);



ALTER TABLE "public"."encuestas_habitos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "eval_delete" ON "public"."evaluaciones_pruebas" FOR DELETE USING (true);



CREATE POLICY "eval_insert" ON "public"."evaluaciones_pruebas" FOR INSERT WITH CHECK (true);



CREATE POLICY "eval_select" ON "public"."evaluaciones_pruebas" FOR SELECT USING (true);



CREATE POLICY "eval_update" ON "public"."evaluaciones_pruebas" FOR UPDATE USING (true);



ALTER TABLE "public"."evaluaciones_pruebas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."evento_convocados" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."evento_recordatorios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."eventos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "eventos_all" ON "public"."eventos" USING (true) WITH CHECK (true);



ALTER TABLE "public"."grupos_entrenamiento" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."grupos_mision" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."grupos_mision_miembros" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."misiones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notas_coach" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."observaciones_cancha" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."padres_atletas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pagos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."progreso_misiones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recomp_insert" ON "public"."recompensas_desbloqueadas" FOR INSERT WITH CHECK (true);



CREATE POLICY "recomp_select" ON "public"."recompensas_desbloqueadas" FOR SELECT USING (true);



CREATE POLICY "recomp_update" ON "public"."recompensas_desbloqueadas" FOR UPDATE USING (true);



ALTER TABLE "public"."recompensas_desbloqueadas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recordatorios_all" ON "public"."evento_recordatorios" USING (true) WITH CHECK (true);



ALTER TABLE "public"."screening_funcional" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "screening_funcional_delete_policy" ON "public"."screening_funcional" FOR DELETE USING (true);



CREATE POLICY "screening_funcional_insert_policy" ON "public"."screening_funcional" FOR INSERT WITH CHECK (true);



CREATE POLICY "screening_funcional_select_policy" ON "public"."screening_funcional" FOR SELECT USING (true);



CREATE POLICY "screening_funcional_update_policy" ON "public"."screening_funcional" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."sesiones_control" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sesiones_entrenamiento_delete_policy" ON "public"."sesiones_entrenamiento" FOR DELETE USING (true);



CREATE POLICY "sesiones_entrenamiento_insert_policy" ON "public"."sesiones_entrenamiento" FOR INSERT WITH CHECK (true);



CREATE POLICY "sesiones_entrenamiento_select_policy" ON "public"."sesiones_entrenamiento" FOR SELECT USING (true);



CREATE POLICY "sesiones_entrenamiento_update_policy" ON "public"."sesiones_entrenamiento" FOR UPDATE USING (true) WITH CHECK (true);



ALTER TABLE "public"."sesiones_programadas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usuarios" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."calcular_categoria_feb"("p_fecha_nac" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."calcular_categoria_feb"("p_fecha_nac" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calcular_categoria_feb"("p_fecha_nac" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolver_audiencia"("p_segmento_tipo" "text", "p_params" "jsonb", "p_incluir_reps" boolean, "p_club" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolver_audiencia"("p_segmento_tipo" "text", "p_params" "jsonb", "p_incluir_reps" boolean, "p_club" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolver_audiencia"("p_segmento_tipo" "text", "p_params" "jsonb", "p_incluir_reps" boolean, "p_club" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolver_email_login"("p_identificador" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolver_email_login"("p_identificador" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolver_email_login"("p_identificador" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."asistencia" TO "anon";
GRANT ALL ON TABLE "public"."asistencia" TO "authenticated";
GRANT ALL ON TABLE "public"."asistencia" TO "service_role";



GRANT ALL ON TABLE "public"."atleta_grupo" TO "anon";
GRANT ALL ON TABLE "public"."atleta_grupo" TO "authenticated";
GRANT ALL ON TABLE "public"."atleta_grupo" TO "service_role";



GRANT ALL ON TABLE "public"."atleta_readiness" TO "anon";
GRANT ALL ON TABLE "public"."atleta_readiness" TO "authenticated";
GRANT ALL ON TABLE "public"."atleta_readiness" TO "service_role";



GRANT ALL ON TABLE "public"."atletas" TO "anon";
GRANT ALL ON TABLE "public"."atletas" TO "authenticated";
GRANT ALL ON TABLE "public"."atletas" TO "service_role";



GRANT ALL ON TABLE "public"."catalogo_ejercicios" TO "anon";
GRANT ALL ON TABLE "public"."catalogo_ejercicios" TO "authenticated";
GRANT ALL ON TABLE "public"."catalogo_ejercicios" TO "service_role";



GRANT ALL ON TABLE "public"."catalogo_sesiones" TO "anon";
GRANT ALL ON TABLE "public"."catalogo_sesiones" TO "authenticated";
GRANT ALL ON TABLE "public"."catalogo_sesiones" TO "service_role";



GRANT ALL ON TABLE "public"."comunicacion_destinatarios" TO "anon";
GRANT ALL ON TABLE "public"."comunicacion_destinatarios" TO "authenticated";
GRANT ALL ON TABLE "public"."comunicacion_destinatarios" TO "service_role";



GRANT ALL ON TABLE "public"."comunicaciones" TO "anon";
GRANT ALL ON TABLE "public"."comunicaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."comunicaciones" TO "service_role";



GRANT ALL ON TABLE "public"."ejercicios_catalogo" TO "anon";
GRANT ALL ON TABLE "public"."ejercicios_catalogo" TO "authenticated";
GRANT ALL ON TABLE "public"."ejercicios_catalogo" TO "service_role";



GRANT ALL ON TABLE "public"."encuestas_habitos" TO "anon";
GRANT ALL ON TABLE "public"."encuestas_habitos" TO "authenticated";
GRANT ALL ON TABLE "public"."encuestas_habitos" TO "service_role";



GRANT ALL ON TABLE "public"."evaluaciones_pruebas" TO "anon";
GRANT ALL ON TABLE "public"."evaluaciones_pruebas" TO "authenticated";
GRANT ALL ON TABLE "public"."evaluaciones_pruebas" TO "service_role";



GRANT ALL ON TABLE "public"."evento_convocados" TO "anon";
GRANT ALL ON TABLE "public"."evento_convocados" TO "authenticated";
GRANT ALL ON TABLE "public"."evento_convocados" TO "service_role";



GRANT ALL ON TABLE "public"."evento_recordatorios" TO "anon";
GRANT ALL ON TABLE "public"."evento_recordatorios" TO "authenticated";
GRANT ALL ON TABLE "public"."evento_recordatorios" TO "service_role";



GRANT ALL ON TABLE "public"."eventos" TO "anon";
GRANT ALL ON TABLE "public"."eventos" TO "authenticated";
GRANT ALL ON TABLE "public"."eventos" TO "service_role";



GRANT ALL ON TABLE "public"."grupos_entrenamiento" TO "anon";
GRANT ALL ON TABLE "public"."grupos_entrenamiento" TO "authenticated";
GRANT ALL ON TABLE "public"."grupos_entrenamiento" TO "service_role";



GRANT ALL ON TABLE "public"."grupos_mision" TO "anon";
GRANT ALL ON TABLE "public"."grupos_mision" TO "authenticated";
GRANT ALL ON TABLE "public"."grupos_mision" TO "service_role";



GRANT ALL ON TABLE "public"."grupos_mision_miembros" TO "anon";
GRANT ALL ON TABLE "public"."grupos_mision_miembros" TO "authenticated";
GRANT ALL ON TABLE "public"."grupos_mision_miembros" TO "service_role";



GRANT ALL ON TABLE "public"."misiones" TO "anon";
GRANT ALL ON TABLE "public"."misiones" TO "authenticated";
GRANT ALL ON TABLE "public"."misiones" TO "service_role";



GRANT ALL ON TABLE "public"."notas_coach" TO "anon";
GRANT ALL ON TABLE "public"."notas_coach" TO "authenticated";
GRANT ALL ON TABLE "public"."notas_coach" TO "service_role";



GRANT ALL ON TABLE "public"."observaciones_cancha" TO "anon";
GRANT ALL ON TABLE "public"."observaciones_cancha" TO "authenticated";
GRANT ALL ON TABLE "public"."observaciones_cancha" TO "service_role";



GRANT ALL ON TABLE "public"."padres_atletas" TO "anon";
GRANT ALL ON TABLE "public"."padres_atletas" TO "authenticated";
GRANT ALL ON TABLE "public"."padres_atletas" TO "service_role";



GRANT ALL ON TABLE "public"."pagos" TO "anon";
GRANT ALL ON TABLE "public"."pagos" TO "authenticated";
GRANT ALL ON TABLE "public"."pagos" TO "service_role";



GRANT ALL ON TABLE "public"."progreso_misiones" TO "anon";
GRANT ALL ON TABLE "public"."progreso_misiones" TO "authenticated";
GRANT ALL ON TABLE "public"."progreso_misiones" TO "service_role";



GRANT ALL ON TABLE "public"."recompensas_desbloqueadas" TO "anon";
GRANT ALL ON TABLE "public"."recompensas_desbloqueadas" TO "authenticated";
GRANT ALL ON TABLE "public"."recompensas_desbloqueadas" TO "service_role";



GRANT ALL ON TABLE "public"."screening_funcional" TO "anon";
GRANT ALL ON TABLE "public"."screening_funcional" TO "authenticated";
GRANT ALL ON TABLE "public"."screening_funcional" TO "service_role";



GRANT ALL ON TABLE "public"."sesiones_control" TO "anon";
GRANT ALL ON TABLE "public"."sesiones_control" TO "authenticated";
GRANT ALL ON TABLE "public"."sesiones_control" TO "service_role";



GRANT ALL ON TABLE "public"."sesiones_entrenamiento" TO "anon";
GRANT ALL ON TABLE "public"."sesiones_entrenamiento" TO "authenticated";
GRANT ALL ON TABLE "public"."sesiones_entrenamiento" TO "service_role";



GRANT ALL ON TABLE "public"."sesiones_programadas" TO "anon";
GRANT ALL ON TABLE "public"."sesiones_programadas" TO "authenticated";
GRANT ALL ON TABLE "public"."sesiones_programadas" TO "service_role";



GRANT ALL ON TABLE "public"."usuarios" TO "anon";
GRANT ALL ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







