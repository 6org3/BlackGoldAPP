// src/api/ocupacionService.js
// Ocupación de cancha real - Black Gold (panel del dueño, heatmap Asistencia).
//
// Invoca la función SECURITY DEFINER fn_ocupacion_cancha (migración v32), que
// agrega las sesiones_programadas + asistencia del club del usuario en una
// rejilla (día de semana × franja horaria), y la mapea a la forma que consume
// el heatmap del dueño: { days, franjas, HD }. Ver duenoMock.js (DUENO_MOCK.heat)
// para la forma exacta y duenoSelectors.js (ctxAsistencia) para el consumo.

import { supabase } from './supabaseClient';

// Días del heatmap: Lunes..Sábado. Coincide con EXTRACT(DOW) = 1..6 y con el
// orden que asume el selector (DN = ['LUN','MAR','MIÉ','JUE','VIE','SÁB']).
const DAYS = ['L', 'M', 'X', 'J', 'V', 'S'];

// 'HH:MM:SS' (o 'HH:MM') → 'HH:MM'.
const hhmm = (t) => String(t || '').slice(0, 5);
const clampPct = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

/**
 * Ocupación real de la cancha para el heatmap del dueño.
 * @param {number} [dias=60] Ventana de días hacia atrás.
 * @returns {Promise<{days:string[], franjas:string[], HD:(Object|null)[][]}|null>}
 *   La forma { days, franjas, HD } o null si no hay datos / error (el llamador
 *   degrada a DUENO_MOCK.heat).
 */
export async function fetchOcupacionCancha(dias = 60) {
  try {
    const { data, error } = await supabase.rpc('fn_ocupacion_cancha', { p_dias: dias });
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) return null;

    // Franjas: horas de inicio distintas, ordenadas ascendente.
    const franjas = [...new Set(data.map((r) => hhmm(r.franja)))]
      .filter(Boolean)
      .sort();
    if (franjas.length === 0) return null;

    // Rejilla franjas × 6 días, inicializada a null (franja libre).
    const HD = franjas.map(() => Array(6).fill(null));

    for (const r of data) {
      const col = Number(r.dia_semana) - 1; // DOW 1..6 → col 0..5
      if (col < 0 || col > 5) continue;
      const fi = franjas.indexOf(hhmm(r.franja));
      if (fi < 0) continue;
      const p = clampPct(r.pct);
      const cell = { p, g: r.grupo || 'Sesión' };
      const prev = HD[fi][col];
      // Si dos grupos comparten franja/día, gana el de mayor ocupación.
      if (!prev || p > prev.p) HD[fi][col] = cell;
    }

    return { days: DAYS, franjas, HD };
  } catch (err) {
    console.error('[ocupacionService] fetchOcupacionCancha:', err);
    return null;
  }
}
