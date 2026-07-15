-- ============================================================================
-- v34 — Catálogo de clubes para el superadmin + membresía como decisión del
--       dueño + borrado físico reservado al superadmin.
--
-- Contexto (petición del dueño, 2026-07-15): "quiero poder SELECCIONAR los
-- clubes, no escribir el nombre" — v33 ya lo resolvió en el registro público,
-- pero el panel /admin/atletas conservaba el último input de texto libre (el
-- campo "Club (Admin)" que solo ve el superadmin) y no tenía forma de
-- desactivar/reactivar a un atleta.
--
-- 1. `listar_clubes_todos()`: catálogo COMPLETO de clubes para el select del
--    superadmin. No sirve `listar_clubes_publicos()` (v33), que solo devuelve
--    clubes con owner activo: el superadmin necesita ver también los clubes
--    históricos sin owner (LAGO AGRIO, PUTUMAYO, SHUSHUFINDI…) justamente para
--    poder sacar atletas de ahí. Tampoco sirve `club_config` (se sembró una vez
--    desde grupos_entrenamiento en v27 y nada la mantiene).
--
-- 2. Membresía (`atletas.estado_membresia`/`fecha_alta`/`fecha_baja`) pasa a ser
--    decisión de owner/superadmin, no de cualquier staff. Simetría con
--    `usuarios.estado` (v33): quien decide quién entra decide quién sale. El
--    trigger v31 listaba estas columnas como protegidas pero el early-return de
--    `es_staff()` dejaba pasar al coach antes de llegar al guard.
--
-- 3. `usuarios.club` solo lo cambia el superadmin: mover a alguien de club es
--    una operación cross-club y la UI ya la reserva al superadmin. (RLS ya lo
--    impedía de facto — un owner falla el WITH CHECK del club destino — pero el
--    trigger lo hace explícito en vez de depender de ese efecto lateral.)
--    Al mover de club se purga la pertenencia a grupos del club viejo: si no,
--    `generar_pagos_mes` seguiría facturándole la tarifa del grupo anterior.
--
-- 3.bis. ESCALADA DE PRIVILEGIOS (preexistente desde v24, encontrada en la
--    revisión adversarial de v34): el guard de `rol` vivía DEBAJO del
--    early-return de `es_staff()`, así que nunca se evaluaba para el staff.
--    Un coach podía ejecutar
--      update usuarios set rol='superadmin' where auth_user_id = auth.uid()
--    — su propia fila, que `usuarios_update` (v24) admite sin mirar `rol` — y
--    salir por `IF es_staff() THEN RETURN NEW` antes del guard. Con eso caía
--    todo: borrado multiclub, catálogo de clubes, membresía, padrón completo.
--    La política hermana `usuarios_insert` (v24) sí lo preveía
--    (`AND rol <> 'superadmin'`): crear superadmins no, auto-promoverse sí.
--    Ahora `rol` se comprueba ANTES del atajo de staff, como `estado` (v33).
--
-- 3.ter. `generar_pagos_mes` deja de facturar a los dados de baja. v33 le puso
--    el filtro de `usuarios.estado` (cuenta), pero la baja deportiva vive en
--    `atletas.estado_membresia` — así que el ex-atleta seguía recibiendo la
--    mensualidad del cron del día 1, pasaba a 'Vencido' el día 5 y aparecía
--    como moroso en el panel del dueño y en el portal de su padre. El texto
--    del panel ("deja de generar mensualidades") ahora es cierto.
--
-- 4. DELETE físico de atletas/usuarios: solo superadmin. Con "desactivar"
--    disponible (reversible, conserva histórico de asistencia/evaluaciones/
--    pagos/XP), el borrado deja de ser la herramienta del staff del club.
--    Cierra además un bug real: `atletas_delete` (v29) admitía a cualquier
--    staff pero `usuarios_delete` (v24) no, así que el botón "Eliminar" de un
--    coach borraba la ficha de atleta y dejaba el usuario huérfano (el cliente
--    no comprobaba el error del segundo delete).
-- ============================================================================


-- ------------------------------------------------------------
-- 1. Catálogo completo de clubes (select del superadmin).
--    El gate va DENTRO del cuerpo: al ser SECURITY DEFINER la función salta
--    RLS, así que sin `es_superadmin()` cualquier authenticated (un atleta)
--    podría enumerar todos los clubes de la plataforma. `listar_clubes_publicos`
--    puede prescindir del gate porque su salida es deliberadamente pública.
--    El club vive denormalizado en varias tablas sin FK: la UNION es el único
--    modo de no perder un club que exista solo en una de ellas.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.listar_clubes_todos()
RETURNS TABLE (club text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT c FROM (
    SELECT club AS c FROM usuarios
    UNION SELECT club FROM grupos_entrenamiento
    UNION SELECT club FROM club_config
    UNION SELECT club FROM eventos
  ) t
  WHERE es_superadmin()
    AND c IS NOT NULL AND btrim(c) <> ''
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.listar_clubes_todos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_clubes_todos() TO authenticated, service_role;


-- ------------------------------------------------------------
-- 2. Membresía del atleta: solo owner/superadmin.
--    Cuerpo base: v31 §2. El guard nuevo va ANTES del early-return de staff
--    (mismo patrón que el guard de `usuarios.estado` en v33); las 3 columnas de
--    membresía salen de la lista de abajo porque el guard nuevo ya las cubre
--    para todos los roles. El trigger trg_proteger_columnas_atletas no se recrea.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.proteger_columnas_atletas()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caminos sin sesión de app (service_role, SECURITY DEFINER internos como
  -- resolver_solicitud_registro cuando lo llama el cron, triggers) pasan.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Dar de baja / reactivar es decisión del dueño del club (v34): ni el coach.
  IF (NEW.estado_membresia IS DISTINCT FROM OLD.estado_membresia
      OR NEW.fecha_alta IS DISTINCT FROM OLD.fecha_alta
      OR NEW.fecha_baja IS DISTINCT FROM OLD.fecha_baja)
     AND current_user_rol() NOT IN ('owner', 'superadmin') THEN
    RAISE EXCEPTION 'Solo el dueño del club puede cambiar el estado de membresía de un atleta.';
  END IF;
  IF es_staff() THEN
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
     OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id THEN
    RAISE EXCEPTION 'No tienes permiso para modificar campos protegidos del atleta.';
  END IF;
  RETURN NEW;
END;
$$;


-- ------------------------------------------------------------
-- 3. Cambio de club y de rol: solo superadmin.
--    Cuerpo base: v33 §2 (que ya reservaba `estado` a owner/superadmin).
--    Los tres guards (estado, club, rol) van ANTES del early-return de staff;
--    debajo queda lo que solo afecta a atleta/padre.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.proteger_columnas_usuarios()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado
     AND current_user_rol() NOT IN ('owner', 'superadmin') THEN
    RAISE EXCEPTION 'Solo el dueño del club puede cambiar el estado de una cuenta.';
  END IF;
  -- Mover a un usuario de club es cross-club: solo superadmin (v34).
  IF NEW.club IS DISTINCT FROM OLD.club AND NOT es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadmin puede cambiar de club a un usuario.';
  END IF;
  -- `rol` concede los privilegios: cambiarlo es del superadmin y de nadie más.
  -- Este guard cierra la escalada descrita en la cabecera §3.bis; iba debajo
  -- del early-return de es_staff() desde v24 y por eso nunca se aplicaba al
  -- staff (un coach se auto-promovía a superadmin editando su propia fila).
  IF NEW.rol IS DISTINCT FROM OLD.rol AND NOT es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadmin puede cambiar el rol de un usuario.';
  END IF;
  IF es_staff() THEN
    RETURN NEW;
  END IF;
  IF NEW.cedula IS DISTINCT FROM OLD.cedula
     OR NEW.fecha_nacimiento IS DISTINCT FROM OLD.fecha_nacimiento
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION 'No tienes permiso para modificar campos protegidos del perfil.';
  END IF;
  RETURN NEW;
END;
$$;


-- ------------------------------------------------------------
-- 3.bis. Al mover de club, la pertenencia a grupos del club viejo se purga.
--    Sin esto el atleta movido conserva `atletas.grupo_id` del club anterior y
--    `generar_pagos_mes` (LEFT JOIN grupos_entrenamiento ON g.id = a.grupo_id)
--    le factura la tarifa de un grupo de otro club. Va server-side para cubrir
--    también los scripts con service_role, que mueven clubes sin pasar por el
--    panel. (El UPDATE sobre atletas re-dispara proteger_columnas_atletas, que
--    deja pasar a staff y a service_role: no toca columnas de membresía.)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.limpiar_grupos_al_cambiar_club()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE atletas SET grupo_id = NULL, grupo_nombre = NULL
   WHERE usuario_id = NEW.id AND grupo_id IS NOT NULL;
  DELETE FROM atleta_grupo
   WHERE atleta_id IN (SELECT id FROM atletas WHERE usuario_id = NEW.id);
  RETURN NULL; -- AFTER trigger: el valor de retorno se ignora
END;
$$;

DROP TRIGGER IF EXISTS trg_limpiar_grupos_al_cambiar_club ON public.usuarios;
CREATE TRIGGER trg_limpiar_grupos_al_cambiar_club
  AFTER UPDATE OF club ON public.usuarios
  FOR EACH ROW
  WHEN (OLD.club IS DISTINCT FROM NEW.club AND NEW.rol = 'atleta')
  EXECUTE FUNCTION public.limpiar_grupos_al_cambiar_club();


-- ------------------------------------------------------------
-- 3.ter. generar_pagos_mes: la baja de membresía corta la facturación.
--    Cuerpo base: v33 §6 (que a su vez copia el fix de min(uuid) de v28b).
--    Único cambio: el filtro de estado_membresia en el CTE `atl`.
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
-- 4. Borrado físico: solo superadmin (el staff del club desactiva).
-- ------------------------------------------------------------

DROP POLICY IF EXISTS atletas_delete ON public.atletas;
CREATE POLICY atletas_delete ON public.atletas FOR DELETE TO authenticated
  USING ((select es_superadmin()));

DROP POLICY IF EXISTS usuarios_delete ON public.usuarios;
CREATE POLICY usuarios_delete ON public.usuarios FOR DELETE TO authenticated
  USING ((select es_superadmin()));
