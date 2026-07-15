-- ============================================================================
-- v37 — Los grupos ganan nivel, rol de membresía y archivado.
--
-- Base de D1 (el club crea sus propios grupos) y D2 (la membresía básica cubre
-- uno de los tres principales; los extra se facturan aparte).
--
-- Esta migración NO cambia el comportamiento de nada: no crea grupos, no mueve
-- atletas, no toca precios y no altera la facturación. Solo abre el esquema y
-- arregla las deudas que bloqueaban el feature.
--
-- INVARIANTE: el NIVEL de un grupo NO determina el nivel de sus atletas.
-- Un grupo mezcla atletas de distintos niveles a propósito (decisión del dueño,
-- 2026-07-15) — es un horario, no una categoría de habilidad.
-- `atletas.nivel_desarrollo` sigue siendo un atributo del ATLETA que asigna el
-- coach, y es lo único que leen los baremos. `grupos_entrenamiento.nivel` es
-- una etiqueta del grupo: sirve para nombrar los tres principales, dar XP a la
-- sesión y limitar a tres los principales por club. Nunca se proyecta al atleta.
--
-- Por eso NO se toca packages/analytics-core (baremos.js:415 usa el nombre del
-- nivel como CLAVE del JSONB de umbrales), ni su copia vendorizada en
-- supabase/functions/_shared/, ni blackgold-mcp.
-- ============================================================================

-- ─── 1. BUG BLOQUEANTE: UNIQUE(nombre) es GLOBAL, no por club ───────────────
-- baseline.sql:818-825. Hoy impide que dos clubes tengan cada uno su "Elite".
-- Evidencia de que ya estorba: sembrar_club_qa_compacto.mjs prefija "QAC Sub-16"
-- solo para no chocar con el "Sub-16" de otro seed.
-- Relajar a (club,nombre) no puede fallar: todo índice más laxo admite lo que el
-- estricto ya admitía. Verificado en la base: 0 colisiones (club,nombre).
--
-- `club` pasa a NOT NULL ANTES de indexarlo: en un UNIQUE de Postgres los NULL
-- son distintos entre sí, así que con club nullable dos filas (NULL,'Elite')
-- convivirían — más laxo que el UNIQUE(nombre) que se elimina — y el límite de
-- "máximo 3 principales por club" del §2 dejaría de ser estructural.
-- Verificado en la base: 0 grupos con club NULL, así que no puede fallar.
ALTER TABLE public.grupos_entrenamiento ALTER COLUMN club SET NOT NULL;

ALTER TABLE public.grupos_entrenamiento
  DROP CONSTRAINT IF EXISTS grupos_entrenamiento_nombre_key;
CREATE UNIQUE INDEX IF NOT EXISTS grupos_entrenamiento_club_nombre_key
  ON public.grupos_entrenamiento (club, nombre);

-- ─── 2. Tres columnas, no una ───────────────────────────────────────────────
-- Van separadas porque un grupo custom "Elite Mañana" necesita nivel='Elite'
-- (para el XP de su sesión) pero NO debe ser principal: no consume el cupo de
-- la membresía básica y se factura como add-on.
ALTER TABLE public.grupos_entrenamiento ADD COLUMN IF NOT EXISTS nivel        text;
ALTER TABLE public.grupos_entrenamiento ADD COLUMN IF NOT EXISTS es_principal boolean NOT NULL DEFAULT false;
ALTER TABLE public.grupos_entrenamiento ADD COLUMN IF NOT EXISTS activo       boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.grupos_entrenamiento.nivel IS
  'Etiqueta del grupo, vocabulario CERRADO de 3 (Micro/Desarrollo/Elite): analytics-core/baremos.js usa el nombre del nivel como CLAVE del JSONB de umbrales, así que un nivel inventado no daría error, desaparecería en silencio. El NOMBRE del grupo es libre y jamás viaja como clave. NO determina el nivel de los atletas del grupo: un grupo mezcla niveles a propósito. NULL = grupo sin nivel deportivo declarado.';
COMMENT ON COLUMN public.grupos_entrenamiento.es_principal IS
  'true = uno de los grupos que cubre la membresía básica (D2). false = grupo extra, add-on facturable aparte.';
COMMENT ON COLUMN public.grupos_entrenamiento.activo IS
  'Retiro suave, y la ÚNICA vía de retiro mientras el FK atletas.grupo_id siga en NO ACTION (ver §4): un grupo con atletas o histórico no se borra, se archiva.';

ALTER TABLE public.grupos_entrenamiento DROP CONSTRAINT IF EXISTS grupos_nivel_check;
ALTER TABLE public.grupos_entrenamiento ADD CONSTRAINT grupos_nivel_check
  CHECK (nivel IS NULL OR nivel IN ('Micro','Desarrollo','Elite'));

-- Un grupo PRINCIPAL siempre declara nivel: es lo que lo identifica como "el
-- Micro"/"el Desarrollo"/"el Elite" del club. Los extra pueden no tenerlo.
ALTER TABLE public.grupos_entrenamiento DROP CONSTRAINT IF EXISTS grupos_principal_nivel_check;
ALTER TABLE public.grupos_entrenamiento ADD CONSTRAINT grupos_principal_nivel_check
  CHECK (NOT es_principal OR nivel IS NOT NULL);

-- D2 ESTRUCTURAL: a lo sumo UN principal por (club,nivel) ⇒ máximo 3 por club.
-- Parcial a propósito: los grupos extra pueden repetir nivel sin límite
-- ("Elite Mañana" y "Elite Tarde" conviven).
CREATE UNIQUE INDEX IF NOT EXISTS grupos_principal_club_nivel_key
  ON public.grupos_entrenamiento (club, nivel) WHERE es_principal AND activo;

-- ─── 3. Que un grupo nuevo no herede un precio que nadie escribió ───────────
-- Quitar el DEFAULT 30.00 (baseline.sql:441) obliga a que todo INSERT futuro
-- diga el precio. No toca ninguna fila existente ni cambia lo que se factura.
--
-- Precedente, con la atribución correcta: el cobro indebido de $30 que motivó
-- scripts/reconciliar_pagos_precio_grupo.mjs NO lo causó este DEFAULT, sino un
-- fallback hardcodeado en el cliente (generarPagosMensuales en pagosService.js
-- cobraba $30 fijo IGNORANDO el precio_mensual real del grupo). Aquel se
-- corrigió, pero el fallback equivalente SIGUE VIVO server-side:
-- generar_pagos_mes (v34:237) hace COALESCE(g.precio_mensual, 30.00), así que
-- un atleta sin grupo —o con un grupo sin precio— aún factura $30 en silencio.
-- Este DROP DEFAULT cierra solo la puerta de entrada (grupos nuevos sin precio);
-- matar el fallback es del PR de facturación, que excluirá del cobro a quien no
-- tenga precio de grupo en vez de inventarle uno.
-- Verificado en la base: 0 grupos con precio NULL y 0 con precio negativo, así
-- que el CHECK entra validado sin sanear nada.
ALTER TABLE public.grupos_entrenamiento ALTER COLUMN precio_mensual DROP DEFAULT;
ALTER TABLE public.grupos_entrenamiento DROP CONSTRAINT IF EXISTS grupos_precio_check;
ALTER TABLE public.grupos_entrenamiento ADD CONSTRAINT grupos_precio_check
  CHECK (precio_mensual IS NULL OR precio_mensual >= 0);

-- ─── 4. Por qué NO se toca el FK atletas.grupo_id (deliberado) ──────────────
-- Tentación descartada: recrear atletas_grupo_id_fkey (baseline.sql:1036) con
-- ON DELETE SET NULL para que se pueda borrar un grupo en uso.
--
-- Sería un cambio de precio silencioso. Hoy ese FK NO tiene ON DELETE, así que
-- borrar un grupo con atletas FALLA — y ese error ES la protección. Con SET NULL
-- el DELETE tendría éxito, dejaría atletas.grupo_id = NULL, y el pg_cron del día
-- 1 (v28:110-118) evaluaría COALESCE(g.precio_mensual, 30.00) sin match: cada
-- familia de ese grupo pasaría a facturar $30 sin error, sin log y sin que nadie
-- lo apruebe (y un pago ya 'Pagado' no se revierte). No hace falta esperar a la
-- UI: grupos_write (v29:364-371) es FOR ALL, o sea que cualquier staff del club
-- ya puede mandar ese DELETE por PostgREST.
--
-- El retiro de grupos se hace con `activo = false` (§2). Si algún día se quiere
-- el SET NULL, va en el MISMO PR que elimine el fallback de $30 del generador y
-- que limpie también grupo_nombre (convención fijada en v34:196).

-- ─── 5. Blindar el vocabulario de niveles del atleta ────────────────────────
-- Asimetría heredada: misiones.nivel_objetivo SÍ tiene CHECK (baseline.sql:497)
-- mientras atletas.nivel_desarrollo es texto libre (baseline.sql:216). Un script
-- con service_role puede escribir 'Iniciación' y resolverUmbrales
-- (baremos.js:415-418) caería al fallback 'Desarrollo' SIN ERROR: al atleta se le
-- evaluaría contra los umbrales equivocados en silencio.
-- Se añade VALIDADO (no NOT VALID): verificado en la base que los 474 atletas
-- solo tienen Micro (15) / Desarrollo (447) / Elite (11) / NULL (1).
ALTER TABLE public.atletas DROP CONSTRAINT IF EXISTS atletas_nivel_desarrollo_check;
ALTER TABLE public.atletas ADD CONSTRAINT atletas_nivel_desarrollo_check
  CHECK (nivel_desarrollo IS NULL OR nivel_desarrollo IN ('Micro','Desarrollo','Elite'));

-- Nota: no se crea ningún índice sobre atleta_grupo(grupo_id) — ya existe
-- idx_atleta_grupo_grupo desde el baseline (baseline.sql:922). `IF NOT EXISTS`
-- compara solo el NOMBRE, así que uno con nombre distinto habría quedado como un
-- segundo btree idéntico y muerto.
