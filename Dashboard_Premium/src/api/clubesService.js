// src/api/clubesService.js
import { supabase } from './supabaseClient';

// ============================
// CATÁLOGO DE CLUBES (v34)
// ============================
// El club es texto denormalizado (no hay tabla `clubes`), así que el catálogo
// se arma server-side con la RPC `listar_clubes_todos()`: UNION de usuarios,
// grupos_entrenamiento, club_config y eventos, con gate `es_superadmin()`
// dentro del cuerpo.
//
// Diferencia con `fetchClubesPublicos` (registroPublicoService, v33): aquella
// lista solo los clubes con owner activo — los que aceptan inscripción en
// línea. Esta devuelve TODOS, incluidos los clubes históricos sin owner, que
// es justamente de donde el superadmin necesita poder mover atletas.

export const fetchClubesTodos = async () => {
  const { data, error } = await supabase.rpc('listar_clubes_todos');
  if (error) throw new Error('No se pudo cargar la lista de clubes.');
  return (data || []).map((r) => r.club);
};
