-- ============================================================================
-- v46 — MEDIA CUOTA PARA ALTAS DESDE EL DÍA 15 (decisión del owner 2026-07-22)
-- ============================================================================
-- Regla de dos tramos elegida por el owner en la sesión de decisiones de
-- producto (docs/pagos_diseno.md §10.2): el atleta que se da de alta ANTES del
-- día 15 paga su primer mes completo; el que entra EL 15 O DESPUÉS paga el 50%
-- de la mensualidad. Solo aplica al mes de `atletas.fecha_alta` (v31, la fija
-- el flujo de aprobación de solicitudes de v33) y SOLO a la fila 'Mensualidad':
-- los add-ons (v39) se contratan aparte y no tienen fecha de alta por grupo.
--
-- DISEÑO (mantiene la invariante monto_final = monto_base × (1 − descuento_pct)):
--   · La media cuota se modela BAJANDO monto_base a la mitad (lo que corresponde
--     facturar ese mes ES la mitad), no como un descuento_pct compuesto —
--     descuento_pct sigue siendo GREATEST(individual, beca, hermanos) intacto.
--   · La nota del pago deja rastro: «Media cuota (alta DD/MM)».
--   · El ranking familiar sigue ordenando por `base` completa: un hermano nuevo
--     con el grupo más caro encabeza el rank aunque este mes pague la mitad
--     (efecto neto equivalente para la familia; evita reordenar por un estado
--     transitorio de un solo mes).
--   · fecha_alta NULL → sin ajuste (mes completo), como hasta ahora.
--   · La función es idempotente por ON CONFLICT: si el pago del mes ya existía
--     cuando el atleta entró, una re-corrida NO lo reescribe (el owner puede
--     ajustar ese caso a mano, como cualquier corrección puntual).
--
-- Cuerpo textual de v42 (fallback $30 muerto) + este delta. Firma INTACTA —
-- ver v39 §4/§5: cambiar el orden de los parámetros crearía una sobrecarga
-- silenciosa; el guard de abajo revienta si quedan ≠1 definiciones.
-- ============================================================================

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
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.es_staff() THEN
      RAISE EXCEPTION 'solo staff puede generar pagos';
    END IF;
    -- v40: el club NO lo elige quien llama. Se ignora p_club y se deriva de la
    -- sesión, como fn_coach_stats/fn_retencion_club (v31/v32). Antes, un coach
    -- facturaba a otro club pasando su nombre, o a todos con p_club=NULL.
    -- El superadmin conserva el alcance de plataforma (incluido NULL = todos).
    IF NOT public.es_superadmin() THEN
      p_club := public.current_user_club();
      IF p_club IS NULL THEN
        RAISE EXCEPTION 'tu cuenta no tiene club: no se puede generar la mensualidad';
      END IF;
    END IF;
  END IF;

  IF p_mes < 1 OR p_mes > 12 THEN RAISE EXCEPTION 'mes inválido: %', p_mes; END IF;
  IF p_anio < 2024 OR p_anio > 2100 THEN RAISE EXCEPTION 'año inválido: %', p_anio; END IF;

  WITH atl AS (
    SELECT a.id AS atleta_id, u.club,
           a.grupo_id,
           a.fecha_alta,
           -- v42: sin COALESCE a 30.00 — el precio sale del grupo o no existe.
           g.precio_mensual                  AS base,
           COALESCE(a.descuento_pct, 0)      AS desc_ind,
           COALESCE(a.beca_pct, 0)           AS beca,
           COALESCE(a.es_becado, false)      AS es_becado,
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
      -- v34: ni los dados de baja. COALESCE por simetría con el JS (esBaja):
      -- estado ausente = activo.
      AND COALESCE(a.estado_membresia, 'activo') = 'activo'
  ),
  fam AS (
    SELECT atl.*,
           -- v42: NULLS LAST — un hermano sin grupo no debe encabezar el rank
           -- (pagaría "completo" un $0 y regalaría el descuento al que sí paga).
           CASE WHEN rep IS NULL THEN 1
                ELSE ROW_NUMBER() OVER (PARTITION BY club, rep ORDER BY base DESC NULLS LAST, atleta_id) END AS rnk,
           CASE WHEN rep IS NULL THEN 1
                ELSE COUNT(*)      OVER (PARTITION BY club, rep) END AS fam_size
    FROM atl
  ),
  calc AS (
    SELECT f.*,
           COALESCE(c.dia_vencimiento, 5) AS dia_venc,
           CASE WHEN f.fam_size > 1 AND f.rnk > 1
                THEN COALESCE(c.descuento_hermanos_pct, 0) ELSE 0 END AS herm_pct,
           -- v46: media cuota si el alta cae en el mes facturado, del 15 en
           -- adelante. fecha_alta NULL nunca cumple (mes completo).
           (f.fecha_alta >= make_date(p_anio, p_mes, 15)
            AND f.fecha_alta < (make_date(p_anio, p_mes, 1) + interval '1 month')) AS media_cuota
    FROM fam f
    LEFT JOIN club_config c ON c.club = f.club
  ),
  final AS (
    SELECT calc.*,
           GREATEST(desc_ind, beca, herm_pct) AS pct,
           -- v46: lo facturable del mes — la mitad si el alta fue del 15 en
           -- adelante. `base` intacta para el ranking familiar de arriba.
           CASE WHEN COALESCE(media_cuota, false)
                THEN ROUND(base / 2.0, 2) ELSE base END AS base_mes
    FROM calc
  ),
  -- v46: notas de la mensualidad pre-calculadas para componer descuento y
  -- media cuota sin separadores huérfanos. Los add-ons siguen armando la suya.
  etiquetado AS (
    SELECT final.*,
           CASE
             WHEN beca >= 100 OR es_becado          THEN 'Beca completa'
             WHEN pct = 0                            THEN ''
             WHEN pct = beca AND beca > 0            THEN 'Beca ' || beca || '%'
             WHEN pct = herm_pct AND herm_pct > 0    THEN 'Desc. hermanos ' || pct || '%'
             ELSE 'Desc. individual ' || pct || '%'
           END AS nota_desc,
           CASE WHEN COALESCE(media_cuota, false)
                THEN 'Media cuota (alta ' || to_char(fecha_alta, 'DD/MM') || ')'
                ELSE NULL END AS nota_media
    FROM final
  ),
  -- (a) LA MENSUALIDAD — solo con grupo básico y precio real (v42).
  ins_mens AS (
    INSERT INTO pagos (atleta_id, tipo, grupo_id, mes, anio, monto_base, descuento_pct, monto_final,
                       estado, fecha_vencimiento, registrado_por, notas)
    SELECT atleta_id, 'Mensualidad', grupo_id, p_mes, p_anio, base_mes, pct,
           ROUND(base_mes * (1 - pct / 100.0), 2),
           CASE WHEN beca >= 100 OR es_becado THEN 'Becado' ELSE 'Pendiente' END,
           make_date(p_anio, p_mes, LEAST(GREATEST(dia_venc, 1), 28)),
           p_registrado_por,
           CASE
             WHEN nota_media IS NULL THEN nota_desc
             WHEN nota_desc = ''     THEN nota_media
             ELSE nota_desc || ' · ' || nota_media
           END
    FROM etiquetado
    -- v42: el espejo de "sin precio no factura" de los add-ons (v40:406).
    WHERE COALESCE(base, 0) > 0
    -- El predicado se repite porque el índice es PARCIAL: sin él, Postgres no
    -- puede inferirlo y la función revienta con 42P10 en cada corrida.
    ON CONFLICT (atleta_id, mes, anio, tipo) WHERE mes IS NOT NULL AND tipo <> 'Adicional' DO NOTHING
    RETURNING 1
  ),
  -- (b) LOS ADD-ONS — una línea por grupo extra facturable (v39). Hereda `pct`
  --     del atleta: el add-on respeta beca y descuento de hermanos. La media
  --     cuota de v46 NO los toca (se contratan aparte, sin fecha de alta).
  ins_add AS (
    INSERT INTO pagos (atleta_id, tipo, grupo_id, mes, anio, monto_base, descuento_pct, monto_final,
                       estado, fecha_vencimiento, registrado_por, notas, concepto)
    SELECT f.atleta_id, 'Adicional', g.id, p_mes, p_anio, g.precio_mensual, f.pct,
           ROUND(g.precio_mensual * (1 - f.pct / 100.0), 2),
           CASE WHEN f.beca >= 100 OR f.es_becado THEN 'Becado' ELSE 'Pendiente' END,
           make_date(p_anio, p_mes, LEAST(GREATEST(f.dia_venc, 1), 28)),
           p_registrado_por,
           CASE
             WHEN f.beca >= 100 OR f.es_becado       THEN 'Beca completa'
             WHEN f.pct = 0                           THEN ''
             WHEN f.pct = f.beca AND f.beca > 0       THEN 'Beca ' || f.beca || '%'
             WHEN f.pct = f.herm_pct AND f.herm_pct > 0 THEN 'Desc. hermanos ' || f.pct || '%'
             ELSE 'Desc. individual ' || f.pct || '%'
           END,
           'Grupo adicional: ' || g.nombre
      FROM final f
      JOIN atleta_grupo ag ON ag.atleta_id = f.atleta_id
                          AND ag.rol_membresia = 'adicional'
                          AND ag.facturable
      JOIN grupos_entrenamiento g ON g.id = ag.grupo_id
     WHERE g.activo
       AND NOT g.es_principal          -- un principal jamás se cobra como add-on (D2)
       AND g.club = f.club             -- defensa: nunca facturar un grupo de otro club
       AND COALESCE(g.precio_mensual, 0) > 0  -- sin precio no factura (no se inventa uno)
    ON CONFLICT (atleta_id, mes, anio, grupo_id) WHERE tipo = 'Adicional' DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM ins_mens) + (SELECT count(*) FROM ins_add) INTO v_creados;

  RETURN v_creados;
END;
$$;

-- Guard de v39 §5 (repetido aquí como en v40/v42): que nunca convivan dos
-- sobrecargas de generar_pagos_mes. Si esta migración cambiara el orden de
-- los parámetros, el push revienta en vez de dejar dos versiones en silencio.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_proc
   WHERE proname = 'generar_pagos_mes' AND pronamespace = 'public'::regnamespace;
  IF n <> 1 THEN
    RAISE EXCEPTION 'generar_pagos_mes tiene % definiciones; debe haber exactamente 1 (¿cambió el orden de los parámetros?)', n;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.generar_pagos_mes(integer, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generar_pagos_mes(integer, integer, text, uuid) TO authenticated, service_role;
