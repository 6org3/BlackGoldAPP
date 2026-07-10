-- eventos_select_convocado (v24) filtra con un EXISTS directo contra
-- evento_convocados. Eso funciona aislado, pero en cualquier query que
-- junte ambas tablas (ej. PostgREST embed evento_convocados?select=...,
-- eventos!inner(*)) Postgres expande el RLS de las dos tablas dentro del
-- mismo plan y se topa con el mismo ciclo que v24 ya había resuelto para
-- usuarios↔atletas (ver mis_atletas()/usuarios_de_mis_atletas() más abajo
-- en ese archivo) — "infinite recursion detected in policy for relation
-- eventos" (42P17). A eventos↔evento_convocados nunca se le aplicó el
-- mismo arreglo. Repetimos el patrón: función SECURITY DEFINER que no
-- vuelve a disparar RLS, así el grafo queda acíclico. Cero cambio de
-- semántica de seguridad (mismo criterio: evento publicado + mi atleta
-- convocado).

CREATE OR REPLACE FUNCTION public.mis_eventos_convocados()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT evento_id), '{}'::uuid[])
  FROM evento_convocados
  WHERE atleta_id = ANY (mis_atletas());
$$;

REVOKE ALL ON FUNCTION public.mis_eventos_convocados() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mis_eventos_convocados() TO authenticated;

DROP POLICY IF EXISTS eventos_select_convocado ON public.eventos;
CREATE POLICY eventos_select_convocado ON public.eventos FOR SELECT TO authenticated
  USING (
    estado = 'publicado'
    AND id = ANY (mis_eventos_convocados())
  );
