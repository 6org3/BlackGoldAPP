// src/api/xpService.js
// FUENTE ÚNICA de la mutación de XP del atleta.
//
// Antes el patrón "leer xp_total → sumar delta → escribir" (y el tope 100 de los stats)
// estaba repetido en 5 lugares: aprobarMision (misionesService), evaluarSesion
// (sesionesService), insertarObservacion (observacionesService) y los dos flujos de
// Modo Cancha (handleSubmitEvaluation, handleCerrarClase). Todos pasan por aquí ahora.
import { supabase } from './supabaseClient';

/**
 * Otorga XP a un atleta y, opcionalmente, sube stats (con tope 100).
 *
 * Sigue siendo read-modify-write (NO atómico) — se preserva la conducta previa. Migrar a
 * un RPC de incremento atómico es un TODO aparte (evitaría carreras si dos procesos
 * otorgan XP al mismo atleta a la vez; hoy ya era así en los 5 sitios originales).
 *
 * @param {string} atletaId - atletas.id
 * @param {number} [xpDelta=0] - XP a sumar.
 * @param {Object<string, number>} [statBoosts={}] - { columna: incremento } aplicado con Math.min(100, actual+inc).
 * @param {Object} [opts={}] - Metadatos del ledger de XP (xp_eventos, v31).
 * @param {string|null} [opts.coachId] - usuarios.id del coach que otorga (null si no aplica).
 * @param {string} [opts.motivo] - Descripción legible (p. ej. "Evaluación Modo Cancha").
 * @param {string} [opts.origen] - Origen técnico (p. ej. "observaciones_cancha", "misiones").
 * @returns {Promise<Object|null>} Los campos actualizados, o null si el atleta no existe.
 */
export async function otorgarXP(atletaId, xpDelta = 0, statBoosts = {}, opts = {}) {
  if (!atletaId) return null;

  const columnas = ['xp_total', ...Object.keys(statBoosts)];
  const { data: atleta, error } = await supabase
    .from('atletas')
    .select(columnas.join(', '))
    .eq('id', atletaId)
    .single();
  if (error || !atleta) return null;

  const updates = { xp_total: (atleta.xp_total || 0) + (xpDelta || 0) };
  for (const [col, inc] of Object.entries(statBoosts)) {
    updates[col] = Math.min(100, (atleta[col] || 0) + inc);
  }

  await supabase.from('atletas').update(updates).eq('id', atletaId);

  // Ledger de XP (xp_eventos, v31): registro BEST-EFFORT del movimiento — habilita
  // el XP semanal del atleta y el XP repartido por coach del dueño. NO debe romper
  // el otorgamiento si la tabla no existe (migración sin aplicar) o la RLS bloquea;
  // por eso va tras el UPDATE y se ignora cualquier error/throw. Solo se registra
  // cuando hay delta (la columna delta es NOT NULL y un 0 no aporta al historial).
  if (xpDelta) {
    try {
      await supabase.from('xp_eventos').insert({
        atleta_id: atletaId,
        coach_id: opts.coachId ?? null,
        delta: xpDelta,
        motivo: opts.motivo ?? null,
        origen: opts.origen ?? null,
      });
    } catch {
      /* best-effort: el ledger no debe romper el otorgamiento de XP */
    }
  }

  return updates;
}
