-- ============================================================================
-- v53 — CIERRE DE LOS P2 (auditoría adversarial 2026-07-29, segundo lote)
-- ============================================================================
-- Aditiva e INDEPENDIENTE de v52 (20260729120000): no redefine ninguna función
-- ni política que v52 cree, y no invoca es_owner_activo(). Puede aplicarse
-- antes o después de v52 sin cambiar el resultado.
--
-- §1 El rol `anon` conserva EXECUTE sobre trece funciones del esquema.
--    Causa raíz viva y nunca revocada, en baseline:1903:
--      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--        GRANT ALL ON FUNCTIONS TO anon;
--    v24:419 revocó los default privileges de TABLAS, nunca los de FUNCIONES.
--    Y un `REVOKE ... FROM PUBLIC` retira la concesión implícita a PUBLIC, NO
--    la concesión DIRECTA que ese default privilege le dio a anon al crear la
--    función: sigue publicada en /rest/v1/rpc/<nombre> para cualquiera con la
--    anon key, que viaja en el bundle y estuvo en el historial de un repo
--    público.
--    El repo ya conocía el mecanismo y lo escribió bien donde tocaba: v27:82-84
--    lo comenta literalmente antes de un `FROM PUBLIC, anon`, y v32 y v24:422
--    igual. Lo que falta es aplicarlo a las que quedaron a medias.
--    Once de las trece son inocuas HOY (nueve dependen de auth.uid() y
--    devuelven NULL/false sin sesión; fn_coach_stats y fn_retencion_club llevan
--    gate interno es_staff()). Se revocan igual: son inocuas por su CUERPO
--    actual, no por su ACL, y la próxima versión de cualquiera hereda la
--    exposición sin que nadie lo note.
--    Las DOS que sí filtran datos a un anónimo, y que motivan la sección:
--      · club_de_usuario(uuid) — SELECT club FROM usuarios WHERE id = $1
--      · club_de_atleta(uuid)  — el club del atleta vía usuarios
--    Ambas SECURITY DEFINER, parametrizadas y sin gate: confirman que un uuid
--    existe y devuelven su club. Hace falta conocer el uuid (v4, no
--    enumerable), así que el impacto es acotado — pero es una fuga no
--    autenticada sobre datos de menores y el fix es de una línea por función.
--
-- §2 marcar_pagos_vencidos() (v27:440-450) no tiene gate, está concedida a
--    `authenticated` y su UPDATE no lleva criterio de club. Al ser SECURITY
--    DEFINER no pasa por la RLS de `pagos` (ni por las políticas nuevas de
--    v52 §3): hoy cualquier atleta o padre de cualquier club dispara por
--    /rest/v1/rpc/marcar_pagos_vencidos un UPDATE sobre los cinco clubes.
--    El daño está acotado —es la misma transición del pg_cron diario y solo
--    alcanza fecha_vencimiento < current_date— pero cada fila dispara
--    tg_registrar_auditoria_pago (v30) atribuida a quien llamó, envenenando el
--    rastro que v52 §3 acaba de construir como control anti-desfalco.
--
-- §3 `misiones` y `ejercicios_catalogo` son catálogos COMPARTIDOS entre clubes
--    (no tienen columna de club: club_id NULL significa "global", v24) y sus
--    políticas de escritura usan es_staff() sin ningún scope. Un coach de un
--    club puede borrar o reescribir el catálogo que usan los cinco. Estaba
--    declarado fuera de alcance en v29 cuando había un solo club; con cinco
--    deja de ser aceptable.
--
-- §4 La Edge Function `copiloto` no tiene ningún límite de frecuencia: un
--    atleta autenticado puede quemar la ANTHROPIC_API_KEY en bucle. Aquí va la
--    mitad de base (tabla + consumo atómico); el gate en la función es aparte.
--
-- CORRECCIÓN sobre el informe de auditoría: el hallazgo original afirmaba que
-- `progreso_staff` no tenía aislamiento por club. Es FALSO — citaba la versión
-- de v24 en vez de la final. v29:refina esa política y YA compara
-- club_de_atleta(atleta_id) contra current_user_club(). Lo único que queda
-- abierto ahí es la rama `atleta_id IS NULL`, y se cierra en §3.4 por higiene,
-- no porque exponga el progreso de otro club (ver el comentario de la sección).
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- §1.1. anon pierde el EXECUTE directo sobre las trece.
-- ────────────────────────────────────────────────────────────────────────────

-- Las dos con fuga real de datos a un anónimo.
REVOKE EXECUTE ON FUNCTION public.club_de_usuario(uuid)      FROM anon;
REVOKE EXECUTE ON FUNCTION public.club_de_atleta(uuid)       FROM anon;

-- Las nueve auth-dependientes (hoy devuelven NULL/false para anon).
REVOKE EXECUTE ON FUNCTION public.current_usuario_id()       FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_rol()         FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_club()        FROM anon;
REVOKE EXECUTE ON FUNCTION public.es_staff()                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.es_superadmin()            FROM anon;
REVOKE EXECUTE ON FUNCTION public.mis_atletas()              FROM anon;
REVOKE EXECUTE ON FUNCTION public.usuarios_de_mis_atletas()  FROM anon;
REVOKE EXECUTE ON FUNCTION public.mis_eventos_convocados()   FROM anon;
REVOKE EXECUTE ON FUNCTION public.grupos_de_mis_atletas()    FROM anon;

-- Las dos con gate interno es_staff().
REVOKE EXECUTE ON FUNCTION public.fn_coach_stats(integer)    FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_retencion_club(integer) FROM anon;

-- Reafirmación de los GRANT legítimos, idénticos a los originales (v24:148-151,
-- v29:48, fix_eventos_rls_recursion:25, v31:164/202, v50:51). Va DESPUÉS de los
-- REVOKE a propósito, para que el estado final sea inequívoco.
-- mis_eventos_convocados() va aparte porque su GRANT original es SOLO a
-- authenticated, no a service_role: se respeta tal cual en vez de ampliarlo de
-- refilón aprovechando el paso.
GRANT EXECUTE ON FUNCTION
  public.club_de_usuario(uuid), public.club_de_atleta(uuid),
  public.current_usuario_id(), public.current_user_rol(), public.current_user_club(),
  public.es_staff(), public.es_superadmin(),
  public.mis_atletas(), public.usuarios_de_mis_atletas(),
  public.grupos_de_mis_atletas(),
  public.fn_coach_stats(integer), public.fn_retencion_club(integer)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.mis_eventos_convocados() TO authenticated;

-- NO se tocan las tres con GRANT explícito a anon —resolver_email_login,
-- registrar_publico y listar_clubes_publicos—: son el login y el alta pública.
-- Tampoco calcular_categoria_feb (pura fecha→texto, no lee ninguna tabla), ni
-- las funciones trigger: PostgREST no expone las que devuelven `trigger`.


-- ────────────────────────────────────────────────────────────────────────────
-- §1.2. La pieza que faltó en v24: los default privileges de FUNCIONES.
--       Sin esto, la próxima función creada por `postgres` en `public` vuelve a
--       nacer ejecutable por anon y el hallazgo se reabre solo. No es
--       retroactivo (de ahí §1.1); solo aplica a lo que se cree después.
--       Falla CERRADO: si una migración futura crea una RPC que anon necesite y
--       olvide el GRANT, la rompe visiblemente en vez de exponerla en silencio.
-- ────────────────────────────────────────────────────────────────────────────

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon;


-- ────────────────────────────────────────────────────────────────────────────
-- §2. marcar_pagos_vencidos(): gate de staff y alcance por club.
--     Cambia de LANGUAGE sql a plpgsql conservando nombre, aridad y
--     RETURNS void — que es lo que CREATE OR REPLACE admite. El job de pg_cron
--     'marcar-pagos-vencidos' (v27) apunta a la misma firma y entra por la rama
--     sin sesión: su comportamiento es idéntico al de v27 y NO hay que
--     reprogramarlo.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.marcar_pagos_vencidos()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sin sesión de app: pg_cron y service_role. Barrido global, idéntico al de
  -- v27 — el cron es la fuente de verdad y debe seguir cubriendo los cinco
  -- clubes. Mismo patrón de detección que v24 y v52.
  IF auth.uid() IS NULL THEN
    UPDATE pagos SET estado = 'Vencido'
    WHERE estado IN ('Pendiente', 'Abonado')
      AND fecha_vencimiento < current_date;
    RETURN;
  END IF;

  -- Con sesión: la cobranza no es cosa del atleta ni del padre.
  IF NOT es_staff() THEN
    RAISE EXCEPTION 'No tienes permiso para actualizar el estado de los pagos.';
  END IF;

  -- Y aunque sea staff, solo su propio club (mismo criterio que las políticas
  -- de pagos desde v40/v52).
  UPDATE pagos SET estado = 'Vencido'
  WHERE estado IN ('Pendiente', 'Abonado')
    AND fecha_vencimiento < current_date
    AND (es_superadmin() OR club_de_atleta(atleta_id) = current_user_club());
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_pagos_vencidos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_pagos_vencidos() TO authenticated, service_role;

-- Índice de apoyo: el UPDATE filtra por estado + fecha ANTES de evaluar
-- club_de_atleta por fila. Sin él, cada llamada con sesión hace un seq scan de
-- `pagos` y una llamada a club_de_atleta por fila.
CREATE INDEX IF NOT EXISTS idx_pagos_estado_vencimiento
  ON public.pagos (estado, fecha_vencimiento);


-- ────────────────────────────────────────────────────────────────────────────
-- §3.1. ejercicios_catalogo: la escritura pasa a superadmin.
--       La LECTURA no se toca (ejercicios_select sigue USING(true)): el
--       catálogo de drills lo consumen las plantillas de Modo Cancha y no
--       contiene ningún dato personal.
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS ejercicios_write ON public.ejercicios_catalogo;
CREATE POLICY ejercicios_write ON public.ejercicios_catalogo FOR ALL TO authenticated
  USING ((select es_superadmin()))
  WITH CHECK ((select es_superadmin()));


-- ────────────────────────────────────────────────────────────────────────────
-- §3.2. misiones: el DELETE deja de alcanzar el catálogo compartido.
--       misiones_select (USING(true)), el INSERT y el UPDATE NO se tocan: crear
--       y curar sigue siendo del coach.
--       COALESCE(autor_id, created_by): `autor_id` es lo que escriben las dos
--       pantallas vivas; `created_by` es la columna legada del baseline, y se
--       respeta como segunda fuente para no dejar huérfanas las filas antiguas.
--       Autor NULL ⇒ solo superadmin. Eso cubre a la vez las semillas del MCP
--       y las propuestas de generar-misiones-ia: ambas se insertan con
--       service_role y sin autor.
--       CONSECUENCIA DE PRODUCTO, asumida: el coach deja de poder BORRAR desde
--       /admin/misiones las propuestas de IA y las semillas del MCP. Sigue
--       pudiendo DESACTIVARLAS (reversible, y es el flujo de curaduría
--       documentado), y para la limpieza real ya existe la tool
--       eliminar_misiones_basura del MCP, que además protege las que tienen
--       progreso. El frontend ya está adaptado (AdminMisiones.jsx comprueba el
--       error del DELETE en vez de asumir que funcionó).
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS misiones_delete ON public.misiones;
CREATE POLICY misiones_delete ON public.misiones FOR DELETE TO authenticated
  USING (
    (select es_superadmin())
    OR (
      (select es_staff())
      AND COALESCE(autor_id, created_by) IS NOT NULL
      AND (select club_de_usuario(COALESCE(autor_id, created_by))) = (select current_user_club())
    )
  );


-- ────────────────────────────────────────────────────────────────────────────
-- §3.3. misiones: el CONTENIDO del catálogo compartido deja de ser reescribible
--       por staff ajeno. La RLS no distingue columnas, así que va por trigger.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.proteger_misiones_globales()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_autor text;
BEGIN
  -- Caminos sin sesión de app (service_role: MCP y Edge Functions; triggers
  -- internos) y superadmin: pasan.
  IF auth.uid() IS NULL OR es_superadmin() THEN
    RETURN NEW;
  END IF;

  v_club_autor := club_de_usuario(COALESCE(OLD.autor_id, OLD.created_by));

  -- Misión creada por alguien de mi club: edición completa, como hasta hoy.
  IF v_club_autor IS NOT NULL AND v_club_autor = current_user_club() THEN
    RETURN NEW;
  END IF;

  -- Misión del catálogo compartido (semilla del MCP o de la IA, sin autor, o de
  -- otro club): solo se admite la curaduría del flag `activa`, que es
  -- reversible y no destruye contenido ajeno.
  IF (to_jsonb(NEW) - 'activa') IS DISTINCT FROM (to_jsonb(OLD) - 'activa') THEN
    RAISE EXCEPTION 'Esta misión pertenece al catálogo compartido entre clubes: solo puedes activarla o desactivarla, no editar su contenido.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_misiones_globales ON public.misiones;
CREATE TRIGGER trg_proteger_misiones_globales
  BEFORE UPDATE ON public.misiones
  FOR EACH ROW EXECUTE FUNCTION public.proteger_misiones_globales();

REVOKE ALL ON FUNCTION public.proteger_misiones_globales() FROM PUBLIC, anon;


-- ────────────────────────────────────────────────────────────────────────────
-- §3.4. progreso_misiones: se cierra la rama `atleta_id IS NULL`.
--       OJO, contra lo que decía el informe: v29 YA aísla esta política por
--       club (compara club_de_atleta(atleta_id) con current_user_club()). Lo
--       único abierto era `atleta_id IS NULL`, que no expone el progreso de
--       otro club —esas filas son huérfanas, sin atleta— pero permite a
--       cualquier staff crear y borrar basura compartida. Se cierra por
--       higiene, no por fuga.
--       Comprobado antes de cerrarla: ninguna ruta de escritura inserta
--       atleta_id NULL (AdminMisiones asigna a atletas seleccionados; las tres
--       inserciones de generar-misiones-ia pasan un atleta_id real y además
--       entran por service_role).
--       progreso_select_propio y progreso_update_atleta NO se tocan: el atleta
--       y el padre siguen viendo y marcando lo suyo por mis_atletas().
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS progreso_staff ON public.progreso_misiones;
CREATE POLICY progreso_staff ON public.progreso_misiones FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (select club_de_atleta(atleta_id)) = (select current_user_club()))
  );

CREATE INDEX IF NOT EXISTS idx_progreso_misiones_atleta_id
  ON public.progreso_misiones (atleta_id);


-- ────────────────────────────────────────────────────────────────────────────
-- §4. Cuota diaria del copiloto.
--     El día se calcula en hora del club (Ecuador, UTC-5 sin horario de
--     verano). Sin políticas + REVOKE: deny-all para los roles de app; solo la
--     Edge Function (service_role) la toca. Mismo patrón que registro_intentos
--     de v52 §5.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.copiloto_uso (
  usuario_id  uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  dia         date NOT NULL,
  mensajes    integer NOT NULL DEFAULT 0,
  actualizado timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, dia)
);

ALTER TABLE public.copiloto_uso ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.copiloto_uso FROM anon, authenticated;

COMMENT ON TABLE public.copiloto_uso IS
  'Cuota diaria del copiloto por usuario (v53). La escribe la Edge Function copiloto con service_role; deny-all para los roles de app.';

-- Consumo ATÓMICO de una unidad de cuota. Devuelve jsonb:
--   { "permitido": true|false, "usados": <n>, "limite": <n> }
-- El WHERE del DO UPDATE es lo que lo hace atómico: si ya llegó al límite el
-- UPDATE no toca la fila, RETURNING no devuelve nada y NO se incrementa — así
-- el contador no se dispara con los intentos ya bloqueados.
CREATE OR REPLACE FUNCTION public.consumir_cuota_copiloto(
  p_usuario_id uuid,
  p_limite     integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dia    date := (now() AT TIME ZONE 'America/Guayaquil')::date;
  v_usados integer;
BEGIN
  INSERT INTO public.copiloto_uso (usuario_id, dia, mensajes, actualizado)
  VALUES (p_usuario_id, v_dia, 1, now())
  ON CONFLICT (usuario_id, dia) DO UPDATE
    SET mensajes = public.copiloto_uso.mensajes + 1,
        actualizado = now()
    WHERE public.copiloto_uso.mensajes < p_limite
  RETURNING mensajes INTO v_usados;

  IF v_usados IS NULL THEN
    SELECT mensajes INTO v_usados
      FROM public.copiloto_uso
     WHERE usuario_id = p_usuario_id AND dia = v_dia;
    RETURN jsonb_build_object('permitido', false,
                              'usados', COALESCE(v_usados, p_limite),
                              'limite', p_limite);
  END IF;

  RETURN jsonb_build_object('permitido', true, 'usados', v_usados, 'limite', p_limite);
END;
$$;

REVOKE ALL ON FUNCTION public.consumir_cuota_copiloto(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_cuota_copiloto(uuid, integer) TO service_role;
