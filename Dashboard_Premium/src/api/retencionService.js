// src/api/retencionService.js
// Retención del club — Black Gold (panel del dueño, D5 · Retención).
//
// Invoca la función SECURITY DEFINER fn_retencion_club (migración v31), que
// deriva total/activos/ret_pct y altas-bajas por mes desde el ciclo de vida de
// membresía del atleta (atletas.estado_membresia/fecha_alta/fecha_baja),
// scopeada por club del usuario. Devuelve el jsonb crudo; el mapeo a la forma
// del selector (incl. la lista `riesgo`, que sale del proxy de señales) se hace
// en duenoData, que tiene la lista de atletas a mano.

import { supabase } from './supabaseClient';

/**
 * Retención del club para el panel del dueño.
 * @param {number} [meses=5] Nº de meses del histórico de altas/bajas.
 * @returns {Promise<{total:number, activos:number, ret_pct:number,
 *   altas_bajas:Array<{ym:string, altas:number, bajas:number}>}|null>} El jsonb
 *   de fn_retencion_club, o null si la RPC falla / no hay permiso / migración
 *   sin aplicar (el panel degrada a DUENO_MOCK.retencion).
 */
export async function fetchRetencionClub(meses = 5) {
  const { data, error } = await supabase.rpc('fn_retencion_club', { p_meses: meses });
  if (error || !data) return null;
  return data; // { total, activos, ret_pct, altas_bajas }
}
