-- ============================================================================
-- v39 — La factura refleja la membresía: 1 mensualidad + N add-ons.
--
-- Cierra D2 por el lado del dinero: el grupo básico factura la cuota, y cada
-- grupo extra facturable genera su propia línea. El add-on RESPETA beca y
-- descuento de hermanos (decisión del dueño, 2026-07-15).
--
-- DELTA EL DÍA DEL MERGE: CERO. Verificado en la base antes de escribir esto:
-- hay 0 add-ons (`atleta_grupo.rol_membresia='adicional'`), así que el bloque
-- nuevo no inserta ni una fila hasta que el dueño asigne extras desde la ficha
-- del atleta. El cobro es opt-in por configuración, no por deploy.
--
-- LO QUE ESTA MIGRACIÓN NO HACE, A PROPÓSITO: no mata el fallback de $30
-- (COALESCE(g.precio_mensual, 30.00), heredado de v28). Es tentador, y sería un
-- desastre ahora: 424 de los 474 atletas activos NO tienen grupo (415 son de un
-- solo club), así que 512 de las 696 mensualidades vivas salen de ese fallback.
-- Cambiar el LEFT JOIN por un JOIN cortaría 512 cobros de golpe. Ese trabajo
-- necesita que primero cada club tenga sus grupos creados y sus atletas dentro
-- (la pantalla /admin/grupos y la ficha de membresía ya existen para eso).
-- ============================================================================

-- ─── 1. La factura recuerda POR QUÉ GRUPO se cobró ──────────────────────────
-- Hoy el arqueo, el CSV al contador y los KPIs agrupan por
-- `pagos.atletas.grupo_nombre`, que es un JOIN AL PRESENTE: mover a un atleta de
-- grupo reescribe el "recaudado por grupo" de meses ya cerrados. Con la columna,
-- cada línea conserva su atribución.
--
-- ON DELETE SET NULL aquí SÍ es correcto (a diferencia de atletas.grupo_id, ver
-- v37 §4): un pago con grupo_id NULL no cambia de precio — ya está emitido, con
-- su monto_final escrito. Solo pierde la atribución, que es preferible a
-- bloquear el borrado de un grupo para siempre.
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS grupo_id uuid
  REFERENCES public.grupos_entrenamiento(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pagos.grupo_id IS
  'Grupo por el que se emitió esta línea. Para una Mensualidad, el grupo básico del atleta; para un Adicional, el grupo extra. Histórico: NO se recalcula si el atleta cambia de grupo.';

-- Backfill del histórico desde el grupo actual: es la mejor aproximación
-- disponible (nadie registró por qué grupo se cobró). A partir de aquí, exacto.
UPDATE public.pagos p
   SET grupo_id = a.grupo_id
  FROM public.atletas a
 WHERE a.id = p.atleta_id AND p.grupo_id IS NULL AND a.grupo_id IS NOT NULL;

-- ─── 2. El tipo nuevo ───────────────────────────────────────────────────────
ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_tipo_check;
ALTER TABLE public.pagos ADD CONSTRAINT pagos_tipo_check
  CHECK (tipo IN ('Mensualidad','Sesion Individual','Otro','Adicional'));

-- ─── 3. DOS índices, porque las dos líneas tienen reglas distintas ──────────
-- El UNIQUE (atleta_id, mes, anio, tipo) de v27 permite UNA fila por tipo y mes:
-- con él, un atleta con dos add-ons pierde el segundo por el ON CONFLICT.
--
-- La tentación es meter grupo_id en esa clave. ES UN BUG: la mensualidad de los
-- 424 atletas sin grupo lleva grupo_id NULL, así que en cuanto a uno se le
-- asigne su grupo básico a mitad de mes, la siguiente corrida emitiría una
-- SEGUNDA mensualidad —(atleta,7,2026,'Mensualidad',NULL) y
-- (atleta,7,2026,'Mensualidad',X) son claves distintas— y la familia pagaría dos
-- veces. La clave de la mensualidad NO puede depender del grupo.
--
-- Por eso van dos índices parciales y disjuntos:
--   · MENSUALIDAD (y cualquier cargo con periodo que no sea add-on): una por
--     atleta/mes/tipo, INDEPENDIENTE del grupo. Idempotente aunque el grupo
--     cambie a mitad de mes.
--   · ADD-ON: uno por atleta/mes/GRUPO — que es justo el eje que los distingue.
--
-- `WHERE mes IS NOT NULL` en el primero: crearCargo() emite cargos puntuales con
-- mes/anio NULL (pagosService.js) y varios del mismo tipo son legítimos.
--
-- Precio a pagar: PostgREST NO infiere índices parciales, así que ningún
-- `onConflict` puede apuntar aquí (los dos seeds pasan a filtrar antes de
-- insertar, en este mismo PR, y upsertPago —sin llamadores— se elimina), y los
-- ON CONFLICT del SQL DEBEN repetir el predicado para poder inferirlos.
--
-- Preflight verificado: 0 claves (atleta,mes,anio,tipo) duplicadas hoy.
DROP INDEX IF EXISTS public.pagos_atleta_mes_anio_tipo_key;
ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_atleta_mes_anio_tipo_key;

CREATE UNIQUE INDEX IF NOT EXISTS pagos_periodo_key
  ON public.pagos (atleta_id, mes, anio, tipo)
  WHERE mes IS NOT NULL AND tipo <> 'Adicional';

CREATE UNIQUE INDEX IF NOT EXISTS pagos_addon_key
  ON public.pagos (atleta_id, mes, anio, grupo_id)
  WHERE tipo = 'Adicional';

COMMENT ON INDEX public.pagos_periodo_key IS
  'Idempotencia de la mensualidad: una por atleta/mes/tipo, SIN el grupo en la clave (si dependiera del grupo, asignárselo a mitad de mes emitiría una segunda mensualidad). Parcial: los cargos puntuales de crearCargo() van con mes NULL. PostgREST no infiere índices parciales: no apuntes ningún onConflict aquí.';
COMMENT ON INDEX public.pagos_addon_key IS
  'Idempotencia del add-on: uno por atleta/mes/grupo, que es el eje que los distingue.';

CREATE INDEX IF NOT EXISTS pagos_grupo_idx ON public.pagos (grupo_id) WHERE grupo_id IS NOT NULL;

-- ─── 4. generar_pagos_mes: la mensualidad y los add-ons, en una sola pasada ──
-- Cuerpo copiado LITERAL de v34 (que es la única copia con el fix de MIN(uuid)
-- de v28b; hay cuatro versiones en el historial y copiar de la equivocada
-- reintroduce aquel bug), con tres cambios:
--   1. la Mensualidad ahora escribe grupo_id;
--   2. un INSERT nuevo emite una línea por add-on facturable;
--   3. los dos INSERT cuelgan del MISMO CTE, así que comparten el descuento ya
--      calculado del atleta — y, sobre todo, el ranking de hermanos se calcula
--      sobre `atl`, que produce UNA fila por atleta: los add-ons NO inflan el
--      tamaño de la familia (un hijo único con dos extras no cobra descuento de
--      hermanos por accidente).
-- LA FIRMA ES EXACTAMENTE LA DE v34 (p_club antes que p_registrado_por), y no es
-- cosmético: Postgres identifica una función por nombre + TIPOS, así que
-- invertir esos dos argumentos NO reemplazaría nada — crearía una SEGUNDA
-- sobrecarga (integer,integer,uuid,text) junto a la vieja. Consecuencias de ese
-- error, por si alguien lo repite:
--   · el cron (v28:110-118) pasa `cc.club` (text) en la 3ª posición, así que
--     resolvería a la función VIEJA: nunca emitiría un add-on, sin un solo
--     error visible;
--   · pagosService.js llama por argumentos NOMBRADOS y ambas sobrecargas tienen
--     los mismos nombres ⇒ PostgREST no desambigua ⇒ PGRST203 y el botón
--     "Generar Mes" revienta;
--   · los REVOKE/GRANT de v28:102-103 son sobre (integer,integer,text,uuid), así
--     que la sobrecarga nueva nacería con EXECUTE para PUBLIC — y siendo
--     SECURITY DEFINER con un guard `IF auth.uid() IS NOT NULL AND NOT es_staff()`,
--     un anónimo (auth.uid() NULL) lo esquivaría entero.
-- Manteniendo la firma, esto es un CREATE OR REPLACE de verdad: hay una sola
-- función y conserva los grants de v28.
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
  IF auth.uid() IS NOT NULL AND NOT public.es_staff() THEN
    RAISE EXCEPTION 'solo staff puede generar pagos';
  END IF;

  IF p_mes < 1 OR p_mes > 12 THEN RAISE EXCEPTION 'mes inválido: %', p_mes; END IF;
  IF p_anio < 2024 OR p_anio > 2100 THEN RAISE EXCEPTION 'año inválido: %', p_anio; END IF;

  WITH atl AS (
    SELECT a.id AS atleta_id, u.club,
           a.grupo_id,
           COALESCE(g.precio_mensual, 30.00) AS base,
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
  ),
  -- (a) LA MENSUALIDAD — idéntica a v34, salvo que ahora ancla su grupo.
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
    -- El predicado se repite porque el indice es PARCIAL: sin el, Postgres no
    -- puede inferirlo y la funcion revienta con 42P10 en cada corrida.
    ON CONFLICT (atleta_id, mes, anio, tipo) WHERE mes IS NOT NULL AND tipo <> 'Adicional' DO NOTHING
    RETURNING 1
  ),
  -- (b) LOS ADD-ONS — una línea por grupo extra facturable.
  --     Hereda `pct` del atleta: el dueño decidió que el extra respeta beca y
  --     descuento de hermanos igual que la cuota.
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

-- ─── 5. Guard: que no exista NUNCA más de una generar_pagos_mes ─────────────
-- Si alguien vuelve a cambiar el orden de los parámetros, esto revienta el push
-- en vez de dejar dos sobrecargas conviviendo en silencio (el cron llamaría a la
-- vieja y el botón moriría con PGRST203).
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_proc
   WHERE proname = 'generar_pagos_mes' AND pronamespace = 'public'::regnamespace;
  IF n <> 1 THEN
    RAISE EXCEPTION 'generar_pagos_mes tiene % definiciones; debe haber exactamente 1 (¿cambió el orden de los parámetros?)', n;
  END IF;
END $$;

-- Los grants de v28:102-103 sobreviven al CREATE OR REPLACE por ser la misma
-- firma; se reafirman por si esta migración se aplica sobre una base donde
-- alguien los tocó.
REVOKE ALL ON FUNCTION public.generar_pagos_mes(integer, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generar_pagos_mes(integer, integer, text, uuid) TO authenticated, service_role;
