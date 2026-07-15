-- ============================================================================
-- v35 — El dueño da de alta a los coaches de su club.
--
-- Contexto (petición del dueño, 2026-07-15): "que el owner pueda crear coaches
-- de su club". Hasta ahora los coaches solo nacían por script con service_role:
-- no había ninguna pantalla que insertara staff (el único formulario de alta,
-- /admin/atletas, fuerza rol 'atleta'/'padre').
--
-- Un coach NO tiene tabla propia: es una fila de `usuarios` con rol='coach' y
-- una cuenta de Auth vinculada por auth_user_id. `fn_coach_stats` lo lista con
-- solo mirar rol+club, así que el alta cierra el círculo sin sembrar nada más.
--
-- 1. ESCALADA POR INSERT (preexistente desde v24, hermana de la que cerró v34
--    por UPDATE). `usuarios_insert` admitía a cualquier `es_staff()` con la sola
--    condición de que el rol nuevo no fuese 'superadmin':
--        (es_staff() AND club = current_user_club() AND rol <> 'superadmin')
--    Es decir, un COACH podía crear un 'owner' —o más coaches— de su club. Hoy
--    eso es teórico porque el navegador no puede crear la cuenta de Auth que le
--    daría acceso... pero esta misma migración habilita justo esa vía para el
--    staff, así que la puerta se cierra ANTES de abrir la otra. Ahora el rol que
--    se puede insertar depende de quién inserta:
--      · atleta/padre → cualquier staff (alta por panel, v33)
--      · coach        → owner o superadmin
--      · owner        → solo superadmin
--      · superadmin   → solo superadmin
--
-- 2. `estado='inactivo'`: un coach que deja el club no se borra (las FK de
--    asistencia/sesiones_control son RESTRICT: su historial lo ancla, y con
--    razón). Se desactiva. 'rechazado' es el vocabulario de una solicitud de
--    ingreso denegada y describe mal a un entrenador que se fue; 'inactivo' ya
--    existía en el CHECK de atletas.estado_membresia con ese mismo sentido.
--
-- 3. `fn_coach_stats` deja de rankear a los coaches no activos: hoy no filtra
--    por `estado`, así que un coach desactivado seguiría en el ranking del
--    panel del dueño compitiendo con los que sí entrenan.
--
-- 4. DESACTIVAR DE VERDAD (encontrado en la revisión adversarial de v35).
--    `usuarios.estado` existe desde v33, pero NINGUNA comprobación server-side
--    lo miraba: `es_staff()`/`es_superadmin()` (v24 §1) resuelven solo por
--    `rol`. El único gate era `PrivateRoute` — JavaScript en el navegador del
--    propio usuario. Un coach retirado volvía a entrar con su cédula (sigue
--    siendo su contraseña), obtenía un JWT válido y por API conservaba TODO:
--    el padrón del club (usuarios_select), pasar lista, crear atletas, XP.
--    El retiro solo lo borraba del ranking. Ahora `estado='activo'` es
--    condición para ser staff, así que la RLS y todas las Edge Functions que
--    derivan de estos helpers cierran a la vez. No hace falta invalidar el JWT
--    vivo: identifica, pero los permisos se re-evalúan en cada consulta.
--
--    Deliberadamente NO se filtra `current_usuario_id()`: `atletas_select` lo
--    usa para "mi propia fila", y un atleta pendiente (v33) necesita cargarla
--    para que fetchUsuarioCompleto arme su perfil… y así poder mostrarle la
--    pantalla de "solicitud en revisión". Filtrarlo lo dejaría sin perfil y sin
--    pantalla. Tampoco `current_user_rol()`/`current_user_club()`: varios
--    guards hacen `current_user_rol() NOT IN (...)`, y un NULL ahí evalúa a
--    NULL y NO dispara el RAISE — filtrarlos los volvería más permisivos, no
--    menos. Con `es_staff()` cerrado, a un coach inactivo no le queda ninguna
--    vía: las RPC de owner (resolver_comprobante, resolver_solicitud_registro)
--    ya lo rechazan por rol.
-- ============================================================================


-- ------------------------------------------------------------
-- 0. Ser staff exige estar activo (ver §4 de la cabecera).
--    Cuerpo base: v24 §1. COALESCE por si `estado` llegara NULL en una fila
--    anterior al DEFAULT de v33 — un dato viejo no debe dejar a nadie fuera.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.es_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT rol IN ('superadmin', 'owner', 'coach') AND COALESCE(estado, 'activo') = 'activo'
     FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1),
    false);
$$;

CREATE OR REPLACE FUNCTION public.es_superadmin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT rol = 'superadmin' AND COALESCE(estado, 'activo') = 'activo'
     FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1),
    false);
$$;


-- ------------------------------------------------------------
-- 1. Quién puede crear a quién.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS usuarios_insert ON public.usuarios;
CREATE POLICY usuarios_insert ON public.usuarios FOR INSERT TO authenticated
  WITH CHECK (
    (select es_superadmin())
    OR (
      (select es_staff())
      AND club = (select current_user_club())
      AND (
        rol IN ('atleta', 'padre')
        OR (rol = 'coach' AND (select current_user_rol()) = 'owner')
      )
    )
  );


-- ------------------------------------------------------------
-- 2. `inactivo` como estado de cuenta (staff retirado).
--    'pendiente'/'rechazado' siguen siendo el vocabulario del registro público
--    (v33); 'inactivo' es la salida reversible de quien ya estuvo dentro.
-- ------------------------------------------------------------

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_estado_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_estado_check
  CHECK (estado IN ('pendiente', 'activo', 'rechazado', 'inactivo'));


-- ------------------------------------------------------------
-- 3. El ranking del dueño solo cuenta coaches activos.
--    Cuerpo base: v31 §4 (fn_coach_stats). Único cambio: el filtro de estado
--    en el CTE `coaches` — que, pese al nombre, es un SELECT sobre `usuarios`
--    (no existe tabla `coaches`).
-- ------------------------------------------------------------

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
      AND u.estado = 'activo'   -- v35: un coach retirado no rankea
      AND es_staff()
      AND (u.club = current_user_club() OR es_superadmin())
  ),
  asis AS (
    SELECT a.coach_id, round(100.0 * count(*) FILTER (WHERE a.estado = 'Presente') / NULLIF(count(*), 0)) AS pct
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
