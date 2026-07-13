-- ============================================================================
-- v28b — Fix: generar_pagos_mes fallaba SIEMPRE con "function min(uuid) does
-- not exist".
--
-- El fallback de representante canónico en v28 usaba MIN(pa.padre_id), pero
-- padre_id es uuid y Postgres no define el agregado min(uuid), así que la
-- función fallaba en planificación en cada invocación (botón "Generar Mes" y
-- pg_cron mensual). Se reemplaza por ORDER BY padre_id LIMIT 1, que es igual
-- de determinista. De paso, el lookup de es_rep_pagos también ordena por
-- padre_id para ser determinista si hubiera dos representantes marcados.
-- Detectado por la auditoría UX 2026-07-13
-- (docs/auditoria_ux_arcade_convergencia.md §7.5).
--
-- El resto del cuerpo es idéntico a v28.
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
    JOIN usuarios u ON u.id = a.usuario_id AND u.rol = 'atleta'
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
