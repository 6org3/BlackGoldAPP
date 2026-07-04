-- ============================================================
-- FIX — la migración v20 (20260701130000_v20_categoria_feb_columna.sql)
-- nunca se ejecutó realmente contra la base real. Quedó marcada como
-- "aplicada" el 2026-07-02 al reconciliar el historial de migraciones
-- (`supabase migration repair`), que asumió — incorrectamente para esta
-- migración en particular — que ya se había corrido a mano por el SQL
-- Editor, como sí ocurrió con las demás migraciones de esa tanda.
--
-- Detectado en vivo: login de coach real → GET /rest/v1/atletas con
-- usuarios(...,categoria_feb,...) embebido → 400 "column
-- usuarios_1.categoria_feb does not exist". Esto bloqueaba el dashboard
-- principal del coach para CUALQUIER usuario, no solo cuentas nuevas.
--
-- Verificado antes de este fix: calcular_categoria_feb(p_fecha_nac DATE)
-- sí existe y funciona (dependencia de la columna generada). El único
-- problema era que el ALTER TABLE nunca se había ejecutado.
--
-- Mismo DDL exacto que v20, sin cambios — solo ejecutándolo de verdad.
-- Ejecutar en: Supabase → SQL Editor (o `supabase db push`)
-- ============================================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS categoria_feb TEXT
  GENERATED ALWAYS AS (calcular_categoria_feb(fecha_nacimiento)) STORED;

CREATE INDEX IF NOT EXISTS idx_usuarios_categoria_feb ON usuarios (categoria_feb);
CREATE INDEX IF NOT EXISTS idx_usuarios_club_categoria_feb ON usuarios (club, categoria_feb);
