-- ============================================================================
-- v62 — Storage para las fotos de identificación (bucket privado + políticas).
--
-- SEPARADO de v61 por el mismo motivo que v27b lo estuvo de v27 y v40b de v40:
-- el rol postgres (con el que corre `npx supabase db push`) puede NO ser owner
-- de storage.objects (lo es supabase_storage_admin) y CREATE POLICY fallaría
-- con "must be owner of table objects". Si este archivo falla en el push:
--   1. Crear el bucket y las 4 políticas desde el dashboard (Storage →
--      Policies) copiando las expresiones de abajo, y
--   2. Marcar esta migración como aplicada:
--      npx supabase migration repair --status applied 20260729140100
-- Así el modelo de datos (v61) no queda rehén de Storage.
--
-- Convención de path: '<atleta_id>/<timestamp>-<rand8>.<ext>' — el primer
-- segmento habilita a la vez la política de familia (mis_atletas()) y la de
-- staff (club_de_carpeta_atleta → club_de_atleta).
--
-- Por qué nombre ÚNICO por subida y no un 'perfil.jpg' fijo: con nombre fijo,
-- la caché de URLs firmadas del cliente tendría la misma clave antes y después
-- de reemplazar la foto, y el usuario seguiría viendo la vieja hasta que
-- expirara el TTL. Efecto secundario bueno: nunca se sobrescribe un objeto, así
-- que la familia no necesita política de UPDATE sobre storage.objects.
--
-- Retención (imagen de un menor): al eliminar un atleta hay que purgar su
-- carpeta ANTES de borrar la fila — al perderse foto_path el objeto quedaría
-- huérfano para siempre. Lo hace el cliente (purgarFotosDeAtleta) porque
-- borrar la fila de storage.objects NO borra el blob en S3.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fotos-atletas', 'fotos-atletas', false,
        2097152,  -- 2 MB. El cliente reencoda a ~40 KB (512x512); esto es el
                  -- tope duro, no el tamaño esperado.
        ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Sin 'image/svg+xml' a propósito: un SVG con <script> servido desde el origen
-- de Storage es XSS desde un dominio de confianza, aunque el bucket sea
-- privado. Sin 'application/pdf': un retrato no es un PDF (a diferencia de un
-- comprobante escaneado). HEIC tampoco: el cliente reencoda a WebP/JPEG antes
-- de subir, lo que además normaliza orientación EXIF, recorte y peso.

-- Políticas SEPARADAS para staff y familia, con la regex ANTES del cast: el
-- cast ::uuid dentro de un OR no cortocircuita en Postgres y un objeto con
-- primer segmento no-UUID rompería la evaluación también para el staff (v27b).

DROP POLICY IF EXISTS fotos_atletas_staff_all ON storage.objects;
CREATE POLICY fotos_atletas_staff_all ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'fotos-atletas'
    AND public.es_staff()
    AND (public.es_superadmin()
         OR public.club_de_carpeta_atleta(name) = public.current_user_club())
  )
  WITH CHECK (
    bucket_id = 'fotos-atletas'
    AND public.es_staff()
    AND (public.es_superadmin()
         OR public.club_de_carpeta_atleta(name) = public.current_user_club())
  );

-- Familia = el propio atleta + el padre vinculado. mis_atletas() cubre los dos
-- casos de una vez, así que no hacen falta políticas separadas por rol.

DROP POLICY IF EXISTS fotos_atletas_familia_select ON storage.objects;
CREATE POLICY fotos_atletas_familia_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fotos-atletas'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    AND (split_part(name, '/', 1))::uuid IN (SELECT unnest(public.mis_atletas())));

-- El INSERT valida la forma COMPLETA del path, no solo el prefijo: si ningún
-- objeto no conforme puede nacer, el cast de las otras políticas nunca tiene
-- con qué fallar. Es el cierre del riesgo residual que v27b solo documentaba.
DROP POLICY IF EXISTS fotos_atletas_familia_insert ON storage.objects;
CREATE POLICY fotos_atletas_familia_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fotos-atletas'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,64}$'
    AND (split_part(name, '/', 1))::uuid IN (SELECT unnest(public.mis_atletas())));

-- DELETE acotado al propio prefijo: sin él, cada reemplazo de foto dejaría
-- basura permanente en el bucket. El peor caso que habilita es que un padre
-- borre la foto de su propio hijo — reversible subiendo otra.
DROP POLICY IF EXISTS fotos_atletas_familia_delete ON storage.objects;
CREATE POLICY fotos_atletas_familia_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fotos-atletas'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    AND (split_part(name, '/', 1))::uuid IN (SELECT unnest(public.mis_atletas())));
