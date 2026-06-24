// src/api/recompensasService.js
import { supabase } from './supabaseClient';

// ============================
// RECOMPENSAS
// ============================

export const fetchRecompensasAtleta = async (atletaId) => {
  const { data, error } = await supabase
    .from('recompensas_desbloqueadas')
    .select('*')
    .eq('atleta_id', atletaId)
    .order('fecha_desbloqueo', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const checkAndCreateRecompensas = async (atletaId, nuevoRangoId) => {
  const { RECOMPENSAS_POR_RANGO } = await import('../lib/baremosEngine');

  // Fetch existing recompensas
  const existentes = await fetchRecompensasAtleta(atletaId);
  const rangosExistentes = new Set(existentes.map(r => r.rango_alcanzado));

  // If the new rank has recompensas and they haven't been created yet
  if (RECOMPENSAS_POR_RANGO[nuevoRangoId] && !rangosExistentes.has(nuevoRangoId)) {
    const nuevasRecompensas = RECOMPENSAS_POR_RANGO[nuevoRangoId].map(r => ({
      atleta_id: atletaId,
      rango_alcanzado: nuevoRangoId,
      recompensa: r.nombre,
      descripcion: r.descripcion,
    }));

    await supabase.from('recompensas_desbloqueadas').insert(nuevasRecompensas);
  }
};

export const marcarRecompensaEntregada = async (recompensaId) => {
  const { error } = await supabase
    .from('recompensas_desbloqueadas')
    .update({ entregado: true, fecha_entrega: new Date().toISOString() })
    .eq('id', recompensaId);
  if (error) throw error;
  return { success: true };
};
