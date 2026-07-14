-- ============================================================================
-- v33 — Registro público con club validado + solicitudes de ingreso.
--
-- Problema (detectado en la revisión del flujo de registro 2026-07-14):
--   1. El formulario público guardaba el club como texto libre sin validar
--      (con fallback 'Black Gold'), así que un typo dejaba al atleta en un
--      club fantasma invisible para todo el staff, y un acierto lo metía al
--      club real SIN ninguna aprobación.
--   2. No existía ciclo de aprobación: la cuenta quedaba operativa (login
--      inmediato con contraseña = cédula) desde el registro.
--
-- Diseño (decisiones de producto del dueño, 2026-07-14):
--   - El registrante elige un club REAL (RPC pública `listar_clubes_publicos`,
--     único camino de lectura para anon) y nace con `usuarios.estado =
--     'pendiente'`.
--   - El pendiente puede iniciar sesión pero el frontend solo le muestra la
--     pantalla "solicitud en revisión" (gate por `usuarios.estado`).
--   - Solo el OWNER del club (o superadmin) resuelve solicitudes, vía RPC
--     `resolver_solicitud_registro` (el coach no; el trigger de columnas
--     protege `estado` server-side incluso contra PostgREST directo).
--   - Los agregados operativos (pagos del mes, retención, audiencias) ignoran
--     a pendientes/rechazados.
--
-- `usuarios.estado` es el estado de la CUENTA (pendiente/activo/rechazado);
-- `atletas.estado_membresia` (v31) sigue siendo el ciclo de vida deportivo
-- (activo/inactivo/baja) de miembros ya aprobados. Son ortogonales.
-- ============================================================================


-- ------------------------------------------------------------
-- 1. usuarios.estado — estado de la cuenta.
--    DEFAULT 'activo' backfillea a todos los existentes (usuarios reales y
--    seeds, que insertan sin la columna): nadie pierde acceso con el deploy.
-- ------------------------------------------------------------

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'activo';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_estado_check') THEN
    ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_estado_check
      CHECK (estado IN ('pendiente', 'activo', 'rechazado'));
  END IF;
END $$;

-- La bandeja del owner consulta "pendientes de mi club": índice parcial barato.
CREATE INDEX IF NOT EXISTS idx_usuarios_estado_pendiente
  ON public.usuarios (club) WHERE estado = 'pendiente';


-- ------------------------------------------------------------
-- 2. Trigger de columnas protegidas: `estado` solo lo cambian owner/superadmin.
--    Sin esto, el propio pendiente podría auto-aprobarse (usuarios_update
--    permite editar la fila propia) y un coach podría aprobar vía PostgREST.
--    Cuerpo idéntico a v24 salvo el guard nuevo; el trigger no se recrea.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.proteger_columnas_usuarios()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caminos sin sesión de app (service_role, SECURITY DEFINER internos,
  -- triggers) pasan directo, como en v24.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- `estado` es más estricto que el resto: ni siquiera el coach (staff)
  -- puede tocarlo — aprobar/rechazar es del dueño del club.
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND current_user_rol() NOT IN ('owner', 'superadmin') THEN
    RAISE EXCEPTION 'Solo el dueño del club puede cambiar el estado de una cuenta.';
  END IF;
  IF es_staff() THEN
    RETURN NEW;
  END IF;
  IF NEW.rol IS DISTINCT FROM OLD.rol
     OR NEW.club IS DISTINCT FROM OLD.club
     OR NEW.cedula IS DISTINCT FROM OLD.cedula
     OR NEW.fecha_nacimiento IS DISTINCT FROM OLD.fecha_nacimiento
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION 'No tienes permiso para modificar campos protegidos del perfil.';
  END IF;
  RETURN NEW;
END;
$$;


-- ------------------------------------------------------------
-- 3. Lista pública de clubes para el selector del formulario de registro.
--    anon no puede leer tablas (v24), este es su único camino. Criterio:
--    un club es inscribible si tiene al menos un owner activo que pueda
--    aprobar la solicitud (club_config no sirve: puede haber config sin owner).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.listar_clubes_publicos()
RETURNS TABLE (club text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT u.club
  FROM usuarios u
  WHERE u.rol = 'owner' AND u.estado = 'activo'
    AND u.club IS NOT NULL AND btrim(u.club) <> ''
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.listar_clubes_publicos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_clubes_publicos() TO anon, authenticated, service_role;


-- ------------------------------------------------------------
-- 4. registrar_publico v33: valida el club contra la misma lista (adiós al
--    texto libre y al fallback 'Black Gold') y crea las cuentas nuevas en
--    'pendiente'. Cuerpo base: v24 §3. Un padre que ya existía (otro hijo)
--    conserva su estado: no se degrada a pendiente.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.registrar_publico(p_atleta jsonb, p_padre jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_atleta_id uuid;
  v_atleta_id uuid;
  v_padre_id uuid;
  v_padre_existente boolean := false;
  v_padre_cedula text;
  v_fecha_nac date;
  v_club text;
BEGIN
  IF COALESCE(p_atleta->>'cedula', '') = '' OR COALESCE(p_atleta->>'nombre', '') = ''
     OR COALESCE(p_atleta->>'fecha_nacimiento', '') = '' THEN
    RAISE EXCEPTION 'Cédula, nombre y fecha de nacimiento del atleta son obligatorios.';
  END IF;

  v_fecha_nac := (p_atleta->>'fecha_nacimiento')::date;

  v_club := NULLIF(btrim(p_atleta->>'club'), '');
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'Selecciona el club al que deseas inscribirte.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE rol = 'owner' AND estado = 'activo' AND club = v_club
  ) THEN
    RAISE EXCEPTION 'El club "%" no existe o no acepta inscripciones en línea.', v_club;
  END IF;

  BEGIN
    INSERT INTO usuarios (cedula, nombre, correo, telefono, fecha_nacimiento, rol, club, categoria, genero, estado)
    VALUES (
      p_atleta->>'cedula',
      p_atleta->>'nombre',
      NULLIF(p_atleta->>'correo', ''),
      NULLIF(p_atleta->>'telefono', ''),
      v_fecha_nac,
      'atleta',
      v_club,
      calcular_categoria_feb(v_fecha_nac),
      COALESCE(NULLIF(p_atleta->>'genero', ''), 'Masculino'),
      'pendiente'
    )
    RETURNING id INTO v_usuario_atleta_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'La cédula "%" ya se encuentra registrada en el sistema. Por favor, verifica los datos.',
      p_atleta->>'cedula';
  END;

  INSERT INTO atletas (usuario_id, edad, posicion)
  VALUES (
    v_usuario_atleta_id,
    GREATEST(0, date_part('year', age(v_fecha_nac)))::int,
    COALESCE(NULLIF(p_atleta->>'posicion', ''), 'N/A')
  )
  RETURNING id INTO v_atleta_id;

  IF p_padre IS NOT NULL AND COALESCE(p_padre->>'telefono', '') <> '' THEN
    v_padre_cedula := 'PADRE_' || (p_padre->>'telefono');

    SELECT id INTO v_padre_id FROM usuarios WHERE cedula = v_padre_cedula;
    IF v_padre_id IS NOT NULL THEN
      v_padre_existente := true;
    ELSE
      BEGIN
        INSERT INTO usuarios (cedula, nombre, correo, telefono, rol, club, estado)
        VALUES (
          v_padre_cedula,
          p_padre->>'nombre',
          NULLIF(p_padre->>'correo', ''),
          p_padre->>'telefono',
          'padre',
          v_club,
          'pendiente'
        )
        RETURNING id INTO v_padre_id;
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'El teléfono del representante "%" ya está registrado con otro padre.',
          p_padre->>'telefono';
      END;
    END IF;

    INSERT INTO padres_atletas (padre_id, atleta_id)
    VALUES (v_padre_id, v_atleta_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'atleta_usuario_id', v_usuario_atleta_id,
    'atleta_id', v_atleta_id,
    'padre_id', v_padre_id,
    'padre_existente', v_padre_existente,
    'padre_cedula', v_padre_cedula,
    'estado', 'pendiente'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_publico(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_publico(jsonb, jsonb) TO anon, authenticated;


-- ------------------------------------------------------------
-- 5. resolver_solicitud_registro — el owner del club (o superadmin) aprueba
--    o rechaza. Aprueba/rechaza también a los padres pendientes vinculados;
--    al rechazar, un padre solo cae si no le queda otro hijo activo/pendiente.
--    Patrón de gates: resolver_comprobante (v27).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolver_solicitud_registro(p_usuario_id uuid, p_accion text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol text := current_user_rol();
  v_target usuarios%ROWTYPE;
  v_padres int := 0;
BEGIN
  IF v_rol IS NULL OR v_rol NOT IN ('owner', 'superadmin') THEN
    RAISE EXCEPTION 'Solo el dueño del club puede resolver solicitudes de registro.';
  END IF;
  IF p_accion NOT IN ('aprobar', 'rechazar') THEN
    RAISE EXCEPTION 'Acción inválida: use aprobar o rechazar.';
  END IF;

  SELECT * INTO v_target FROM usuarios WHERE id = p_usuario_id;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Usuario inexistente.';
  END IF;
  IF v_target.rol <> 'atleta' THEN
    RAISE EXCEPTION 'La solicitud debe ser de un atleta.';
  END IF;
  IF v_target.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'La solicitud ya fue resuelta (estado: %).', v_target.estado;
  END IF;
  IF v_rol = 'owner' AND v_target.club IS DISTINCT FROM current_user_club() THEN
    RAISE EXCEPTION 'El atleta no pertenece a tu club.';
  END IF;

  IF p_accion = 'aprobar' THEN
    UPDATE usuarios SET estado = 'activo' WHERE id = p_usuario_id;
    -- El registro público no fija fecha_alta (v31); la membresía arranca
    -- cuando el club aprueba.
    UPDATE atletas SET fecha_alta = COALESCE(fecha_alta, current_date)
      WHERE usuario_id = p_usuario_id;
    UPDATE usuarios p SET estado = 'activo'
      WHERE p.rol = 'padre' AND p.estado = 'pendiente'
        AND p.id IN (
          SELECT pa.padre_id FROM padres_atletas pa
          JOIN atletas a ON a.id = pa.atleta_id
          WHERE a.usuario_id = p_usuario_id
        );
    GET DIAGNOSTICS v_padres = ROW_COUNT;
  ELSE
    UPDATE usuarios SET estado = 'rechazado' WHERE id = p_usuario_id;
    UPDATE usuarios p SET estado = 'rechazado'
      WHERE p.rol = 'padre' AND p.estado = 'pendiente'
        AND p.id IN (
          SELECT pa.padre_id FROM padres_atletas pa
          JOIN atletas a ON a.id = pa.atleta_id
          WHERE a.usuario_id = p_usuario_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM padres_atletas pa2
          JOIN atletas a2 ON a2.id = pa2.atleta_id
          JOIN usuarios u2 ON u2.id = a2.usuario_id
          WHERE pa2.padre_id = p.id
            AND u2.id <> p_usuario_id
            AND u2.estado IN ('activo', 'pendiente')
        );
    GET DIAGNOSTICS v_padres = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'usuario_id', p_usuario_id,
    'accion', p_accion,
    'padres_afectados', v_padres
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolver_solicitud_registro(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_solicitud_registro(uuid, text) TO authenticated, service_role;


-- ------------------------------------------------------------
-- 6. generar_pagos_mes: un pendiente/rechazado no genera mensualidad.
--    Cuerpo base: v28b (el fix de min(uuid)); único cambio: filtro de estado
--    en el JOIN a usuarios.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generar_pagos_mes(
  p_mes            integer,
  p_anio           integer,
  p_club           text DEFAULT NULL,
  p_registrado_por uuid DEFAULT NULL
) RETURNS integer   -- nº de pagos creados
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_creados integer;
BEGIN
  -- Esta función es SECURITY DEFINER: desde la app solo la puede invocar el
  -- staff. El pg_cron corre sin auth.uid() (contexto de sistema) y no queda
  -- bloqueado; un padre/atleta autenticado sí.
  IF auth.uid() IS NOT NULL AND NOT public.es_staff() THEN
    RAISE EXCEPTION 'solo staff puede generar pagos';
  END IF;

  IF p_mes < 1 OR p_mes > 12 THEN RAISE EXCEPTION 'mes inválido: %', p_mes; END IF;
  IF p_anio < 2024 OR p_anio > 2100 THEN RAISE EXCEPTION 'año inválido: %', p_anio; END IF;

  WITH atl AS (
    SELECT a.id AS atleta_id, u.club,
           COALESCE(g.precio_mensual, 30.00) AS base,
           COALESCE(a.descuento_pct, 0)      AS desc_ind,
           COALESCE(a.beca_pct, 0)           AS beca,
           COALESCE(a.es_becado, false)      AS es_becado,
           -- Representante canónico: el marcado como es_rep_pagos si existe,
           -- si no el menor padre_id (determinista; min(uuid) no existe como
           -- agregado, de ahí el ORDER BY ... LIMIT 1). Un atleta con dos
           -- representantes cuenta una sola vez (agrupamos por atleta).
           COALESCE(
             (SELECT pa.padre_id FROM padres_atletas pa
               WHERE pa.atleta_id = a.id AND pa.es_rep_pagos
               ORDER BY pa.padre_id LIMIT 1),
             (SELECT pa.padre_id FROM padres_atletas pa
               WHERE pa.atleta_id = a.id
               ORDER BY pa.padre_id LIMIT 1)
           ) AS rep
    FROM atletas a
    -- v33: las cuentas pendientes/rechazadas no facturan.
    JOIN usuarios u ON u.id = a.usuario_id AND u.rol = 'atleta' AND u.estado = 'activo'
    LEFT JOIN grupos_entrenamiento g ON g.id = a.grupo_id
    WHERE (p_club IS NULL OR u.club = p_club)
  ),
  fam AS (
    SELECT atl.*,
           -- Dentro de una familia (mismo club+rep) con 2+ atletas, la
           -- mensualidad más cara paga completo (rnk=1); las más baratas
           -- reciben el descuento por hermanos.
           CASE WHEN rep IS NULL THEN 1
                ELSE ROW_NUMBER() OVER (PARTITION BY club, rep ORDER BY base DESC, atleta_id) END AS rnk,
           CASE WHEN rep IS NULL THEN 1
                ELSE COUNT(*)      OVER (PARTITION BY club, rep) END AS fam_size
    FROM atl
  ),
  calc AS (
    SELECT f.*,
           COALESCE(c.dia_vencimiento, 5) AS dia_venc,
           CASE WHEN f.fam_size > 1 AND f.rnk > 1
                THEN COALESCE(c.descuento_hermanos_pct, 0) ELSE 0 END AS herm_pct
    FROM fam f
    LEFT JOIN club_config c ON c.club = f.club
  ),
  final AS (
    SELECT calc.*, GREATEST(desc_ind, beca, herm_pct) AS pct FROM calc
  )
  INSERT INTO pagos (atleta_id, tipo, mes, anio, monto_base, descuento_pct, monto_final,
                     estado, fecha_vencimiento, registrado_por, notas)
  SELECT atleta_id, 'Mensualidad', p_mes, p_anio, base, pct,
         ROUND(base * (1 - pct / 100.0), 2),
         CASE WHEN beca >= 100 OR es_becado THEN 'Becado' ELSE 'Pendiente' END,
         make_date(p_anio, p_mes, LEAST(GREATEST(dia_venc, 1), 28)),
         p_registrado_por,
         CASE
           WHEN beca >= 100 OR es_becado          THEN 'Beca completa'
           WHEN pct = 0                            THEN ''
           WHEN pct = beca AND beca > 0            THEN 'Beca ' || beca || '%'
           WHEN pct = herm_pct AND herm_pct > 0    THEN 'Desc. hermanos ' || pct || '%'
           ELSE 'Desc. individual ' || pct || '%'
         END
  FROM final
  ON CONFLICT (atleta_id, mes, anio, tipo) DO NOTHING;

  GET DIAGNOSTICS v_creados = ROW_COUNT;
  RETURN v_creados;
END;
$$;


-- ------------------------------------------------------------
-- 7. fn_retencion_club: pendientes/rechazados fuera del gauge de retención.
--    Los dados de baja siguen contando (su usuarios.estado sigue 'activo';
--    la baja vive en atletas.estado_membresia). Cuerpo base: v31 §5.
-- ------------------------------------------------------------

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
      AND u.estado = 'activo'   -- v33: cuentas no aprobadas no son membresía
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


-- ------------------------------------------------------------
-- 8. resolver_audiencia: las comunicaciones no segmentan hacia cuentas no
--    aprobadas. (El frontend hoy resuelve audiencias client-side sobre
--    fetchTodosLosAtletas — que ya filtra estado — pero la RPC sigue
--    ejecutable por authenticated: se alinea igual.) Cuerpo base: baseline.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolver_audiencia(
  p_segmento_tipo text,
  p_params jsonb DEFAULT '{}'::jsonb,
  p_incluir_reps boolean DEFAULT true,
  p_club text DEFAULT NULL
) RETURNS TABLE (usuario_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public   -- el baseline no lo fijaba; hardening estándar v24
AS $$
BEGIN
  RETURN QUERY
  WITH atletas_base AS (
    SELECT a.id AS atleta_id, u.id AS usuario_id
    FROM atletas a
    JOIN usuarios u ON u.id = a.usuario_id
    WHERE u.estado = 'activo'   -- v33
      AND (p_club IS NULL OR u.club = p_club)
      AND CASE p_segmento_tipo

        WHEN 'general' THEN true

        WHEN 'individual' THEN
          a.id = (p_params->>'atleta_id')::uuid
          OR u.id = (p_params->>'usuario_id')::uuid

        WHEN 'individualizado' THEN
          u.id IN (SELECT (jsonb_array_elements_text(p_params->'usuario_ids'))::uuid)

        WHEN 'grupo' THEN
          a.id IN (SELECT ag.atleta_id FROM atleta_grupo ag
                   WHERE ag.grupo_id = (p_params->>'grupo_id')::uuid)

        WHEN 'grupos_limitados' THEN
          a.id IN (SELECT ag.atleta_id FROM atleta_grupo ag
                   WHERE ag.grupo_id IN (
                     SELECT (jsonb_array_elements_text(p_params->'grupo_ids'))::uuid))

        WHEN 'categoria' THEN
          calcular_categoria_feb(u.fecha_nacimiento) = ANY (
            SELECT jsonb_array_elements_text(p_params->'categorias'))

        WHEN 'edad' THEN
          date_part('year', age(u.fecha_nacimiento))
            BETWEEN COALESCE((p_params->>'edad_min')::int, 0)
                AND COALESCE((p_params->>'edad_max')::int, 200)

        WHEN 'genero' THEN
          u.genero = (p_params->>'genero')

        WHEN 'compuesto' THEN
          (NOT (p_params->'filtros' ? 'genero')
             OR u.genero = (p_params->'filtros'->>'genero'))
          AND (NOT (p_params->'filtros' ? 'grupo_id')
             OR a.id IN (SELECT ag.atleta_id FROM atleta_grupo ag
                         WHERE ag.grupo_id = (p_params->'filtros'->>'grupo_id')::uuid))
          AND (NOT (p_params->'filtros' ? 'categoria')
             OR calcular_categoria_feb(u.fecha_nacimiento) = (p_params->'filtros'->>'categoria'))
          AND (NOT (p_params->'filtros' ? 'edad_min')
             OR date_part('year', age(u.fecha_nacimiento)) >= (p_params->'filtros'->>'edad_min')::int)
          AND (NOT (p_params->'filtros' ? 'edad_max')
             OR date_part('year', age(u.fecha_nacimiento)) <= (p_params->'filtros'->>'edad_max')::int)

        ELSE false
      END
  )
  -- Atletas resueltos
  SELECT ab.usuario_id FROM atletas_base ab
  UNION
  -- + representantes vinculados (si se solicita)
  SELECT pa.padre_id FROM padres_atletas pa
  JOIN atletas_base ab ON ab.atleta_id = pa.atleta_id
  WHERE p_incluir_reps = true;
END;
$$;

REVOKE ALL ON FUNCTION public.resolver_audiencia(text, jsonb, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_audiencia(text, jsonb, boolean, text) TO authenticated, service_role;
