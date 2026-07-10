-- ============================================================
-- MIGRACIÓN v29 — Aislamiento por club en las políticas "staff"
-- ============================================================
-- v24 (2026-07-07) dejó documentado a propósito (ver su comentario de
-- cabecera, sección "Modelo de autorización") que las tablas operativas
-- hijas NO se filtran por club para el rol staff: "hoy opera un solo
-- club... afinar multi-club fila a fila es trabajo futuro declarado".
-- Esa simplificación era razonable cuando solo existía un club real.
--
-- Desde entonces el proyecto usa clubes de prueba adicionales (QA Demo
-- Club, clubes de simulación) en el mismo entorno, y se confirmó en vivo
-- que cualquier coach/owner puede leer y ESCRIBIR (las políticas son
-- FOR ALL) datos de atletas de otro club: asistencia, evaluaciones,
-- pagos, XP/recompensas, notas del coach, aprobación de misiones, etc.
-- Esta migración cierra ese hueco agregando el mismo criterio de club
-- que ya usan usuarios_select/atletas_select/grupos_select desde v24,
-- sin cambiar QUIÉN puede actuar (staff sigue siendo staff) — solo
-- restringe el alcance a su propio club (superadmin sigue cruzando).
--
-- Fuera de alcance deliberado (no tocadas en esta migración):
--   * misiones, ejercicios_catalogo: catálogos globales por diseño
--     (misiones_select/ejercicios_select ya son USING(true) para
--     cualquier usuario logueado — no tienen columna de club).
--   * catalogo_ejercicios, catalogo_sesiones: ya scopeadas por club_id
--     desde v24 (cat_ejercicios_write/cat_sesiones_write).
--   * grupos_mision, grupos_mision_miembros: sin uso en el frontend
--     (grep en src/ sin resultados) y sin relación de club establecida
--     en el esquema — no se les inventa un criterio de scoping.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Helper: club del atleta dueño de una fila hija (SECURITY DEFINER,
--    mismo patrón que club_de_usuario() de v24).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.club_de_atleta(p_atleta_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.club
  FROM atletas a
  JOIN usuarios u ON u.id = a.usuario_id
  WHERE a.id = p_atleta_id;
$$;

REVOKE ALL ON FUNCTION public.club_de_atleta(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.club_de_atleta(uuid) TO authenticated, service_role;


-- ------------------------------------------------------------
-- 2. atletas — insert/update/delete no tenían el filtro de club que
--    atletas_select sí aplica desde v24.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS atletas_insert ON public.atletas;
CREATE POLICY atletas_insert ON public.atletas FOR INSERT TO authenticated
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND club_de_usuario(usuario_id) = (select current_user_club()))
  );

DROP POLICY IF EXISTS atletas_update ON public.atletas;
CREATE POLICY atletas_update ON public.atletas FOR UPDATE TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND club_de_usuario(usuario_id) = (select current_user_club()))
    OR usuario_id = (select current_usuario_id())
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND club_de_usuario(usuario_id) = (select current_user_club()))
    OR usuario_id = (select current_usuario_id())
  );

DROP POLICY IF EXISTS atletas_delete ON public.atletas;
CREATE POLICY atletas_delete ON public.atletas FOR DELETE TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND club_de_usuario(usuario_id) = (select current_user_club()))
  );


-- ------------------------------------------------------------
-- 3. padres_atletas
-- ------------------------------------------------------------
DROP POLICY IF EXISTS padres_atletas_select ON public.padres_atletas;
CREATE POLICY padres_atletas_select ON public.padres_atletas FOR SELECT TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
    OR padre_id = (select current_usuario_id())
    OR atleta_id IN (SELECT unnest(mis_atletas()))
  );

DROP POLICY IF EXISTS padres_atletas_write ON public.padres_atletas;
CREATE POLICY padres_atletas_write ON public.padres_atletas FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  );


-- ------------------------------------------------------------
-- 4. Tablas hijas con atleta_id directo (asistencia, evaluaciones,
--    readiness, encuestas, notas del coach, observaciones, screening,
--    sesiones individuales, pagos, recompensas, progreso de misiones).
--    atleta_id IS NULL se deja pasar donde la columna es nullable —
--    mismo criterio que "club IS NULL" en eventos_staff (v24): filas
--    sin atleta asociado no tienen club que exigir.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS asistencia_staff ON public.asistencia;
CREATE POLICY asistencia_staff ON public.asistencia FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  );

DROP POLICY IF EXISTS evaluaciones_staff ON public.evaluaciones_pruebas;
CREATE POLICY evaluaciones_staff ON public.evaluaciones_pruebas FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (atleta_id IS NULL OR (select club_de_atleta(atleta_id)) = (select current_user_club())))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (atleta_id IS NULL OR (select club_de_atleta(atleta_id)) = (select current_user_club())))
  );

DROP POLICY IF EXISTS readiness_staff ON public.atleta_readiness;
CREATE POLICY readiness_staff ON public.atleta_readiness FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (atleta_id IS NULL OR (select club_de_atleta(atleta_id)) = (select current_user_club())))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (atleta_id IS NULL OR (select club_de_atleta(atleta_id)) = (select current_user_club())))
  );

DROP POLICY IF EXISTS encuestas_staff ON public.encuestas_habitos;
CREATE POLICY encuestas_staff ON public.encuestas_habitos FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (atleta_id IS NULL OR (select club_de_atleta(atleta_id)) = (select current_user_club())))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (atleta_id IS NULL OR (select club_de_atleta(atleta_id)) = (select current_user_club())))
  );

DROP POLICY IF EXISTS notas_staff ON public.notas_coach;
CREATE POLICY notas_staff ON public.notas_coach FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (atleta_id IS NULL OR (select club_de_atleta(atleta_id)) = (select current_user_club())))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (atleta_id IS NULL OR (select club_de_atleta(atleta_id)) = (select current_user_club())))
  );

DROP POLICY IF EXISTS observaciones_staff ON public.observaciones_cancha;
CREATE POLICY observaciones_staff ON public.observaciones_cancha FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (atleta_id IS NULL OR (select club_de_atleta(atleta_id)) = (select current_user_club())))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (atleta_id IS NULL OR (select club_de_atleta(atleta_id)) = (select current_user_club())))
  );

DROP POLICY IF EXISTS screening_staff ON public.screening_funcional;
CREATE POLICY screening_staff ON public.screening_funcional FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  );

DROP POLICY IF EXISTS ses_entrenamiento_staff ON public.sesiones_entrenamiento;
CREATE POLICY ses_entrenamiento_staff ON public.sesiones_entrenamiento FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  );

DROP POLICY IF EXISTS pagos_staff ON public.pagos;
CREATE POLICY pagos_staff ON public.pagos FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  );

DROP POLICY IF EXISTS recompensas_staff ON public.recompensas_desbloqueadas;
CREATE POLICY recompensas_staff ON public.recompensas_desbloqueadas FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (atleta_id IS NULL OR (select club_de_atleta(atleta_id)) = (select current_user_club())))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (atleta_id IS NULL OR (select club_de_atleta(atleta_id)) = (select current_user_club())))
  );

DROP POLICY IF EXISTS progreso_staff ON public.progreso_misiones;
CREATE POLICY progreso_staff ON public.progreso_misiones FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (atleta_id IS NULL OR (select club_de_atleta(atleta_id)) = (select current_user_club())))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (atleta_id IS NULL OR (select club_de_atleta(atleta_id)) = (select current_user_club())))
  );


-- ------------------------------------------------------------
-- 5. sesiones_control / sesiones_programadas — atleta_id o grupo_id
--    (individuales vs. grupales), ambos nullable.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS ses_control_staff ON public.sesiones_control;
CREATE POLICY ses_control_staff ON public.sesiones_control FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (
      (atleta_id IS NOT NULL AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
      OR (grupo_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM grupos_entrenamiento g
        WHERE g.id = sesiones_control.grupo_id AND g.club = (select current_user_club())
      ))
    ))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (
      (atleta_id IS NOT NULL AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
      OR (grupo_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM grupos_entrenamiento g
        WHERE g.id = sesiones_control.grupo_id AND g.club = (select current_user_club())
      ))
    ))
  );

DROP POLICY IF EXISTS ses_programadas_staff ON public.sesiones_programadas;
CREATE POLICY ses_programadas_staff ON public.sesiones_programadas FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (
      (atleta_id IS NOT NULL AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
      OR (grupo_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM grupos_entrenamiento g
        WHERE g.id = sesiones_programadas.grupo_id AND g.club = (select current_user_club())
      ))
    ))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (
      (atleta_id IS NOT NULL AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
      OR (grupo_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM grupos_entrenamiento g
        WHERE g.id = sesiones_programadas.grupo_id AND g.club = (select current_user_club())
      ))
    ))
  );


-- ------------------------------------------------------------
-- 6. evento_convocados / evento_recordatorios — se scopean vía
--    evento_id → eventos.club (mismo bypass "club IS NULL" que
--    eventos_staff, para eventos legados sin club asignado).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS convocados_staff ON public.evento_convocados;
CREATE POLICY convocados_staff ON public.evento_convocados FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND EXISTS (
      SELECT 1 FROM eventos e
      WHERE e.id = evento_convocados.evento_id
        AND (e.club IS NULL OR e.club = (select current_user_club()))
    ))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND EXISTS (
      SELECT 1 FROM eventos e
      WHERE e.id = evento_convocados.evento_id
        AND (e.club IS NULL OR e.club = (select current_user_club()))
    ))
  );

DROP POLICY IF EXISTS recordatorios_staff ON public.evento_recordatorios;
CREATE POLICY recordatorios_staff ON public.evento_recordatorios FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND EXISTS (
      SELECT 1 FROM eventos e
      WHERE e.id = evento_recordatorios.evento_id
        AND (e.club IS NULL OR e.club = (select current_user_club()))
    ))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND EXISTS (
      SELECT 1 FROM eventos e
      WHERE e.id = evento_recordatorios.evento_id
        AND (e.club IS NULL OR e.club = (select current_user_club()))
    ))
  );


-- ------------------------------------------------------------
-- 7. comunicaciones / comunicacion_destinatarios — comunicaciones no
--    tiene columna de club propia (es segmentada por grupo/atleta/
--    evento/general); se scopea por el club de quien la autoró.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS comunicaciones_staff ON public.comunicaciones;
CREATE POLICY comunicaciones_staff ON public.comunicaciones FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (autor_id IS NULL OR club_de_usuario(autor_id) = (select current_user_club())))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (autor_id IS NULL OR club_de_usuario(autor_id) = (select current_user_club())))
  );

DROP POLICY IF EXISTS comdest_staff ON public.comunicacion_destinatarios;
CREATE POLICY comdest_staff ON public.comunicacion_destinatarios FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND club_de_usuario(usuario_id) = (select current_user_club()))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND club_de_usuario(usuario_id) = (select current_user_club()))
  );


-- ------------------------------------------------------------
-- 8. grupos_entrenamiento (escritura) / atleta_grupo (escritura) —
--    grupos_select ya scopea lectura desde v24; faltaba la escritura.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS grupos_write ON public.grupos_entrenamiento;
CREATE POLICY grupos_write ON public.grupos_entrenamiento FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND club = (select current_user_club()))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND club = (select current_user_club()))
  );

DROP POLICY IF EXISTS atleta_grupo_write ON public.atleta_grupo;
CREATE POLICY atleta_grupo_write ON public.atleta_grupo FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  );
