-- ============================================================================
-- v27 — Módulo de pagos: catálogo de servicios con tarifas por grupo/categoría
-- FEB/género, transacciones (abonos), comprobantes de transferencia,
-- configuración por club y RLS estilo v24.
--
-- Diseño: docs/pagos_diseno.md (§3). Prerrequisito: correr
-- Dashboard_Premium/scripts/preflight_v27_pagos.mjs (duplicados en pagos y
-- saneo de usuarios.genero) ANTES de aplicar.
--
-- El bucket de Storage y sus políticas van en la migración v27b separada:
-- CREATE POLICY sobre storage.objects puede fallar vía db push (el rol
-- postgres no siempre es owner de esa tabla) y no debe bloquear este archivo.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Integridad: el UNIQUE que los onConflict de pagosService.js ya asumían
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS pagos_atleta_mes_anio_tipo_key
  ON public.pagos (atleta_id, mes, anio, tipo);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Catálogo de servicios y tarifas por dimensión
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.catalogo_servicios (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club         text NOT NULL DEFAULT 'Black Gold',
  nombre       text NOT NULL,
  descripcion  text,
  recurrencia  text NOT NULL DEFAULT 'puntual' CHECK (recurrencia IN ('mensual','puntual')),
  precio_base  numeric(10,2) NOT NULL DEFAULT 0,
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (club, nombre)
);

-- Reglas de precio. NULL = "cualquiera" en esa dimensión.
CREATE TABLE IF NOT EXISTS public.servicio_tarifas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id   uuid NOT NULL REFERENCES public.catalogo_servicios(id) ON DELETE CASCADE,
  grupo_id      uuid REFERENCES public.grupos_entrenamiento(id),
  categoria_feb text,   -- valores de calcularCategoriaFEB(): 'Premini (Sub-9)' ... 'Mayores'
  genero        text CHECK (genero IN ('Masculino','Femenino')),
  precio        numeric(10,2) NOT NULL,
  vigente_desde date NOT NULL DEFAULT current_date,
  created_at    timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS servicio_tarifas_dim_key
  ON public.servicio_tarifas (servicio_id, COALESCE(grupo_id::text,'*'),
                              COALESCE(categoria_feb,'*'), COALESCE(genero,'*'), vigente_desde);

-- Resolución de precio: categoría SIEMPRE al vuelo desde fecha_nacimiento
-- (usuarios.categoria_feb STORED se congela al insertar — deuda conocida).
-- Precedencia determinista: grupo > categoría > género > precio_base.
CREATE OR REPLACE FUNCTION public.precio_servicio_atleta(p_servicio_id uuid, p_atleta_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH persona AS (
    SELECT a.grupo_id, calcular_categoria_feb(u.fecha_nacimiento) AS cat, u.genero
    FROM atletas a JOIN usuarios u ON u.id = a.usuario_id
    WHERE a.id = p_atleta_id
  )
  SELECT COALESCE(
    (SELECT t.precio FROM servicio_tarifas t, persona p
      WHERE t.servicio_id = p_servicio_id AND t.vigente_desde <= current_date
        AND (t.grupo_id      IS NULL OR t.grupo_id      = p.grupo_id)
        AND (t.categoria_feb IS NULL OR t.categoria_feb = p.cat)
        AND (t.genero        IS NULL OR t.genero        = p.genero)
      ORDER BY (t.grupo_id IS NOT NULL) DESC,
               (t.categoria_feb IS NOT NULL) DESC,
               (t.genero IS NOT NULL) DESC,
               t.vigente_desde DESC
      LIMIT 1),
    (SELECT precio_base FROM catalogo_servicios WHERE id = p_servicio_id)
  );
$$;

-- v24 revocó los default privileges de anon sobre TABLAS, no sobre FUNCIONES
-- (el baseline otorga GRANT ALL ON FUNCTIONS a anon por default privileges).
REVOKE ALL ON FUNCTION public.precio_servicio_atleta(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.precio_servicio_atleta(uuid, uuid) TO authenticated, service_role;

-- Semillas del catálogo (por club existente en grupos_entrenamiento)
INSERT INTO public.catalogo_servicios (club, nombre, descripcion, recurrencia, precio_base)
SELECT DISTINCT g.club, 'Mensualidad',
       'Mensualidad de entrenamiento (el precio por grupo en grupos_entrenamiento.precio_mensual tiene precedencia)',
       'mensual', 30.00
FROM public.grupos_entrenamiento g
WHERE g.club IS NOT NULL
ON CONFLICT (club, nombre) DO NOTHING;

INSERT INTO public.catalogo_servicios (club, nombre, descripcion, recurrencia, precio_base)
SELECT DISTINCT g.club, 'Sesión Individual', 'Sesión de entrenamiento individual', 'puntual',
       COALESCE((SELECT MAX(precio_sesion_ind) FROM public.grupos_entrenamiento g2 WHERE g2.club = g.club), 0)
FROM public.grupos_entrenamiento g
WHERE g.club IS NOT NULL
ON CONFLICT (club, nombre) DO NOTHING;

-- CHECK suave de género (NOT VALID: no aborta contra datos históricos sucios;
-- correr VALIDATE CONSTRAINT tras el saneo del preflight).
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_genero_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_genero_check
  CHECK (genero IS NULL OR genero IN ('Masculino','Femenino')) NOT VALID;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Ampliación de pagos: columnas nuevas, estados nuevos, becas parciales,
--    representante de pagos, pausa de recordatorios
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS monto_pagado       numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS servicio_id        uuid REFERENCES public.catalogo_servicios(id);
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS concepto           text;
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS fecha_servicio     date;
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS comprobante_path   text;
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS verificado_por     uuid REFERENCES public.usuarios(id);
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS verificado_at      timestamptz;
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS anulado_motivo     text;
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS pasarela           text;
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS referencia_externa text;
ALTER TABLE public.pagos ADD COLUMN IF NOT EXISTS link_pago          text;

CREATE UNIQUE INDEX IF NOT EXISTS pagos_referencia_externa_key
  ON public.pagos (pasarela, referencia_externa) WHERE referencia_externa IS NOT NULL;

-- Backfill: pagos ya 'Pagado' quedan con monto_pagado = monto_final para que
-- el modelo de saldos sea coherente hacia atrás (sin crear transacciones
-- retroactivas: el histórico previo a v27 no tiene detalle por transacción).
UPDATE public.pagos SET monto_pagado = COALESCE(monto_final, monto_base)
WHERE estado = 'Pagado' AND monto_pagado = 0;

ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_estado_check;
ALTER TABLE public.pagos ADD CONSTRAINT pagos_estado_check
  CHECK (estado IN ('Pagado','Pendiente','Vencido','Becado','Por Verificar','Abonado','Anulado'));

ALTER TABLE public.pagos DROP CONSTRAINT IF EXISTS pagos_forma_pago_check;
ALTER TABLE public.pagos ADD CONSTRAINT pagos_forma_pago_check
  CHECK (forma_pago IN ('Efectivo','Transferencia','Pasarela','Make-Auto','Otro'));

-- Becas parciales: es_becado (boolean) no expresa la media beca.
ALTER TABLE public.atletas ADD COLUMN IF NOT EXISTS beca_pct integer NOT NULL DEFAULT 0;
ALTER TABLE public.atletas DROP CONSTRAINT IF EXISTS atletas_beca_pct_check;
ALTER TABLE public.atletas ADD CONSTRAINT atletas_beca_pct_check CHECK (beca_pct BETWEEN 0 AND 100);
UPDATE public.atletas SET beca_pct = 100 WHERE es_becado = true AND beca_pct = 0;

-- Representante de pagos preferido (a quién se dirige recordatorio/confirmación
-- cuando el atleta tiene más de un representante). Máximo uno por atleta.
ALTER TABLE public.padres_atletas ADD COLUMN IF NOT EXISTS es_rep_pagos boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS padres_atletas_rep_pagos_key
  ON public.padres_atletas (atleta_id) WHERE es_rep_pagos;

-- Pausa de recordatorios (acuerdos verbales del club con una familia).
ALTER TABLE public.atletas ADD COLUMN IF NOT EXISTS recordatorios_pausados boolean NOT NULL DEFAULT false;
ALTER TABLE public.atletas ADD COLUMN IF NOT EXISTS recordatorios_pausados_motivo text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Comprobantes de transferencia (metadatos; el binario vive en Storage, v27b)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pago_comprobantes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id             uuid NOT NULL REFERENCES public.pagos(id) ON DELETE CASCADE,
  subido_por          uuid NOT NULL REFERENCES public.usuarios(id),
  storage_path        text NOT NULL,          -- '<atleta_id>/<pago_id>/<timestamp>.<ext>'
  banco               text,
  numero_documento    text,
  monto_declarado     numeric(10,2),
  fecha_transferencia date,
  estado              text NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente','aprobado','rechazado','obsoleto')),
  revisado_por        uuid REFERENCES public.usuarios(id),
  revisado_at         timestamptz,
  motivo_rechazo      text,
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pago_comprobantes_pago ON public.pago_comprobantes(pago_id);
CREATE INDEX IF NOT EXISTS idx_pago_comprobantes_pendientes
  ON public.pago_comprobantes(estado) WHERE estado = 'pendiente';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Transacciones (abonos): cada entrega de dinero es una fila.
--    Habilita pagos parciales, arqueo de efectivo por registrador y
--    conciliación de pasarela (bruto/comisión/neto).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pago_transacciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id        uuid NOT NULL REFERENCES public.pagos(id) ON DELETE CASCADE,
  monto          numeric(10,2) NOT NULL CHECK (monto > 0),
  forma_pago     text NOT NULL CHECK (forma_pago IN ('Efectivo','Transferencia','Pasarela','Otro')),
  referencia     text,
  comprobante_id uuid REFERENCES public.pago_comprobantes(id),
  monto_bruto    numeric(10,2),
  comision       numeric(10,2),
  registrado_por uuid NOT NULL REFERENCES public.usuarios(id),
  notas          text,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pago_transacciones_pago ON public.pago_transacciones(pago_id);
CREATE INDEX IF NOT EXISTS idx_pago_transacciones_registrador
  ON public.pago_transacciones(registrado_por, forma_pago, created_at);

-- Recalcula el pago tras cada alta/baja de transacción. Becado y Anulado se
-- preservan (la UI bloquea transacciones ahí; si algo llega igual, el estado
-- no se pisa). Al quedar Pagado, los comprobantes aún pendientes pasan a
-- 'obsoleto' (evita el contador "Por verificar" inflado si el padre subió
-- comprobante y luego pagó en efectivo).
CREATE OR REPLACE FUNCTION public.tg_recalcular_pago()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago  uuid := COALESCE(NEW.pago_id, OLD.pago_id);
  v_total numeric;
BEGIN
  SELECT COALESCE(SUM(monto), 0) INTO v_total FROM pago_transacciones WHERE pago_id = v_pago;

  UPDATE pagos SET
    monto_pagado = v_total,
    estado = CASE
      WHEN estado IN ('Becado','Anulado') THEN estado
      WHEN v_total > 0 AND v_total >= COALESCE(monto_final, monto_base) THEN 'Pagado'
      WHEN v_total > 0 THEN 'Abonado'
      WHEN fecha_vencimiento < current_date THEN 'Vencido'
      ELSE 'Pendiente'
    END,
    fecha_pago = CASE
      WHEN v_total > 0 AND v_total >= COALESCE(monto_final, monto_base)
        THEN COALESCE(fecha_pago, current_date)
      ELSE NULL
    END,
    forma_pago = CASE
      WHEN v_total > 0 THEN (SELECT t.forma_pago FROM pago_transacciones t
                             WHERE t.pago_id = v_pago ORDER BY t.created_at DESC LIMIT 1)
      ELSE NULL
    END
  WHERE id = v_pago;

  UPDATE pago_comprobantes SET estado = 'obsoleto'
  WHERE pago_id = v_pago AND estado = 'pendiente'
    AND EXISTS (SELECT 1 FROM pagos WHERE id = v_pago AND estado = 'Pagado');

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.tg_recalcular_pago() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_recalcular_pago ON public.pago_transacciones;
CREATE TRIGGER trg_recalcular_pago
  AFTER INSERT OR DELETE ON public.pago_transacciones
  FOR EACH ROW EXECUTE FUNCTION public.tg_recalcular_pago();

-- Al insertar un comprobante, el pago pasa a 'Por Verificar'. Estados
-- terminales no admiten comprobantes (guard server-side, no solo UI).
CREATE OR REPLACE FUNCTION public.tg_comprobante_por_verificar()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_estado text;
BEGIN
  SELECT estado INTO v_estado FROM pagos WHERE id = NEW.pago_id;
  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'pago inexistente';
  END IF;
  IF v_estado IN ('Pagado','Becado','Anulado') THEN
    RAISE EXCEPTION 'el pago no admite comprobantes en estado %', v_estado;
  END IF;
  UPDATE pagos SET estado = 'Por Verificar', comprobante_path = NEW.storage_path
  WHERE id = NEW.pago_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_comprobante_por_verificar() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_comprobante_por_verificar ON public.pago_comprobantes;
CREATE TRIGGER trg_comprobante_por_verificar
  AFTER INSERT ON public.pago_comprobantes
  FOR EACH ROW EXECUTE FUNCTION public.tg_comprobante_por_verificar();

-- Resolución del staff, con rastro de quién verificó. Aprobar CREA la
-- transacción (por el monto declarado, o el saldo si no se declaró) — un
-- comprobante parcial produce un abono por transferencia.
CREATE OR REPLACE FUNCTION public.resolver_comprobante(p_comprobante_id uuid, p_aprobar boolean, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_pago uuid; v_monto numeric; v_ref text;
BEGIN
  IF NOT es_staff() THEN RAISE EXCEPTION 'solo staff'; END IF;

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Configuración por club
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.club_config (
  club                    text PRIMARY KEY,
  whatsapp_club           text,               -- E.164 sin '+' (593...)
  cuenta_bancaria_texto   text,               -- instrucciones de transferencia que ve el padre
  qr_deuna_path           text,               -- imagen del QR De Una en Storage
  dia_vencimiento         integer NOT NULL DEFAULT 5 CHECK (dia_vencimiento BETWEEN 1 AND 28),
  descuento_hermanos_pct  integer NOT NULL DEFAULT 0 CHECK (descuento_hermanos_pct BETWEEN 0 AND 100),
  pasarela                text,               -- 'payphone' | NULL (credenciales SOLO en supabase secrets)
  updated_at              timestamptz DEFAULT now()
);

INSERT INTO public.club_config (club)
SELECT DISTINCT club FROM public.grupos_entrenamiento WHERE club IS NOT NULL
ON CONFLICT (club) DO NOTHING;

-- updated_at automático en las tablas de configuración/catálogo
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_club_config_updated_at ON public.club_config;
CREATE TRIGGER trg_club_config_updated_at
  BEFORE UPDATE ON public.club_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_catalogo_servicios_updated_at ON public.catalogo_servicios;
CREATE TRIGGER trg_catalogo_servicios_updated_at
  BEFORE UPDATE ON public.catalogo_servicios
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS (estilo v24). OJO: es_staff() incluye al coach — la configuración del
--    club (cuenta bancaria que ven las familias), el catálogo y las tarifas
--    los escribe SOLO owner/superadmin, respaldado aquí y no solo en UI.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.catalogo_servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicio_tarifas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pago_transacciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pago_comprobantes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_config        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS servicios_select ON public.catalogo_servicios;
CREATE POLICY servicios_select ON public.catalogo_servicios FOR SELECT TO authenticated
  USING (club = current_user_club() OR es_superadmin());
DROP POLICY IF EXISTS servicios_write ON public.catalogo_servicios;
CREATE POLICY servicios_write ON public.catalogo_servicios FOR ALL TO authenticated
  USING ((SELECT current_user_rol()) IN ('owner','superadmin'))
  WITH CHECK ((SELECT current_user_rol()) IN ('owner','superadmin'));

DROP POLICY IF EXISTS tarifas_select ON public.servicio_tarifas;
CREATE POLICY tarifas_select ON public.servicio_tarifas FOR SELECT TO authenticated
  USING (servicio_id IN (SELECT id FROM catalogo_servicios WHERE club = current_user_club())
         OR es_superadmin());
DROP POLICY IF EXISTS tarifas_write ON public.servicio_tarifas;
CREATE POLICY tarifas_write ON public.servicio_tarifas FOR ALL TO authenticated
  USING ((SELECT current_user_rol()) IN ('owner','superadmin'))
  WITH CHECK ((SELECT current_user_rol()) IN ('owner','superadmin'));

DROP POLICY IF EXISTS club_config_select ON public.club_config;
CREATE POLICY club_config_select ON public.club_config FOR SELECT TO authenticated
  USING (club = current_user_club() OR es_superadmin());
DROP POLICY IF EXISTS club_config_write ON public.club_config;
CREATE POLICY club_config_write ON public.club_config FOR ALL TO authenticated
  USING ((SELECT current_user_rol()) IN ('owner','superadmin'))
  WITH CHECK ((SELECT current_user_rol()) IN ('owner','superadmin'));

-- Transacciones: staff registra (a su propio nombre) y gestiona; la familia
-- lee las de sus pagos.
DROP POLICY IF EXISTS transacciones_staff ON public.pago_transacciones;
CREATE POLICY transacciones_staff ON public.pago_transacciones FOR ALL TO authenticated
  USING (es_staff())
  WITH CHECK (es_staff() AND registrado_por = current_usuario_id());
DROP POLICY IF EXISTS transacciones_select_propio ON public.pago_transacciones;
CREATE POLICY transacciones_select_propio ON public.pago_transacciones FOR SELECT TO authenticated
  USING (pago_id IN (SELECT p.id FROM pagos p
                     WHERE p.atleta_id IN (SELECT unnest(mis_atletas()))));

-- Comprobantes: staff todo; padre/atleta lee e inserta SOLO sobre pagos suyos.
DROP POLICY IF EXISTS comprobantes_staff ON public.pago_comprobantes;
CREATE POLICY comprobantes_staff ON public.pago_comprobantes FOR ALL TO authenticated
  USING (es_staff()) WITH CHECK (es_staff());
DROP POLICY IF EXISTS comprobantes_select_propio ON public.pago_comprobantes;
CREATE POLICY comprobantes_select_propio ON public.pago_comprobantes FOR SELECT TO authenticated
  USING (pago_id IN (SELECT p.id FROM pagos p
                     WHERE p.atleta_id IN (SELECT unnest(mis_atletas()))));
DROP POLICY IF EXISTS comprobantes_insert_propio ON public.pago_comprobantes;
CREATE POLICY comprobantes_insert_propio ON public.pago_comprobantes FOR INSERT TO authenticated
  WITH CHECK (subido_por = current_usuario_id()
    AND pago_id IN (SELECT p.id FROM pagos p
                    WHERE p.atleta_id IN (SELECT unnest(mis_atletas()))));

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Job diario de vencidos (pg_cron). Guardado en un DO por si la extensión
--    no está disponible en el plan del proyecto: en ese caso la migración NO
--    falla y el respaldo sigue siendo la llamada idempotente al montar
--    AdminPagos (comportamiento actual).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.marcar_pagos_vencidos()
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE pagos SET estado = 'Vencido'
  WHERE estado IN ('Pendiente','Abonado') AND fecha_vencimiento < current_date;
$$;

REVOKE ALL ON FUNCTION public.marcar_pagos_vencidos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_pagos_vencidos() TO authenticated, service_role;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('marcar-pagos-vencidos', '15 5 * * *',
                        'SELECT public.marcar_pagos_vencidos()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron no disponible (%) — marcar_pagos_vencidos() seguirá corriendo desde AdminPagos al montar', SQLERRM;
END;
$$;
