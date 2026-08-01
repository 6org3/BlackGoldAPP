-- ============================================================================
-- v63 — Endurece las políticas de FAMILIA del bucket fotos-atletas.
--
-- Hallazgo de la revisión de seguridad (retratos de MENORES en un bucket
-- privado): v62 documentó en su propia cabecera que "el cast ::uuid dentro de
-- un OR no cortocircuita en Postgres y un objeto con primer segmento no-UUID
-- rompería la evaluación también para el staff" — y por eso creó
-- club_de_carpeta_atleta(), que hace el chequeo de forma completa y envuelve
-- el cast en un EXCEPTION WHEN OTHERS, ANTES de usarlo en
-- fotos_atletas_staff_all. Pero las tres políticas de FAMILIA
-- (fotos_atletas_familia_select/insert/delete) se dejaron con el patrón crudo:
-- `name ~ regex AND (split_part(name,'/',1))::uuid IN (...)`, sin ese mismo
-- blindaje.
--
-- Por qué esto también expone al STAFF y no solo a la familia: cuando varias
-- políticas PERMISSIVE aplican al mismo comando sobre la misma tabla —aquí,
-- fotos_atletas_staff_all (FOR ALL) y la de familia correspondiente (FOR
-- SELECT/INSERT/DELETE)— Postgres evalúa la fila como si sus condiciones
-- estuvieran unidas por OR. El orden de evaluación de ese OR combinado no está
-- garantizado por el estándar ni por el planner de Postgres. Aunque la propia
-- cláusula de familia usa AND (no OR) puertas adentro, en el OR combinado con
-- la política de staff el cast sin proteger de la mitad de familia puede
-- evaluarse igual, y una sola fila con `name` mal formado (basura subida
-- fuera de la convención, o un ataque deliberado) revienta la evaluación de
-- TODA la consulta — también para el staff, cuya propia cláusula ya era seguro
-- por sí sola. v62 cerró la mitad del riesgo que documentó; esta migración
-- cierra la otra mitad dándole a la familia el mismo helper con el mismo
-- blindaje.
--
-- Se numera v63 y no se toca v62: v61/v62 ya están aplicadas en producción y
-- la convención del repo es aditiva. Idempotente (CREATE OR REPLACE +
-- DROP POLICY IF EXISTS), como toda migración de este repo.
-- ============================================================================


-- ------------------------------------------------------------
-- 1. HELPER: ATLETA DUEÑO DE UNA CARPETA DEL BUCKET
-- ------------------------------------------------------------
-- Mismo patrón EXACTO que club_de_carpeta_atleta (v62 §2): regex completo
-- ANTES del cast, EXCEPTION WHEN OTHERS que devuelve NULL en vez de propagar
-- el error, SECURITY DEFINER con search_path fijado. No hace falta
-- SECURITY DEFINER para esta función en concreto (a diferencia de
-- club_de_carpeta_atleta, que sí necesita saltarse RLS para llamar a
-- club_de_atleta() y leer el club de un atleta que la familia no puede ver
-- directo) — pero se copia la misma liturgia por consistencia con su gemela
-- de v62 y para que cualquier extensión futura de este helper (p. ej. si
-- algún día valida algo más que el propio split) herede el mismo blindaje sin
-- tener que recordarlo.
CREATE OR REPLACE FUNCTION public.atleta_de_carpeta(p_name text)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_atleta uuid;
BEGIN
  IF p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' THEN
    RETURN NULL;
  END IF;
  v_atleta := (split_part(p_name, '/', 1))::uuid;
  RETURN v_atleta;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;   -- un path que no cumple la convención no pertenece a ningún atleta
END;
$$;

REVOKE ALL ON FUNCTION public.atleta_de_carpeta(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atleta_de_carpeta(text) TO authenticated, service_role;


-- ------------------------------------------------------------
-- 2. POLÍTICAS DE FAMILIA, RECREADAS CON EL HELPER
-- ------------------------------------------------------------
-- Mismo alcance que v62 (mis_atletas() cubre de una vez al propio atleta y al
-- padre vinculado): lo único que cambia es CÓMO se extrae el atleta del path.

DROP POLICY IF EXISTS fotos_atletas_familia_select ON storage.objects;
CREATE POLICY fotos_atletas_familia_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fotos-atletas'
    AND public.atleta_de_carpeta(name) IN (SELECT unnest(public.mis_atletas())));

-- El INSERT sigue validando la forma COMPLETA del path, no solo el prefijo
-- (v62 §"El INSERT valida..."): eso es lo que garantiza que ningún objeto no
-- conforme pueda nacer, y por tanto que el cast dentro del helper nunca tenga
-- con qué fallar en el resto de políticas. Se conserva tal cual.
DROP POLICY IF EXISTS fotos_atletas_familia_insert ON storage.objects;
CREATE POLICY fotos_atletas_familia_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fotos-atletas'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,64}$'
    AND public.atleta_de_carpeta(name) IN (SELECT unnest(public.mis_atletas())));

DROP POLICY IF EXISTS fotos_atletas_familia_delete ON storage.objects;
CREATE POLICY fotos_atletas_familia_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fotos-atletas'
    AND public.atleta_de_carpeta(name) IN (SELECT unnest(public.mis_atletas())));
