// src/api/encuestasHabitosService.js
import { supabase } from './supabaseClient';

// ============================
// ENCUESTAS DE HÁBITOS
// ============================

export const guardarEncuestaHabitos = async (encuesta) => {
  const { data, error } = await supabase
    .from('encuestas_habitos')
    .insert([encuesta])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const fetchEncuestasSemana = async (atletaId, semana) => {
  const { data, error } = await supabase
    .from('encuestas_habitos')
    .select('*')
    .eq('atleta_id', atletaId)
    .eq('semana', semana)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const validarEncuestaPorPadre = async (encuestaId, correcciones) => {
  const { error } = await supabase
    .from('encuestas_habitos')
    .update({
      validado_por_padre: true,
      correcciones_padre: correcciones,
    })
    .eq('id', encuestaId);
  if (error) throw error;
  return { success: true };
};
