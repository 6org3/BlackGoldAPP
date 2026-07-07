-- ============================================================================
-- v27b — Storage para comprobantes de pago (bucket privado + políticas).
--
-- SEPARADO de v27 a propósito: en proyectos Supabase actuales el rol postgres
-- (con el que corre `npx supabase db push`) puede NO ser owner de
-- storage.objects (lo es supabase_storage_admin) y CREATE POLICY fallaría con
-- "must be owner of table objects". Si este archivo falla en el push:
--   1. Crear el bucket y las 3 políticas desde el dashboard (Storage →
--      Policies) copiando las expresiones de abajo, y
--   2. Marcar esta migración como aplicada:
--      npx supabase migration repair --status applied 20260707181000
-- Así el resto del modelo de datos (v27) no queda rehén de Storage.
--
-- Convención de path: '<atleta_id>/<pago_id>/<timestamp>.<ext>' — el primer
-- segmento habilita la política de familia vía mis_atletas().
-- Retención (PII financiera): borrar la imagen de comprobantes aprobados a los
-- 24 meses (los metadatos de pago_comprobantes se conservan). Job manual/anual
-- por ahora — ver docs/pagos_diseno.md §3.5.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('comprobantes-pagos', 'comprobantes-pagos', false,
        5242880,  -- 5 MB
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Políticas SEPARADAS para staff y familia: el cast ::uuid dentro de un OR no
-- cortocircuita en Postgres, y un objeto con primer segmento no-UUID rompería
-- la evaluación también para staff. La política de familia protege el cast con
-- una regex previa.

DROP POLICY IF EXISTS comprobantes_staff_all ON storage.objects;
CREATE POLICY comprobantes_staff_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'comprobantes-pagos' AND public.es_staff())
  WITH CHECK (bucket_id = 'comprobantes-pagos' AND public.es_staff());

DROP POLICY IF EXISTS comprobantes_familia_select ON storage.objects;
CREATE POLICY comprobantes_familia_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'comprobantes-pagos'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    AND (split_part(name, '/', 1))::uuid IN (SELECT unnest(public.mis_atletas())));

DROP POLICY IF EXISTS comprobantes_familia_insert ON storage.objects;
CREATE POLICY comprobantes_familia_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comprobantes-pagos'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    AND (split_part(name, '/', 1))::uuid IN (SELECT unnest(public.mis_atletas())));
