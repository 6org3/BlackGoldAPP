// src/api/sesionesService.js
import { supabase } from './supabaseClient';
import { xpBaseSesion } from '../../../packages/analytics-core/xp.js';
import { otorgarXP } from './xpService';

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

  // Asignar XP si es un atleta individual y se logró o parcial.
  // XP base por tipo de sesión desde la fuente única (analytics-core/xp.js);
  // la mutación de xp_total pasa por otorgarXP (xpService).
  if (data.atleta_id && (se_logro === 'Sí' || se_logro === 'Parcial')) {
    let xpBase = xpBaseSesion(data.tipo);
    if (se_logro === 'Parcial') xpBase = Math.floor(xpBase / 2);
    if (xpBase > 0) await otorgarXP(data.atleta_id, xpBase);
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
