-- ============================================================================
-- v42 — LA MENSUALIDAD SIN GRUPO CON PRECIO NO SE FACTURA (muere el $30)
-- ============================================================================
-- Desde v28, generar_pagos_mes facturaba $30 a todo atleta activo sin grupo
-- (COALESCE(g.precio_mensual, 30.00) sobre un LEFT JOIN). v37 cerró la puerta
-- de entrada (DROP DEFAULT en precio_mensual) y v38/v39 hicieron del grupo la
-- fuente de verdad de la membresía, pero el fallback siguió vivo: al momento
-- de esta migración, 424 atletas activos sin grupo generaban mensualidad de
-- $30 inventada cada mes por el cron (512 mensualidades históricas con esa
-- base). Se elimina junto con el reset de datos para los clubes simulados:
-- ningún cobro real depende ya de él.
--
-- Semántica nueva (espejo de la regla que los add-ons ya tenían en v39/v40
-- "sin precio no factura, no se inventa uno"):
--   · atleta sin grupo básico            → SIN mensualidad
--   · grupo básico sin precio (NULL/0)   → SIN mensualidad
--   · para dejar de facturar sigue existiendo estado_membresia='baja' (v34);
--     ahora además "no tener grupo" deja de ser un cobro silencioso de $30.
--
-- DOS DECISIONES QUIRÚRGICAS (no mover el filtro de sitio):
--   1. El filtro vive en el INSERT de la mensualidad (ins_mens), NO en el CTE
--      atl: un atleta sin grupo básico pero con grupo adicional facturable
--      debe seguir pagando su add-on (la rama ins_add consume `final`).
--   2. El ranking familiar ordena con NULLS LAST: en Postgres, ORDER BY base
--      DESC pone los NULL primero, así que un hermano sin grupo tomaría
--      rnk=1 ("el que paga completo") y regalaría el descuento de hermanos al
--      único hermano que sí factura.
--
-- Cuerpo textual de v40 §4 (la definición vigente: club derivado de la sesión,
-- add-ons de v39, MIN por padre_id de v28b). Firma INTACTA — ver v39 §4/§5:
-- cambiar el orden de los parámetros crearía una sobrecarga silenciosa.
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
                THEN COALESCE(c.descuento_hermanos_pct, 0) ELSE 0 END AS herm_pct
    FROM fam f
    LEFT JOIN club_config c ON c.club = f.club
  ),
  final AS (
    SELECT calc.*, GREATEST(desc_ind, beca, herm_pct) AS pct FROM calc
  ),
  -- (a) LA MENSUALIDAD — solo con grupo básico y precio real (v42).
  ins_mens AS (
    INSERT INTO pagos (atleta_id, tipo, grupo_id, mes, anio, monto_base, descuento_pct, monto_final,
                       estado, fecha_vencimiento, registrado_por, notas)
    SELECT atleta_id, 'Mensualidad', grupo_id, p_mes, p_anio, base, pct,
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
    -- v42: el espejo de "sin precio no factura" de los add-ons (v40:406).
    WHERE COALESCE(base, 0) > 0
    -- El predicado se repite porque el índice es PARCIAL: sin él, Postgres no
    -- puede inferirlo y la función revienta con 42P10 en cada corrida.
    ON CONFLICT (atleta_id, mes, anio, tipo) WHERE mes IS NOT NULL AND tipo <> 'Adicional' DO NOTHING
    RETURNING 1
  ),
  -- (b) LOS ADD-ONS — una línea por grupo extra facturable (v39). Hereda `pct`
  --     del atleta: el add-on respeta beca y descuento de hermanos.
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

-- Guard de v39 §5 (repetido aquí como en v40): que nunca convivan dos
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
