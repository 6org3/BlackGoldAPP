// src/api/asistenciaService.js
// Módulo de Control de Asistencia - Black Gold Intelligence

import { supabase } from './supabaseClient';

/**
 * Obtiene las asistencias de una fecha dada, enriquecidas con datos del atleta.
 * Opcionalmente filtra por categoría.
 * @param {string} fecha - Fecha en formato 'YYYY-MM-DD'
 * @param {string|null} categoria - Categoría a filtrar (null = todas)
 */
export async function fetchAsistenciaPorFecha(fecha, categoria = null) {
  try {
    let query = supabase
      .from('asistencia')
      .select(`
        id,
        atleta_id,
        coach_id,
        fecha,
        estado,
        notas,
        atletas (id, nombre, categoria, posicion, club)
      `)
      .eq('fecha', fecha);

    const { data, error } = await query;
    if (error) throw error;

    // Filtrar por categoría si se especifica
    if (categoria && categoria !== 'Todas') {
      return (data || []).filter(r => r.atletas?.categoria === categoria);
    }
    return data || [];
  } catch (err) {
    console.error('[asistenciaService] fetchAsistenciaPorFecha:', err);
    return [];
  }
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
