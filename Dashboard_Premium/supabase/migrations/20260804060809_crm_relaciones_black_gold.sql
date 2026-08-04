-- ============================================================================
-- CRM de relaciones Black Gold
--
-- CRM comercial independiente de usuarios, atletas y representantes.  Las
-- tablas deportivas existentes contienen datos de menores y no son un CRM:
-- esta migración jamás copia ni resuelve sus teléfonos, correos o documentos.
-- La correlación con una cuenta de la app es opcional, explícita y solo guarda
-- el UUID de usuarios.id tras una verificación en el adaptador confiable.
--
-- El teléfono/identificador de WhatsApp vive únicamente en
-- crm_contacto_canales, una tabla sin acceso para anon/authenticated.  Las
-- herramientas MCP reciben y devuelven crm_contactos.id, nunca ese valor.
-- Las entradas WhatsApp/Web/App deben llegar desde una Edge Function o
-- adaptador de servidor que use crm_recibir_contacto_canal con service_role.
-- No exponer esta RPC ni la service_role key al navegador.
--
-- Inspiración de dominio: oportunidad separada del contacto, etapas
-- controladas y actividades con vencimiento. Es una implementación propia y
-- pequeña para Black Gold; no incorpora ni copia código de Odoo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crm_etapas_oportunidad (
  codigo text PRIMARY KEY CHECK (codigo IN (
    'nuevo',
    'interes_identificado',
    'calificado',
    'prueba_o_visita',
    'inscripcion_en_proceso',
    'ganado',
    'perdido',
    'no_contactar'
  )),
  nombre text NOT NULL,
  orden smallint NOT NULL UNIQUE CHECK (orden > 0),
  es_cierre boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.crm_etapas_oportunidad (codigo, nombre, orden, es_cierre)
VALUES
  ('nuevo', 'Nuevo', 10, false),
  ('interes_identificado', 'Interés identificado', 20, false),
  ('calificado', 'Calificado', 30, false),
  ('prueba_o_visita', 'Prueba o visita', 40, false),
  ('inscripcion_en_proceso', 'Inscripción en proceso', 50, false),
  ('ganado', 'Ganado', 60, true),
  ('perdido', 'Perdido', 70, true),
  ('no_contactar', 'No contactar', 80, true)
ON CONFLICT (codigo) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      orden = EXCLUDED.orden,
      es_cierre = EXCLUDED.es_cierre;

CREATE TABLE IF NOT EXISTS public.crm_contactos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club text NOT NULL DEFAULT 'Black Gold' CHECK (btrim(club) <> ''),
  tipo_relacion text NOT NULL DEFAULT 'lead' CHECK (tipo_relacion IN (
    'interno', 'lead', 'cliente', 'no_contactar'
  )),
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'archivado')),
  nombre_preferido text CHECK (nombre_preferido IS NULL OR (
    char_length(btrim(nombre_preferido)) BETWEEN 1 AND 120
  )),
  -- Correlación opcional: nunca se usa para copiar identificadores de login ni
  -- datos de atletas/representantes al CRM comercial.
  app_usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  origen_inicial text NOT NULL DEFAULT 'whatsapp' CHECK (origen_inicial IN (
    'whatsapp', 'web_chat', 'app', 'manual'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_contactos_club_tipo
  ON public.crm_contactos (club, tipo_relacion, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_contactos_app_usuario
  ON public.crm_contactos (app_usuario_id)
  WHERE app_usuario_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_contactos_club_app_usuario
  ON public.crm_contactos (club, app_usuario_id)
  WHERE app_usuario_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_contacto_canales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.crm_contactos(id) ON DELETE CASCADE,
  club text NOT NULL DEFAULT 'Black Gold' CHECK (btrim(club) <> ''),
  canal text NOT NULL CHECK (canal IN ('whatsapp', 'web_chat', 'app', 'manual')),
  -- Dato de contacto deliberadamente aislado. No se selecciona desde el MCP.
  identificador_normalizado text NOT NULL CHECK (
    char_length(identificador_normalizado) BETWEEN 1 AND 160
  ),
  es_principal boolean NOT NULL DEFAULT true,
  verificado_at timestamptz,
  ultimo_contacto_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club, canal, identificador_normalizado)
);

CREATE INDEX IF NOT EXISTS idx_crm_canales_contacto
  ON public.crm_contacto_canales (contact_id, canal, es_principal DESC);

CREATE TABLE IF NOT EXISTS public.crm_preferencias (
  contact_id uuid PRIMARY KEY REFERENCES public.crm_contactos(id) ON DELETE CASCADE,
  tratamiento_preferido text CHECK (tratamiento_preferido IS NULL OR char_length(tratamiento_preferido) <= 80),
  canal_preferido text CHECK (canal_preferido IS NULL OR canal_preferido IN ('whatsapp', 'web_chat', 'app', 'manual')),
  franja_preferida text CHECK (franja_preferida IS NULL OR char_length(franja_preferida) <= 120),
  estilo_mensaje_preferido text CHECK (estilo_mensaje_preferido IS NULL OR char_length(estilo_mensaje_preferido) <= 120),
  notas_operativas text CHECK (notas_operativas IS NULL OR char_length(notas_operativas) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_consentimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.crm_contactos(id) ON DELETE CASCADE,
  alcance text NOT NULL CHECK (alcance IN ('atencion', 'seguimiento', 'marketing')),
  estado text NOT NULL CHECK (estado IN ('otorgado', 'revocado')),
  version_politica text NOT NULL CHECK (char_length(btrim(version_politica)) BETWEEN 1 AND 80),
  evidencia_ref text CHECK (evidencia_ref IS NULL OR char_length(evidencia_ref) <= 180),
  registrado_por text NOT NULL CHECK (registrado_por ~ '^[a-z0-9_-]{2,64}$'),
  registrado_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, alcance)
);

CREATE INDEX IF NOT EXISTS idx_crm_consentimientos_contacto
  ON public.crm_consentimientos (contact_id, alcance, estado);

CREATE TABLE IF NOT EXISTS public.crm_oportunidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.crm_contactos(id) ON DELETE RESTRICT,
  club text NOT NULL DEFAULT 'Black Gold' CHECK (btrim(club) <> ''),
  etapa_codigo text NOT NULL DEFAULT 'nuevo'
    REFERENCES public.crm_etapas_oportunidad(codigo),
  origen text NOT NULL CHECK (origen IN ('whatsapp', 'web_chat', 'app', 'manual')),
  interes_principal text CHECK (interes_principal IS NULL OR interes_principal IN (
    'informacion_general', 'clases', 'horarios', 'inscripcion', 'prueba', 'soporte', 'otro'
  )),
  proximo_paso_en timestamptz,
  etapa_actualizada_at timestamptz NOT NULL DEFAULT now(),
  cerrada_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_oportunidades_pipeline
  ON public.crm_oportunidades (club, etapa_codigo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_oportunidades_contacto
  ON public.crm_oportunidades (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_oportunidades_proximo_paso
  ON public.crm_oportunidades (club, proximo_paso_en)
  WHERE proximo_paso_en IS NOT NULL;

-- The club value is duplicated on channels and opportunities for efficient
-- filtering. These composite FKs ensure it always matches the owning contact.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.crm_contactos'::regclass
      AND conname = 'crm_contactos_id_club_key'
  ) THEN
    ALTER TABLE public.crm_contactos
      ADD CONSTRAINT crm_contactos_id_club_key UNIQUE (id, club);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.crm_contacto_canales'::regclass
      AND conname = 'crm_contacto_canales_contacto_club_fkey'
  ) THEN
    ALTER TABLE public.crm_contacto_canales
      ADD CONSTRAINT crm_contacto_canales_contacto_club_fkey
      FOREIGN KEY (contact_id, club) REFERENCES public.crm_contactos (id, club)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.crm_oportunidades'::regclass
      AND conname = 'crm_oportunidades_contacto_club_fkey'
  ) THEN
    ALTER TABLE public.crm_oportunidades
      ADD CONSTRAINT crm_oportunidades_contacto_club_fkey
      FOREIGN KEY (contact_id, club) REFERENCES public.crm_contactos (id, club)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.crm_interacciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.crm_contactos(id) ON DELETE RESTRICT,
  oportunidad_id uuid REFERENCES public.crm_oportunidades(id) ON DELETE SET NULL,
  canal text NOT NULL CHECK (canal IN ('whatsapp', 'web_chat', 'app', 'manual')),
  sentido text NOT NULL CHECK (sentido IN ('entrada', 'salida', 'nota_interna')),
  intencion text CHECK (intencion IS NULL OR intencion IN (
    'informacion_general', 'clases', 'horarios', 'inscripcion', 'prueba', 'soporte', 'seguimiento', 'otro'
  )),
  -- Solo un resumen operativo, no el transcript ni adjuntos del canal externo.
  resumen_operativo text CHECK (resumen_operativo IS NULL OR char_length(resumen_operativo) <= 1000),
  mensaje_externo_ref text CHECK (mensaje_externo_ref IS NULL OR (
    char_length(mensaje_externo_ref) <= 180
    AND mensaje_externo_ref ~ '^[A-Za-z0-9._:-]+$'
  )),
  -- Confirmación mínima de que el evento ya llegó a Lily. No almacena el
  -- transcript ni el teléfono; permite reintentar sólo las entregas fallidas.
  lily_entregado_at timestamptz,
  registrado_por text NOT NULL CHECK (registrado_por ~ '^[a-z0-9_-]{2,64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Los mensajes sin ID externo también se registran; los NULL no participan
  -- en la idempotencia, como corresponde para una nota/manual sin webhook.
  UNIQUE (canal, mensaje_externo_ref)
);

CREATE INDEX IF NOT EXISTS idx_crm_interacciones_contacto
  ON public.crm_interacciones (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_interacciones_oportunidad
  ON public.crm_interacciones (oportunidad_id, created_at DESC)
  WHERE oportunidad_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_interacciones_lily_pendiente
  ON public.crm_interacciones (canal, created_at)
  WHERE sentido = 'entrada'
    AND mensaje_externo_ref IS NOT NULL
    AND lily_entregado_at IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_actividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.crm_contactos(id) ON DELETE RESTRICT,
  oportunidad_id uuid REFERENCES public.crm_oportunidades(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('seguimiento', 'llamada', 'prueba_o_visita', 'documentacion', 'otro')),
  asunto text NOT NULL CHECK (char_length(btrim(asunto)) BETWEEN 1 AND 240),
  vencimiento_at timestamptz NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'completada', 'cancelada')),
  asignado_a text NOT NULL CHECK (asignado_a ~ '^[a-z0-9_-]{2,64}$'),
  completada_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_actividades_pendientes
  ON public.crm_actividades (asignado_a, vencimiento_at)
  WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_crm_actividades_contacto
  ON public.crm_actividades (contact_id, vencimiento_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club text NOT NULL DEFAULT 'Black Gold' CHECK (btrim(club) <> ''),
  entidad_tipo text NOT NULL CHECK (entidad_tipo IN ('contacto', 'oportunidad', 'preferencia', 'consentimiento', 'actividad')),
  entidad_id uuid NOT NULL,
  accion text NOT NULL CHECK (char_length(btrim(accion)) BETWEEN 1 AND 120),
  actor text NOT NULL CHECK (actor ~ '^[a-z0-9_-]{2,64}$'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_auditoria_entidad
  ON public.crm_auditoria (entidad_tipo, entidad_id, created_at DESC);

COMMENT ON TABLE public.crm_contactos IS
  'CRM comercial de Black Gold. No reutiliza ni duplica usuarios, atletas o representantes.';
COMMENT ON TABLE public.crm_contacto_canales IS
  'Canales privados (incluido WhatsApp normalizado). Sin acceso de navegador o MCP; solo adaptadores confiables con service_role.';
COMMENT ON TABLE public.crm_interacciones IS
  'Registro operativo mínimo: no guardar transcript, adjuntos ni teléfono en el resumen.';

DROP TRIGGER IF EXISTS trg_crm_contactos_updated_at ON public.crm_contactos;
CREATE TRIGGER trg_crm_contactos_updated_at
  BEFORE UPDATE ON public.crm_contactos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_canales_updated_at ON public.crm_contacto_canales;
CREATE TRIGGER trg_crm_canales_updated_at
  BEFORE UPDATE ON public.crm_contacto_canales
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_preferencias_updated_at ON public.crm_preferencias;
CREATE TRIGGER trg_crm_preferencias_updated_at
  BEFORE UPDATE ON public.crm_preferencias
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_consentimientos_updated_at ON public.crm_consentimientos;
CREATE TRIGGER trg_crm_consentimientos_updated_at
  BEFORE UPDATE ON public.crm_consentimientos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_oportunidades_updated_at ON public.crm_oportunidades;
CREATE TRIGGER trg_crm_oportunidades_updated_at
  BEFORE UPDATE ON public.crm_oportunidades
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_actividades_updated_at ON public.crm_actividades;
CREATE TRIGGER trg_crm_actividades_updated_at
  BEFORE UPDATE ON public.crm_actividades
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- El CRM todavía no tiene interfaz web. Habilitamos RLS y negamos por defecto
-- todo acceso de anon/authenticated. Al construir el panel habrá políticas y
-- vistas de mínimo privilegio específicas; no se abrirán estas tablas crudas.
ALTER TABLE public.crm_etapas_oportunidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contactos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacto_canales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_preferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_consentimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_oportunidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_interacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_actividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_auditoria ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.crm_etapas_oportunidad,
  public.crm_contactos,
  public.crm_contacto_canales,
  public.crm_preferencias,
  public.crm_consentimientos,
  public.crm_oportunidades,
  public.crm_interacciones,
  public.crm_actividades,
  public.crm_auditoria
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.crm_etapas_oportunidad,
  public.crm_contactos,
  public.crm_contacto_canales,
  public.crm_preferencias,
  public.crm_consentimientos,
  public.crm_oportunidades,
  public.crm_interacciones,
  public.crm_actividades,
  public.crm_auditoria
  TO service_role;

-- Entrada idempotente de un adaptador de canal confiable. Recibe el
-- identificador privado para hacer el match y devuelve únicamente UUIDs y
-- contexto operativo. El navegador y el MCP jamás deben llamar esta función.
CREATE OR REPLACE FUNCTION public.crm_recibir_contacto_canal(
  p_club text,
  p_canal text,
  p_identificador_normalizado text,
  p_nombre_preferido text DEFAULT NULL,
  p_interes_principal text DEFAULT NULL,
  p_mensaje_externo_ref text DEFAULT NULL,
  p_app_usuario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club text := btrim(COALESCE(p_club, ''));
  v_canal text := btrim(COALESCE(p_canal, ''));
  v_identificador text := btrim(COALESCE(p_identificador_normalizado, ''));
  v_nombre text := NULLIF(btrim(COALESCE(p_nombre_preferido, '')), '');
  v_interes text := NULLIF(btrim(COALESCE(p_interes_principal, '')), '');
  v_referencia text := NULLIF(btrim(COALESCE(p_mensaje_externo_ref, '')), '');
  v_contacto public.crm_contactos%ROWTYPE;
  v_oportunidad public.crm_oportunidades%ROWTYPE;
  v_interaccion public.crm_interacciones%ROWTYPE;
  v_canal_existe boolean := false;
  v_app_usuario_valido boolean := false;
BEGIN
  IF char_length(v_club) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Club inválido.';
  END IF;
  IF v_canal NOT IN ('whatsapp', 'web_chat', 'app', 'manual') THEN
    RAISE EXCEPTION 'Canal CRM inválido.';
  END IF;
  IF char_length(v_identificador) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Identificador de canal inválido.';
  END IF;
  IF v_canal = 'whatsapp' AND v_identificador !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'El identificador de WhatsApp debe estar normalizado en E.164.';
  END IF;
  IF v_canal IN ('web_chat', 'app', 'manual')
     AND v_identificador !~ '^[A-Za-z0-9._:-]{8,160}$' THEN
    RAISE EXCEPTION 'El identificador del canal debe ser un ID estable, no texto libre.';
  END IF;
  IF v_nombre IS NOT NULL AND char_length(v_nombre) > 120 THEN
    RAISE EXCEPTION 'Nombre preferido demasiado largo.';
  END IF;
  IF v_interes IS NOT NULL AND v_interes NOT IN (
    'informacion_general', 'clases', 'horarios', 'inscripcion', 'prueba', 'soporte', 'otro'
  ) THEN
    RAISE EXCEPTION 'Interés CRM inválido.';
  END IF;
  IF v_referencia IS NOT NULL AND (
    char_length(v_referencia) > 180 OR v_referencia !~ '^[A-Za-z0-9._:-]+$'
  ) THEN
    RAISE EXCEPTION 'Referencia externa inválida.';
  END IF;

  -- Evita duplicados cuando un webhook se reintenta o dos eventos del mismo
  -- número llegan casi al mismo tiempo. Una colisión del hash solo serializa.
  PERFORM pg_advisory_xact_lock(hashtext(v_club || E'\x1f' || v_canal || E'\x1f' || v_identificador));
  -- El proveedor puede reintentar el mismo mensaje y, en casos raros, los
  -- reintentos llegar en paralelo por rutas distintas. El lock del evento evita
  -- que ambos pasen la comprobación de idempotencia antes de insertar.
  IF v_referencia IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('crm_evento' || E'\x1f' || v_canal || E'\x1f' || v_referencia));
  END IF;

  IF p_app_usuario_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(
      'crm_app_usuario' || E'\x1f' || v_club || E'\x1f' || p_app_usuario_id::text
    ));
    SELECT EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = p_app_usuario_id AND u.club = v_club
    ) INTO v_app_usuario_valido;
    IF NOT v_app_usuario_valido THEN
      RAISE EXCEPTION 'La correlación con la app no pertenece al club indicado.';
    END IF;
  END IF;

  -- Idempotencia ANTES de crear/actualizar contacto, oportunidad o auditoría.
  -- Una entrega que llegó a Lily no se vuelve a pasar; si Lily no confirmó,
  -- debe_responder queda true para que Meta pueda reintentarla.
  IF v_referencia IS NOT NULL THEN
    SELECT i.* INTO v_interaccion
    FROM public.crm_interacciones i
    WHERE i.canal = v_canal
      AND i.mensaje_externo_ref = v_referencia
    FOR UPDATE;

    IF v_interaccion.id IS NOT NULL THEN
      SELECT * INTO v_contacto
      FROM public.crm_contactos
      WHERE id = v_interaccion.contact_id
      FOR UPDATE;
      IF v_contacto.id IS NULL OR v_contacto.club <> v_club THEN
        RAISE EXCEPTION 'La referencia externa no pertenece al club indicado.';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.crm_contacto_canales ch
        WHERE ch.contact_id = v_contacto.id
          AND ch.club = v_club
          AND ch.canal = v_canal
          AND ch.identificador_normalizado = v_identificador
      ) THEN
        RAISE EXCEPTION 'La referencia externa no coincide con el canal indicado.';
      END IF;
      IF v_interaccion.oportunidad_id IS NOT NULL THEN
        SELECT * INTO v_oportunidad
        FROM public.crm_oportunidades
        WHERE id = v_interaccion.oportunidad_id;
      END IF;
      RETURN jsonb_build_object(
        'contact_id', v_contacto.id,
        'oportunidad_id', v_oportunidad.id,
        'ruta', CASE
          WHEN v_contacto.tipo_relacion = 'interno' THEN 'interno'
          WHEN v_contacto.tipo_relacion = 'cliente' THEN 'cliente'
          WHEN v_contacto.tipo_relacion = 'no_contactar' THEN 'no_contactar'
          ELSE 'lead'
        END,
        'tipo_relacion', v_contacto.tipo_relacion,
        'etapa_codigo', v_oportunidad.etapa_codigo,
        'nombre_preferido', v_contacto.nombre_preferido,
        'ya_procesado', true,
        'debe_responder', v_contacto.tipo_relacion <> 'no_contactar'
          AND v_interaccion.lily_entregado_at IS NULL
      );
    END IF;
  END IF;

  SELECT c.* INTO v_contacto
  FROM public.crm_contactos c
  JOIN public.crm_contacto_canales ch ON ch.contact_id = c.id
  WHERE ch.club = v_club
    AND ch.canal = v_canal
    AND ch.identificador_normalizado = v_identificador
  FOR UPDATE OF c;

  IF v_contacto.id IS NULL AND p_app_usuario_id IS NOT NULL THEN
    SELECT c.* INTO v_contacto
    FROM public.crm_contactos c
    WHERE c.club = v_club AND c.app_usuario_id = p_app_usuario_id
    FOR UPDATE;
  END IF;

  IF v_contacto.id IS NULL THEN
    INSERT INTO public.crm_contactos (
      club, tipo_relacion, estado, nombre_preferido, app_usuario_id, origen_inicial
    ) VALUES (
      v_club, 'lead', 'activo', v_nombre, p_app_usuario_id, v_canal
    )
    RETURNING * INTO v_contacto;
  ELSIF p_app_usuario_id IS NOT NULL AND v_contacto.app_usuario_id IS NULL THEN
    UPDATE public.crm_contactos
       SET app_usuario_id = p_app_usuario_id
     WHERE id = v_contacto.id
    RETURNING * INTO v_contacto;
  ELSIF p_app_usuario_id IS NOT NULL AND v_contacto.app_usuario_id <> p_app_usuario_id THEN
    RAISE EXCEPTION 'El contacto ya está correlacionado con otra cuenta de la app.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.crm_contacto_canales ch
    WHERE ch.club = v_club
      AND ch.canal = v_canal
      AND ch.identificador_normalizado = v_identificador
  ) INTO v_canal_existe;

  IF v_canal_existe THEN
    UPDATE public.crm_contacto_canales
       SET ultimo_contacto_at = now()
     WHERE club = v_club
       AND canal = v_canal
       AND identificador_normalizado = v_identificador;
  ELSE
    INSERT INTO public.crm_contacto_canales (
      contact_id, club, canal, identificador_normalizado, es_principal
    ) VALUES (v_contacto.id, v_club, v_canal, v_identificador, true);
  END IF;

  IF v_nombre IS NOT NULL AND v_contacto.nombre_preferido IS NULL THEN
    UPDATE public.crm_contactos
       SET nombre_preferido = v_nombre
     WHERE id = v_contacto.id
    RETURNING * INTO v_contacto;
  END IF;

  -- Registra el ID externo antes de cualquier retorno por tipo de contacto.
  -- Así un reintento de un mensaje interno o bloqueado no vuelve a llegar a
  -- Lily, y un fallo de entrega sí puede reintentarse hasta ser confirmado.
  INSERT INTO public.crm_interacciones (
    contact_id, oportunidad_id, canal, sentido, intencion, mensaje_externo_ref, registrado_por
  ) VALUES (
    v_contacto.id, NULL, v_canal, 'entrada', v_interes, v_referencia, 'adaptador'
  )
  RETURNING * INTO v_interaccion;

  IF v_contacto.tipo_relacion = 'no_contactar' THEN
    INSERT INTO public.crm_auditoria (club, entidad_tipo, entidad_id, accion, actor, metadata)
    VALUES (v_club, 'contacto', v_contacto.id, 'entrada_bloqueada_no_contactar', 'adaptador',
      jsonb_build_object('canal', v_canal));
    RETURN jsonb_build_object(
      'contact_id', v_contacto.id,
      'ruta', 'no_contactar',
      'tipo_relacion', v_contacto.tipo_relacion,
      'ya_procesado', false,
      'debe_responder', false
    );
  END IF;

  IF v_contacto.tipo_relacion = 'interno' THEN
    INSERT INTO public.crm_auditoria (club, entidad_tipo, entidad_id, accion, actor, metadata)
    VALUES (v_club, 'contacto', v_contacto.id, 'entrada_interna_recibida', 'adaptador',
      jsonb_build_object('canal', v_canal));
    RETURN jsonb_build_object(
      'contact_id', v_contacto.id,
      'ruta', 'interno',
      'tipo_relacion', v_contacto.tipo_relacion,
      'nombre_preferido', v_contacto.nombre_preferido,
      'ya_procesado', false,
      'debe_responder', true
    );
  END IF;

  IF v_contacto.tipo_relacion = 'lead' THEN
    SELECT o.* INTO v_oportunidad
    FROM public.crm_oportunidades o
    WHERE o.contact_id = v_contacto.id
      AND o.etapa_codigo NOT IN ('ganado', 'perdido', 'no_contactar')
    ORDER BY o.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_oportunidad.id IS NULL THEN
      INSERT INTO public.crm_oportunidades (
        contact_id, club, etapa_codigo, origen, interes_principal
      ) VALUES (
        v_contacto.id, v_club, 'nuevo', v_canal, v_interes
      )
      RETURNING * INTO v_oportunidad;
    ELSIF v_interes IS NOT NULL AND v_oportunidad.interes_principal IS NULL THEN
      UPDATE public.crm_oportunidades
         SET interes_principal = v_interes
       WHERE id = v_oportunidad.id
      RETURNING * INTO v_oportunidad;
    END IF;
  END IF;

  -- La recepción se insertó antes de las rutas interno/no_contactar para poder
  -- deduplicar todas las entregas. En leads/clientes se vincula a la
  -- oportunidad resuelta sin crear un segundo registro.
  UPDATE public.crm_interacciones
     SET oportunidad_id = v_oportunidad.id
   WHERE id = v_interaccion.id
  RETURNING * INTO v_interaccion;

  INSERT INTO public.crm_auditoria (club, entidad_tipo, entidad_id, accion, actor, metadata)
  VALUES (v_club, 'contacto', v_contacto.id, 'entrada_canal_registrada', 'adaptador',
    jsonb_build_object('canal', v_canal, 'tipo_relacion', v_contacto.tipo_relacion));

  RETURN jsonb_build_object(
    'contact_id', v_contacto.id,
    'oportunidad_id', v_oportunidad.id,
    'ruta', CASE WHEN v_contacto.tipo_relacion = 'cliente' THEN 'cliente' ELSE 'lead' END,
    'tipo_relacion', v_contacto.tipo_relacion,
    'etapa_codigo', v_oportunidad.etapa_codigo,
    'nombre_preferido', v_contacto.nombre_preferido,
    'ya_procesado', false,
    'debe_responder', true
  );
END;
$$;

-- Actualiza una oportunidad siguiendo transiciones controladas. La función es
-- deliberadamente solo service_role porque el MCP no porta una sesión de app.
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
  -- El consentimiento de no contactar no es una transición comercial: exige
  -- motivo, auditoría y cancelación de seguimientos en la función dedicada.
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
    UPDATE public.crm_contactos SET tipo_relacion = 'cliente', estado = 'activo'
    WHERE id = v_oportunidad.contact_id;
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
      'actividades_canceladas', v_actividades_canceladas
    )));

  RETURN jsonb_build_object(
    'oportunidad_id', v_oportunidad.id,
    'contact_id', v_oportunidad.contact_id,
    'etapa_codigo', v_oportunidad.etapa_codigo,
    'proximo_paso_en', v_oportunidad.proximo_paso_en
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_registrar_interaccion(
  p_contact_id uuid,
  p_oportunidad_id uuid,
  p_canal text,
  p_sentido text,
  p_intencion text DEFAULT NULL,
  p_resumen_operativo text DEFAULT NULL,
  p_actor text DEFAULT 'lily'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contacto public.crm_contactos%ROWTYPE;
  v_interaccion public.crm_interacciones%ROWTYPE;
  v_canal text := btrim(COALESCE(p_canal, ''));
  v_sentido text := btrim(COALESCE(p_sentido, ''));
  v_intencion text := NULLIF(btrim(COALESCE(p_intencion, '')), '');
  v_resumen text := NULLIF(btrim(COALESCE(p_resumen_operativo, '')), '');
  v_actor text := btrim(COALESCE(p_actor, ''));
BEGIN
  IF p_contact_id IS NULL
     OR v_canal NOT IN ('whatsapp', 'web_chat', 'app', 'manual')
     OR v_sentido NOT IN ('entrada', 'salida', 'nota_interna')
     OR v_actor !~ '^[a-z0-9_-]{2,64}$' THEN
    RAISE EXCEPTION 'Parámetros de interacción CRM inválidos.';
  END IF;
  IF v_intencion IS NOT NULL AND v_intencion NOT IN (
    'informacion_general', 'clases', 'horarios', 'inscripcion', 'prueba', 'soporte', 'seguimiento', 'otro'
  ) THEN
    RAISE EXCEPTION 'Intención CRM inválida.';
  END IF;
  IF v_resumen IS NOT NULL AND char_length(v_resumen) > 1000 THEN
    RAISE EXCEPTION 'Resumen operativo demasiado largo.';
  END IF;

  SELECT * INTO v_contacto FROM public.crm_contactos WHERE id = p_contact_id FOR UPDATE;
  IF v_contacto.id IS NULL THEN
    RAISE EXCEPTION 'Contacto CRM inexistente.';
  END IF;
  IF v_contacto.tipo_relacion = 'no_contactar' AND v_sentido = 'salida' THEN
    RAISE EXCEPTION 'El contacto está marcado como no contactar.';
  END IF;
  IF p_oportunidad_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.crm_oportunidades o
    WHERE o.id = p_oportunidad_id AND o.contact_id = p_contact_id
  ) THEN
    RAISE EXCEPTION 'La oportunidad no pertenece al contacto.';
  END IF;

  INSERT INTO public.crm_interacciones (
    contact_id, oportunidad_id, canal, sentido, intencion, resumen_operativo, registrado_por
  ) VALUES (
    p_contact_id, p_oportunidad_id, v_canal, v_sentido, v_intencion, v_resumen, v_actor
  ) RETURNING * INTO v_interaccion;

  INSERT INTO public.crm_auditoria (club, entidad_tipo, entidad_id, accion, actor, metadata)
  VALUES (v_contacto.club, 'contacto', v_contacto.id, 'interaccion_registrada', v_actor,
    jsonb_build_object('interaccion_id', v_interaccion.id, 'canal', v_canal, 'sentido', v_sentido));

  RETURN jsonb_build_object(
    'interaccion_id', v_interaccion.id,
    'contact_id', v_interaccion.contact_id,
    'oportunidad_id', v_interaccion.oportunidad_id,
    'created_at', v_interaccion.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_actualizar_preferencias(
  p_contact_id uuid,
  p_tratamiento_preferido text DEFAULT NULL,
  p_canal_preferido text DEFAULT NULL,
  p_franja_preferida text DEFAULT NULL,
  p_estilo_mensaje_preferido text DEFAULT NULL,
  p_notas_operativas text DEFAULT NULL,
  p_actor text DEFAULT 'lily'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contacto public.crm_contactos%ROWTYPE;
  v_preferencias public.crm_preferencias%ROWTYPE;
  v_actor text := btrim(COALESCE(p_actor, ''));
BEGIN
  IF p_contact_id IS NULL OR v_actor !~ '^[a-z0-9_-]{2,64}$' THEN
    RAISE EXCEPTION 'Parámetros de preferencias CRM inválidos.';
  END IF;
  IF p_canal_preferido IS NOT NULL AND p_canal_preferido NOT IN ('whatsapp', 'web_chat', 'app', 'manual') THEN
    RAISE EXCEPTION 'Canal preferido inválido.';
  END IF;
  IF COALESCE(char_length(p_tratamiento_preferido), 0) > 80
     OR COALESCE(char_length(p_franja_preferida), 0) > 120
     OR COALESCE(char_length(p_estilo_mensaje_preferido), 0) > 120
     OR COALESCE(char_length(p_notas_operativas), 0) > 1000 THEN
    RAISE EXCEPTION 'Una preferencia CRM excede el tamaño permitido.';
  END IF;

  SELECT * INTO v_contacto FROM public.crm_contactos WHERE id = p_contact_id FOR UPDATE;
  IF v_contacto.id IS NULL THEN
    RAISE EXCEPTION 'Contacto CRM inexistente.';
  END IF;

  INSERT INTO public.crm_preferencias (
    contact_id, tratamiento_preferido, canal_preferido, franja_preferida,
    estilo_mensaje_preferido, notas_operativas
  ) VALUES (
    p_contact_id, p_tratamiento_preferido, p_canal_preferido, p_franja_preferida,
    p_estilo_mensaje_preferido, p_notas_operativas
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    tratamiento_preferido = COALESCE(EXCLUDED.tratamiento_preferido, crm_preferencias.tratamiento_preferido),
    canal_preferido = COALESCE(EXCLUDED.canal_preferido, crm_preferencias.canal_preferido),
    franja_preferida = COALESCE(EXCLUDED.franja_preferida, crm_preferencias.franja_preferida),
    estilo_mensaje_preferido = COALESCE(EXCLUDED.estilo_mensaje_preferido, crm_preferencias.estilo_mensaje_preferido),
    notas_operativas = COALESCE(EXCLUDED.notas_operativas, crm_preferencias.notas_operativas)
  RETURNING * INTO v_preferencias;

  INSERT INTO public.crm_auditoria (club, entidad_tipo, entidad_id, accion, actor, metadata)
  VALUES (v_contacto.club, 'preferencia', p_contact_id, 'preferencias_actualizadas', v_actor, '{}'::jsonb);

  RETURN jsonb_build_object(
    'contact_id', v_preferencias.contact_id,
    'tratamiento_preferido', v_preferencias.tratamiento_preferido,
    'canal_preferido', v_preferencias.canal_preferido,
    'franja_preferida', v_preferencias.franja_preferida,
    'estilo_mensaje_preferido', v_preferencias.estilo_mensaje_preferido
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_programar_actividad(
  p_contact_id uuid,
  p_oportunidad_id uuid,
  p_tipo text,
  p_asunto text,
  p_vencimiento_at timestamptz,
  p_asignado_a text,
  p_actor text DEFAULT 'lily'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contacto public.crm_contactos%ROWTYPE;
  v_actividad public.crm_actividades%ROWTYPE;
  v_tipo text := btrim(COALESCE(p_tipo, ''));
  v_asunto text := btrim(COALESCE(p_asunto, ''));
  v_asignado text := btrim(COALESCE(p_asignado_a, ''));
  v_actor text := btrim(COALESCE(p_actor, ''));
BEGIN
  IF p_contact_id IS NULL
     OR v_tipo NOT IN ('seguimiento', 'llamada', 'prueba_o_visita', 'documentacion', 'otro')
     OR char_length(v_asunto) NOT BETWEEN 1 AND 240
     OR p_vencimiento_at IS NULL
     OR v_asignado !~ '^[a-z0-9_-]{2,64}$'
     OR v_actor !~ '^[a-z0-9_-]{2,64}$' THEN
    RAISE EXCEPTION 'Parámetros de actividad CRM inválidos.';
  END IF;

  SELECT * INTO v_contacto FROM public.crm_contactos WHERE id = p_contact_id FOR UPDATE;
  IF v_contacto.id IS NULL OR v_contacto.tipo_relacion = 'no_contactar' THEN
    RAISE EXCEPTION 'No se puede programar seguimiento para este contacto.';
  END IF;
  IF p_oportunidad_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.crm_oportunidades o WHERE o.id = p_oportunidad_id AND o.contact_id = p_contact_id
  ) THEN
    RAISE EXCEPTION 'La oportunidad no pertenece al contacto.';
  END IF;

  INSERT INTO public.crm_actividades (
    contact_id, oportunidad_id, tipo, asunto, vencimiento_at, asignado_a
  ) VALUES (
    p_contact_id, p_oportunidad_id, v_tipo, v_asunto, p_vencimiento_at, v_asignado
  ) RETURNING * INTO v_actividad;

  INSERT INTO public.crm_auditoria (club, entidad_tipo, entidad_id, accion, actor, metadata)
  VALUES (v_contacto.club, 'actividad', v_actividad.id, 'actividad_programada', v_actor,
    jsonb_build_object('contact_id', p_contact_id, 'tipo', v_tipo, 'asignado_a', v_asignado));

  RETURN jsonb_build_object(
    'actividad_id', v_actividad.id,
    'contact_id', v_actividad.contact_id,
    'oportunidad_id', v_actividad.oportunidad_id,
    'vencimiento_at', v_actividad.vencimiento_at,
    'estado', v_actividad.estado
  );
END;
$$;

-- Protección prioritaria: cerrar todos los seguimientos abiertos y evitar que
-- Lily vuelva a tratar al contacto como lead. La reactivación queda fuera del
-- MCP y requiere una decisión humana documentada.
CREATE OR REPLACE FUNCTION public.crm_marcar_no_contactar(
  p_contact_id uuid,
  p_motivo text,
  p_actor text DEFAULT 'lily'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contacto public.crm_contactos%ROWTYPE;
  v_motivo text := btrim(COALESCE(p_motivo, ''));
  v_actor text := btrim(COALESCE(p_actor, ''));
  v_cerradas integer := 0;
BEGIN
  IF p_contact_id IS NULL OR char_length(v_motivo) NOT BETWEEN 1 AND 500
     OR v_actor !~ '^[a-z0-9_-]{2,64}$' THEN
    RAISE EXCEPTION 'Parámetros para no contactar inválidos.';
  END IF;
  SELECT * INTO v_contacto FROM public.crm_contactos WHERE id = p_contact_id FOR UPDATE;
  IF v_contacto.id IS NULL THEN
    RAISE EXCEPTION 'Contacto CRM inexistente.';
  END IF;

  UPDATE public.crm_contactos
     SET tipo_relacion = 'no_contactar', estado = 'archivado'
   WHERE id = p_contact_id
  RETURNING * INTO v_contacto;

  UPDATE public.crm_oportunidades
     SET etapa_codigo = 'no_contactar',
         cerrada_at = COALESCE(cerrada_at, now()),
         proximo_paso_en = NULL,
         etapa_actualizada_at = now()
   WHERE contact_id = p_contact_id
     AND etapa_codigo NOT IN ('ganado', 'perdido', 'no_contactar');
  GET DIAGNOSTICS v_cerradas = ROW_COUNT;

  UPDATE public.crm_actividades
     SET estado = 'cancelada'
   WHERE contact_id = p_contact_id AND estado = 'pendiente';

  -- La decisión operativa deja constancia de las dos finalidades que Lily
  -- podría ejecutar de forma proactiva. Atención solicitada por la propia
  -- persona se mantiene separada y nunca habilita seguimiento/marketing.
  INSERT INTO public.crm_consentimientos (
    contact_id, alcance, estado, version_politica, registrado_por
  ) VALUES
    (p_contact_id, 'seguimiento', 'revocado', 'crm_operativo_v1', v_actor),
    (p_contact_id, 'marketing', 'revocado', 'crm_operativo_v1', v_actor)
  ON CONFLICT (contact_id, alcance) DO UPDATE SET
    estado = EXCLUDED.estado,
    version_politica = EXCLUDED.version_politica,
    registrado_por = EXCLUDED.registrado_por,
    registrado_at = now();

  INSERT INTO public.crm_auditoria (club, entidad_tipo, entidad_id, accion, actor, metadata)
  VALUES (v_contacto.club, 'contacto', p_contact_id, 'marcado_no_contactar', v_actor,
    jsonb_build_object('motivo', v_motivo, 'oportunidades_cerradas', v_cerradas));

  RETURN jsonb_build_object(
    'contact_id', p_contact_id,
    'tipo_relacion', v_contacto.tipo_relacion,
    'oportunidades_cerradas', v_cerradas,
    'reactivacion_requiere', 'decision_humana_documentada'
  );
END;
$$;

-- Confirmación idempotente desde el adaptador: sólo se marca después de que
-- Lily aceptó el evento. Si la entrega falla, el siguiente webhook vuelve a
-- recibir debe_responder=true y puede reintentarlo sin crear otro lead.
CREATE OR REPLACE FUNCTION public.crm_confirmar_entrega_lily(
  p_canal text,
  p_mensaje_externo_ref text,
  p_actor text DEFAULT 'lily'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_interaccion public.crm_interacciones%ROWTYPE;
  v_canal text := btrim(COALESCE(p_canal, ''));
  v_referencia text := btrim(COALESCE(p_mensaje_externo_ref, ''));
  v_actor text := btrim(COALESCE(p_actor, ''));
  v_ya_entregado boolean := false;
BEGIN
  IF v_canal NOT IN ('whatsapp', 'web_chat', 'app', 'manual')
     OR v_referencia = ''
     OR char_length(v_referencia) > 180
     OR v_referencia !~ '^[A-Za-z0-9._:-]+$'
     OR v_actor !~ '^[a-z0-9_-]{2,64}$' THEN
    RAISE EXCEPTION 'Parámetros de confirmación Lily inválidos.';
  END IF;

  SELECT * INTO v_interaccion
  FROM public.crm_interacciones
  WHERE canal = v_canal
    AND mensaje_externo_ref = v_referencia
  FOR UPDATE;
  IF v_interaccion.id IS NULL THEN
    RAISE EXCEPTION 'No existe la recepción CRM indicada.';
  END IF;

  v_ya_entregado := v_interaccion.lily_entregado_at IS NOT NULL;
  IF NOT v_ya_entregado THEN
    UPDATE public.crm_interacciones
       SET lily_entregado_at = now()
     WHERE id = v_interaccion.id
    RETURNING * INTO v_interaccion;
  END IF;

  RETURN jsonb_build_object(
    'interaccion_id', v_interaccion.id,
    'contact_id', v_interaccion.contact_id,
    'ya_entregado', v_ya_entregado,
    'lily_entregado_at', COALESCE(v_interaccion.lily_entregado_at, now())
  );
END;
$$;

-- Alta de la lista cerrada de contactos organizacionales. Se usa desde una
-- consola/Edge Function protegida DESPUÉS de obtener el contact_id mediante el
-- ingreso privado del canal. No acepta el número telefónico y no se expone al
-- MCP para que un agente no pueda autoelevar una conversación a "interna".
CREATE OR REPLACE FUNCTION public.crm_configurar_contacto_interno(
  p_contact_id uuid,
  p_actor text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contacto public.crm_contactos%ROWTYPE;
  v_actor text := btrim(COALESCE(p_actor, ''));
  v_oportunidades_cerradas integer := 0;
BEGIN
  IF p_contact_id IS NULL OR v_actor !~ '^[a-z0-9_-]{2,64}$' THEN
    RAISE EXCEPTION 'Parámetros para contacto interno inválidos.';
  END IF;
  SELECT * INTO v_contacto FROM public.crm_contactos WHERE id = p_contact_id FOR UPDATE;
  IF v_contacto.id IS NULL THEN
    RAISE EXCEPTION 'Contacto CRM inexistente.';
  END IF;
  IF v_contacto.tipo_relacion = 'no_contactar' THEN
    RAISE EXCEPTION 'Un contacto no_contactar no puede reclasificarse sin revisión humana de privacidad.';
  END IF;

  UPDATE public.crm_contactos
     SET tipo_relacion = 'interno', estado = 'activo'
   WHERE id = p_contact_id
  RETURNING * INTO v_contacto;

  UPDATE public.crm_oportunidades
     SET etapa_codigo = 'perdido', cerrada_at = COALESCE(cerrada_at, now()), etapa_actualizada_at = now()
   WHERE contact_id = p_contact_id
     AND etapa_codigo NOT IN ('ganado', 'perdido', 'no_contactar');
  GET DIAGNOSTICS v_oportunidades_cerradas = ROW_COUNT;

  UPDATE public.crm_actividades
     SET estado = 'cancelada'
   WHERE contact_id = p_contact_id AND estado = 'pendiente';

  INSERT INTO public.crm_auditoria (club, entidad_tipo, entidad_id, accion, actor, metadata)
  VALUES (v_contacto.club, 'contacto', p_contact_id, 'contacto_configurado_interno', v_actor,
    jsonb_build_object('oportunidades_cerradas', v_oportunidades_cerradas));

  RETURN jsonb_build_object(
    'contact_id', p_contact_id,
    'tipo_relacion', v_contacto.tipo_relacion,
    'oportunidades_cerradas', v_oportunidades_cerradas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_recibir_contacto_canal(text, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_actualizar_etapa_oportunidad(uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_registrar_interaccion(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_actualizar_preferencias(uuid, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_programar_actividad(uuid, uuid, text, text, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_marcar_no_contactar(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_confirmar_entrega_lily(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_configurar_contacto_interno(uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crm_recibir_contacto_canal(text, text, text, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_actualizar_etapa_oportunidad(uuid, text, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_registrar_interaccion(uuid, uuid, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_actualizar_preferencias(uuid, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_programar_actividad(uuid, uuid, text, text, timestamptz, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_marcar_no_contactar(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_confirmar_entrega_lily(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_configurar_contacto_interno(uuid, text) TO service_role;

COMMENT ON FUNCTION public.crm_recibir_contacto_canal(text, text, text, text, text, text, uuid) IS
  'Ingreso privado de WhatsApp/Web/App. Solo adaptador/Edge Function con service_role; devuelve UUIDs y ruta, nunca el identificador de canal.';
COMMENT ON FUNCTION public.crm_marcar_no_contactar(uuid, text, text) IS
  'Bloquea seguimiento comercial y cancela actividades pendientes. Reactivar no es una acción MCP.';
COMMENT ON FUNCTION public.crm_configurar_contacto_interno(uuid, text) IS
  'Clasifica de forma cerrada un contact_id como interno. Solo consola/Edge Function con service_role; no acepta teléfonos ni se expone al MCP.';
