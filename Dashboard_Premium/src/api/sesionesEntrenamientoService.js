// src/api/sesionesEntrenamientoService.js
import { supabase } from './supabaseClient';

// ============================
// SESIONES DE ENTRENAMIENTO
// ============================

export const fetchSesionesAtleta = async (atletaId) => {
  const { data, error } = await supabase
    .from('sesiones_entrenamiento')
    .select('*')
    .eq('atleta_id', atletaId)
    .order('fecha', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching sesiones:', error);
    return [];
  }

  return data || [];
};

export const crearSesionEntrenamiento = async (sesionData) => {
  const { data, error } = await supabase
    .from('sesiones_entrenamiento')
    .insert(sesionData)
    .select()
    .single();

  if (error) {
    console.error('Error creating sesion:', error);
    throw error;
  }

  return data;
};
