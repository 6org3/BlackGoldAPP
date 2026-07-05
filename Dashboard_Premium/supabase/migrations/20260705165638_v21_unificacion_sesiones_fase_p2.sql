-- ============================================================
-- MIGRACIÓN v21 — Unificación de Sesiones, fase P2
-- Diseño: docs/unificacion_sesiones_cancha_evaluacion.md (§3.2, §3.3.a, §7 P2)
-- ============================================================
-- Todo aditivo (IF NOT EXISTS / guards), sin tocar filas existentes de
-- asistencia (3936), sesiones_control (312) ni sesiones_programadas (15).
-- ============================================================


-- ------------------------------------------------------------
-- 1. catalogo_sesiones → biblioteca de plantillas de Modo Sesiones
-- ------------------------------------------------------------
-- Tabla huérfana descubierta en el baseline (0 filas, sin código que la
-- referenciara). Se reutiliza en vez de crear sesiones_plantilla desde cero
-- (decisión revisada, ver §3.2 del documento).

ALTER TABLE catalogo_sesiones
  ADD COLUMN IF NOT EXISTS pilar      TEXT,    -- valida contra PILARES de taxonomia.js
  ADD COLUMN IF NOT EXISTS sub_pilar  TEXT,    -- valida contra SUB_PILARES de taxonomia.js (incluye 'resistencia' tras P1.5)
  ADD COLUMN IF NOT EXISTS tipo_clase TEXT,    -- 'Grupal (Niveles)' | 'Grupal Individualizada' | 'Privada 1v1' | NULL = cualquiera
  ADD COLUMN IF NOT EXISTS activa     BOOLEAN DEFAULT true;

-- RLS de esta tabla quedó de un esquema de roles anterior (coach_head /
-- coach_asistente no existen hoy — el CHECK de usuarios.rol solo permite
-- superadmin/owner/coach/atleta/padre). Sin este fix, ningún coach real
-- podría insertar una plantilla cuando se cablee la UI en la fase P3.
DROP POLICY IF EXISTS "Insertar Sesiones" ON catalogo_sesiones;
CREATE POLICY "Insertar Sesiones" ON catalogo_sesiones
  FOR INSERT WITH CHECK (
    (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol = 'superadmin'))
    OR (
      club_id = (SELECT usuarios.club FROM usuarios WHERE usuarios.id = auth.uid())
      AND EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = auth.uid() AND usuarios.rol IN ('owner', 'coach'))
    )
  );

-- Semillas: una plantilla por cada objetivo que hoy existe en Modo Cancha
-- (ModoCanchaModalConstants.OBJETIVOS_CLASE), con su pilar/sub_pilar
-- canónico de taxonomia.js. club_id = NULL → visible globalmente (mono-club
-- hoy, ver usuarios.club default 'Black Gold'). Sin ejercicios_ids todavía:
-- es contenido a curar por los coaches, no algo que deba inventar aquí.
-- Resistencia queda con sub_pilar NULL a propósito: pendiente de P1.5
-- (baremos/pruebas de resistencia) antes de existir en taxonomia.js.
INSERT INTO catalogo_sesiones (titulo, enfoque_principal, descripcion, pilar, sub_pilar, tipo_clase, ejercicios_ids, club_id, activa)
SELECT v.titulo, v.enfoque, v.descripcion, v.pilar, v.sub_pilar, NULL, '[]'::jsonb, NULL, true
FROM (VALUES
  ('Físico - Fuerza',             'Fuerza',        'Plantilla base para sesiones de fuerza.',                    'fisico',  'fuerza'),
  ('Físico - Explosividad',       'Explosividad',  'Plantilla base para sesiones de explosividad/potencia.',     'fisico',  'explosividad'),
  ('Físico - Resistencia',        'Resistencia',   'Plantilla base para resistencia aeróbica/anaeróbica. Sub-pilar pendiente de P1.5 (baremos).', 'fisico', NULL),
  ('Técnico - Agilidad',          'Agilidad',      'Plantilla base para agilidad/velocidad (técnico, no físico).', 'tecnico', 'agilidad'),
  ('Eficiencia Táctica',          'Táctica',       'Plantilla base para trabajo táctico en cancha.',              'mental',  'tactica'),
  ('Resiliencia Psicológica',     'Resiliencia',   'Plantilla base para trabajo de resiliencia mental.',          'mental',  'resiliencia'),
  ('Liderazgo y Comunicación',    'Liderazgo',     'Plantilla base para liderazgo/comunicación (mapea a resiliencia).', 'mental', 'resiliencia')
) AS v(titulo, enfoque, descripcion, pilar, sub_pilar)
WHERE NOT EXISTS (SELECT 1 FROM catalogo_sesiones WHERE catalogo_sesiones.titulo = v.titulo);


-- ------------------------------------------------------------
-- 2. asistencia → que Modo Cancha escriba ahí (en vez del hack de notas)
-- ------------------------------------------------------------
-- Tabla real y ya en producción (3936 filas, alimenta OwnerKPIsPage). Se
-- extiende para que Modo Cancha pueda registrar asistencia por sesión sin
-- romper el pase de lista diario manual de AdminAsistencia (sesion_id NULL).

ALTER TABLE asistencia
  ADD COLUMN IF NOT EXISTS sesion_id UUID REFERENCES sesiones_programadas(id) ON DELETE SET NULL;

-- Relajar UNIQUE(atleta_id, fecha) → UNIQUE(atleta_id, fecha, sesion_id).
-- Es una relajación estricta→laxa: no puede fallar por datos existentes,
-- cualquier fila que ya cumplía la restricción vieja cumple la nueva.
ALTER TABLE asistencia DROP CONSTRAINT IF EXISTS asistencia_atleta_id_fecha_key;
ALTER TABLE asistencia
  ADD CONSTRAINT asistencia_atleta_fecha_sesion_key UNIQUE (atleta_id, fecha, sesion_id);

CREATE INDEX IF NOT EXISTS idx_asistencia_sesion ON asistencia (sesion_id);
