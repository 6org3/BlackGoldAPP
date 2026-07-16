// src/api/asistenciaService.js
// Módulo de Control de Asistencia - Black Gold Intelligence

import { supabase } from './supabaseClient';

/**
 * Obtiene TODAS las asistencias de una fecha dada. No acota por grupo: de eso se
 * encarga quien llama, cruzando por `atleta_id` contra su propia lista de atletas.
 *
 * Aquí no se filtra por grupo a propósito. `atletas.grupo_id` NO es la única
 * fuente de pertenencia: en los clubes cuya pertenencia vive solo en la tabla
 * `atleta_grupo` (la fuente de verdad de v18) esa columna está vacía, y quien
 * arma la lista de atletas la deriva de ahí (`fetchTodosLosAtletas`). Filtrar
 * por la columna cruda aquí dejaba fuera precisamente los registros de esos
 * atletas: el pase de lista los mostraba en el grupo, pero con "Presente" por
 * defecto en vez de su estado real, y al guardar lo pisaba en silencio — el
 * mismo daño que el `throw` de abajo existe para evitar. Una sola fuente de
 * verdad para el grupo (la lista ya resuelta del componente) y no dos.
 *
 * El club ya lo acota la RLS (`asistencia_staff`, v29), no esta query.
 *
 * Lanza si la consulta falla: devolver [] aquí haría indistinguible "sin
 * registros" de "falló la carga", y el pase de lista partiría de "100%
 * presente" pudiendo pisar asistencia real sin ninguna señal (auditoría
 * UX coach 2026-07-09).
 * @param {string} fecha - Fecha en formato 'YYYY-MM-DD'
 */
export async function fetchAsistenciaPorFecha(fecha) {
  const { data, error } = await supabase
    .from('asistencia')
    .select('id, atleta_id, coach_id, fecha, estado, notas')
    .eq('fecha', fecha);

  if (error) {
    console.error('[asistenciaService] fetchAsistenciaPorFecha:', error);
    throw error;
  }

  return data || [];
}

/**
 * Guarda o actualiza la asistencia de un atleta en una fecha (UPSERT).
 *
 * Dos modos, distinguidos por sesion_id (v21/v22, unificación de sesiones):
 * - sesion_id = null  → pase de lista DIARIO (AdminAsistencia): un registro por
 *   atleta y fecha.
 * - sesion_id = uuid  → asistencia de una CLASE concreta (Modo Cancha, FK a
 *   sesiones_programadas): un registro por atleta y sesión, coexiste con el diario.
 *
 * El conflict target debe ser la terna completa: la constraint real es
 * UNIQUE NULLS NOT DISTINCT (atleta_id, fecha, sesion_id) — v22. (El target viejo
 * 'atleta_id,fecha' dejó de existir con v21 y rompía este upsert con "no unique or
 * exclusion constraint matching the ON CONFLICT specification".)
 *
 * @param {{ atleta_id: string, coach_id: string, fecha: string, estado: string, notas?: string, sesion_id?: string|null }} payload
 */
export async function upsertAsistencia({ atleta_id, coach_id, fecha, estado, notas = '', sesion_id = null }) {
  try {
    const { data, error } = await supabase
      .from('asistencia')
      .upsert(
        { atleta_id, coach_id, fecha, estado, notas, sesion_id },
        { onConflict: 'atleta_id,fecha,sesion_id' }
      )
      .select();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[asistenciaService] upsertAsistencia:', err);
    return null;
  }
}

/**
 * Porcentaje de asistencia ('Presente' / total de registros) de un grupo de
 * atletas en una ventana de días. Extraído de OwnerKPIsPage.jsx (asistencia
 * de los últimos 7 días) para reutilizarlo en los gauges de las homes
 * (owner, sistema, padre) sin repetir la query.
 * @param {string[]} atletaIds - atletas.id (no usuarios.id).
 * @param {number} [dias=7]
 * @returns {Promise<number>} 0-100, redondeado; 0 si no hay atletas o registros.
 */
export async function fetchAsistenciaPct(atletaIds, dias = 7) {
  if (!atletaIds || atletaIds.length === 0) return 0;
  try {
    const desde = new Date();
    desde.setDate(desde.getDate() - dias);
    const { data, error } = await supabase
      .from('asistencia')
      .select('estado')
      .in('atleta_id', atletaIds)
      .gte('fecha', desde.toISOString().split('T')[0]);

    if (error) throw error;
    if (!data || data.length === 0) return 0;
    const presentes = data.filter((r) => r.estado === 'Presente').length;
    return Math.round((presentes / data.length) * 100);
  } catch (err) {
    console.error('[asistenciaService] fetchAsistenciaPct:', err);
    return 0;
  }
}

/**
 * Obtiene el historial de asistencias de un atleta en los últimos 30 días.
 * @param {string} atleta_id
 */
export async function fetchHistorialAtleta(atleta_id) {
  try {
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);
    const fechaMinima = hace30Dias.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('asistencia')
      .select('fecha, estado, notas')
      .eq('atleta_id', atleta_id)
      .gte('fecha', fechaMinima)
      .order('fecha', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[asistenciaService] fetchHistorialAtleta:', err);
    return [];
  }
}
