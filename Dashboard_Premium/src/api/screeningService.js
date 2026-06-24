// src/api/screeningService.js
import { supabase } from './supabaseClient';

// ============================
// SCREENING FUNCIONAL
// ============================

export const fetchScreeningFuncional = async (atletaId) => {
  const { data, error } = await supabase
    .from('screening_funcional')
    .select('*')
    .eq('atleta_id', atletaId)
    .order('fecha', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('Error fetching screening:', error);
    return null;
  }

  return data;
};
