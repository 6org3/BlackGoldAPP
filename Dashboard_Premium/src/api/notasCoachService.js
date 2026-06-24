// src/api/notasCoachService.js
import { supabase } from './supabaseClient';

// ============================
// NOTAS COACH (Phase 4)
// ============================

export const fetchNotasCoach = async (atletaId) => {
  const { data, error } = await supabase
    .from('notas_coach')
    .select('*')
    .eq('atleta_id', atletaId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching notas coach:', error);
    return [];
  }
  return data || [];
};

export const insertarNotaCoach = async (data) => {
  const { data: notaData, error } = await supabase
    .from('notas_coach')
    .insert([data])
    .select()
    .single();

  if (error) throw error;
  return notaData;
};
