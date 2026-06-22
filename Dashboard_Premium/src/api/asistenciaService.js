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
 * Si ya existe un registro para ese atleta en esa fecha, lo actualiza.
 * @param {{ atleta_id: string, coach_id: string, fecha: string, estado: string, notas?: string }} payload
 */
export async function upsertAsistencia({ atleta_id, coach_id, fecha, estado, notas = '' }) {
  try {
    const { data, error } = await supabase
      .from('asistencia')
      .upsert(
        { atleta_id, coach_id, fecha, estado, notas },
        { onConflict: 'atleta_id,fecha' }
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
