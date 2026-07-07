-- ============================================================
-- MIGRACIÓN v24 — RLS real basada en auth.uid() (Fase 2, P0)
-- Diseño: docs/plan_remediacion_seguridad.md (Fase 2)
-- Aplicar con: npx supabase db push
-- ============================================================
-- Reemplaza TODAS las políticas del esquema public (54 permisivas
-- USING(true) + un puñado escritas contra `usuarios.id = auth.uid()`,
-- que nunca funcionaron: el vínculo real es `usuarios.auth_user_id`,
-- agregado en v19). También habilita RLS en las dos tablas que la
-- tenían apagada (atleta_readiness, sesiones_entrenamiento) y revoca
-- todo privilegio directo del rol `anon` sobre tablas: tras esta
-- migración la anon key solo puede ejecutar las RPC de login y de
-- registro público, nada más.
--
-- Modelo de identidad:
--   auth.uid() ─→ usuarios.auth_user_id ─→ usuarios.id (id "de app")
--   atletas.usuario_id → usuarios.id ; padres_atletas → (padre_id, atleta_id)
--
-- Modelo de autorización v24 (deliberadamente simple):
--   * staff = superadmin | owner | coach → operación completa.
--     - En usuarios/atletas/eventos/comunicaciones/catálogos, owner y
--       coach quedan limitados a su club; superadmin cruza clubes.
--     - En las tablas operativas hijas (asistencia, evaluaciones, etc.)
--       staff no se filtra por club en v24: hoy opera un solo club y el
--       aislamiento de datos personales queda garantizado en las tablas
--       raíz. Afinar multi-club fila a fila es trabajo futuro declarado.
--   * atleta → lee lo suyo; escribe su readiness, sus encuestas y el
--     progreso de sus misiones. No puede tocar XP, rango, becas ni rol
--     (triggers de protección de columnas).
--   * padre → lee lo de sus hijos; valida encuestas y responde RSVP.
--   * anon → nada directo. Registro público vía RPC SECURITY DEFINER
--     que fuerza rol atleta/padre server-side.
--   * service_role (Edge Function generar-misiones-ia, blackgold-mcp
--     local) → bypass RLS, sin cambios.
-- ============================================================


-- ------------------------------------------------------------
-- 1. FUNCIONES DE IDENTIDAD Y ROL (SECURITY DEFINER, STABLE)
-- ------------------------------------------------------------
-- SECURITY DEFINER: consultan `usuarios` sin re-disparar RLS (evita
-- recursión en las políticas de la propia tabla usuarios).
-- STABLE + uso como `(select fn())` en las políticas: Postgres las
-- evalúa una sola vez por consulta (initplan), no por fila.

CREATE OR REPLACE FUNCTION public.current_usuario_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_rol()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rol FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_club()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT club FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.es_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT rol IN ('superadmin', 'owner', 'coach')
     FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1),
    false);
$$;

CREATE OR REPLACE FUNCTION public.es_superadmin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT rol = 'superadmin'
     FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1),
    false);
$$;

-- Atletas "míos": mi propia fila de atletas (si soy atleta) + mis hijos
-- vinculados (si soy padre). Devuelve uuid[] para usar con = ANY (...).
CREATE OR REPLACE FUNCTION public.mis_atletas()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(atleta_id), '{}'::uuid[])
  FROM (
    SELECT a.id AS atleta_id
    FROM atletas a
    WHERE a.usuario_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
    UNION
    SELECT pa.atleta_id
    FROM padres_atletas pa
    WHERE pa.padre_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid())
  ) t;
$$;

-- Los dos siguientes cortan el ciclo de RLS usuarios↔atletas: si una
-- política de `usuarios` subconsultara `atletas` directamente (y la de
-- `atletas` subconsulta `usuarios`), Postgres abortaría con "infinite
-- recursion detected in policy" (42P17). Al ser SECURITY DEFINER, la
-- subconsulta interna no re-dispara RLS y el grafo queda acíclico.

-- usuarios.id de los atletas "míos" (para que el padre vea los perfiles
-- de usuario de sus hijos).
CREATE OR REPLACE FUNCTION public.usuarios_de_mis_atletas()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(usuario_id), '{}'::uuid[])
  FROM atletas
  WHERE usuario_id IS NOT NULL
    AND id = ANY (mis_atletas());
$$;

-- Club del usuario dueño de una fila de atletas. Se evalúa por fila
-- (index lookup por PK), solo en la rama de staff.
CREATE OR REPLACE FUNCTION public.club_de_usuario(p_usuario_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT club FROM usuarios WHERE id = p_usuario_id;
$$;

REVOKE ALL ON FUNCTION public.current_usuario_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_rol() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_club() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.es_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.es_superadmin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mis_atletas() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.usuarios_de_mis_atletas() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.club_de_usuario(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_usuario_id(), public.current_user_rol(),
  public.current_user_club(), public.es_staff(), public.es_superadmin(),
  public.mis_atletas(), public.usuarios_de_mis_atletas(), public.club_de_usuario(uuid)
  TO authenticated, service_role;

-- Índice de apoyo: las funciones y varias políticas resuelven
-- atletas.usuario_id; la FK no crea índice por sí sola.
CREATE INDEX IF NOT EXISTS idx_atletas_usuario_id ON public.atletas (usuario_id);


-- ------------------------------------------------------------
-- 2. VINCULACIÓN AUTOMÁTICA auth.users → usuarios
-- ------------------------------------------------------------
-- Sustituye el UPDATE de vinculación que hacía el cliente en el
-- registro público (registroPublicoService.js). Al crearse la cuenta
-- de Auth, se vincula la fila de `usuarios` cuyo email real o
-- sintético coincida. lower(): GoTrue normaliza emails a minúsculas
-- (las cédulas sintéticas de padres son 'PADRE_<telefono>').

CREATE OR REPLACE FUNCTION public.vincular_auth_usuario()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE usuarios
  SET auth_user_id = NEW.id
  WHERE auth_user_id IS NULL
    AND (
      lower(correo) = lower(NEW.email)
      OR lower(cedula || '@sinacceso.blackgoldapp.internal') = lower(NEW.email)
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vincular_auth_usuario ON auth.users;
CREATE TRIGGER trg_vincular_auth_usuario
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.vincular_auth_usuario();


-- ------------------------------------------------------------
-- 3. RPC DE REGISTRO PÚBLICO (reemplaza los INSERT anon del cliente)
-- ------------------------------------------------------------
-- El formulario público ya no inserta en tablas directamente (anon
-- pierde todo privilegio en la sección 7). Esta función concentra el
-- registro en una transacción y FUERZA los roles server-side: por aquí
-- solo pueden nacer filas 'atleta' y 'padre', nunca staff.
-- La cuenta de Auth la sigue creando el cliente con signUp (la
-- vinculación la hace el trigger de la sección 2).

CREATE OR REPLACE FUNCTION public.registrar_publico(p_atleta jsonb, p_padre jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_atleta_id uuid;
  v_atleta_id uuid;
  v_padre_id uuid;
  v_padre_existente boolean := false;
  v_padre_cedula text;
  v_fecha_nac date;
BEGIN
  IF COALESCE(p_atleta->>'cedula', '') = '' OR COALESCE(p_atleta->>'nombre', '') = ''
     OR COALESCE(p_atleta->>'fecha_nacimiento', '') = '' THEN
    RAISE EXCEPTION 'Cédula, nombre y fecha de nacimiento del atleta son obligatorios.';
  END IF;

  v_fecha_nac := (p_atleta->>'fecha_nacimiento')::date;

  BEGIN
    INSERT INTO usuarios (cedula, nombre, correo, telefono, fecha_nacimiento, rol, club, categoria, genero)
    VALUES (
      p_atleta->>'cedula',
      p_atleta->>'nombre',
      NULLIF(p_atleta->>'correo', ''),
      NULLIF(p_atleta->>'telefono', ''),
      v_fecha_nac,
      'atleta',
      COALESCE(NULLIF(p_atleta->>'club', ''), 'Black Gold'),
      calcular_categoria_feb(v_fecha_nac),
      COALESCE(NULLIF(p_atleta->>'genero', ''), 'Masculino')
    )
    RETURNING id INTO v_usuario_atleta_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'La cédula "%" ya se encuentra registrada en el sistema. Por favor, verifica los datos.',
      p_atleta->>'cedula';
  END;

  INSERT INTO atletas (usuario_id, edad, posicion)
  VALUES (
    v_usuario_atleta_id,
    GREATEST(0, date_part('year', age(v_fecha_nac)))::int,
    COALESCE(NULLIF(p_atleta->>'posicion', ''), 'N/A')
  )
  RETURNING id INTO v_atleta_id;

  IF p_padre IS NOT NULL AND COALESCE(p_padre->>'telefono', '') <> '' THEN
    v_padre_cedula := 'PADRE_' || (p_padre->>'telefono');

    SELECT id INTO v_padre_id FROM usuarios WHERE cedula = v_padre_cedula;
    IF v_padre_id IS NOT NULL THEN
      v_padre_existente := true;
    ELSE
      BEGIN
        INSERT INTO usuarios (cedula, nombre, correo, telefono, rol, club)
        VALUES (
          v_padre_cedula,
          p_padre->>'nombre',
          NULLIF(p_padre->>'correo', ''),
          p_padre->>'telefono',
          'padre',
          COALESCE(NULLIF(p_atleta->>'club', ''), 'Black Gold')
        )
        RETURNING id INTO v_padre_id;
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'El teléfono del representante "%" ya está registrado con otro padre.',
          p_padre->>'telefono';
      END;
    END IF;

    INSERT INTO padres_atletas (padre_id, atleta_id)
    VALUES (v_padre_id, v_atleta_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'atleta_usuario_id', v_usuario_atleta_id,
    'atleta_id', v_atleta_id,
    'padre_id', v_padre_id,
    'padre_existente', v_padre_existente,
    'padre_cedula', v_padre_cedula
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_publico(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_publico(jsonb, jsonb) TO anon, authenticated;


-- ------------------------------------------------------------
-- 4. TRIGGERS DE PROTECCIÓN DE COLUMNAS SENSIBLES
-- ------------------------------------------------------------
-- RLS decide QUÉ filas puede tocar cada quien; estos triggers deciden
-- QUÉ columnas. Un usuario no-staff no puede auto-promoverse de rol,
-- cambiarse de club, alterar su fecha de nacimiento (cambiaría sus
-- baremos) ni inflar su XP/beca. `auth.uid() IS NULL` deja pasar los
-- caminos legítimos sin sesión de app: funciones SECURITY DEFINER
-- propias, service_role (Edge Function / MCP) y triggers internos.

CREATE OR REPLACE FUNCTION public.proteger_columnas_usuarios()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR es_staff() THEN
    RETURN NEW;
  END IF;
  IF NEW.rol IS DISTINCT FROM OLD.rol
     OR NEW.club IS DISTINCT FROM OLD.club
     OR NEW.cedula IS DISTINCT FROM OLD.cedula
     OR NEW.fecha_nacimiento IS DISTINCT FROM OLD.fecha_nacimiento
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION 'No tienes permiso para modificar campos protegidos del perfil.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_columnas_usuarios ON public.usuarios;
CREATE TRIGGER trg_proteger_columnas_usuarios
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.proteger_columnas_usuarios();

CREATE OR REPLACE FUNCTION public.proteger_columnas_atletas()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR es_staff() THEN
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

DROP TRIGGER IF EXISTS trg_proteger_columnas_atletas ON public.atletas;
CREATE TRIGGER trg_proteger_columnas_atletas
  BEFORE UPDATE ON public.atletas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_columnas_atletas();


-- ------------------------------------------------------------
-- 5. LIMPIEZA: FUERA TODAS LAS POLÍTICAS EXISTENTES
-- ------------------------------------------------------------
-- Borrado dinámico: hay 78 políticas con nombres heterogéneos (acentos,
-- espacios, duplicadas). Partimos de cero con un conjunto coherente.

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END;
$$;


-- ------------------------------------------------------------
-- 6. RLS HABILITADA EN TODAS LAS TABLAS
-- ------------------------------------------------------------
-- atleta_readiness y sesiones_entrenamiento tenían políticas pero RLS
-- APAGADA (el baseline lo confirma): estaban 100% abiertas.

ALTER TABLE public.asistencia                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atleta_grupo               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atleta_readiness           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atletas                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_ejercicios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_sesiones          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacion_destinatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicaciones             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ejercicios_catalogo        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encuestas_habitos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluaciones_pruebas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_convocados          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_recordatorios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupos_entrenamiento       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupos_mision              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupos_mision_miembros     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.misiones                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_coach                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observaciones_cancha       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.padres_atletas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progreso_misiones          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recompensas_desbloqueadas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screening_funcional        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesiones_control           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesiones_entrenamiento     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesiones_programadas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios                   ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 7. ANON FUERA DE LAS TABLAS
-- ------------------------------------------------------------
-- La anon key viaja en el bundle público (y estuvo hardcodeada en
-- scripts del repo): no puede conservar NINGÚN privilegio de tabla.
-- Sus únicos caminos quedan: resolver_email_login() y registrar_publico().

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- resolver_audiencia expone usuario_ids por segmento: solo staff logueado.
REVOKE ALL ON FUNCTION public.resolver_audiencia(text, jsonb, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_audiencia(text, jsonb, boolean, text) TO authenticated, service_role;


-- ------------------------------------------------------------
-- 8. POLÍTICAS NUEVAS
-- ------------------------------------------------------------
-- Convención: <tabla>_<select|insert|update|delete>. Los helpers van
-- envueltos en (select ...) para evaluarse una vez por consulta.

-- ===== usuarios =====
-- SELECT: staff de mi club (superadmin cruza), mi propia fila, y los
-- usuarios-atleta de mis hijos (portal del padre). Sin subconsultas
-- directas a `atletas` (ver nota anti-recursión de la sección 1).
CREATE POLICY usuarios_select ON public.usuarios FOR SELECT TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND club = (select current_user_club()))
    OR auth_user_id = (select auth.uid())
    OR id = ANY ((select usuarios_de_mis_atletas()))
  );

CREATE POLICY usuarios_insert ON public.usuarios FOR INSERT TO authenticated
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND club = (select current_user_club()) AND rol <> 'superadmin')
  );

CREATE POLICY usuarios_update ON public.usuarios FOR UPDATE TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND club = (select current_user_club()))
    OR auth_user_id = (select auth.uid())
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND club = (select current_user_club()))
    OR auth_user_id = (select auth.uid())
  );

CREATE POLICY usuarios_delete ON public.usuarios FOR DELETE TO authenticated
  USING (
    (select es_superadmin())
    OR ((select current_user_rol()) = 'owner' AND club = (select current_user_club()))
  );

-- ===== atletas =====
-- El club del staff se compara vía club_de_usuario() (definer) y no con
-- un EXISTS sobre usuarios: ver nota anti-recursión de la sección 1.
CREATE POLICY atletas_select ON public.atletas FOR SELECT TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND club_de_usuario(usuario_id) = (select current_user_club()))
    OR usuario_id = (select current_usuario_id())
    OR id = ANY ((select mis_atletas()))
  );

CREATE POLICY atletas_insert ON public.atletas FOR INSERT TO authenticated
  WITH CHECK ((select es_staff()));

-- El atleta puede actualizar su propia fila (modo_vista, antropometría
-- de onboarding); el trigger de la sección 4 le veta XP/beca/grupo.
CREATE POLICY atletas_update ON public.atletas FOR UPDATE TO authenticated
  USING ((select es_staff()) OR usuario_id = (select current_usuario_id()))
  WITH CHECK ((select es_staff()) OR usuario_id = (select current_usuario_id()));

CREATE POLICY atletas_delete ON public.atletas FOR DELETE TO authenticated
  USING ((select es_staff()));

-- ===== padres_atletas =====
CREATE POLICY padres_atletas_select ON public.padres_atletas FOR SELECT TO authenticated
  USING (
    (select es_staff())
    OR padre_id = (select current_usuario_id())
    OR atleta_id = ANY ((select mis_atletas()))
  );

CREATE POLICY padres_atletas_write ON public.padres_atletas FOR ALL TO authenticated
  USING ((select es_staff()))
  WITH CHECK ((select es_staff()));

-- ===== Tablas operativas por atleta: patrón común =====
-- staff todo; atleta/padre SELECT de sus filas; excepciones anotadas.

-- asistencia
CREATE POLICY asistencia_staff ON public.asistencia FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));
CREATE POLICY asistencia_select_propio ON public.asistencia FOR SELECT TO authenticated
  USING (atleta_id = ANY ((select mis_atletas())));

-- evaluaciones_pruebas
CREATE POLICY evaluaciones_staff ON public.evaluaciones_pruebas FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));
CREATE POLICY evaluaciones_select_propio ON public.evaluaciones_pruebas FOR SELECT TO authenticated
  USING (atleta_id = ANY ((select mis_atletas())));

-- atleta_readiness — el check-in diario lo inserta el propio atleta.
CREATE POLICY readiness_staff ON public.atleta_readiness FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));
CREATE POLICY readiness_select_propio ON public.atleta_readiness FOR SELECT TO authenticated
  USING (atleta_id = ANY ((select mis_atletas())));
CREATE POLICY readiness_insert_atleta ON public.atleta_readiness FOR INSERT TO authenticated
  WITH CHECK (
    (select current_user_rol()) = 'atleta'
    AND atleta_id = ANY ((select mis_atletas()))
  );

-- encuestas_habitos — el atleta la crea/corrige; el padre la valida.
CREATE POLICY encuestas_staff ON public.encuestas_habitos FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));
CREATE POLICY encuestas_select_propio ON public.encuestas_habitos FOR SELECT TO authenticated
  USING (atleta_id = ANY ((select mis_atletas())));
CREATE POLICY encuestas_insert_propio ON public.encuestas_habitos FOR INSERT TO authenticated
  WITH CHECK (atleta_id = ANY ((select mis_atletas())));
CREATE POLICY encuestas_update_propio ON public.encuestas_habitos FOR UPDATE TO authenticated
  USING (atleta_id = ANY ((select mis_atletas())))
  WITH CHECK (atleta_id = ANY ((select mis_atletas())));

-- notas_coach — solo lectura para atleta/padre.
CREATE POLICY notas_staff ON public.notas_coach FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));
CREATE POLICY notas_select_propio ON public.notas_coach FOR SELECT TO authenticated
  USING (atleta_id = ANY ((select mis_atletas())));

-- observaciones_cancha
CREATE POLICY observaciones_staff ON public.observaciones_cancha FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));
CREATE POLICY observaciones_select_propio ON public.observaciones_cancha FOR SELECT TO authenticated
  USING (atleta_id = ANY ((select mis_atletas())));

-- screening_funcional
CREATE POLICY screening_staff ON public.screening_funcional FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));
CREATE POLICY screening_select_propio ON public.screening_funcional FOR SELECT TO authenticated
  USING (atleta_id = ANY ((select mis_atletas())));

-- sesiones_entrenamiento
CREATE POLICY ses_entrenamiento_staff ON public.sesiones_entrenamiento FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));
CREATE POLICY ses_entrenamiento_select_propio ON public.sesiones_entrenamiento FOR SELECT TO authenticated
  USING (atleta_id = ANY ((select mis_atletas())));

-- sesiones_control (atleta_id nullable: las grupales solo las ve staff,
-- igual que hoy — el portal del padre consulta por atleta_id).
CREATE POLICY ses_control_staff ON public.sesiones_control FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));
CREATE POLICY ses_control_select_propio ON public.sesiones_control FOR SELECT TO authenticated
  USING (atleta_id = ANY ((select mis_atletas())));

-- pagos
CREATE POLICY pagos_staff ON public.pagos FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));
CREATE POLICY pagos_select_propio ON public.pagos FOR SELECT TO authenticated
  USING (atleta_id = ANY ((select mis_atletas())));

-- recompensas_desbloqueadas — INSERT solo staff: todo camino que otorga
-- recompensas (recalcularOverall → checkAndCreateRecompensas) corre en
-- sesión de coach, verificado en código.
CREATE POLICY recompensas_staff ON public.recompensas_desbloqueadas FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));
CREATE POLICY recompensas_select_propio ON public.recompensas_desbloqueadas FOR SELECT TO authenticated
  USING (atleta_id = ANY ((select mis_atletas())));

-- progreso_misiones — el atleta marca su misión como completada
-- (UPDATE); asignar (INSERT) es de staff o de la Edge Function.
CREATE POLICY progreso_staff ON public.progreso_misiones FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));
CREATE POLICY progreso_select_propio ON public.progreso_misiones FOR SELECT TO authenticated
  USING (atleta_id = ANY ((select mis_atletas())));
CREATE POLICY progreso_update_atleta ON public.progreso_misiones FOR UPDATE TO authenticated
  USING (
    (select current_user_rol()) = 'atleta'
    AND atleta_id = ANY ((select mis_atletas()))
  )
  WITH CHECK (
    (select current_user_rol()) = 'atleta'
    AND atleta_id = ANY ((select mis_atletas()))
  );

-- evento_convocados — RSVP: atleta convocado o su padre.
CREATE POLICY convocados_staff ON public.evento_convocados FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));
CREATE POLICY convocados_select_propio ON public.evento_convocados FOR SELECT TO authenticated
  USING (atleta_id = ANY ((select mis_atletas())));
CREATE POLICY convocados_rsvp_propio ON public.evento_convocados FOR UPDATE TO authenticated
  USING (atleta_id = ANY ((select mis_atletas())))
  WITH CHECK (atleta_id = ANY ((select mis_atletas())));

-- ===== eventos =====
-- Staff de club (superadmin cruza); atleta/padre solo eventos
-- publicados donde su atleta esté convocado.
CREATE POLICY eventos_staff ON public.eventos FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (club IS NULL OR club = (select current_user_club())))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (club IS NULL OR club = (select current_user_club())))
  );
CREATE POLICY eventos_select_convocado ON public.eventos FOR SELECT TO authenticated
  USING (
    estado = 'publicado'
    AND EXISTS (
      SELECT 1 FROM evento_convocados ec
      WHERE ec.evento_id = eventos.id
        AND ec.atleta_id = ANY ((select mis_atletas()))
    )
  );

-- evento_recordatorios — infraestructura de staff.
CREATE POLICY recordatorios_staff ON public.evento_recordatorios FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));

-- ===== comunicaciones =====
-- Staff todo; atleta/padre ven: anuncios generales, lo dirigido a su
-- atleta o a un grupo de su atleta (columnas legadas que consulta
-- fetchComunicacionesParaPadre), y lo congelado en destinatarios.
CREATE POLICY comunicaciones_staff ON public.comunicaciones FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));
CREATE POLICY comunicaciones_select_audiencia ON public.comunicaciones FOR SELECT TO authenticated
  USING (
    segmento_tipo = 'general'
    OR tipo = 'Anuncio'
    OR atleta_id = ANY ((select mis_atletas()))
    OR (grupo_id IS NOT NULL AND grupo_id IN (
      SELECT ag.grupo_id FROM atleta_grupo ag WHERE ag.atleta_id = ANY ((select mis_atletas()))
      UNION
      SELECT a.grupo_id FROM atletas a WHERE a.id = ANY ((select mis_atletas())) AND a.grupo_id IS NOT NULL
    ))
    OR EXISTS (
      SELECT 1 FROM comunicacion_destinatarios cd
      WHERE cd.comunicacion_id = comunicaciones.id
        AND cd.usuario_id = (select current_usuario_id())
    )
  );

CREATE POLICY comdest_staff ON public.comunicacion_destinatarios FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));
CREATE POLICY comdest_select_propio ON public.comunicacion_destinatarios FOR SELECT TO authenticated
  USING (usuario_id = (select current_usuario_id()));
CREATE POLICY comdest_marcar_leido ON public.comunicacion_destinatarios FOR UPDATE TO authenticated
  USING (usuario_id = (select current_usuario_id()))
  WITH CHECK (usuario_id = (select current_usuario_id()));

-- ===== Catálogos y grupos =====

-- misiones: catálogo visible a cualquier usuario logueado; escritura
-- de staff (el MCP escribe con service_role y no pasa por aquí).
CREATE POLICY misiones_select ON public.misiones FOR SELECT TO authenticated
  USING (true);
CREATE POLICY misiones_write ON public.misiones FOR INSERT TO authenticated
  WITH CHECK ((select es_staff()));
CREATE POLICY misiones_update ON public.misiones FOR UPDATE TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));
CREATE POLICY misiones_delete ON public.misiones FOR DELETE TO authenticated
  USING ((select es_staff()));

-- catalogo_ejercicios (pruebas de evaluación): visibles las globales
-- (club_id NULL) y las del propio club.
CREATE POLICY cat_ejercicios_select ON public.catalogo_ejercicios FOR SELECT TO authenticated
  USING (
    club_id IS NULL
    OR club_id = (select current_user_club())
    OR (select es_superadmin())
  );
CREATE POLICY cat_ejercicios_write ON public.catalogo_ejercicios FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (club_id IS NULL OR club_id = (select current_user_club())))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (club_id IS NULL OR club_id = (select current_user_club())))
  );

-- catalogo_sesiones (plantillas de Modo Cancha): mismo patrón. Esto
-- además ARREGLA el INSERT de plantillas: la política de v21 seguía
-- comparando usuarios.id = auth.uid() y nunca dejó pasar a nadie.
CREATE POLICY cat_sesiones_select ON public.catalogo_sesiones FOR SELECT TO authenticated
  USING (
    club_id IS NULL
    OR club_id = (select current_user_club())
    OR (select es_superadmin())
  );
CREATE POLICY cat_sesiones_write ON public.catalogo_sesiones FOR ALL TO authenticated
  USING (
    (select es_superadmin())
    OR ((select es_staff()) AND (club_id IS NULL OR club_id = (select current_user_club())))
  )
  WITH CHECK (
    (select es_superadmin())
    OR ((select es_staff()) AND (club_id IS NULL OR club_id = (select current_user_club())))
  );

-- ejercicios_catalogo (drills de entrenamiento)
CREATE POLICY ejercicios_select ON public.ejercicios_catalogo FOR SELECT TO authenticated
  USING (true);
CREATE POLICY ejercicios_write ON public.ejercicios_catalogo FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));

-- grupos_entrenamiento: lectura para cualquier usuario del club
-- (el padre ve nombre/horario del grupo del hijo); escritura staff.
CREATE POLICY grupos_select ON public.grupos_entrenamiento FOR SELECT TO authenticated
  USING (
    (select es_superadmin())
    OR club = (select current_user_club())
  );
CREATE POLICY grupos_write ON public.grupos_entrenamiento FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));

-- atleta_grupo: membresías visibles a cualquier usuario logueado
-- (las resuelve la segmentación de comunicaciones); escritura staff.
CREATE POLICY atleta_grupo_select ON public.atleta_grupo FOR SELECT TO authenticated
  USING (true);
CREATE POLICY atleta_grupo_write ON public.atleta_grupo FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));

-- grupos_mision / miembros: herramienta interna de staff.
CREATE POLICY gmision_staff ON public.grupos_mision FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));
CREATE POLICY gmision_miembros_staff ON public.grupos_mision_miembros FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));

-- sesiones_programadas: operación de staff (la suscripción realtime
-- del Sidebar filtra por coach_id y corre como coach).
CREATE POLICY ses_programadas_staff ON public.sesiones_programadas FOR ALL TO authenticated
  USING ((select es_staff())) WITH CHECK ((select es_staff()));


-- ------------------------------------------------------------
-- 9. NOTAS DE VERIFICACIÓN (ver plan_remediacion_seguridad.md Fase 2)
-- ------------------------------------------------------------
-- Con la anon key (sin sesión):
--   * SELECT sobre usuarios/atletas/pagos → "permission denied" (42501).
--   * rpc resolver_email_login / registrar_publico → funcionan.
-- Con cuenta atleta: ve solo sus filas; UPDATE de xp_total → excepción
--   del trigger; localStorage no contiene nada falsificable (v19).
-- Con cuenta padre: ve solo a sus hijos (atletas, evaluaciones, pagos,
--   sesiones, comunicaciones de su audiencia); RSVP funciona.
-- Con cuenta coach: opera normal; no ve usuarios de otro club.
-- MCP: requiere SUPABASE_SERVICE_ROLE_KEY en blackgold-mcp/.env.
