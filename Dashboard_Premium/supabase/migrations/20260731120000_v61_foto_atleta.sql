-- ============================================================================
-- v61 — Foto de identificación del atleta (retrato tipo carnet).
--
-- Qué habilita: cada atleta puede tener un retrato que reemplaza la inicial
-- del HexAvatar en toda la app. Lo suben superadmin, el staff de su club, el
-- propio atleta y el padre vinculado. Decisión del dueño (2026-07-29): sin
-- moderación previa —se publica directo y queda auditado quién lo subió.
--
-- El bucket y sus políticas van en v62, SEPARADO por el riesgo de ownership
-- de storage.objects (ver la cabecera de ese archivo).
--
-- ---------------------------------------------------------------------------
-- POR QUÉ LA COLUMNA VA EN `atletas` Y NO EN `usuarios`
--
-- Los dos ejes de autorización pivotan sobre atletas.id: mis_atletas() (v24)
-- devuelve atletas.id y club_de_atleta() (v29) lo recibe. Poniendo el path
-- bajo '<atletas.id>/...' las políticas de storage.objects se escriben con los
-- helpers que ya existen y ya están probados en el bucket de comprobantes.
-- Además `usuarios` es la tabla más blindada del esquema (triggers de v34 y
-- v36b reservan estado/club/rol) y contiene también al staff: meter ahí una
-- columna que un PADRE debe poder escribir obligaría a abrirle la tabla de
-- identidad.
--
-- POR QUÉ `foto_path` Y NO `foto_url`
--
-- Se guarda un path de Storage, no una URL: el bucket es privado y toda URL
-- caduca. Y es defensivo — src/components/ScoutingReportTemplate.jsx ya hace
-- `atleta.foto_url ? <img src={atleta.foto_url}>` sobre un campo que nunca
-- existió, y los servicios hacen select('*'): llamarla `foto_url` haría que
-- ese <img> recibiera un path relativo y renderizara un 404 mudo en el PDF.
--
-- POR QUÉ UNA RPC Y NO UNA POLÍTICA DE UPDATE PARA EL PADRE
--
-- El padre hoy no tiene UPDATE sobre atletas (atletas_update, v29 §62-73), y
-- ensanchar esa política le abriría de paso posicion, peso_kg, talla_cm y
-- estado_recuperacion: proteger_columnas_atletas (v24 §325, recreada en v31 y
-- v34) está escrita como LISTA NEGRA —enumera lo que el no-staff NO puede
-- tocar y deja pasar el resto—. Una lista blanca de una sola columna escondida
-- dentro de una lista negra es fail-open: cada columna futura de `atletas`
-- quedaría escribible por el padre salvo que alguien recuerde sincronizar el
-- IF. Con la RPC, el padre no gana NINGUNA política de UPDATE y la superficie
-- de escritura queda congelada en las tres columnas de foto, para siempre.
--
-- Nota de numeración: v52 (endurecimiento pre-producción) vive en una rama
-- paralela sin mergear. v61 es aditiva y no depende de ella.
-- ============================================================================


-- ------------------------------------------------------------
-- 1. COLUMNAS
-- ------------------------------------------------------------
-- Sin tabla de metadatos: la relación es 1:1, sin versionado ni aprobación
-- (a diferencia de pago_comprobantes, que sí tiene ciclo de vida).
-- `foto_actualizada_por` no es auditoría decorativa: son retratos de menores
-- subibles por cuatro actores distintos, y ante una foto inapropiada la
-- primera pregunta es quién la subió.

ALTER TABLE public.atletas
  ADD COLUMN IF NOT EXISTS foto_path            text,
  ADD COLUMN IF NOT EXISTS foto_actualizada_at  timestamptz,
  ADD COLUMN IF NOT EXISTS foto_actualizada_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.atletas.foto_path IS
  'Path en el bucket privado fotos-atletas: ''<atleta_id>/<ts>-<rand>.<ext>''. NO es una URL: se firma en lectura (ver src/api/fotosAtletasService.js).';

-- El path SIEMPRE bajo la carpeta del propio atleta. No es cosmética: las
-- políticas de storage.objects autorizan por split_part(name,'/',1), así que
-- una fila que apuntara a la carpeta de otro atleta sería una foto que la app
-- cree legible y Storage rechaza. La BD lo hace imposible incluso para un
-- UPDATE directo de staff que no pase por la RPC.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'atletas_foto_path_carpeta_propia'
  ) THEN
    ALTER TABLE public.atletas
      ADD CONSTRAINT atletas_foto_path_carpeta_propia
      CHECK (foto_path IS NULL OR foto_path LIKE (id::text || '/%'));
  END IF;
END $$;


-- ------------------------------------------------------------
-- 2. HELPER: CLUB DUEÑO DE UNA CARPETA DEL BUCKET
-- ------------------------------------------------------------
-- Gemelo genérico de club_de_comprobante_path (v40b). No se reutiliza aquél
-- porque su nombre está cableado a una política ya aplicada en producción y la
-- convención del repo es aditiva, no invasiva.
--
-- plpgsql a propósito, con la regex ANTES del cast y un EXCEPTION de red: v27b
-- documenta que el cast ::uuid dentro de un OR no cortocircuita en Postgres y
-- que un objeto con primer segmento no-UUID rompería la evaluación TAMBIÉN
-- para el staff.

CREATE OR REPLACE FUNCTION public.club_de_carpeta_atleta(p_name text)
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

REVOKE ALL ON FUNCTION public.club_de_carpeta_atleta(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_de_carpeta_atleta(text) TO authenticated, service_role;


-- ------------------------------------------------------------
-- 3. RPC: ÚNICO CAMINO DE ESCRITURA DE LA FOTO
-- ------------------------------------------------------------
-- Los cuatro actores pasan por aquí: una sola validación y un solo sitio que
-- auditar. p_path = NULL quita la foto.
--
-- Devuelve el path anterior porque el cliente lo necesita para borrar el
-- objeto huérfano; SQL no puede borrar de Storage de forma transaccional
-- (borrar la fila de storage.objects NO borra el blob en S3 — solo la API de
-- Storage hace las dos cosas, por eso aquí no hay ningún trigger de limpieza).
--
-- El trigger trg_proteger_columnas_atletas sigue disparándose dentro de esta
-- función: SECURITY DEFINER cambia el rol de BD, no los claims del JWT, así
-- que auth.uid() sigue siendo el del llamante. foto_path no está en su lista
-- negra y no se tocan columnas de membresía, así que pasa limpio.

CREATE OR REPLACE FUNCTION public.establecer_foto_atleta(
  p_atleta_id uuid,
  p_path      text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anterior text;
  v_existe   boolean;
BEGIN
  IF p_atleta_id IS NULL THEN
    RAISE EXCEPTION 'Falta el atleta.';
  END IF;

  -- Autorización. mis_atletas() cubre de una vez al propio atleta y al padre
  -- vinculado (v24 §94); el staff se acota a su club igual que atletas_update.
  IF NOT (
    es_superadmin()
    OR (es_staff() AND club_de_atleta(p_atleta_id) = current_user_club())
    OR p_atleta_id = ANY (mis_atletas())
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar la foto de este atleta.';
  END IF;

  -- El path debe vivir en la carpeta del propio atleta y tener la forma exacta
  -- que aceptan las políticas de v62. Sin esto se podrían guardar filas que
  -- apunten a objetos que ni el propio usuario puede leer.
  IF p_path IS NOT NULL
     AND (split_part(p_path, '/', 1) <> p_atleta_id::text
          OR p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,64}$')
  THEN
    RAISE EXCEPTION 'Ruta de foto inválida para este atleta.';
  END IF;

  SELECT foto_path, true INTO v_anterior, v_existe
  FROM atletas WHERE id = p_atleta_id FOR UPDATE;

  IF NOT COALESCE(v_existe, false) THEN
    RAISE EXCEPTION 'Atleta inexistente.';
  END IF;

  UPDATE atletas
     SET foto_path            = p_path,
         foto_actualizada_at  = CASE WHEN p_path IS NULL THEN NULL ELSE now() END,
         foto_actualizada_por = CASE WHEN p_path IS NULL THEN NULL ELSE current_usuario_id() END
   WHERE id = p_atleta_id;

  RETURN jsonb_build_object(
    'atleta_id',     p_atleta_id,
    'foto_path',     p_path,
    'path_anterior', v_anterior
  );
END;
$$;

REVOKE ALL ON FUNCTION public.establecer_foto_atleta(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.establecer_foto_atleta(uuid, text) TO authenticated, service_role;
