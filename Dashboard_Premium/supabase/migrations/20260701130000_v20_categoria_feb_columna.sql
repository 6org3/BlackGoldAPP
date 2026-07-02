-- ============================================================
-- MIGRACIÓN v20 — Columna generada categoria_feb (Fase 10 del
-- plan de refactor P2: paginación/filtrado en servidor)
-- Ejecutar en: Supabase → SQL Editor
-- ============================================================
-- La categoría FEB de un atleta se calculaba solo en JS
-- (calcularCategoriaFEB, src/api/utilsAtletas.js) o vía la función
-- SQL calcular_categoria_feb() (migración v18), pero nunca existió
-- como columna real de `usuarios` — la columna cruda `usuarios.categoria`
-- es un campo libre que la Fase 6 confirmó que NUNCA coincide con las
-- categorías FEB reales. Sin una columna filtrable, fetchTodosLosAtletas
-- no podía delegar el filtrado por categoría a Postgres y traía el
-- roster completo del club para descartar el resto en el cliente.
--
-- Esta columna generada reutiliza la misma función SQL que ya usan
-- `atleta_grupo` y la segmentación de eventos/comunicaciones (v18),
-- así que no introduce una tercera fuente de verdad.
-- ============================================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS categoria_feb TEXT
  GENERATED ALWAYS AS (calcular_categoria_feb(fecha_nacimiento)) STORED;

CREATE INDEX IF NOT EXISTS idx_usuarios_categoria_feb ON usuarios (categoria_feb);
CREATE INDEX IF NOT EXISTS idx_usuarios_club_categoria_feb ON usuarios (club, categoria_feb);
