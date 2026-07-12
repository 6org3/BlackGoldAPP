-- ============================================================
-- MIGRACIÓN v30 — Auditoría formal de pagos
-- ============================================================
-- docs/pagos_diseno.md §8 (P2) dejó declarada como deuda consciente la
-- ausencia de un registro formal de "quién cambió qué estado y cuándo"
-- (hasta ahora solo quedaba rastro parcial en pagos.notas, escrito a mano
-- por cada camino). Esta migración cierra ese hueco con una tabla de solo
-- lectura para el staff, alimentada por un trigger genérico en `pagos` que
-- registra TODOS los caminos existentes sin tocarlos: alta/baja de
-- pago_transacciones (trg_recalcular_pago, v27), aprobar/rechazar
-- comprobante (resolver_comprobante, v27), anular cargo (anularCargo,
-- pagosService.js), vencimiento automático (marcar_pagos_vencidos,
-- v27/pg_cron) y el alta inicial (generar_pagos_mes, v28 / crearCargo).
--
-- actor_id usa current_usuario_id() (auth.uid() del llamador original —
-- SECURITY DEFINER no lo altera, ver v24). Queda NULL cuando el cambio lo
-- dispara pg_cron (sin sesión de usuario): eso es correcto, no un bug.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Tabla
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pagos_auditoria (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id          uuid NOT NULL REFERENCES public.pagos(id) ON DELETE CASCADE,
  accion           text NOT NULL CHECK (accion IN ('creado', 'estado_cambiado')),
  estado_anterior  text,
  estado_nuevo     text,
  monto_pagado_anterior numeric(10,2),
  monto_pagado_nuevo    numeric(10,2),
  actor_id         uuid REFERENCES public.usuarios(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_auditoria_pago ON public.pagos_auditoria(pago_id, created_at DESC);

ALTER TABLE public.pagos_auditoria ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 2. Trigger genérico en `pagos`: registra el alta y cualquier cambio de
--    estado o de monto_pagado (un abono puede repetir estado 'Abonado' con
--    saldo distinto, por eso se dispara también solo con ese cambio).
--    SECURITY DEFINER + REVOKE: la tabla nunca se escribe a mano desde el
--    cliente, solo vía este trigger (mismo patrón que tg_recalcular_pago).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_registrar_auditoria_pago()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO pagos_auditoria (pago_id, accion, estado_nuevo, monto_pagado_nuevo, actor_id)
    VALUES (NEW.id, 'creado', NEW.estado, NEW.monto_pagado, current_usuario_id());
  ELSIF TG_OP = 'UPDATE'
        AND (NEW.estado IS DISTINCT FROM OLD.estado
             OR NEW.monto_pagado IS DISTINCT FROM OLD.monto_pagado) THEN
    INSERT INTO pagos_auditoria (
      pago_id, accion, estado_anterior, estado_nuevo,
      monto_pagado_anterior, monto_pagado_nuevo, actor_id
    ) VALUES (
      NEW.id, 'estado_cambiado', OLD.estado, NEW.estado,
      OLD.monto_pagado, NEW.monto_pagado, current_usuario_id()
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_registrar_auditoria_pago() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_registrar_auditoria_pago ON public.pagos;
CREATE TRIGGER trg_registrar_auditoria_pago
  AFTER INSERT OR UPDATE ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.tg_registrar_auditoria_pago();


-- ------------------------------------------------------------
-- 3. RLS: solo lectura, staff de su propio club (mismo criterio que
--    pagos_staff desde v29 — vía club_de_atleta() del pago referenciado).
--    Nadie escribe desde el cliente: no hay política INSERT/UPDATE/DELETE
--    para `authenticated`, así que esas operaciones quedan denegadas por
--    RLS incluso si alguien lo intentara vía API directa. Solo el trigger
--    (SECURITY DEFINER, corre como el owner de la función) inserta.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS pagos_auditoria_select ON public.pagos_auditoria;
CREATE POLICY pagos_auditoria_select ON public.pagos_auditoria FOR SELECT TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND EXISTS (
      SELECT 1 FROM pagos p
      WHERE p.id = pagos_auditoria.pago_id
        AND (select club_de_atleta(p.atleta_id)) = (select current_user_club())
    ))
  );
