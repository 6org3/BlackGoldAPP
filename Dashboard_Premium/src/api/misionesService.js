// src/api/misionesService.js
import { supabase } from './supabaseClient';
// XP por datos (analytics-core, compartido con blackgold-mcp y la Edge Function).
// El shim src/lib/baremosEngine.js solo reexporta baremos.js, por eso se importa
// directo del paquete.
import { calcularXPMision } from '../../../packages/analytics-core/recomendaciones.js';
import { otorgarXP } from './xpService';

// ============================
// MISIONES (Supabase)
// ============================

export const fetchMisiones = async (atletaId) => {
  // atletaId aquí es el usuario.id, necesitamos el atleta_id
  const { data: atletaData } = await supabase
    .from('atletas')
    .select('id')
    .eq('usuario_id', atletaId)
    .single();

  if (!atletaData) return [];

  const { data: progreso, error } = await supabase
    .from('progreso_misiones')
    .select(`
      *,
      misiones!inner (
        id,
        titulo,
        descripcion,
        pilar,
        video_url,
        xp_recompensa,
        quiz,
        justificacion,
        nivel_objetivo,
        complejidad,
        activa
      )
    `)
    .eq('atleta_id', atletaData.id);

  if (error) {
    console.error('Error fetching misiones:', error);
    return [];
  }

  return progreso
    // D4: las asignaciones propuestas (pendiente_aprobacion sin completar) y las
    // asignaciones rechazadas por el coach son INVISIBLES para el atleta. Las
    // completadas en revisión (completada=true + pendiente_aprobacion) sí se ven.
    .filter(p => p.completada || !['pendiente_aprobacion', 'rechazada'].includes(p.estado))
    .map(p => ({
      id: p.misiones.id,
      progreso_id: p.id,
      titulo: p.misiones.titulo,
      descripcion: p.misiones.descripcion,
      pilar: p.misiones.pilar,
      videoUrl: p.misiones.video_url,
      xpRecompensa: p.misiones.xp_recompensa,
      quiz: p.misiones.quiz || [],
      justificacion: p.misiones.justificacion,
      nivelObjetivo: p.misiones.nivel_objetivo,
      complejidad: p.misiones.complejidad,
      activa: p.misiones.activa,
      completada: p.completada,
      estado: p.estado,
      fechaCompletada: p.fecha_completada,
      origen: p.origen,
      subPilarObjetivo: p.sub_pilar_objetivo,
    }));
};

// ============================
// COMPLETAR MISIÓN (Supabase)
// ============================

export const completarMision = async (atletaUserId, misionId) => {
  // Obtener atleta_id desde usuario_id
  const { data: atletaData } = await supabase
    .from('atletas')
    .select('id')
    .eq('usuario_id', atletaUserId)
    .single();

  if (!atletaData) return { success: false };

  // Marcar misión como completada pero pendiente de aprobación por el coach
  const { error: updateError } = await supabase
    .from('progreso_misiones')
    .update({
      completada: true,
      fecha_completada: new Date().toISOString(),
      estado: 'pendiente_aprobacion'
    })
    .eq('atleta_id', atletaData.id)
    .eq('mision_id', misionId);

  if (updateError) {
    console.error('Error completing mission:', updateError);
    return { success: false };
  }

  return { success: true };
};

// ============================
// MISIONES - APROBAR/RECHAZAR/ASIGNAR (Phase 4)
// ============================

export const aprobarMision = async (progresoId) => {
  // 1. Obtener la misión y el atleta para sumar el XP.
  // El XP ahora es 100% por datos vía calcularXPMision (analytics-core):
  // xp_recompensa > 0 → nivel_objetivo de la misión → nivel_desarrollo del
  // atleta → fallback 50. Antes aquí había un keyword-match sobre el título
  // ('micro'/'desarrollo'/'elite') que además nunca corría: el título ni
  // siquiera se seleccionaba en la query.
  const { data: progresoData } = await supabase
    .from('progreso_misiones')
    .select(`
      atleta_id,
      misiones (xp_recompensa, nivel_objetivo)
    `)
    .eq('id', progresoId)
    .single();

  if (progresoData && progresoData.misiones) {
    const atletaId = progresoData.atleta_id;

    // Nivel actual del atleta (para calcularXPMision); la mutación de xp_total
    // pasa por otorgarXP (fuente única).
    const { data: atletaData } = await supabase
      .from('atletas')
      .select('nivel_desarrollo')
      .eq('id', atletaId)
      .single();

    if (atletaData) {
      const finalXP = calcularXPMision(progresoData.misiones, atletaData);
      await otorgarXP(atletaId, finalXP);
    }
  }

  // 2. Marcar como aprobada
  const { error } = await supabase
    .from('progreso_misiones')
    .update({ estado: 'aprobada' })
    .eq('id', progresoId);
  if (error) throw error;
  return { success: true };
};

export const rechazarMision = async (progresoId) => {
  const { error } = await supabase
    .from('progreso_misiones')
    .update({ estado: 'rechazada' })
    .eq('id', progresoId);
  if (error) throw error;
  return { success: true };
};

// ============================
// ASIGNACIONES PROPUESTAS (D4 — loop evaluación → misión)
// Una propuesta es progreso_misiones con estado='pendiente_aprobacion' y
// completada=false (a diferencia de una completación en revisión, que es
// pendiente_aprobacion + completada=true).
// ============================

/**
 * El coach aprueba una asignación propuesta: pasa a 'pendiente' y el atleta
 * la ve en su panel. No toca XP ni `completada` (el XP se otorga recién al
 * completarla y aprobarla vía aprobarMision).
 */
export const aprobarAsignacion = async (progresoId) => {
  const { error } = await supabase
    .from('progreso_misiones')
    .update({ estado: 'pendiente' })
    .eq('id', progresoId);
  if (error) throw error;
  return { success: true };
};

/**
 * El coach rechaza una asignación propuesta. La fila SE CONSERVA (no DELETE):
 * alimenta el dedup del regenerador de misiones y la métrica de calidad del
 * catálogo. El atleta nunca la ve (fetchMisiones la filtra).
 */
export const rechazarAsignacion = async (progresoId) => {
  const { error } = await supabase
    .from('progreso_misiones')
    .update({ estado: 'rechazada' })
    .eq('id', progresoId);
  if (error) throw error;
  return { success: true };
};

/**
 * Activa/desactiva una misión del catálogo (curaduría del coach: las misiones
 * propuestas por el MCP nacen con activa=false hasta que él las active).
 */
export const setMisionActiva = async (misionId, activa) => {
  const { error } = await supabase
    .from('misiones')
    .update({ activa })
    .eq('id', misionId);
  if (error) throw error;
  return { success: true };
};

export const asignarMisionAAtleta = async (atletaId, misionId) => {
  const { data, error } = await supabase
    .from('progreso_misiones')
    .insert([{
      atleta_id: atletaId,
      mision_id: misionId,
      estado: 'pendiente'
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
};
