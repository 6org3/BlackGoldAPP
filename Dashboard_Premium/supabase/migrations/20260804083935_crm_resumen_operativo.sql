-- Resumen de Dirección calculado dentro de Postgres. Mantiene las métricas
-- completas aunque el panel cargue contactos por páginas, y evita llevar
-- oportunidades/actividades de todo el club al proceso Edge.
CREATE OR REPLACE FUNCTION public.crm_resumen_operativo(
  p_club text,
  p_limite integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_club text := btrim(COALESCE(p_club, ''));
  v_limite integer := COALESCE(p_limite, 50);
  v_offset integer := COALESCE(p_offset, 0);
BEGIN
  IF char_length(v_club) NOT BETWEEN 1 AND 120
     OR v_limite NOT BETWEEN 1 AND 100
     OR v_offset NOT BETWEEN 0 AND 1000000 THEN
    RAISE EXCEPTION 'Parámetros de resumen CRM inválidos.';
  END IF;

  RETURN (
    WITH etapas AS (
      SELECT
        e.codigo,
        e.nombre,
        e.orden,
        e.es_cierre,
        count(o.id)::integer AS total
      FROM public.crm_etapas_oportunidad e
      LEFT JOIN public.crm_oportunidades o
        ON o.etapa_codigo = e.codigo
       AND o.club = v_club
      GROUP BY e.codigo, e.nombre, e.orden, e.es_cierre
    ),
    pagina_contactos AS (
      SELECT c.id, c.tipo_relacion, c.estado, c.nombre_preferido,
             c.origen_inicial, c.created_at, c.updated_at
      FROM public.crm_contactos c
      WHERE c.club = v_club
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT v_limite OFFSET v_offset
    ),
    contactos_detalle AS (
      SELECT
        c.*,
        oportunidad.oportunidad,
        COALESCE(agenda.actividades_pendientes, 0)::integer AS actividades_pendientes,
        proxima.proxima_actividad
      FROM pagina_contactos c
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object(
          'id', o.id,
          'contact_id', o.contact_id,
          'etapa_codigo', o.etapa_codigo,
          'origen', o.origen,
          'interes_principal', o.interes_principal,
          'proximo_paso_en', o.proximo_paso_en,
          'etapa_actualizada_at', o.etapa_actualizada_at,
          'created_at', o.created_at
        ) AS oportunidad
        FROM public.crm_oportunidades o
        WHERE o.contact_id = c.id
        ORDER BY o.etapa_actualizada_at DESC, o.id DESC
        LIMIT 1
      ) oportunidad ON true
      LEFT JOIN LATERAL (
        SELECT count(*) AS actividades_pendientes
        FROM public.crm_actividades a
        WHERE a.contact_id = c.id AND a.estado = 'pendiente'
      ) agenda ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object(
          'id', a.id,
          'contact_id', a.contact_id,
          'oportunidad_id', a.oportunidad_id,
          'tipo', a.tipo,
          'asunto', a.asunto,
          'vencimiento_at', a.vencimiento_at,
          'estado', a.estado,
          'asignado_a', a.asignado_a
        ) AS proxima_actividad
        FROM public.crm_actividades a
        WHERE a.contact_id = c.id AND a.estado = 'pendiente'
        ORDER BY a.vencimiento_at ASC, a.id ASC
        LIMIT 1
      ) proxima ON true
    )
    SELECT jsonb_build_object(
      'club', v_club,
      'pipeline', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'codigo', e.codigo,
          'nombre', e.nombre,
          'orden', e.orden,
          'es_cierre', e.es_cierre,
          'total', e.total
        ) ORDER BY e.orden)
        FROM etapas e
      ), '[]'::jsonb),
      'total_contactos', (
        SELECT count(*)::integer FROM public.crm_contactos WHERE club = v_club
      ),
      'actividades_pendientes_total', (
        SELECT count(*)::integer
        FROM public.crm_actividades a
        JOIN public.crm_contactos c ON c.id = a.contact_id
        WHERE c.club = v_club AND a.estado = 'pendiente'
      ),
      'contactos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', c.id,
          'tipo_relacion', c.tipo_relacion,
          'estado', c.estado,
          'nombre_preferido', c.nombre_preferido,
          'origen_inicial', c.origen_inicial,
          'created_at', c.created_at,
          'updated_at', c.updated_at,
          'oportunidad', c.oportunidad,
          'actividades_pendientes', c.actividades_pendientes,
          'proxima_actividad', c.proxima_actividad
        ) ORDER BY c.updated_at DESC, c.id DESC)
        FROM contactos_detalle c
      ), '[]'::jsonb),
      'offset', v_offset,
      'limite', v_limite,
      'tiene_mas', (
        SELECT count(*) > (v_offset + v_limite)
        FROM public.crm_contactos
        WHERE club = v_club
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_resumen_operativo(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_resumen_operativo(text, integer, integer)
  TO service_role;

COMMENT ON FUNCTION public.crm_resumen_operativo(text, integer, integer) IS
  'Resumen paginado de CRM para Dirección. Calcula pipeline y actividades sobre todo el club; sólo service_role.';
