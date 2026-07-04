// src/api/evaluacionesService.js
import { supabase } from './supabaseClient';
import { checkAndCreateRecompensas } from './recompensasService';
// Fuente única de "última evaluación por prueba" (analytics-core, compartido
// con blackgold-mcp y la Edge Function). El shim src/lib/baremosEngine.js solo
// reexporta baremos.js, por eso se importa directo del paquete.
import { ultimasPorPrueba } from '../../../packages/analytics-core/recomendaciones.js';

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

  // Última evaluación por prueba_tipo (lógica compartida de analytics-core;
  // no depende del orden de la query).
  const latest = ultimasPorPrueba(evaluaciones);

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

  // Disparo del loop evaluación → misión (D2 del spec): invoca la Edge Function
  // que genera/asigna misiones según las debilidades medidas. Best-effort y NO
  // bloqueante: nunca debe hacer fallar el guardado de la evaluación (sin await;
  // el error solo se loguea).
  try {
    supabase.functions
      .invoke('generar-misiones-ia', { body: { atleta_id: atletaId } })
      .then(({ error: fnError }) => {
        if (fnError) {
          console.error('Error al invocar generar-misiones-ia:', fnError);
        }
      })
      .catch(err => {
        console.error('Error al invocar generar-misiones-ia:', err);
      });
  } catch (err) {
    console.error('Error al invocar generar-misiones-ia:', err);
  }

  return { overall, rango };
};

/**
 * Historial COMPLETO de evaluaciones de varios atletas en un solo query
 * (sin dedup por prueba: eso lo decide el consumidor con ultimasPorPrueba).
 *
 * @param {Array<string>} atletaIds - ids de atletas (atletas.id).
 * @returns {Promise<Object>} { [atletaId]: evaluaciones[] } — cada atleta pedido
 *   tiene su clave (con [] si no tiene evaluaciones); {} si atletaIds está vacío.
 *   Las evaluaciones vienen ordenadas por created_at ascendente.
 */
export const fetchEvaluacionesDeAtletas = async (atletaIds) => {
  if (!atletaIds || atletaIds.length === 0) return {};

  const { data, error } = await supabase
    .from('evaluaciones_pruebas')
    .select('*')
    .in('atleta_id', atletaIds)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const porAtleta = {};
  atletaIds.forEach(id => { porAtleta[id] = []; });
  (data || []).forEach(evaluacion => {
    if (!porAtleta[evaluacion.atleta_id]) porAtleta[evaluacion.atleta_id] = [];
    porAtleta[evaluacion.atleta_id].push(evaluacion);
  });

  return porAtleta;
};
