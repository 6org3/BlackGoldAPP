// src/api/observacionesService.js
import { supabase } from './supabaseClient';
import { otorgarXP } from './xpService';

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
    await otorgarXP(data.atleta_id, data.xp_agregado, {}, { coachId: data.coach_id ?? null, motivo: 'Observación de cancha', origen: 'observaciones_cancha' });
  }

  return obsData;
};
