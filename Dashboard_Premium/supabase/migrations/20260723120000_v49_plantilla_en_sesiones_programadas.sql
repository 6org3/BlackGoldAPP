-- ============================================================
-- MIGRACIÓN v49 — Plantilla de sesión persistida en Modo Cancha
-- Diseño: docs/unificacion_sesiones_cancha_evaluacion.md (§7 P3) + PR #127
-- ============================================================
-- El paso "Objetivo de la sesión" del Modo Cancha permite elegir una plantilla
-- (catalogo_sesiones) que pinta el panel "PLAN DE SESIÓN" con sus drills. Hasta
-- ahora esa elección vivía SOLO en el estado del cliente: al reanudar una sesión
-- [EN_CURSO] desde el landing, el panel de drills no reaparecía (limitación
-- anotada en PR #127). Estas dos columnas aditivas la persisten:
--
--   ejercicios_ids  → SNAPSHOT inmutable de los drills planeados (ids del
--                     catálogo ejercicios_catalogo). Sobrevive a ediciones o
--                     borrado posterior de la plantilla: lo que se planeó al
--                     iniciar es lo que se muestra al reanudar. Nombre y tipo
--                     JSONB coherentes con catalogo_sesiones.ejercicios_ids;
--                     columna SEPARADA de pruebas_ids (v23) a propósito, para
--                     no mezclar los catálogos espejo (ejercicios_catalogo, el
--                     de drills, vs catalogo_ejercicios, el de pruebas).
--   plantilla_id    → referencia a la plantilla, solo para recuperar su TÍTULO
--                     al reanudar. ON DELETE SET NULL: si la plantilla se borra,
--                     la sesión conserva su snapshot de drills y cae a un título
--                     genérico — nunca se borra la sesión ni se pierde el plan.
--
-- pilar_objetivo (ya existente) sigue guardando el sub_pilar/pilar de la
-- plantilla; el CHECK de estado/tipo no se toca.

ALTER TABLE sesiones_programadas
  ADD COLUMN IF NOT EXISTS ejercicios_ids JSONB DEFAULT NULL;

ALTER TABLE sesiones_programadas
  ADD COLUMN IF NOT EXISTS plantilla_id UUID DEFAULT NULL
    REFERENCES catalogo_sesiones (id) ON DELETE SET NULL;
