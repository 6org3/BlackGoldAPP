-- ============================================================
-- MIGRACIÓN v17 — Pilares en Misiones + Grupos Personalizados
-- Ejecutar en: Supabase → SQL Editor
-- ============================================================

-- ------------------------------------------------------------
-- 1. LIMPIAR TABLA DUPLICADA (catalogo_misiones no se usa)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS catalogo_misiones;


-- ------------------------------------------------------------
-- 2. CÉDULA: obligatoria solo para atletas
-- ------------------------------------------------------------
-- Actualmente cedula es NOT NULL para todos los usuarios.
-- La relajamos y añadimos un CHECK que la exige solo si rol = 'atleta'.

ALTER TABLE usuarios ALTER COLUMN cedula DROP NOT NULL;

ALTER TABLE usuarios
  DROP CONSTRAINT IF EXISTS cedula_requerida_atletas;

ALTER TABLE usuarios
  ADD CONSTRAINT cedula_requerida_atletas
  CHECK (rol != 'atleta' OR (cedula IS NOT NULL AND cedula != ''));


-- ------------------------------------------------------------
-- 3. MISIONES: reemplazar 'tipo' por 'pilar' con nuevo CHECK
-- ------------------------------------------------------------

-- 3a. Eliminar constraint viejo
ALTER TABLE misiones DROP CONSTRAINT IF EXISTS misiones_tipo_check;

-- 3b. Renombrar columna tipo → pilar
ALTER TABLE misiones RENAME COLUMN tipo TO pilar;

-- 3c. Nuevo constraint con los 7 pilares + formatos de contenido
ALTER TABLE misiones
  ADD CONSTRAINT misiones_pilar_check
  CHECK (pilar IN (
    'youtube',
    'articulo',
    'fuerza',
    'explosividad',
    'movilidad',
    'tiro',
    'agilidad',
    'tactica',
    'resiliencia'
  ));

-- 3d. Actualizar default (antes era 'youtube', se mantiene igual)
ALTER TABLE misiones ALTER COLUMN pilar SET DEFAULT 'youtube';


-- ------------------------------------------------------------
-- 4. GRUPOS PERSONALIZADOS PARA MISIONES
-- ------------------------------------------------------------
-- Grupos independientes de grupos_entrenamiento (que son grupos
-- de clase con horario/precio). Estos grupos son solo para
-- agrupar atletas al asignar misiones, sin importar categoría.

CREATE TABLE IF NOT EXISTS grupos_mision (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT        NOT NULL,
  descripcion TEXT,
  creado_por  UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Miembros del grupo (relación muchos a muchos)
CREATE TABLE IF NOT EXISTS grupos_mision_miembros (
  grupo_id   UUID REFERENCES grupos_mision(id) ON DELETE CASCADE,
  atleta_id  UUID REFERENCES atletas(id)        ON DELETE CASCADE,
  added_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (grupo_id, atleta_id)
);


-- ------------------------------------------------------------
-- 5. PROGRESO_MISIONES: registrar cómo y a quién se asignó
-- ------------------------------------------------------------

ALTER TABLE progreso_misiones
  ADD COLUMN IF NOT EXISTS asignado_por    UUID REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS tipo_asignacion TEXT CHECK (tipo_asignacion IN (
    'individual', 'categoria', 'grupo', 'todos'
  )),
  ADD COLUMN IF NOT EXISTS fecha_asignacion TIMESTAMPTZ DEFAULT now();


-- ------------------------------------------------------------
-- 6. ÍNDICES útiles para búsquedas frecuentes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_progreso_atleta  ON progreso_misiones (atleta_id);
CREATE INDEX IF NOT EXISTS idx_progreso_mision  ON progreso_misiones (mision_id);
CREATE INDEX IF NOT EXISTS idx_gmision_miembros ON grupos_mision_miembros (atleta_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_cedula  ON usuarios (cedula) WHERE cedula IS NOT NULL;


-- ------------------------------------------------------------
-- FIN DE MIGRACIÓN v17
-- ============================================================
