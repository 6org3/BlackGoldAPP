-- ============================================================================
-- v40b — La imagen del comprobante también es de un club.
--
-- SEPARADO de v40 por el mismo motivo que v27b lo estuvo de v27: el rol
-- postgres (con el que corre `npx supabase db push`) puede NO ser owner de
-- storage.objects (lo es supabase_storage_admin) y CREATE POLICY fallaría con
-- "must be owner of table objects". Si este archivo falla en el push:
--   1. Reemplazar la política `comprobantes_staff_all` desde el dashboard
--      (Storage → Policies) con la expresión de abajo, y
--   2. Marcar esta migración como aplicada:
--      npx supabase migration repair --status applied 20260716000100
-- Así el cierre del modelo de datos (v40) no queda rehén de Storage.
--
-- Qué cierra: `comprobantes_staff_all` (v27b) daba a CUALQUIER staff acceso
-- FOR ALL a TODO el bucket — leer, sobrescribir y borrar las imágenes de
-- comprobantes (PII financiera, según la propia cabecera de v27b) de atletas
-- de otros clubes. Es la hermana en Storage de lo que v40 §2/§3 cierra en las
-- tablas: sin esto, la fuga sigue viva por la vía del archivo.
--
-- Cómo: el path es '<atleta_id>/<pago_id>/<timestamp>.<ext>' (convención de
-- v27b), así que el club se deriva del primer segmento con club_de_atleta
-- (v29). El helper va en plpgsql a propósito: v27b documenta que el cast
-- ::uuid dentro de un OR no cortocircuita en Postgres y que un objeto con
-- primer segmento no-UUID rompería la evaluación —también para el staff—, así
-- que aquí la regex se comprueba ANTES del cast y el EXCEPTION atrapa
-- cualquier resto. Las políticas de familia (select/insert) no se tocan: ya
-- estaban acotadas por mis_atletas() y protegen su cast con la misma regex.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.club_de_comprobante_path(p_name text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_atleta uuid;
BEGIN
  IF p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' THEN
    RETURN NULL;
  END IF;
  v_atleta := (split_part(p_name, '/', 1))::uuid;
  RETURN public.club_de_atleta(v_atleta);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;   -- un path que no cumple la convención no pertenece a ningún club
END;
$$;

REVOKE ALL ON FUNCTION public.club_de_comprobante_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_de_comprobante_path(text) TO authenticated, service_role;

DROP POLICY IF EXISTS comprobantes_staff_all ON storage.objects;
CREATE POLICY comprobantes_staff_all ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'comprobantes-pagos'
    AND public.es_staff()
    AND (public.es_superadmin()
         OR public.club_de_comprobante_path(name) = public.current_user_club())
  )
  WITH CHECK (
    bucket_id = 'comprobantes-pagos'
    AND public.es_staff()
    AND (public.es_superadmin()
         OR public.club_de_comprobante_path(name) = public.current_user_club())
  );
