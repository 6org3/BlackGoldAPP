// src/api/misionesService.js
import { supabase } from './supabaseClient';

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
        tipo,
        video_url,
        xp_recompensa,
        quiz
      )
    `)
    .eq('atleta_id', atletaData.id);

  if (error) {
    console.error('Error fetching misiones:', error);
    return [];
  }

  return progreso.map(p => ({
    id: p.misiones.id,
    progreso_id: p.id,
    titulo: p.misiones.titulo,
    descripcion: p.misiones.descripcion,
    tipo: p.misiones.tipo,
    videoUrl: p.misiones.video_url,
    xpRecompensa: p.misiones.xp_recompensa,
    quiz: p.misiones.quiz || [],
    completada: p.completada,
    estado: p.estado,
    fechaCompletada: p.fecha_completada,
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
  // 1. Obtener la misión y el atleta para sumar el XP
  const { data: progresoData } = await supabase
    .from('progreso_misiones')
    .select(`
      atleta_id,
      misiones (xp_recompensa)
    `)
    .eq('id', progresoId)
    .single();

  if (progresoData && progresoData.misiones) {
    const baseXP = progresoData.misiones.xp_recompensa || 0;
    const atletaId = progresoData.atleta_id;

    // Obtener XP y Nivel actual del atleta
    const { data: atletaData } = await supabase
      .from('atletas')
      .select('xp_total, nivel_desarrollo')
      .eq('id', atletaId)
      .single();

    if (atletaData) {
      let finalXP = baseXP;
      const titleLower = (progresoData.misiones.titulo || '').toLowerCase();

      // Ajustar XP según palabras clave del nivel en el título de la misión
      if (titleLower.includes('micro')) {
        finalXP = 25; // Recompensa estándar para misiones Micro
      } else if (titleLower.includes('desarrollo')) {
        finalXP = 50; // Recompensa estándar para misiones Desarrollo
      } else if (titleLower.includes('elite') || titleLower.includes('élite')) {
        finalXP = 75; // Recompensa estándar para misiones Élite
      } else {
        // Ajuste fallback según el nivel del atleta si la misión no tiene nivel explícito
        if (atletaData.nivel_desarrollo === 'Micro') {
          finalXP = Math.min(baseXP, 30);
        } else if (atletaData.nivel_desarrollo === 'Desarrollo') {
          finalXP = Math.min(baseXP, 60);
        } else if (atletaData.nivel_desarrollo === 'Elite') {
          finalXP = Math.max(baseXP, 75);
        }
      }

      await supabase
        .from('atletas')
        .update({ xp_total: (atletaData.xp_total || 0) + finalXP })
        .eq('id', atletaId);
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
