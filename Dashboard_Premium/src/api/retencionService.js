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

// Fecha local YYYY-MM-DD (Ecuador UTC-5): evita el corrimiento de día de
// toISOString() cerca de medianoche al fijar la fecha de baja.
function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Marca (o revierte) la baja de membresía de un atleta — acción del dueño en el
 * panel de Retención. Escribe atletas.estado_membresia/fecha_baja (columnas v31);
 * la RLS `atletas_update` + el trigger `proteger_columnas_atletas` permiten la
 * escritura a staff (owner/coach/superadmin), no al propio atleta.
 *
 * Dar de baja es idempotente: el `.neq('estado_membresia','baja')` evita
 * reescribir `fecha_baja` de un atleta que YA estaba de baja (re-darlo de baja
 * en otro mes movería su baja de mes en el histórico de fn_retencion_club). Si
 * ya estaba de baja, el UPDATE no afecta filas y no hay error — no-op seguro.
 * @param {string} atletaId atletas.id.
 * @param {boolean} [dar=true] true = dar de baja; false = reactivar (activo, sin fecha_baja).
 */
export async function marcarBaja(atletaId, dar = true) {
  let query = supabase.from('atletas');
  query = dar
    ? query.update({ estado_membresia: 'baja', fecha_baja: hoyLocal() }).eq('id', atletaId).neq('estado_membresia', 'baja')
    : query.update({ estado_membresia: 'activo', fecha_baja: null }).eq('id', atletaId);
  const { error } = await query;
  if (error) throw error;
  return { success: true };
}
