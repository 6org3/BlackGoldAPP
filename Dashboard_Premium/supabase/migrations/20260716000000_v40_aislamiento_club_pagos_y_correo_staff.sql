-- ============================================================================
-- v40 — El club deja de ser un parámetro del cliente en el módulo de pagos,
--       y el correo de un staff sin acceso deja de ser su puerta trasera.
--
-- Origen: auditoría adversarial de la regla de oro ("la seguridad real es RLS +
-- handlers; el gating de rol en la UI es solo conveniencia"). Todo lo de abajo
-- es alcanzable con `supabase.rpc()` / PostgREST directo y una cuenta de staff
-- legítima: ningún hallazgo depende de "encontrar un botón que no debería
-- estar", que es justo lo que la regla pide que no ocurra.
--
-- Por qué existió: v29 barrió el aislamiento por club de las tablas de v24 y
-- dejó fuera —por omisión, no por diseño: no figuran en su lista de "fuera de
-- alcance deliberado"— las tablas que v27 había creado dos días antes. v27
-- restringió QUIÉN escribe (owner/superadmin, excluyendo al coach) pero nunca
-- SOBRE QUÉ CLUB, y sus comentarios daban el club por supuesto.
--
-- Por qué la suite no lo vio: validar_rls_por_rol.js crea todas sus cuentas QA
-- en un solo club ('Black Gold'). Sin staff en un segundo club, una fuga
-- cross-club es indetectable por construcción — 86/86 en verde convivía con
-- esto. Esta migración viene con el segundo club QA (ver el script).
--
-- 1. `generar_pagos_mes(..., p_club, ...)` — el cliente elegía el club. Un
--    coach podía facturar a otro club, o con p_club=NULL (el DEFAULT de la
--    firma) a TODA la plataforma. Ahora el club se deriva server-side, como ya
--    hacían fn_coach_stats/fn_retencion_club (v31/v32) — que son el precedente
--    correcto del repo. El cron y los scripts (auth.uid() IS NULL) siguen
--    pasando el club explícito: el cron itera club_config y factura club por
--    club, y romperlo sería romper la facturación mensual entera.
--
-- 2. `club_config_write` / `servicios_write` / `tarifas_write` — solo miraban
--    el rol. Un owner podía reescribir `club_config.cuenta_bancaria_texto` de
--    OTRO club: son las instrucciones de transferencia que ve la familia al
--    pagar. Es el hallazgo con vector de fraude más directo de la auditoría.
--
-- 3. `transacciones_staff` / `comprobantes_staff` — `es_staff()` a secas,
--    mientras su tabla madre `pagos` sí quedó acotada por club en v29. Un coach
--    del club A fabricaba/borraba abonos y aprobaba comprobantes del club B.
--
-- 4. `resolver_comprobante()` — SECURITY DEFINER con `es_staff()` a secas. No
--    basta con arreglar la RLS de las tablas: al correr como dueño de la tabla
--    NO re-evalúa RLS, así que sin este guard la vía seguiría viva. Aprobar
--    crea una transacción financiera real.
--
-- 5. `resolver_audiencia()` — el comentario de v24 decía "solo staff logueado"
--    y el cuerpo nunca lo comprobó. Cualquier atleta/padre podía enumerar
--    usuario_ids de cualquier club. Hoy no tiene llamadores en src/, pero
--    PostgREST expone toda función con GRANT a `authenticated`, la use la UI o
--    no: una intención escrita en un comentario no es un control.
--
-- 6. `correo`/`telefono` de un staff SIN acceso (una variante del hueco que
--    deja v36b). v36b cerró la REASIGNACIÓN de auth_user_id, y su cabecera
--    afirma que `correo` no sube de privilegio. No es exacto: `correo` (y,
--    por el mismo mecanismo, `telefono`) son la identidad FUTURA de una fila
--    aún sin vincular. v36 introdujo filas rol='owner' creadas por staff que
--    transitan `auth_user_id IS NULL`, y useAdminEquipoForm.js persiste ese
--    estado a propósito cuando falla el 2º paso ("Quedó sin acceso — vuelve a
--    intentarlo desde la lista"), así que la ventana es duradera, no una
--    carrera. Un coach cambiaba el correo/teléfono de un co-dueño pendiente y,
--    al reintentar el dueño, crear-acceso-usuario le emitía la cuenta a él.
--    Se cierra por los dos lados: quién puede cambiar esos dos campos (aquí) y
--    qué filas puede reclamar el trigger de vinculación (§7).
--
--    OJO — esto cierra UNA variante, no la clase de "coach se apodera de la
--    cuenta de un dueño". crear-acceso-usuario fija password = cédula del
--    propio target para rol IN ('atleta','coach','owner'), y usuarios_select
--    (v24) le da a CUALQUIER staff lectura de fila completa —correo Y
--    cédula incluidos, sin GRANT por columna— de todo su club. Un coach no
--    necesita escribir nada: le basta con
--      SELECT correo, cedula FROM usuarios WHERE club = <su club> AND rol IN ('owner','coach')
--    y iniciar sesión con esas credenciales directamente, sin pasar por
--    ningún guard de v34/v36/v36b/v40 (ninguno de ellos protege una LECTURA).
--    Agravante: no hay flujo de cambio de contraseña en la app, así que la
--    inicial es permanente. Deliberadamente FUERA de alcance de este parche:
--    el fix (dejar de exponer `cedula` al coach, o dejar de derivar la
--    password de una columna legible) es un cambio de superficie distinto
--    —toca auth y la UI de equipo/atletas, no solo RLS de pagos— y merece su
--    propia revisión. Ver nota de seguimiento.
--
-- 7. `vincular_auth_usuario()` (v24) vincula por email CUALQUIER fila sin
--    auth_user_id, incluida la rama sintética `cedula@sinacceso...` — que un
--    guard sobre `correo` no taparía: bastaba conocer la cédula (visible para
--    el staff del club) y registrarse con ese email. Los accesos de staff los
--    emite crear-acceso-usuario, que vincula por id exacto con service_role;
--    el trigger solo hace falta para el registro público (atleta/padre). Se
--    acota a esos dos roles.
--
-- Lo que esta migración NO cambia (a propósito): QUIÉN puede actuar. El staff
-- sigue siendo staff y el coach sigue resolviendo comprobantes; solo se acota
-- el ALCANCE a su club, exactamente el criterio de v29. El superadmin sigue
-- cruzando clubes por diseño.
--
-- Fuera de alcance, anotado para no perderlo:
--   * (RESUELTO en v41, que va justo detrás de esta migración.) Un coach leía
--     `cedula` de cualquier owner/coach de su club y esa cédula ERA la
--     contraseña que crear-acceso-usuario le había puesto: se entraba como el
--     dueño sin escribir nada ni cruzar ningún guard de v34/v36/v36b/v40,
--     porque ninguno protege una LECTURA. v41 corta la derivación en la Edge
--     Function (contraseña aleatoria para coach/owner) en vez de esconder la
--     cédula — que se sabe fuera de la base y no serviría de nada ocultar.
--   * `generar_pagos_mes` admite coach mientras el panel esconde "Generar Mes"
--     del coach (AdminPagos.jsx: `!esCoach`). Alinear eso a owner/superadmin es
--     una decisión de producto, no un fix de aislamiento: se deja como está.
--   * `p_registrado_por` no se contrasta con current_usuario_id(): el invocante
--     puede atribuir la generación a otro usuario en la auditoría de v30.
--   * `marcar_pagos_vencidos()` / `precio_servicio_atleta()`: sin gate de rol,
--     pero idempotente por fecha el primero y un solo número el segundo.
-- ============================================================================


-- ------------------------------------------------------------
-- 0. Helper: club dueño de un pago. Mismo patrón y mismas garantías que
--    club_de_atleta (v29:36): STABLE, SECURITY DEFINER (las hijas se evalúan
--    para staff que no ve la fila madre por RLS) y search_path fijado.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.club_de_pago(p_pago_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.club
  FROM pagos p
  JOIN atletas a  ON a.id = p.atleta_id
  JOIN usuarios u ON u.id = a.usuario_id
  WHERE p.id = p_pago_id;
$$;

REVOKE ALL ON FUNCTION public.club_de_pago(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_de_pago(uuid) TO authenticated, service_role;


-- ------------------------------------------------------------
-- 1. Configuración, catálogo y tarifas: se conserva el chequeo de rol de v27
--    (excluir al coach era su objetivo) y se le AND-ea el criterio de club que
--    sus hermanas _select ya usan desde el primer día.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS club_config_write ON public.club_config;
CREATE POLICY club_config_write ON public.club_config FOR ALL TO authenticated
  USING (
    (select current_user_rol()) IN ('owner','superadmin')
    AND (club = (select current_user_club()) OR (select es_superadmin()))
  )
  WITH CHECK (
    (select current_user_rol()) IN ('owner','superadmin')
    AND (club = (select current_user_club()) OR (select es_superadmin()))
  );

DROP POLICY IF EXISTS servicios_write ON public.catalogo_servicios;
CREATE POLICY servicios_write ON public.catalogo_servicios FOR ALL TO authenticated
  USING (
    (select current_user_rol()) IN ('owner','superadmin')
    AND (club = (select current_user_club()) OR (select es_superadmin()))
  )
  WITH CHECK (
    (select current_user_rol()) IN ('owner','superadmin')
    AND (club = (select current_user_club()) OR (select es_superadmin()))
  );

-- servicio_tarifas no tiene columna club: se deriva por servicio_id con el
-- mismo subselect que tarifas_select usa desde v27.
DROP POLICY IF EXISTS tarifas_write ON public.servicio_tarifas;
CREATE POLICY tarifas_write ON public.servicio_tarifas FOR ALL TO authenticated
  USING (
    (select current_user_rol()) IN ('owner','superadmin')
    AND (servicio_id IN (SELECT id FROM catalogo_servicios
                          WHERE club = (select current_user_club()))
         OR (select es_superadmin()))
  )
  WITH CHECK (
    (select current_user_rol()) IN ('owner','superadmin')
    AND (servicio_id IN (SELECT id FROM catalogo_servicios
                          WHERE club = (select current_user_club()))
         OR (select es_superadmin()))
  );


-- ------------------------------------------------------------
-- 2. Hijas de pago: el mismo criterio que pagos_staff (v29:204).
--    Se conserva `registrado_por = current_usuario_id()` en el WITH CHECK de
--    transacciones (intención de v27: el staff registra a su propio nombre).
-- ------------------------------------------------------------

DROP POLICY IF EXISTS transacciones_staff ON public.pago_transacciones;
CREATE POLICY transacciones_staff ON public.pago_transacciones FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_pago(pago_id)) = (select current_user_club()))
  )
  WITH CHECK (
    -- `registrado_por` sigue aplicando a TODOS, superadmin incluido: v27 lo
    -- exigía sin excepción y relajarlo aquí degradaría el rastro de quién
    -- cobró. Lo único que se le perdona al superadmin es el filtro de club.
    registrado_por = (select current_usuario_id())
    AND ((select es_superadmin())
         OR ((select es_staff()) AND (select club_de_pago(pago_id)) = (select current_user_club())))
  );

DROP POLICY IF EXISTS comprobantes_staff ON public.pago_comprobantes;
CREATE POLICY comprobantes_staff ON public.pago_comprobantes FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_pago(pago_id)) = (select current_user_club()))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_pago(pago_id)) = (select current_user_club()))
  );


-- ------------------------------------------------------------
-- 3. resolver_comprobante: cuerpo textual de v27:290-325 + el guard de club.
--    Imprescindible aparte de la RLS: SECURITY DEFINER no re-evalúa policies.
--    NO se convierte en solo-owner: el coach cobra, y eso es intencional.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolver_comprobante(p_comprobante_id uuid, p_aprobar boolean, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_pago uuid; v_monto numeric; v_ref text; v_club_yo text; v_club_comp text;
BEGIN
  IF NOT es_staff() THEN RAISE EXCEPTION 'solo staff'; END IF;

  -- v40: el comprobante tiene que ser de tu club. Se resuelve ANTES del UPDATE
  -- para no dejar rastro (revisado_por/revisado_at) de una resolución ajena.
  -- `club IS NULL` se corta explícito (como en generar_pagos_mes/resolver_
  -- audiencia): con `IS DISTINCT FROM`, NULL = NULL evalúa a FALSE y un staff
  -- sin club colaría comprobantes de un atleta también sin club.
  IF NOT es_superadmin() THEN
    v_club_yo := current_user_club();
    IF v_club_yo IS NULL THEN
      RAISE EXCEPTION 'tu cuenta no tiene club: no se puede resolver el comprobante';
    END IF;
    SELECT club_de_pago(c.pago_id) INTO v_club_comp
    FROM pago_comprobantes c WHERE c.id = p_comprobante_id;
    IF v_club_comp IS NULL OR v_club_comp <> v_club_yo THEN
      RAISE EXCEPTION 'ese comprobante no es de tu club';
    END IF;
  END IF;

  UPDATE pago_comprobantes
     SET estado = CASE WHEN p_aprobar THEN 'aprobado' ELSE 'rechazado' END,
         revisado_por = current_usuario_id(), revisado_at = now(), motivo_rechazo = p_motivo
   WHERE id = p_comprobante_id AND estado = 'pendiente'
   RETURNING pago_id, monto_declarado, numero_documento INTO v_pago, v_monto, v_ref;

  IF v_pago IS NULL THEN
    RAISE EXCEPTION 'comprobante inexistente o ya resuelto';
  END IF;

  IF p_aprobar THEN
    INSERT INTO pago_transacciones (pago_id, monto, forma_pago, comprobante_id, referencia, registrado_por)
    SELECT v_pago,
           GREATEST(COALESCE(v_monto, p.monto_final - p.monto_pagado), 0.01),
           'Transferencia', p_comprobante_id, v_ref, current_usuario_id()
    FROM pagos p WHERE p.id = v_pago;
    UPDATE pagos SET verificado_por = current_usuario_id(), verificado_at = now()
    WHERE id = v_pago;
  ELSE
    UPDATE pagos SET comprobante_path = NULL,
           estado = CASE WHEN monto_pagado > 0 THEN 'Abonado'
                         WHEN fecha_vencimiento < current_date THEN 'Vencido'
                         ELSE 'Pendiente' END
     WHERE id = v_pago AND estado = 'Por Verificar';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resolver_comprobante(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_comprobante(uuid, boolean, text) TO authenticated, service_role;


-- ------------------------------------------------------------
-- 4. generar_pagos_mes: cuerpo textual de v39 (mensualidad + add-ons, grupo_id
--    en la factura) — NO de v34. v39 ya está aplicada en producción con esa
--    lógica; copiar el cuerpo viejo de v34 aquí la habría destruido en
--    silencio. Lo único nuevo de v40 es que el club deja de venir del
--    cliente. Se conserva la rama sin sesión (auth.uid() IS NULL) porque es
--    el cron mensual de v28, que factura club por club iterando club_config.
--    Firma intacta (p_club antes que p_registrado_por): ver v39 §4 sobre por
--    qué invertirla crearía una segunda sobrecarga silenciosa.
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
  -- (a) LA MENSUALIDAD — idéntica a v39, ancla su grupo.
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

-- Guard de v39 §5: que nunca convivan dos sobrecargas de generar_pagos_mes.
-- Se repite aquí por la misma razón que allá: si esta migración volviera a
-- cambiar el orden de los parámetros, el push revienta en vez de dejar dos
-- versiones conviviendo en silencio.
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


-- ------------------------------------------------------------
-- 5. resolver_audiencia: cuerpo textual de v33:454-527 + el guard que su
--    comentario de v24 prometía desde el principio.
--    No se usa auth.role() ni current_user para saber quién llama: dentro de
--    un SECURITY DEFINER, current_user es el dueño (postgres), no el llamador.
--    Se usa auth.uid(), el mismo criterio que el resto de las funciones del
--    repo (generar_pagos_mes, proteger_columnas_*).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolver_audiencia(
  p_segmento_tipo text,
  p_params jsonb DEFAULT '{}'::jsonb,
  p_incluir_reps boolean DEFAULT true,
  p_club text DEFAULT NULL
) RETURNS TABLE (usuario_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- v40: sin sesión de app (service_role, pg_cron, psql) pasa derecho: ahí
  -- es_staff() sería false y filtrarlo rompería el backend de confianza.
  IF auth.uid() IS NOT NULL THEN
    IF NOT es_staff() THEN
      RAISE EXCEPTION 'resolver_audiencia: solo staff';
    END IF;
    -- Y el segmento se resuelve sobre TU club, no sobre el que pidas.
    IF NOT es_superadmin() THEN
      p_club := current_user_club();
      IF p_club IS NULL THEN
        RAISE EXCEPTION 'resolver_audiencia: tu cuenta no tiene club';
      END IF;
    END IF;
  END IF;

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


-- ------------------------------------------------------------
-- 6. proteger_columnas_usuarios: cuerpo textual de v36b:36-100 + el guard de
--    `correo` sobre filas de staff aún sin acceso. Va ANTES del early-return
--    de es_staff(), como el resto: un guard después de ese atajo no se le
--    aplica al staff, que es exactamente de quien hay que protegerse aquí
--    (así nació el bug que cerró v34).
--    La regla es la misma que decide quién puede CREAR esa fila (usuarios_insert,
--    v36): al coach lo invita el owner; al co-dueño, el owner original.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.proteger_columnas_usuarios()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caminos sin sesión de app: service_role (Edge Functions, seeds) y el
  -- trigger trg_vincular_auth_usuario (v24), que es justo quien tiene que
  -- poder escribir auth_user_id al crearse la cuenta.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Identidad de la cuenta (v36b): a qué usuario de Auth resuelve esta fila y
  -- con qué cédula se identifica. Ver cabecera: cambiarlas es apoderarse de la
  -- cuenta, así que ni el staff de su propio club.
  IF (NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
      OR NEW.cedula IS DISTINCT FROM OLD.cedula)
     AND NOT es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadmin puede cambiar la identidad de una cuenta.';
  END IF;

  -- v40: `correo` y `telefono` de un staff que AÚN NO tiene acceso son su
  -- identidad futura — crear-acceso-usuario le emitirá la cuenta a ese correo
  -- y el trigger de v24 vincula por él; resolver_email_login (v19) resuelve el
  -- login por correo, teléfono O cédula, así que teléfono abre la misma puerta
  -- que correo. Cambiar cualquiera de los dos es quedarse con la cuenta sin
  -- tocar auth_user_id (el hueco que v36b daba por inocuo). Se pide el mismo
  -- rango que para crear la fila: al coach lo invita el dueño; al co-dueño,
  -- solo el dueño original. Una vez vinculada, ambos vuelven a ser datos de
  -- contacto y el staff los corrige con normalidad.
  IF (NEW.correo IS DISTINCT FROM OLD.correo OR NEW.telefono IS DISTINCT FROM OLD.telefono)
     AND OLD.auth_user_id IS NULL
     AND OLD.rol IN ('coach', 'owner')
     AND NOT es_superadmin() THEN
    IF current_user_rol() <> 'owner' THEN
      RAISE EXCEPTION 'Solo el dueño del club puede cambiar el contacto de un miembro del staff que todavía no tiene acceso.';
    END IF;
    IF OLD.rol = 'owner' AND NOT es_owner_principal() THEN
      RAISE EXCEPTION 'Solo el dueño original puede cambiar el contacto de un co-dueño que todavía no tiene acceso.';
    END IF;
  END IF;

  -- Linaje inmutable: define quién puede invitar co-dueños (v36).
  IF NEW.creado_por IS DISTINCT FROM OLD.creado_por AND NOT es_superadmin() THEN
    RAISE EXCEPTION 'No tienes permiso para modificar el origen de una cuenta.';
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF current_user_rol() NOT IN ('owner', 'superadmin') THEN
      RAISE EXCEPTION 'Solo el dueño del club puede cambiar el estado de una cuenta.';
    END IF;
    -- Retirar o reactivar a un DUEÑO es del superadmin: entre co-dueños, el
    -- primero que pulsara el botón se quedaría con el club (v36).
    IF OLD.rol = 'owner' AND NOT es_superadmin() THEN
      RAISE EXCEPTION 'Solo el superadmin puede activar o desactivar a un dueño.';
    END IF;
    -- Un club sin dueño activo no puede aprobar solicitudes, dar de alta staff
    -- ni recibir inscripciones: no se desactiva al último que queda.
    IF OLD.rol = 'owner' AND OLD.estado = 'activo' AND NEW.estado <> 'activo'
       AND NOT EXISTS (
         SELECT 1 FROM usuarios u
         WHERE u.club = OLD.club AND u.rol = 'owner' AND u.estado = 'activo' AND u.id <> OLD.id
       ) THEN
      RAISE EXCEPTION 'No puedes desactivar al último dueño de "%": el club se quedaría sin quien lo administre.', OLD.club;
    END IF;
  END IF;

  IF NEW.club IS DISTINCT FROM OLD.club AND NOT es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadmin puede cambiar de club a un usuario.';
  END IF;
  IF NEW.rol IS DISTINCT FROM OLD.rol AND NOT es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadmin puede cambiar el rol de un usuario.';
  END IF;

  IF es_staff() THEN
    RETURN NEW;
  END IF;

  -- Solo para atleta/padre: el staff sí corrige la fecha de nacimiento de sus
  -- atletas (cambia su categoría FEB), pero el propio atleta no.
  IF NEW.fecha_nacimiento IS DISTINCT FROM OLD.fecha_nacimiento THEN
    RAISE EXCEPTION 'No tienes permiso para modificar campos protegidos del perfil.';
  END IF;
  RETURN NEW;
END;
$$;


-- ------------------------------------------------------------
-- 7. vincular_auth_usuario: cuerpo de v24:167-182 acotado a atleta/padre.
--    La rama sintética (`cedula@sinacceso...`) permitía reclamar cualquier
--    fila sin vincular con solo conocer su cédula — que el staff del club ve
--    por usuarios_select. Con §6 sola, esa vía seguiría abierta.
--    Los accesos de staff no dependen de este trigger: crear-acceso-usuario
--    los vincula por id exacto con service_role justo después de createUser
--    (y hacerlo por id, no por email, es más preciso: era ya su "cinturón").
--    El registro público (atleta/padre) sí lo necesita y se conserva igual.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.vincular_auth_usuario()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE usuarios
  SET auth_user_id = NEW.id
  WHERE auth_user_id IS NULL
    AND rol IN ('atleta', 'padre')   -- v40: el staff se vincula explícitamente
    AND (
      lower(correo) = lower(NEW.email)
      OR lower(cedula || '@sinacceso.blackgoldapp.internal') = lower(NEW.email)
    );
  RETURN NEW;
END;
$$;
