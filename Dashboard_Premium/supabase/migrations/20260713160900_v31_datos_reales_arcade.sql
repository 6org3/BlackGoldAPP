-- ============================================================
-- MIGRACIÓN v31 — Datos reales del rediseño Arcade HUD
-- ============================================================
-- Rellena huecos de datos de los portales Atleta/Dueño Arcade (PRs #43/#44),
-- que hoy usan mocks:
--   · Dueño/Finanzas  → meta de recaudación real (donut).
--   · Dueño/Equipo     → ranking de coaches (asistencia + sesiones + XP).
--   · Dueño/Retención  → altas/bajas y activos (membresía del atleta, baja manual).
--   · Atleta/Progreso  → XP semanal real (ledger de XP).
-- El heatmap de ocupación de cancha va en migración aparte (v32).
--
-- Todo ADITIVO (IF NOT EXISTS / CREATE OR REPLACE). Respeta el patrón RLS de
-- v24/v29: helpers current_user_club()/es_staff()/es_superadmin()/club_de_atleta(),
-- funciones SECURITY DEFINER con REVOKE/GRANT (precedente: precio_servicio_atleta v27).
-- ============================================================

-- ============================================================
-- 1) Meta de recaudación mensual (club_config)
-- ============================================================
ALTER TABLE public.club_config
  ADD COLUMN IF NOT EXISTS meta_recaudacion_mensual numeric(10,2);

COMMENT ON COLUMN public.club_config.meta_recaudacion_mensual IS
  'Meta de recaudación mensual del club (donut de Finanzas del dueño). NULL = derivar del total generado.';

-- ============================================================
-- 2) Ciclo de vida de membresía del atleta (retención, baja MANUAL)
-- ============================================================
ALTER TABLE public.atletas
  ADD COLUMN IF NOT EXISTS fecha_alta date,
  ADD COLUMN IF NOT EXISTS fecha_baja date,
  ADD COLUMN IF NOT EXISTS estado_membresia text NOT NULL DEFAULT 'activo';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'atletas_estado_membresia_check') THEN
    ALTER TABLE public.atletas
      ADD CONSTRAINT atletas_estado_membresia_check
      CHECK (estado_membresia IN ('activo','inactivo','baja'));
  END IF;
END $$;

-- Backfill de fecha_alta desde la creación del usuario del atleta (una sola vez).
UPDATE public.atletas a
SET fecha_alta = u.created_at::date
FROM public.usuarios u
WHERE a.usuario_id = u.id AND a.fecha_alta IS NULL;

-- Proteger las nuevas columnas de membresía de ediciones del propio atleta/padre.
-- Se recrea proteger_columnas_atletas (v24) conservando su lógica + las 3 columnas.
CREATE OR REPLACE FUNCTION public.proteger_columnas_atletas()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR es_staff() THEN
    RETURN NEW;
  END IF;
  IF NEW.xp_total IS DISTINCT FROM OLD.xp_total
     OR NEW.overall_score IS DISTINCT FROM OLD.overall_score
     OR NEW.rango IS DISTINCT FROM OLD.rango
     OR NEW.rango_tier IS DISTINCT FROM OLD.rango_tier
     OR NEW.nivel_desarrollo IS DISTINCT FROM OLD.nivel_desarrollo
     OR NEW.es_becado IS DISTINCT FROM OLD.es_becado
     OR NEW.descuento_pct IS DISTINCT FROM OLD.descuento_pct
     OR NEW.grupo_id IS DISTINCT FROM OLD.grupo_id
     OR NEW.grupo_nombre IS DISTINCT FROM OLD.grupo_nombre
     OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
     OR NEW.estado_membresia IS DISTINCT FROM OLD.estado_membresia
     OR NEW.fecha_alta IS DISTINCT FROM OLD.fecha_alta
     OR NEW.fecha_baja IS DISTINCT FROM OLD.fecha_baja THEN
    RAISE EXCEPTION 'No tienes permiso para modificar campos protegidos del atleta.';
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 3) Ledger de XP (historial por atleta + coach) — habilita XP semanal (atleta)
--    y XP repartido por coach (dueño).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.xp_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atleta_id uuid NOT NULL REFERENCES public.atletas(id) ON DELETE CASCADE,
  coach_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  delta integer NOT NULL,
  motivo text,
  origen text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_xp_eventos_atleta ON public.xp_eventos (atleta_id, created_at);
CREATE INDEX IF NOT EXISTS idx_xp_eventos_coach ON public.xp_eventos (coach_id, created_at);

ALTER TABLE public.xp_eventos ENABLE ROW LEVEL SECURITY;

-- Staff: acceso total, scopeado por club del atleta (patrón v30 pagos_auditoria).
DROP POLICY IF EXISTS xp_eventos_staff ON public.xp_eventos;
CREATE POLICY xp_eventos_staff ON public.xp_eventos FOR ALL TO authenticated
  USING ((select es_superadmin()) OR ((select es_staff()) AND club_de_atleta(atleta_id) = (select current_user_club())))
  WITH CHECK ((select es_superadmin()) OR ((select es_staff()) AND club_de_atleta(atleta_id) = (select current_user_club())));

-- Atleta/padre: lee lo suyo (para el XP semanal del portal atleta).
DROP POLICY IF EXISTS xp_eventos_select_propio ON public.xp_eventos;
CREATE POLICY xp_eventos_select_propio ON public.xp_eventos FOR SELECT TO authenticated
  USING (atleta_id IN (SELECT unnest(mis_atletas())));

-- Backfill del historial de XP existente desde observaciones_cancha (Modo Cancha:
-- ya trae atleta_id + coach_id + xp_ganada + created_at). Solo si xp_eventos está
-- vacía (guard) para no duplicar en re-aplicaciones.
INSERT INTO public.xp_eventos (atleta_id, coach_id, delta, motivo, origen, created_at)
SELECT o.atleta_id, o.coach_id, o.xp_ganada, 'Evaluación Modo Cancha', 'observaciones_cancha', o.created_at
FROM public.observaciones_cancha o
WHERE o.atleta_id IS NOT NULL AND o.xp_ganada IS NOT NULL AND o.xp_ganada > 0
  AND NOT EXISTS (SELECT 1 FROM public.xp_eventos);

-- ============================================================
-- 4) fn_coach_stats — ranking de coaches del club (últimos p_dias)
--    Asistencia % (pases de lista Presente/total), nº de sesiones dictadas y XP
--    repartido (xp_eventos). SECURITY DEFINER + scope por club del que consulta.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_coach_stats(p_dias integer DEFAULT 30)
RETURNS TABLE (coach_id uuid, nombre text, asistencia_pct integer, sesiones integer, xp integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH d AS (SELECT (current_date - p_dias) AS desde),
  coaches AS (
    SELECT u.id, u.nombre
    FROM usuarios u
    WHERE u.rol = 'coach'
      AND es_staff()
      AND (u.club = current_user_club() OR es_superadmin())
  ),
  asis AS (
    SELECT a.coach_id,
      round(100.0 * count(*) FILTER (WHERE a.estado = 'Presente') / nullif(count(*), 0)) AS pct
    FROM asistencia a, d
    WHERE a.fecha >= d.desde
    GROUP BY a.coach_id
  ),
  ses AS (
    SELECT s.coach_id, count(*) AS n
    FROM sesiones_control s, d
    WHERE s.fecha >= d.desde
    GROUP BY s.coach_id
  ),
  xp AS (
    SELECT e.coach_id, sum(e.delta) AS total
    FROM xp_eventos e, d
    WHERE e.created_at >= d.desde AND e.coach_id IS NOT NULL
    GROUP BY e.coach_id
  )
  SELECT c.id, c.nombre,
    COALESCE(asis.pct, 0)::integer,
    COALESCE(ses.n, 0)::integer,
    COALESCE(xp.total, 0)::integer
  FROM coaches c
  LEFT JOIN asis ON asis.coach_id = c.id
  LEFT JOIN ses ON ses.coach_id = c.id
  LEFT JOIN xp ON xp.coach_id = c.id
  ORDER BY COALESCE(asis.pct, 0) DESC, COALESCE(ses.n, 0) DESC;
$$;
REVOKE ALL ON FUNCTION public.fn_coach_stats(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_coach_stats(integer) TO authenticated, service_role;

-- ============================================================
-- 5) fn_retencion_club — retención/altas-bajas del club (membresía).
--    ret_pct = activos/total; altas_bajas por mes (últimos p_meses).
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_retencion_club(p_meses integer DEFAULT 5)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH mis AS (
    SELECT a.id, a.estado_membresia, a.fecha_alta, a.fecha_baja
    FROM atletas a
    JOIN usuarios u ON u.id = a.usuario_id
    WHERE es_staff() AND (u.club = current_user_club() OR es_superadmin())
  ),
  meses AS (
    SELECT date_trunc('month', current_date) - (g || ' month')::interval AS m0
    FROM generate_series(p_meses - 1, 0, -1) AS g
  ),
  ab AS (
    SELECT
      to_char(m.m0, 'YYYY-MM') AS ym,
      (SELECT count(*) FROM mis WHERE date_trunc('month', mis.fecha_alta) = m.m0) AS altas,
      (SELECT count(*) FROM mis WHERE date_trunc('month', mis.fecha_baja) = m.m0) AS bajas
    FROM meses m
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM mis),
    'activos', (SELECT count(*) FROM mis WHERE estado_membresia = 'activo'),
    'ret_pct', CASE WHEN (SELECT count(*) FROM mis) > 0
      THEN round(100.0 * (SELECT count(*) FROM mis WHERE estado_membresia = 'activo') / (SELECT count(*) FROM mis))
      ELSE 0 END,
    'altas_bajas', COALESCE((SELECT jsonb_agg(jsonb_build_object('ym', ym, 'altas', altas, 'bajas', bajas)) FROM ab), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.fn_retencion_club(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_retencion_club(integer) TO authenticated, service_role;
