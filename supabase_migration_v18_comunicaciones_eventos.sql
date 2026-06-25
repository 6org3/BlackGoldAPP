-- ============================================================
-- MIGRACIÓN v18 — Comunicaciones Segmentadas + Eventos Deportivos
-- Ejecutar en: Supabase → SQL Editor
-- Diseño: docs/comunicaciones_eventos.md
-- ============================================================
-- Cubre: segmentación (individual, individualizado, grupo, grupos
-- limitados, categoría, edad, género, general, compuesto), feed
-- in-app, y eventos con convocatoria/RSVP, recordatorios, check-in
-- y resultado post-evento.
-- ============================================================


-- ------------------------------------------------------------
-- 1. PERTENENCIA ATLETA ↔ GRUPO DE ENTRENAMIENTO
-- ------------------------------------------------------------
-- Hoy no existe relación directa atleta ↔ grupos_entrenamiento
-- (solo se usa grupo_id en sesiones_control). La creamos para que
-- los segmentos "grupo" y "grupos_limitados" puedan resolverse.

CREATE TABLE IF NOT EXISTS atleta_grupo (
  atleta_id  UUID REFERENCES atletas(id)               ON DELETE CASCADE,
  grupo_id   UUID REFERENCES grupos_entrenamiento(id)  ON DELETE CASCADE,
  added_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (atleta_id, grupo_id)
);

CREATE INDEX IF NOT EXISTS idx_atleta_grupo_grupo  ON atleta_grupo (grupo_id);
CREATE INDEX IF NOT EXISTS idx_atleta_grupo_atleta ON atleta_grupo (atleta_id);


-- ------------------------------------------------------------
-- 2. COMUNICACIONES: motor de segmentación + soporte in-app
-- ------------------------------------------------------------
-- Conservamos tipo/grupo_id/atleta_id por compatibilidad y
-- añadimos el segmento componible.

ALTER TABLE comunicaciones
  ADD COLUMN IF NOT EXISTS segmento_tipo TEXT
    CHECK (segmento_tipo IN (
      'general', 'individual', 'individualizado', 'grupo',
      'grupos_limitados', 'categoria', 'edad', 'genero', 'compuesto'
    )),
  ADD COLUMN IF NOT EXISTS segmento_params       JSONB   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS incluir_representantes BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS evento_id             UUID,   -- FK añadida tras crear eventos (paso 4)
  ADD COLUMN IF NOT EXISTS canal                 TEXT    DEFAULT 'whatsapp'
    CHECK (canal IN ('whatsapp', 'in_app', 'ambos')),
  ADD COLUMN IF NOT EXISTS proposito             TEXT    DEFAULT 'comunicado'
    CHECK (proposito IN ('comunicado', 'convocatoria', 'recordatorio', 'resultado'));

-- Mapear los registros existentes (tipo legado → segmento_tipo)
UPDATE comunicaciones SET segmento_tipo = CASE tipo
  WHEN 'Anuncio'       THEN 'general'
  WHEN 'Grupal'        THEN 'grupo'
  WHEN 'Personalizado' THEN 'individualizado'
  WHEN 'Individual'    THEN 'individual'
  ELSE 'general'
END
WHERE segmento_tipo IS NULL;


-- ------------------------------------------------------------
-- 3. DESTINATARIOS: estado de lectura para el feed in-app
-- ------------------------------------------------------------

ALTER TABLE comunicacion_destinatarios
  ADD COLUMN IF NOT EXISTS leido      BOOLEAN     DEFAULT false,
  ADD COLUMN IF NOT EXISTS leido_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_comdest_usuario
  ON comunicacion_destinatarios (usuario_id, leido);


-- ------------------------------------------------------------
-- 4. EVENTOS DEPORTIVOS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS eventos (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  club         TEXT,
  creado_por   UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo         TEXT        NOT NULL DEFAULT 'partido'
    CHECK (tipo IN ('partido','torneo','entrenamiento_especial',
                    'clinica','reunion','evaluacion','social')),
  estado       TEXT        NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','publicado','en_curso','cerrado','cancelado')),
  titulo       TEXT        NOT NULL,
  descripcion  TEXT,
  rival        TEXT,

  -- Audiencia: reutiliza el motor de segmentación
  segmento_tipo          TEXT,
  segmento_params        JSONB   DEFAULT '{}'::jsonb,
  incluir_representantes BOOLEAN DEFAULT true,

  -- Fecha / logística
  fecha_evento    TIMESTAMPTZ NOT NULL,
  hora_llegada    TIME,
  hora_inicio     TIME,
  sede            TEXT,
  direccion       TEXT,
  uniforme        TEXT,
  transporte      TEXT,
  notas_logistica TEXT,

  -- Resultado / cierre
  marcador_propio INT,
  marcador_rival  INT,
  resultado       TEXT CHECK (resultado IN ('ganado','perdido','empatado') OR resultado IS NULL),
  mvp             TEXT,
  top_scorer      TEXT,   -- máximo anotador (total)
  top_dobles      TEXT,   -- máximo anotador de 2 puntos
  top_triples     TEXT,   -- máximo anotador de 3 puntos
  notas_resultado TEXT,

  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eventos_fecha  ON eventos (fecha_evento);
CREATE INDEX IF NOT EXISTS idx_eventos_estado ON eventos (estado);
CREATE INDEX IF NOT EXISTS idx_eventos_club   ON eventos (club);

-- FK diferida de comunicaciones → eventos
ALTER TABLE comunicaciones
  DROP CONSTRAINT IF EXISTS comunicaciones_evento_fk;
ALTER TABLE comunicaciones
  ADD CONSTRAINT comunicaciones_evento_fk
  FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE SET NULL;


-- ------------------------------------------------------------
-- 5. CONVOCADOS — RSVP + check-in por atleta
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS evento_convocados (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id      UUID REFERENCES eventos(id)  ON DELETE CASCADE,
  atleta_id      UUID REFERENCES atletas(id)  ON DELETE CASCADE,

  estado_rsvp    TEXT DEFAULT 'pendiente'
    CHECK (estado_rsvp IN ('pendiente','asiste','no_asiste','duda')),
  rsvp_at        TIMESTAMPTZ,
  rsvp_por       UUID REFERENCES usuarios(id),  -- atleta, padre o coach que registró

  asistencia_real TEXT
    CHECK (asistencia_real IN ('presente','ausente','tarde') OR asistencia_real IS NULL),
  checkin_at     TIMESTAMPTZ,

  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (evento_id, atleta_id)
);

CREATE INDEX IF NOT EXISTS idx_convocados_evento ON evento_convocados (evento_id, estado_rsvp);
CREATE INDEX IF NOT EXISTS idx_convocados_atleta ON evento_convocados (atleta_id);


-- ------------------------------------------------------------
-- 6. RECORDATORIOS AUTOMÁTICOS
-- ------------------------------------------------------------
-- Reglas relativas al inicio del evento (ej. 1440 min = 24h antes).
-- 'enviado_at' garantiza idempotencia si el job corre dos veces.

CREATE TABLE IF NOT EXISTS evento_recordatorios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id       UUID REFERENCES eventos(id) ON DELETE CASCADE,
  minutos_antes   INT  NOT NULL,            -- ej. 1440, 120
  solo_pendientes BOOLEAN DEFAULT true,     -- no molestar a los confirmados
  enviado_at      TIMESTAMPTZ,              -- NULL = aún no disparado
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (evento_id, minutos_antes)
);

CREATE INDEX IF NOT EXISTS idx_recordatorios_pendientes
  ON evento_recordatorios (evento_id) WHERE enviado_at IS NULL;


-- ------------------------------------------------------------
-- 7. FUNCIÓN: resolver_audiencia → lista de usuario_id
-- ------------------------------------------------------------
-- Traduce un segmento (tipo + params) en los usuarios destinatarios.
-- Incluye representantes (padres_atletas) cuando se solicita.
-- SECURITY DEFINER: se asume filtrado por club en la capa de app/RLS.

CREATE OR REPLACE FUNCTION resolver_audiencia(
  p_segmento_tipo TEXT,
  p_params        JSONB DEFAULT '{}'::jsonb,
  p_incluir_reps  BOOLEAN DEFAULT true,
  p_club          TEXT DEFAULT NULL
)
RETURNS TABLE (usuario_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
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


-- ------------------------------------------------------------
-- 8. FUNCIÓN AUXILIAR: categoría FEB en SQL
-- ------------------------------------------------------------
-- Réplica de calcularCategoriaFEB() (src/api/utilsAtletas.js) para
-- poder segmentar por categoría dentro de la base de datos.

CREATE OR REPLACE FUNCTION calcular_categoria_feb(p_fecha_nac DATE)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
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


-- ------------------------------------------------------------
-- 9. RLS (Row Level Security) — política base
-- ------------------------------------------------------------
-- NOTA: ajustar a la convención de auth del proyecto. Se asume que
-- el rol del usuario autenticado está disponible. Aquí se habilita
-- RLS y se dejan políticas permisivas de lectura para destinatarios;
-- afinar escritura a coach/owner/superadmin antes de producción.

ALTER TABLE eventos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_convocados    ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_recordatorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE atleta_grupo         ENABLE ROW LEVEL SECURITY;

-- Lectura de eventos publicados para usuarios autenticados
DROP POLICY IF EXISTS eventos_read ON eventos;
CREATE POLICY eventos_read ON eventos
  FOR SELECT USING (estado <> 'borrador' OR creado_por = auth.uid());

-- Un convocado puede ver y actualizar SOLO su propio RSVP
DROP POLICY IF EXISTS convocados_self ON evento_convocados;
CREATE POLICY convocados_self ON evento_convocados
  FOR ALL USING (
    rsvp_por = auth.uid()
    OR atleta_id IN (SELECT id FROM atletas WHERE usuario_id = auth.uid())
    OR atleta_id IN (SELECT atleta_id FROM padres_atletas WHERE padre_id = auth.uid())
  );


-- ------------------------------------------------------------
-- 10. TRIGGER: updated_at en eventos
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_eventos_updated ON eventos;
CREATE TRIGGER trg_eventos_updated
  BEFORE UPDATE ON eventos
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- ------------------------------------------------------------
-- FIN DE MIGRACIÓN v18
-- ============================================================
