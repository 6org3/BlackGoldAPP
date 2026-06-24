// src/api/observacionesService.js
import { supabase } from './supabaseClient';

// ============================
// OBSERVACIONES CANCHA (Phase 4)
// ============================

export const fetchObservaciones = async (atletaId) => {
  const { data, error } = await supabase
    .from('observaciones_cancha')
    .select('*')
    .eq('atleta_id', atletaId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching observaciones:', error);
    return [];
  }
  return data || [];
};

export const insertarObservacion = async (data) => {
  const { data: obsData, error } = await supabase
    .from('observaciones_cancha')
    .insert([data])
    .select()
    .single();

  if (error) throw error;

  if (data.xp_agregado) {
    const { data: atletaData } = await supabase
      .from('atletas')
      .select('id, xp_total')
      .eq('id', data.atleta_id)
      .single();

    if (atletaData) {
      await supabase
        .from('atletas')
        .update({ xp_total: (atletaData.xp_total || 0) + data.xp_agregado })
        .eq('id', data.atleta_id);
    }
  }

  return obsData;
};
