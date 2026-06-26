// src/api/eventosService.js
import { supabase } from './supabaseClient';

// Crea un evento y, si se pasan atleta_ids, lo publica generando convocados.
export async function crearEvento({
  creado_por,
  club = null,
  tipo = 'partido',
  titulo,
  descripcion = null,
  rival = null,
  fecha_evento,
  hora_inicio = null,
  hora_llegada = null,
  sede = null,
  segmento_tipo = null,
  segmento_params = {},
  incluir_representantes = true,
  atleta_ids = [],
}) {
  const estado = atleta_ids.length > 0 ? 'publicado' : 'borrador';

  const { data: evento, error } = await supabase
    .from('eventos')
    .insert({
      creado_por, club, tipo, estado, titulo, descripcion, rival,
      fecha_evento, hora_inicio, hora_llegada, sede,
      segmento_tipo, segmento_params, incluir_representantes,
    })
    .select()
    .single();
  if (error) throw error;

  if (atleta_ids.length > 0) {
    const filas = atleta_ids.map((aid) => ({
      evento_id: evento.id,
      atleta_id: aid,
      estado_rsvp: 'pendiente',
    }));
    const { error: e2 } = await supabase
      .from('evento_convocados')
      .upsert(filas, { onConflict: 'evento_id,atleta_id', ignoreDuplicates: true });
    if (e2) console.error('Error insertando convocados:', e2);
  }
  return evento;
}

// Lista eventos (admin/coach).
export async function fetchEventos({ limit = 30 } = {}) {
  const { data, error } = await supabase
    .from('eventos')
    .select('*')
    .order('fecha_evento', { ascending: false })
    .limit(limit);
  if (error) { console.error(error); return []; }
  return data || [];
}

// Conteo de RSVP por evento, para el tablero. Devuelve:
// { [evento_id]: { total, asiste, no_asiste, duda, pendiente } }
export async function fetchTableroConvocados(eventoIds = []) {
  if (eventoIds.length === 0) return {};
  const { data, error } = await supabase
    .from('evento_convocados')
    .select('evento_id, estado_rsvp')
    .in('evento_id', eventoIds);
  if (error) { console.error(error); return {}; }
  const tablero = {};
  (data || []).forEach((r) => {
    const t = (tablero[r.evento_id] = tablero[r.evento_id] || {
      total: 0, asiste: 0, no_asiste: 0, duda: 0, pendiente: 0,
    });
    t.total += 1;
    if (t[r.estado_rsvp] != null) t[r.estado_rsvp] += 1;
  });
  return tablero;
}

// Convocatorias de un atleta (para el Portal Padre).
export async function fetchConvocatoriasAtleta(atletaIds = []) {
  if (atletaIds.length === 0) return [];
  const { data, error } = await supabase
    .from('evento_convocados')
    .select('id, estado_rsvp, atleta_id, eventos!inner(*)')
    .in('atleta_id', atletaIds)
    .eq('eventos.estado', 'publicado');
  if (error) { console.error(error); return []; }
  // Ordenar por fecha del evento (cliente, para no depender de foreignTable order)
  return (data || []).sort((a, b) =>
    new Date(a.eventos?.fecha_evento || 0) - new Date(b.eventos?.fecha_evento || 0)
  );
}

// Registrar respuesta de asistencia (atleta/padre).
export async function responderRSVP(convocadoId, estado, usuarioId) {
  const { data, error } = await supabase
    .from('evento_convocados')
    .update({ estado_rsvp: estado, rsvp_at: new Date().toISOString(), rsvp_por: usuarioId })
    .eq('id', convocadoId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export const TIPO_EVENTO_LABEL = {
  partido: 'Partido',
  torneo: 'Torneo',
  entrenamiento_especial: 'Entrenamiento especial',
  clinica: 'Clínica / Camp',
  reunion: 'Reunión',
  evaluacion: 'Evaluación',
  social: 'Social',
};
