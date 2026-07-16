-- ============================================================================
-- v38 — La pertenencia dice QUÉ es cada grupo para el atleta (D2).
--
-- `atleta_grupo` pasa a ser la fuente de verdad y gana el rol de la membresía:
-- un grupo BÁSICO (el que cubre la cuota) y N ADICIONALES (add-ons). La columna
-- `atletas.grupo_id` se queda como CACHÉ DERIVADA con un único escritor.
--
-- CONTINUIDAD POR CONSTRUCCIÓN: la básica se define como "el grupo que YA se
-- factura" (atletas.grupo_id), así que el espejo reescribe el mismo valor y
-- generar_pagos_mes emite exactamente las mismas filas. Verificado en la base
-- antes de escribir esto: los 50 vínculos de atleta_grupo son EXACTAMENTE los
-- 50 atletas con grupo_id — 0 huérfanos, 0 cross-club, 0 atletas con dos
-- grupos, 0 atletas que empezarían a facturar. Delta de ingresos: CERO.
--
-- NO se proyecta el nivel. Decisión del dueño (2026-07-15): un grupo mezcla
-- atletas de distintos niveles a propósito, así que `atletas.nivel_desarrollo`
-- NO se toca aquí y sigue siendo un atributo del atleta que asigna el coach.
-- (Un diseño anterior hacía que el nivel del grupo básico reetiquetara al
-- atleta; eso le habría cambiado los umbrales de evaluación en silencio.)
-- ============================================================================

-- ─── 1. Cerrar la fuga de lectura, que es REAL y está viva ──────────────────
-- atleta_grupo_select es USING(true) para cualquier authenticated (v24:739):
-- hoy un padre de un club puede leer las pertenencias de TODOS los clubes.
-- v29 re-scopeó solo la ESCRITURA (atleta_grupo_write) y se dejó la lectura.
-- Al volverse esta tabla la fuente de verdad de la facturación, es inaceptable.
DROP POLICY IF EXISTS atleta_grupo_select ON public.atleta_grupo;
CREATE POLICY atleta_grupo_select ON public.atleta_grupo FOR SELECT TO authenticated
  USING ((select public.es_superadmin())
         OR (select public.club_de_atleta(atleta_id)) = (select public.current_user_club()));

-- ─── 2. El vínculo gana rol y facturabilidad ────────────────────────────────
-- No se añade `baja_at`: las dos RPC de §7 borran la fila, así que nacería
-- muerta. Cuando haga falta histórico de pertenencia, se añade con su escritor.
ALTER TABLE public.atleta_grupo ADD COLUMN IF NOT EXISTS rol_membresia text NOT NULL DEFAULT 'adicional';
ALTER TABLE public.atleta_grupo ADD COLUMN IF NOT EXISTS facturable    boolean NOT NULL DEFAULT true;

ALTER TABLE public.atleta_grupo DROP CONSTRAINT IF EXISTS atleta_grupo_rol_check;
ALTER TABLE public.atleta_grupo ADD CONSTRAINT atleta_grupo_rol_check
  CHECK (rol_membresia IN ('basica','adicional'));

COMMENT ON COLUMN public.atleta_grupo.rol_membresia IS
  'basica = el grupo que cubre la membresía (uno por atleta, y el que factura la mensualidad). adicional = add-on. DEFAULT adicional: un INSERT crudo NO puede convertirse en la básica de nadie por omisión.';
COMMENT ON COLUMN public.atleta_grupo.facturable IS
  'Solo para add-ons: si se cobra aparte. false = cortesía, o vínculo legacy grandfathered (§4: los previos a v38 nunca se cobraron y no pueden empezar a cobrarse solos).';

-- NOTA DE DISEÑO: no se añade precio_override por atleta+grupo. Ya hay dos
-- fuentes de precio desconectadas (grupos.precio_mensual, que factura, y
-- catalogo_servicios, que nadie lee para la mensualidad — docs/pagos_diseno.md).
-- Una tercera sería deuda nueva: el precio del add-on es el del grupo.

-- ─── 3. Integridad de club a nivel de motor ─────────────────────────────────
-- Hoy nada impide un vínculo cross-club: la limpieza es un script a mano
-- (scripts/reparar_pertenencia_grupos.mjs). El trigger se arma DESPUÉS del
-- backfill a propósito, por si quedara data legacy.
CREATE OR REPLACE FUNCTION public.validar_club_atleta_grupo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT club FROM grupos_entrenamiento WHERE id = NEW.grupo_id)
     IS DISTINCT FROM (SELECT club_de_atleta(NEW.atleta_id)) THEN
    RAISE EXCEPTION 'El atleta y el grupo son de clubes distintos.';
  END IF;
  RETURN NEW;
END $$;

-- ─── 4. BACKFILL. ORDEN OBLIGATORIO: 4a → 4b → 4c → índices → triggers ──────

-- 4a. Purga defensiva de vínculos rotos (verificado: 0 hoy).
DELETE FROM public.atleta_grupo ag
 WHERE NOT EXISTS (SELECT 1 FROM public.grupos_entrenamiento g WHERE g.id = ag.grupo_id)
    OR (SELECT g.club FROM public.grupos_entrenamiento g WHERE g.id = ag.grupo_id)
       IS DISTINCT FROM (SELECT public.club_de_atleta(ag.atleta_id));

-- 4b. LA LÍNEA QUE GARANTIZA QUE LA FACTURA NO SE MUEVE:
--     la básica := el grupo que la columna ya venía facturando.
UPDATE public.atleta_grupo ag
   SET rol_membresia = 'basica'
  FROM public.atletas a
 WHERE a.id = ag.atleta_id AND a.grupo_id = ag.grupo_id;

-- 4c. GRANDFATHERING. `facturable` nace en true, así que sin esto todo vínculo
--     preexistente que no sea la básica se volvería un add-on cobrable y cada
--     familia recibiría una SEGUNDA línea el día 1. Nunca se cobraron: se
--     apagan en bloque y el dueño los enciende uno a uno. (Verificado: hoy
--     afecta a 0 filas; queda por si el orden de aplicación cambia.)
UPDATE public.atleta_grupo
   SET facturable = false
 WHERE rol_membresia = 'adicional' AND facturable;

-- ─── 5. D2 ESTRUCTURAL: la básica cubre EXACTAMENTE UN grupo ────────────────
-- Va DESPUÉS del backfill: al revés, cualquier atleta con dos vínculos abortaría
-- el `db push` a mitad.
CREATE UNIQUE INDEX IF NOT EXISTS atleta_grupo_basica_key
  ON public.atleta_grupo (atleta_id) WHERE rol_membresia = 'basica';

DROP TRIGGER IF EXISTS trg_validar_club_atleta_grupo ON public.atleta_grupo;
CREATE TRIGGER trg_validar_club_atleta_grupo
  BEFORE INSERT OR UPDATE ON public.atleta_grupo
  FOR EACH ROW EXECUTE FUNCTION public.validar_club_atleta_grupo();

-- ─── 6. EL ESPEJO: refresca atletas.grupo_id, y NUNCA lo anula ──────────────
-- Deliberadamente NO toca nivel_desarrollo: el nivel es del atleta, no del grupo.
--
-- LA REGLA QUE SOSTIENE TODO ESTO: si no hay básica, el espejo NO TOCA la caché.
-- Escribir NULL parece lo natural y es una bomba, porque en este sistema
-- `grupo_id NULL` no significa "no cobrar" sino "cobrar $30": generar_pagos_mes
-- (v34:237) hace COALESCE(g.precio_mensual, 30.00) sobre un LEFT JOIN. Anular la
-- caché repreciaría a la familia en la siguiente corrida del cron, sin error y
-- sin que nadie lo apruebe. Tres consecuencias concretas de esta regla:
--
--   1. Borrar un grupo SIGUE FALLANDO. atleta_grupo tiene ON DELETE CASCADE
--      (baseline:1026) pero atletas.grupo_id es NO ACTION (baseline:1036): si el
--      espejo anulara la caché al cascadear, el FK se quedaría sin nada que
--      bloquear y el DELETE pasaría, tirando a sus atletas a $30 — exactamente
--      lo que v37 §4 rechazó por escrito. Al no anular, la protección sigue viva.
--   2. Un INSERT crudo en atleta_grupo (los seeds, un script) no puede destruir
--      la caché: crea un 'adicional', el espejo no encuentra básica y se calla.
--   3. Quitar la básica sin poner otra deja la caché rancia — a propósito: el
--      atleta sigue facturando lo que ya facturaba. Para que DEJE de facturar
--      existe estado_membresia='baja' (v34:254-256), que es la vía explícita.
--
-- El UPDATE sobre atletas re-dispara proteger_columnas_atletas (v34:98), que
-- deja pasar a staff y a los caminos sin auth.uid() (triggers/service_role) y
-- solo bloquea columnas de membresía — que este espejo no toca. Mismo precedente
-- que limpiar_grupos_al_cambiar_club (v34:190), que ya hace este UPDATE.
CREATE OR REPLACE FUNCTION public.sync_grupo_basico(p_atleta_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_grupo uuid; v_nombre text;
BEGIN
  SELECT g.id, g.nombre INTO v_grupo, v_nombre
    FROM atleta_grupo ag JOIN grupos_entrenamiento g ON g.id = ag.grupo_id
   WHERE ag.atleta_id = p_atleta_id AND ag.rol_membresia = 'basica'
   LIMIT 1;
  IF v_grupo IS NULL THEN
    RETURN; -- sin básica: no se toca la caché (ver la regla de arriba)
  END IF;
  UPDATE atletas
     SET grupo_id = v_grupo, grupo_nombre = v_nombre
   WHERE id = p_atleta_id
     AND (grupo_id IS DISTINCT FROM v_grupo OR grupo_nombre IS DISTINCT FROM v_nombre);
END $$;

CREATE OR REPLACE FUNCTION public.trg_sync_grupo_basico()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM sync_grupo_basico(COALESCE(NEW.atleta_id, OLD.atleta_id));
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_grupo_basico ON public.atleta_grupo;
CREATE TRIGGER trg_sync_grupo_basico
  AFTER INSERT OR UPDATE OR DELETE ON public.atleta_grupo
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_grupo_basico();

-- Renombrar un grupo debe refrescar la caché de nombre de sus básicos.
CREATE OR REPLACE FUNCTION public.trg_sync_nombre_grupo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE atletas a SET grupo_nombre = NEW.nombre
   WHERE a.grupo_id = NEW.id AND a.grupo_nombre IS DISTINCT FROM NEW.nombre;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_nombre_grupo ON public.grupos_entrenamiento;
CREATE TRIGGER trg_sync_nombre_grupo
  AFTER UPDATE OF nombre ON public.grupos_entrenamiento
  FOR EACH ROW WHEN (OLD.nombre IS DISTINCT FROM NEW.nombre)
  EXECUTE FUNCTION public.trg_sync_nombre_grupo();

-- 6b. Arranque del espejo: sin esto nace desincronizado.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT atleta_id FROM atleta_grupo
            WHERE rol_membresia = 'basica'
  LOOP PERFORM sync_grupo_basico(r.atleta_id); END LOOP;
END $$;

COMMENT ON COLUMN public.atletas.grupo_id IS
  'CACHÉ DERIVADA de atleta_grupo(rol_membresia=basica). Único escritor: trg_sync_grupo_basico. No escribir a mano.';

REVOKE ALL ON FUNCTION public.sync_grupo_basico(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_grupo_basico(uuid) TO authenticated, service_role;

-- ─── 7. RPCs: el camino RECOMENDADO de escritura de la membresía ────────────
-- No son el único: la RLS atleta_grupo_write (v29:375-384) es FOR ALL para el
-- staff del club, así que un INSERT crudo por PostgREST sigue siendo posible y
-- no se pretende cerrarlo aquí (haría falta revocar el grant de la tabla, que
-- rompería lecturas). Lo que sí se garantiza es que un INSERT crudo sea
-- INOFENSIVO: cae en rol_membresia='adicional' por DEFAULT, y el espejo no anula
-- nada al no encontrar básica (§6). Para CONVERTIRSE en básica hay que decirlo
-- explícitamente, y ahí es donde estas RPC añaden lo que la RLS no sabe
-- expresar: "la básica debe ser un principal activo" y el cupo.
-- SECURITY INVOKER a propósito: que la RLS de v29 haga el aislamiento por club.
CREATE OR REPLACE FUNCTION public.asignar_grupo_basico(p_atleta_id uuid, p_grupo_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_ocupado integer; v_cupo integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM grupos_entrenamiento
                  WHERE id = p_grupo_id AND es_principal AND activo) THEN
    RAISE EXCEPTION 'La membresía básica solo cubre un grupo principal activo.';
  END IF;
  SELECT g.cupo_max, (SELECT count(*) FROM atleta_grupo x
                       WHERE x.grupo_id = g.id)
    INTO v_cupo, v_ocupado FROM grupos_entrenamiento g WHERE g.id = p_grupo_id;
  IF v_cupo IS NOT NULL AND v_ocupado >= v_cupo
     AND NOT EXISTS (SELECT 1 FROM atleta_grupo WHERE atleta_id = p_atleta_id AND grupo_id = p_grupo_id) THEN
    RAISE EXCEPTION 'El grupo está lleno: % de % plazas.', v_ocupado, v_cupo;
  END IF;
  -- Una básica nueva sustituye a la anterior: el índice único lo exige.
  DELETE FROM atleta_grupo
   WHERE atleta_id = p_atleta_id AND rol_membresia = 'basica' AND grupo_id <> p_grupo_id;
  INSERT INTO atleta_grupo (atleta_id, grupo_id, rol_membresia, facturable)
  VALUES (p_atleta_id, p_grupo_id, 'basica', true)
  ON CONFLICT (atleta_id, grupo_id) DO UPDATE SET rol_membresia = 'basica', facturable = true;
END $$;

CREATE OR REPLACE FUNCTION public.set_grupo_adicional(
  p_atleta_id uuid, p_grupo_id uuid, p_activo boolean, p_facturable boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NOT p_activo THEN
    DELETE FROM atleta_grupo
     WHERE atleta_id = p_atleta_id AND grupo_id = p_grupo_id AND rol_membresia = 'adicional';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM grupos_entrenamiento WHERE id = p_grupo_id AND es_principal) THEN
    RAISE EXCEPTION 'Un grupo principal no es un add-on: se asigna como membresía básica.';
  END IF;
  INSERT INTO atleta_grupo (atleta_id, grupo_id, rol_membresia, facturable)
  VALUES (p_atleta_id, p_grupo_id, 'adicional', p_facturable)
  ON CONFLICT (atleta_id, grupo_id) DO UPDATE
    SET rol_membresia = 'adicional', facturable = p_facturable;
END $$;

-- v24 revocó default privileges de anon sobre TABLAS, no sobre FUNCIONES.
REVOKE ALL ON FUNCTION public.asignar_grupo_basico(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_grupo_adicional(uuid,uuid,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asignar_grupo_basico(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_grupo_adicional(uuid,uuid,boolean,boolean) TO authenticated, service_role;
