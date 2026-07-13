-- ============================================================
-- MIGRACIÓN v32 — Ocupación de cancha
-- ============================================================
-- Reemplaza el heatmap MOCK "OCUPACIÓN · CANCHA CENTRAL" del panel del
-- dueño (Arcade HUD, pestaña Asistencia) por datos reales derivados de
-- sesiones_programadas + asistencia, modelando horario + capacidad.
--
-- Aporta dos piezas aditivas:
--   1. grupos_entrenamiento.cupo_max — capacidad por grupo (no existía
--      ninguna columna de cupo/capacidad en el esquema).
--   2. fn_ocupacion_cancha(p_dias) — función SECURITY DEFINER (mismo
--      patrón que precio_servicio_atleta de v27) que agrega la rejilla
--      de ocupación del club del usuario (current_user_club()), gateada a
--      staff (es_staff() → owner/coach/superadmin). Para cada (día de
--      semana, franja horaria, grupo) calcula ocupación = presentes
--      promedio por sesión (asistencia por sesion_id) o, si no hay pase de
--      lista, inscritos del grupo (atletas.grupo_id), sobre cupo_max.
--
-- Todo aditivo (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION).
-- sesiones_programadas no tiene columna de club: el club se deriva por
-- join a grupos_entrenamiento.club (grupal) o usuarios.club del coach
-- (individual).
-- ============================================================


-- ------------------------------------------------------------
-- 1. Capacidad por grupo (cupo de la cancha para ese grupo).
--    DEFAULT 24 backfillea los grupos existentes para que el heatmap
--    tenga denominador desde el primer apply; ajustar por grupo luego.
-- ------------------------------------------------------------
ALTER TABLE public.grupos_entrenamiento
  ADD COLUMN IF NOT EXISTS cupo_max integer DEFAULT 24;

COMMENT ON COLUMN public.grupos_entrenamiento.cupo_max IS
  'Capacidad máxima de la cancha para este grupo (denominador de la ocupación). DEFAULT 24.';


-- ------------------------------------------------------------
-- 2. Rejilla de ocupación de cancha del club del usuario.
--    Devuelve una fila por (día de semana Lun..Sáb, franja = hora_inicio,
--    grupo). SECURITY DEFINER + gate por es_staff() + scope por
--    current_user_club(): bypassa RLS pero solo entrega datos del propio
--    club a staff, igual que precio_servicio_atleta (v27).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ocupacion_cancha(p_dias int DEFAULT 60)
RETURNS TABLE (
  dia_semana int,
  franja     time,
  grupo      text,
  ocupados   int,
  cupo       int,
  pct        numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club text := (SELECT current_user_club());
  v_dias int  := GREATEST(COALESCE(p_dias, 60), 1);
BEGIN
  -- Gate: solo staff (owner/coach/superadmin) del club recibe filas.
  IF NOT (SELECT es_staff()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH ses AS (
    -- Sesiones recientes del club (no canceladas), Lun..Sáb. Club derivado
    -- del grupo (grupal) o del coach (individual, grupo_id NULL).
    SELECT
      s.id,
      s.grupo_id,
      EXTRACT(DOW FROM s.fecha)::int AS dow,
      s.hora_inicio                 AS h,
      g.nombre                      AS gnombre,
      g.cupo_max                    AS cupo_max
    FROM sesiones_programadas s
    LEFT JOIN grupos_entrenamiento g ON g.id = s.grupo_id
    LEFT JOIN usuarios cu            ON cu.id = s.coach_id
    WHERE s.estado <> 'Cancelada'
      AND s.fecha >= current_date - v_dias
      AND s.fecha <= current_date
      AND COALESCE(g.club, cu.club) = v_club
      AND EXTRACT(DOW FROM s.fecha) BETWEEN 1 AND 6
  ),
  pres AS (
    -- Presentes por sesión (para promediar la ocupación real por franja).
    SELECT a.sesion_id,
           COUNT(*) FILTER (WHERE a.estado = 'Presente') AS n_pres
    FROM asistencia a
    WHERE a.sesion_id IN (SELECT id FROM ses)
    GROUP BY a.sesion_id
  ),
  bucket AS (
    -- Un bucket por (día, franja, grupo). avg_pres = presentes promedio por
    -- sesión con pase de lista; cupo_max = capacidad del grupo.
    SELECT
      ses.dow                                   AS dia_semana,
      ses.h                                     AS franja,
      COALESCE(ses.gnombre, 'Individual · 1v1') AS grupo,
      ses.grupo_id                              AS grupo_id,
      MAX(ses.cupo_max)                         AS cupo_max,
      AVG(pres.n_pres)                          AS avg_pres
    FROM ses
    LEFT JOIN pres ON pres.sesion_id = ses.id
    GROUP BY ses.dow, ses.h, COALESCE(ses.gnombre, 'Individual · 1v1'), ses.grupo_id
  ),
  comp AS (
    -- ocupados = presentes promedio (si hubo pase de lista) o, si no,
    -- inscritos del grupo (atletas.grupo_id). cupo = cupo_max o 24.
    SELECT
      b.dia_semana,
      b.franja,
      b.grupo,
      GREATEST(0, COALESCE(
        NULLIF(ROUND(b.avg_pres)::int, 0),
        (SELECT COUNT(*)::int FROM atletas at WHERE at.grupo_id = b.grupo_id),
        0
      ))                        AS ocupados,
      COALESCE(b.cupo_max, 24)  AS cupo
    FROM bucket b
  )
  SELECT
    c.dia_semana,
    c.franja,
    c.grupo,
    c.ocupados,
    c.cupo,
    LEAST(100, ROUND(100.0 * c.ocupados / NULLIF(c.cupo, 0)))::numeric AS pct
  FROM comp c
  ORDER BY c.franja, c.dia_semana;
END;
$$;

COMMENT ON FUNCTION public.fn_ocupacion_cancha(int) IS
  'Rejilla de ocupación de la cancha del club del usuario (staff only). Fila por (día Lun..Sáb, franja hora_inicio, grupo): ocupados/cupo/pct de las sesiones no canceladas de los últimos p_dias.';

-- v24 revocó los default privileges de anon sobre TABLAS, no sobre FUNCIONES
-- (el baseline otorga GRANT ALL ON FUNCTIONS a anon por default privileges).
REVOKE ALL ON FUNCTION public.fn_ocupacion_cancha(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ocupacion_cancha(int) TO authenticated, service_role;
