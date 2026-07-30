// src/api/readinessService.js
import { supabase } from './supabaseClient';
// Sin ciclo: brainService solo importa supabaseClient.
import { invalidarReadiness } from './brainService';
import { hoyLocal } from '../lib/fechasLocal';

// ============================
// READINESS ENGINE (FIBA/NBA)
// ============================

/** Hora a partir de la cual se ofrece el check-in del día: mide la primera
 *  orina de la mañana (escala de Armstrong), así que de madrugada no aplica. */
export const HORA_MINIMA_CHECKIN = 6;

/** ¿El check-in de hoy ya está disponible? (gate horario del engine) */
export const checkinDisponible = (fecha = new Date()) => fecha.getHours() >= HORA_MINIMA_CHECKIN;

export const guardarReadinessDiario = async (readinessData) => {
  // Si el caller no trae fecha explícita, se fija al día LOCAL aquí, en vez de
  // dejar que la columna caiga al DEFAULT CURRENT_DATE del servidor (UTC): un
  // check-in nocturno en Ecuador (UTC-5) ya cruzó medianoche UTC y quedaría
  // fechado mañana, desincronizado del día que consulta fetchReadinessHoy.
  const payload = { fecha: hoyLocal(), ...readinessData };
  const { data, error } = await supabase
    .from('atleta_readiness')
    .insert([payload])
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
  const hoy = hoyLocal();
  const { data, error } = await supabase
    .from('atleta_readiness')
    .select('*')
    .eq('atleta_id', atletaId)
    .eq('fecha', hoy)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error; // Ignorar error si no hay datos
  return data;
};
