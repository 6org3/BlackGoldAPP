// src/api/evaluacionesService.js
import { supabase } from './supabaseClient';
import { checkAndCreateRecompensas } from './recompensasService';

// ============================
// EVALUACIONES POR PRUEBAS (Fase 4D)
// ============================

export const guardarEvaluacion = async (evaluacion) => {
  const { data, error } = await supabase
    .from('evaluaciones_pruebas')
    .insert([evaluacion])
    .select()
    .single();
  if (error) throw error;

  // Recalculate overall score for the athlete
  await recalcularOverall(evaluacion.atleta_id);

  return data;
};

export const fetchEvaluacionesAtleta = async (atletaId) => {
  const { data, error } = await supabase
    .from('evaluaciones_pruebas')
    .select('*')
    .eq('atleta_id', atletaId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const recalcularOverall = async (atletaId) => {
  const { calcularOverall } = await import('../lib/baremosEngine');

  // Fetch latest evaluaciones
  const evaluaciones = await fetchEvaluacionesAtleta(atletaId);

  // Keep only latest per prueba_tipo
  const latest = {};
  evaluaciones.forEach(e => {
    if (!latest[e.prueba_tipo]) latest[e.prueba_tipo] = e;
  });

  const { overall, rango } = calcularOverall(Object.values(latest));

  // Update atleta
  const { error } = await supabase
    .from('atletas')
    .update({
      overall_score: overall,
      rango: rango.id
    })
    .eq('id', atletaId);

  if (error) throw error;

  // Check if rank changed → create recompensas
  await checkAndCreateRecompensas(atletaId, rango.id);

  return { overall, rango };
};
