// src/api/coachesService.js
// Ranking de coaches del club — Black Gold (panel del dueño, D4 · Equipo técnico).
//
// Invoca la función SECURITY DEFINER fn_coach_stats (migración v31), que agrega
// asistencia % (pases de lista Presente/total), nº de sesiones dictadas y XP
// repartido (xp_eventos) por coach del club del usuario en los últimos p_dias, y
// la mapea a la forma que consume duenoSelectors.ctxEquipo vía duenoData.coaches.
// Ver duenoMock.js (DUENO_MOCK.coaches) para la forma exacta.

import { supabase } from './supabaseClient';

// Paleta de acentos por posición (fn_coach_stats no devuelve color); se asigna
// por índice del ranking, de forma estable dentro de una misma carga.
const HUES = ['gold', 'blue', 'green', 'cyan', 'orange', 'red'];

/**
 * Ranking de coaches del club para el panel del dueño.
 * @param {number} [dias=30] Ventana de días hacia atrás.
 * @returns {Promise<Array<{id:string, initial:string, hue:string, name:string,
 *   cats:string, asist:number, ses:number, xp:number}>>} Filas mapeadas, o []
 *   si la RPC falla / no hay permiso / migración sin aplicar (el panel degrada
 *   a DUENO_MOCK.coaches).
 */
export async function fetchCoachStats(dias = 30) {
  const { data, error } = await supabase.rpc('fn_coach_stats', { p_dias: dias });
  if (error || !Array.isArray(data)) return [];
  return data.map((r, i) => ({
    id: r.coach_id,
    initial: (r.nombre || '?').charAt(0).toUpperCase(),
    hue: HUES[i % HUES.length],
    name: r.nombre || 'Coach',
    cats: '—', // fn_coach_stats no devuelve categorías — TODO: lookup por grupos del coach.
    // Numéricos: el selector ordena por estos campos y normaliza celdas al máximo.
    asist: Number(r.asistencia_pct) || 0,
    ses: Number(r.sesiones) || 0,
    xp: Number(r.xp) || 0,
  }));
}
