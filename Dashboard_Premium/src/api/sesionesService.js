// src/api/sesionesService.js
import { supabase } from './supabaseClient';
import { xpBaseSesion } from '../../../packages/analytics-core/xp.js';
import { otorgarXP } from './xpService';
import { TABLA_EJERCICIOS_ENTRENAMIENTO } from './tablas';

export async function fetchEjercicios(tipo = null) {
  let q = supabase.from(TABLA_EJERCICIOS_ENTRENAMIENTO).select('*').order('tipo').order('nombre');
  if (tipo) q = q.eq('tipo', tipo);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}

// ============================
// PLANTILLAS DE SESIÓN (catalogo_sesiones) — fase P3 de la unificación.
// Biblioteca de sesiones preestablecidas que alimenta el paso "Objetivo de la
// Sesión" del Modo Cancha y el botón "Guardar como plantilla" de AdminSesiones.
// ============================

export async function fetchPlantillas() {
  const { data, error } = await supabase
    .from('catalogo_sesiones')
    .select('*')
    .eq('activa', true)
    .order('pilar', { ascending: true })
    .order('titulo', { ascending: true });
  if (error) { console.error(error); return []; }
  return data || [];
}

/**
 * Crea una plantilla de sesión. `club` debe ser el club del usuario autenticado:
 * la política RLS "Insertar Sesiones" solo permite a owner/coach insertar filas
 * con club_id = su propio club (club_id NULL queda reservado a superadmin, que es
 * como se sembraron las 7 plantillas globales de la migración v21).
 */
export async function crearPlantilla({ titulo, enfoque_principal = null, descripcion = null, pilar = null, sub_pilar = null, tipo_clase = null, ejercicios_ids = [], creado_por, club }) {
  const { data, error } = await supabase
    .from('catalogo_sesiones')
    .insert({
      titulo,
      enfoque_principal,
      descripcion,
      pilar,
      sub_pilar,
      tipo_clase,
      ejercicios_ids,
      creado_por,
      club_id: club || null,
      activa: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
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
