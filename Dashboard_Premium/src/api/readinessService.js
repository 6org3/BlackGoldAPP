// src/api/readinessService.js
import { supabase } from './supabaseClient';
// Sin ciclo: brainService solo importa supabaseClient.
import { invalidarReadiness } from './brainService';

// ============================
// READINESS ENGINE (FIBA/NBA)
// ============================

export const guardarReadinessDiario = async (readinessData) => {
  const { data, error } = await supabase
    .from('atleta_readiness')
    .insert([readinessData])
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya realizaste tu Check-in de Readiness hoy.');
    }
    throw error;
  }

  // Check-in nuevo → el readiness cacheado del cerebro (brainService) quedó
  // obsoleto para este atleta.
  invalidarReadiness(readinessData.atleta_id);

  return data;
};

export const fetchReadinessHoy = async (atletaId) => {
  const hoy = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('atleta_readiness')
    .select('*')
    .eq('atleta_id', atletaId)
    .eq('fecha', hoy)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error; // Ignorar error si no hay datos
  return data;
};
