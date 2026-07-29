-- ============================================================================
-- v52 — ENDURECIMIENTO PRE-PRODUCCIÓN (auditoría adversarial 2026-07-29)
-- ============================================================================
-- Cinco huecos confirmados contra el estado FINAL del esquema (57 migraciones
-- aplicadas, paridad local↔producción verificada con `supabase migration list`).
-- Cada uno se verificó leyendo la última definición vigente, no la original.
--
-- §1 `atletas.beca_pct` (v27:144) nunca entró a la lista de columnas protegidas
--    del trigger: v24 escribió la lista a las 11:30 y v27 creó la columna a las
--    18:00 del MISMO día; v31 y v34 la copiaron textualmente arrastrando el
--    hueco. Con `atletas_update` (v29:62) dejando al atleta actualizar su propia
--    fila, sin GRANT por columna (baseline da GRANT ALL a authenticated) y con
--    el CHECK admitiendo 100 como valor legal, un solo
--    PATCH /rest/v1/atletas?id=eq.<propio> {"beca_pct":100} hace que la
--    siguiente mensualidad salga en $0: el disparo de generar_pagos_mes es
--    `es_becado OR beca >= 100` (v48:113) y NO exige `es_becado`, que sí estaba
--    protegida. La factura queda etiquetada 'Beca completa', indistinguible de
--    una beca legítima en el panel del dueño.
--    Se añaden también las dos columnas de pausa de recordatorios (v27:156-157):
--    misma clase de omisión, y silenciarse la cobranza es del mismo orden.
--
-- §2 `current_user_rol()` (v24) no comprueba `estado`, a diferencia de
--    `es_staff()`/`es_superadmin()` desde v35. v35 dejó el helper fuera A
--    PROPÓSITO porque los guards NEGATIVOS (`NOT IN (...)`) se vuelven MÁS
--    permisivos con un NULL — razonamiento correcto que sigue vigente, pero que
--    no cubre los predicados AFIRMATIVOS `IN ('owner','superadmin')` de v40 y
--    v51. Resultado: un co-dueño retirado (`estado='inactivo'`, puesto por
--    coachesService, que NO deshabilita su cuenta de Auth) conserva escritura
--    sobre la configuración de cobranza, el catálogo, las tarifas y el libro de
--    gastos. Por eso NO se toca `current_user_rol()`: se añade un helper
--    afirmativo aparte y se sustituye solo en los predicados afirmativos.
--
-- §3 `pagos`, `pago_transacciones` y `pago_comprobantes` tienen políticas
--    FOR ALL para todo `es_staff()`, que incluye al coach (v35). Eso implementa
--    el "modo cobro" del §7.4 de docs/pagos_diseno.md, DESCARTADO por el dueño
--    el 2026-07-22 (§10.4 literal: "Coach en modo cobro → EXCLUIDO. Pagos es
--    solo-owner (y co-dueños)"). Lo grave no es `generar_pagos_mes` (ya acotada
--    al club propio por v40 e idempotente por ON CONFLICT) sino el UPDATE y el
--    DELETE: un coach puede marcar estado='Pagado' sin crear la fila de
--    `pago_transacciones` —derrotando el arqueo de efectivo por registrador,
--    que es el control anti-desfalco del diseño— y puede borrar el pago,
--    llevándose por CASCADE sus propias filas de `pagos_auditoria`.
--    La LECTURA se conserva para todo el staff: el coach abre la ficha del
--    atleta desde /admin/atletas y ahí se muestra el estado de cuenta.
--
-- §4 `resolver_email_login` (v19) devuelve NULL cuando no hay coincidencia: es
--    un oráculo de existencia consultable por `anon`, sin captcha y sin el rate
--    limit de GoTrue (entra por PostgREST, no por /auth). Combinado con que la
--    contraseña inicial de atleta y padre se deriva de la cédula, permite
--    barrer un espacio de cédulas y quedarse con las que existen. Se elimina la
--    distinción "existe"/"no existe" devolviendo siempre un correo con la misma
--    forma. NO se revoca a `anon`: el login pre-sesión la necesita.
--
-- §5 Tabla de apoyo para el control de abuso del registro público. La usa la
--    Edge Function con service_role; ningún rol de app la ve.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- §1. beca_pct y la pausa de recordatorios entran a las columnas protegidas.
--     Cuerpo TEXTUAL de la versión vigente (v34) + tres columnas. El trigger
--     trg_proteger_columnas_atletas (v24) NO se recrea: apunta a la función por
--     nombre, así que la tabla nunca queda un instante desprotegida.
-- ────────────────────────────────────────────────────────────────────────────

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
     -- v52: el dinero del atleta lo decide el club, no el atleta.
     OR NEW.beca_pct IS DISTINCT FROM OLD.beca_pct
     OR NEW.recordatorios_pausados IS DISTINCT FROM OLD.recordatorios_pausados
     OR NEW.recordatorios_pausados_motivo IS DISTINCT FROM OLD.recordatorios_pausados_motivo
     OR NEW.grupo_id IS DISTINCT FROM OLD.grupo_id
     OR NEW.grupo_nombre IS DISTINCT FROM OLD.grupo_nombre
     OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id THEN
    RAISE EXCEPTION 'No tienes permiso para modificar campos protegidos del atleta.';
  END IF;
  RETURN NEW;
END;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- §2. es_owner_activo(): predicado AFIRMATIVO de dueño en ejercicio.
--     Sustituye a `current_user_rol() IN ('owner','superadmin')` en las cinco
--     políticas afirmativas. current_user_rol() se deja intacta a propósito
--     (ver cabecera): filtrarla volvería más permisivos los guards negativos.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.es_owner_activo()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE auth_user_id = auth.uid()
      AND rol IN ('owner', 'superadmin')
      -- Estado ausente = activo (columna NOT NULL DEFAULT 'activo').
      AND COALESCE(estado, 'activo') = 'activo'
  );
$$;

REVOKE ALL ON FUNCTION public.es_owner_activo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_owner_activo() TO authenticated;

-- club_config: configuración de cobranza del club.
DROP POLICY IF EXISTS club_config_write ON public.club_config;
CREATE POLICY club_config_write ON public.club_config FOR ALL TO authenticated
  USING (
    (select es_owner_activo())
    AND (club = (select current_user_club()) OR (select es_superadmin()))
  )
  WITH CHECK (
    (select es_owner_activo())
    AND (club = (select current_user_club()) OR (select es_superadmin()))
  );

-- catalogo_servicios: qué se cobra.
DROP POLICY IF EXISTS servicios_write ON public.catalogo_servicios;
CREATE POLICY servicios_write ON public.catalogo_servicios FOR ALL TO authenticated
  USING (
    (select es_owner_activo())
    AND (club = (select current_user_club()) OR (select es_superadmin()))
  )
  WITH CHECK (
    (select es_owner_activo())
    AND (club = (select current_user_club()) OR (select es_superadmin()))
  );

-- servicio_tarifas: cuánto se cobra.
DROP POLICY IF EXISTS tarifas_write ON public.servicio_tarifas;
CREATE POLICY tarifas_write ON public.servicio_tarifas FOR ALL TO authenticated
  USING (
    (select es_owner_activo())
    AND (servicio_id IN (SELECT id FROM catalogo_servicios
                          WHERE club = (select current_user_club()))
         OR (select es_superadmin()))
  )
  WITH CHECK (
    (select es_owner_activo())
    AND (servicio_id IN (SELECT id FROM catalogo_servicios
                          WHERE club = (select current_user_club()))
         OR (select es_superadmin()))
  );

-- gastos (v51): libro de gastos del club.
DROP POLICY IF EXISTS gastos_select ON public.gastos;
CREATE POLICY gastos_select ON public.gastos FOR SELECT TO authenticated
  USING (
    (select es_owner_activo())
    AND (club = (select current_user_club()) OR (select es_superadmin()))
  );

DROP POLICY IF EXISTS gastos_write ON public.gastos;
CREATE POLICY gastos_write ON public.gastos FOR ALL TO authenticated
  USING (
    (select es_owner_activo())
    AND (club = (select current_user_club()) OR (select es_superadmin()))
  )
  WITH CHECK (
    (select es_owner_activo())
    AND (club = (select current_user_club()) OR (select es_superadmin()))
  );


-- ────────────────────────────────────────────────────────────────────────────
-- §3. Pagos: lectura para todo el staff, ESCRITURA solo dueño en ejercicio.
--     Implementa la decisión §10.4 del dueño (2026-07-22). La política FOR ALL
--     se parte en SELECT (staff) + INSERT/UPDATE/DELETE (owner activo), que es
--     lo que permite conservar la ficha del atleta para el coach sin darle el
--     UPDATE de estado ni el DELETE que arrastra la auditoría.
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS pagos_staff ON public.pagos;

CREATE POLICY pagos_staff_select ON public.pagos FOR SELECT TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  );

CREATE POLICY pagos_owner_write ON public.pagos FOR INSERT TO authenticated
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_owner_activo()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  );

CREATE POLICY pagos_owner_update ON public.pagos FOR UPDATE TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_owner_activo()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_owner_activo()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  );

CREATE POLICY pagos_owner_delete ON public.pagos FOR DELETE TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_owner_activo()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  );

-- pago_transacciones: cada entrega de dinero. `registrado_por` sigue aplicando
-- a TODOS, superadmin incluido (v40): relajarlo degradaría el rastro de quién
-- cobró, que es justamente el control que §3 protege.
DROP POLICY IF EXISTS transacciones_staff ON public.pago_transacciones;

CREATE POLICY transacciones_staff_select ON public.pago_transacciones FOR SELECT TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_pago(pago_id)) = (select current_user_club()))
  );

CREATE POLICY transacciones_owner_write ON public.pago_transacciones FOR INSERT TO authenticated
  WITH CHECK (
    registrado_por = (select current_usuario_id())
    AND ((select es_superadmin())
         OR ((select es_owner_activo()) AND (select club_de_pago(pago_id)) = (select current_user_club())))
  );

CREATE POLICY transacciones_owner_update ON public.pago_transacciones FOR UPDATE TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_owner_activo()) AND (select club_de_pago(pago_id)) = (select current_user_club()))
  )
  WITH CHECK (
    registrado_por = (select current_usuario_id())
    AND ((select es_superadmin())
         OR ((select es_owner_activo()) AND (select club_de_pago(pago_id)) = (select current_user_club())))
  );

CREATE POLICY transacciones_owner_delete ON public.pago_transacciones FOR DELETE TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_owner_activo()) AND (select club_de_pago(pago_id)) = (select current_user_club()))
  );

-- pago_comprobantes: mismo patrón. Validar o rechazar un comprobante es un acto
-- de cobranza (§10.4) y el DELETE destruye la evidencia de una transferencia que
-- la familia ya hizo. La subida del padre la sigue cubriendo
-- comprobantes_insert_propio, que no se toca.
DROP POLICY IF EXISTS comprobantes_staff ON public.pago_comprobantes;

CREATE POLICY comprobantes_staff_select ON public.pago_comprobantes FOR SELECT TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_pago(pago_id)) = (select current_user_club()))
  );

CREATE POLICY comprobantes_owner_write ON public.pago_comprobantes FOR INSERT TO authenticated
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_owner_activo()) AND (select club_de_pago(pago_id)) = (select current_user_club()))
  );

CREATE POLICY comprobantes_owner_update ON public.pago_comprobantes FOR UPDATE TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_owner_activo()) AND (select club_de_pago(pago_id)) = (select current_user_club()))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_owner_activo()) AND (select club_de_pago(pago_id)) = (select current_user_club()))
  );

CREATE POLICY comprobantes_owner_delete ON public.pago_comprobantes FOR DELETE TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_owner_activo()) AND (select club_de_pago(pago_id)) = (select current_user_club()))
  );


-- ────────────────────────────────────────────────────────────────────────────
-- §4. resolver_email_login deja de ser un oráculo de existencia.
--     Antes: NULL si no existe → "esta cédula no está en el club".
--     Ahora: siempre devuelve un correo con la MISMA forma que el de una cuenta
--     real sin correo propio, así que existir y no existir son indistinguibles
--     desde fuera y el fallo se produce —igual para ambos— en signInWithPassword,
--     que sí pasa por el rate limit de GoTrue.
--     Se excluyen además las cuentas rechazadas.
--
--     Límite conocido que NO cierra esta migración: si la cuenta tiene `correo`
--     propio, buscar por teléfono sigue revelando ese correo. Cerrarlo exige
--     mover el login a una Edge Function que no devuelva nunca el correo
--     (queda anotado como deuda; hoy la mayoría de atletas y padres se crean
--     sin correo, así que el caso común ya queda cubierto).
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION resolver_email_login(p_identificador TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT COALESCE(correo, cedula || '@sinacceso.blackgoldapp.internal')
       FROM usuarios
      WHERE (correo = p_identificador
             OR telefono = p_identificador
             OR cedula = p_identificador)
        AND COALESCE(estado, 'activo') <> 'rechazado'
      LIMIT 1),
    -- Sin coincidencia: un correo con la misma forma, que no resuelve a
    -- ninguna cuenta. El atacante no puede distinguir este caso del anterior.
    p_identificador || '@sinacceso.blackgoldapp.internal'
  );
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- §5. Control de abuso del registro público.
--     La Edge Function registro-publico anota aquí cada intento por IP para
--     poder frenar el alta masiva. Sin política: RLS activa y sin policies
--     deniega a todo rol de app; solo service_role (la función) la toca.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.registro_intentos (
  id          bigserial PRIMARY KEY,
  ip          text NOT NULL,
  club        text,
  exito       boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registro_intentos_ip_fecha
  ON public.registro_intentos (ip, created_at DESC);

ALTER TABLE public.registro_intentos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.registro_intentos FROM anon, authenticated;

COMMENT ON TABLE public.registro_intentos IS
  'Intentos de alta pública por IP (v52). La escribe registro-publico con service_role; deny-all para los roles de app.';
