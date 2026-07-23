-- ============================================================
-- MIGRACIÓN v49 — Plan de sesión persistente en Modo Cancha
-- Diseño: catálogo de ejercicios (drills) en Modo Cancha Arcade (PR #127)
-- ============================================================
-- Al INICIAR una sesión en Modo Cancha, el coach puede elegir una plantilla
-- (catalogo_sesiones); sus drills se muestran en el panel "PLAN DE SESIÓN".
-- Hasta ahora la plantilla solo vivía en el cliente, así que al REANUDAR la
-- sesión (recarga de página u otro dispositivo) el panel desaparecía.
-- Persistimos los ids de los drills elegidos para poder rehidratar el plan.
--
-- `ejercicios_ids` = ids de drills de `ejercicios_catalogo` (el catálogo de
-- ENTRENAMIENTO) de la plantilla elegida. Columna SEPARADA de `pruebas_ids`
-- (v23) a propósito: son catálogos espejo (ejercicios_catalogo, drills de
-- entrenamiento, vs catalogo_ejercicios, pruebas de evaluación) y no deben
-- mezclarse. jsonb → llega al cliente como array JS (sin JSON.parse).
--
-- RLS: sin cambios. La escribe el staff (coach) al iniciar la sesión, cubierto
-- por las políticas de escritura existentes de sesiones_programadas (v29/v40).

ALTER TABLE sesiones_programadas
  ADD COLUMN IF NOT EXISTS ejercicios_ids JSONB DEFAULT NULL;

COMMENT ON COLUMN sesiones_programadas.ejercicios_ids IS
  'IDs de drills de ejercicios_catalogo (catálogo de entrenamiento) de la plantilla elegida en Modo Cancha, para rehidratar el panel PLAN DE SESIÓN al reanudar. Columna separada de pruebas_ids a propósito (catálogos espejo, ver v23).';
