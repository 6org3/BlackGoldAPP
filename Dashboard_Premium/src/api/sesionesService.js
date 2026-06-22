// src/api/sesionesService.js
import { supabase } from './supabaseClient';

export async function fetchEjercicios(tipo = null) {
  let q = supabase.from('ejercicios_catalogo').select('*').order('tipo').order('nombre');
  if (tipo) q = q.eq('tipo', tipo);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}

export async function fetchGrupos() {
  const { data, error } = await supabase
    .from('grupos_entrenamiento')
    .select('*')
    .order('nombre');
  if (error) { console.error(error); return []; }
  return data || [];
}

export async function crearSesionControl(payload) {
  const { data, error } = await supabase
    .from('sesiones_control')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function evaluarSesion(sesionId, { se_logro, notas_evaluacion }) {
  const { data, error } = await supabase
    .from('sesiones_control')
    .update({ se_logro, notas_evaluacion })
    .eq('id', sesionId)
    .select()
    .single();
  if (error) throw error;

  // Asignar XP si es un atleta individual y se logró o parcial
  if (data.atleta_id && (se_logro === 'Sí' || se_logro === 'Parcial')) {
    let xpBase = 20;
    if (data.tipo === 'Privada 1v1') xpBase = 50;
    else if (data.tipo === 'Grupal Individualizada') xpBase = 35;
    else if (data.tipo?.startsWith('Grupal (Niveles)')) {
      if (data.tipo.includes('Micro')) xpBase = 20;
      else if (data.tipo.includes('Desarrollo')) xpBase = 30;
      else if (data.tipo.includes('Elite')) xpBase = 40;
    }

    if (se_logro === 'Parcial') {
      xpBase = Math.floor(xpBase / 2);
    }

    if (xpBase > 0) {
      const { data: atletaData } = await supabase
        .from('atletas')
        .select('xp_total')
        .eq('id', data.atleta_id)
        .single();
      
      if (atletaData) {
        await supabase
          .from('atletas')
          .update({ xp_total: (atletaData.xp_total || 0) + xpBase })
          .eq('id', data.atleta_id);
      }
    }
  }

  return data;
}

export async function fetchSesionesControl({ grupoId = null, atletaId = null, limit = 20 } = {}) {
  let q = supabase
    .from('sesiones_control')
    .select(`
      *,
      grupos_entrenamiento (nombre, horario),
      atletas (id, usuarios!inner(nombre))
    `)
    .order('fecha', { ascending: false })
    .limit(limit);
  if (grupoId) q = q.eq('grupo_id', grupoId);
  if (atletaId) q = q.eq('atleta_id', atletaId);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}
