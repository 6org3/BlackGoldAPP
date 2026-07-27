-- ============================================================================
-- v51 — Contabilidad de gestión: tabla `gastos`.
--
-- Origen: "Punto de Partida — Black Gold.md" §6/§7 (Fase E) y el encargo de
-- construcción de `blackgold-negocio-mcp` v0.1. La app (Dashboard_Premium) NO
-- registra un solo gasto hoy — pagosService.js cubre COBRANZA (dinero que
-- entra), no CONTABILIDAD DE GESTIÓN (dinero que sale: nómina, arriendo,
-- marketing, equipamiento...). Esta migración abre ese hueco con la tabla
-- mínima que necesitan las tools `registrar_gasto`/`resumen_gastos` del MCP
-- de negocio.
--
-- ESTADO AL ESCRIBIR ESTA MIGRACIÓN: escrita, NO aplicada. Quien construyó
-- blackgold-negocio-mcp no tuvo (ni debía tener) acceso de red ni credenciales
-- para correr `npx supabase db push`. Hasta que Jorge la aplique, las tools
-- `registrar_gasto` y `resumen_gastos` fallan con un error legible que lo
-- explica. Aplicar con: cd Dashboard_Premium && npx supabase db push
--
-- Decisiones de diseño:
--
-- 1. `club` es texto denormalizado (no hay tabla `clubes` — ver v34 §1:
--    "El club vive denormalizado en varias tablas sin FK"), igual que
--    usuarios.club / grupos_entrenamiento.club / club_config.club.
--
-- 2. `registrado_por` es TEXTO LIBRE, no una FK a usuarios(id). Todas las
--    demás tablas de auditoría del esquema (pagos.registrado_por, pago_
--    transacciones.registrado_por, pagos_auditoria.actor_id) SÍ son FK a
--    usuarios(id), porque se escriben desde una sesión de app con
--    current_usuario_id() resuelto de auth.uid(). blackgold-negocio-mcp corre
--    con la service_role key, sin sesión de usuario ligada a una fila de
--    `usuarios` — el actor típico es un agente de IA (Pythagoras) actuando
--    por instrucción de Jorge, no necesariamente una cuenta staff con login.
--    Forzar una FK habría obligado al MCP a inventarse o adivinar un
--    usuario_id, que es peor que declarar el campo como lo que realmente es:
--    una anotación de texto de quién/qué originó el registro.
--
-- 3. RLS restringida a owner/superadmin (mismo patrón que club_config_write,
--    v40): un gasto es dato financiero sensible, no un catálogo de precios
--    que cualquier staff deba ver. Esta RLS solo importa si la app alguna vez
--    gana una UI de gastos — el MCP escribe con service_role y la bypasea.
--
-- 4. Categorías: lista CERRADA vía CHECK, en sincronía exacta con la
--    constante CATEGORIAS_GASTO de blackgold-negocio-mcp/src/index.js. Si se
--    agrega una categoría en un lado, agregar también en el otro.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.gastos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club           text NOT NULL DEFAULT 'Black Gold',
  fecha          date NOT NULL DEFAULT current_date,
  monto          numeric(10,2) NOT NULL CHECK (monto > 0),
  categoria      text NOT NULL CHECK (categoria IN (
                   'Nómina',
                   'Arriendo e instalaciones',
                   'Servicios básicos',
                   'Marketing y publicidad',
                   'Equipamiento deportivo',
                   'Mantenimiento',
                   'Transporte',
                   'Impuestos y permisos',
                   'Insumos y suministros',
                   'Otro'
                 )),
  descripcion    text NOT NULL CHECK (btrim(descripcion) <> ''),
  -- Texto libre a propósito: ver nota de diseño §2 en la cabecera de esta
  -- migración (el actor típico es un agente de IA vía MCP, no una sesión de
  -- usuarios.id).
  registrado_por text NOT NULL CHECK (btrim(registrado_por) <> ''),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gastos_club_fecha ON public.gastos (club, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON public.gastos (categoria);

COMMENT ON TABLE public.gastos IS
  'Contabilidad de gestión (v51): gastos operativos del club (nómina, arriendo, marketing, etc.). No confundir con `pagos`, que es COBRANZA (dinero que entra de las familias). Alimentada hoy por blackgold-negocio-mcp (registrar_gasto), no por la app.';

-- updated_at automático: reutiliza tg_set_updated_at(), creada en v27 para
-- club_config/catalogo_servicios — mismo patrón, no se duplica la función.
DROP TRIGGER IF EXISTS trg_gastos_updated_at ON public.gastos;
CREATE TRIGGER trg_gastos_updated_at
  BEFORE UPDATE ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS (estilo v24/v40): solo owner/superadmin, scopeado a su club (superadmin
-- cruza). Ver nota de diseño §3 en la cabecera: la service_role key del MCP
-- bypasea esta RLS por completo; solo aplica si la app gana una UI de gastos.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gastos_select ON public.gastos;
CREATE POLICY gastos_select ON public.gastos FOR SELECT TO authenticated
  USING (
    (select current_user_rol()) IN ('owner', 'superadmin')
    AND (club = (select current_user_club()) OR (select es_superadmin()))
  );

DROP POLICY IF EXISTS gastos_write ON public.gastos;
CREATE POLICY gastos_write ON public.gastos FOR ALL TO authenticated
  USING (
    (select current_user_rol()) IN ('owner', 'superadmin')
    AND (club = (select current_user_club()) OR (select es_superadmin()))
  )
  WITH CHECK (
    (select current_user_rol()) IN ('owner', 'superadmin')
    AND (club = (select current_user_club()) OR (select es_superadmin()))
  );
