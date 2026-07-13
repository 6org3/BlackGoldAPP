// src/api/sesionesService.js
import { supabase } from './supabaseClient';
import { xpBaseSesion } from '../../../packages/analytics-core/xp.js';
import { otorgarXP } from './xpService';
import { TABLA_EJERCICIOS_ENTRENAMIENTO, TABLA_PRUEBAS_EVALUACION } from './tablas';

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

// ============================
// EVALUACIONES GRUPALES (fase P3b): sesiones de evaluación con pruebas
// específicas para un grupo. pruebas_ids NO NULL en sesiones_programadas es el
// discriminador de que la sesión es una evaluación (migración v23).
// ============================

/** Catálogo de PRUEBAS de evaluación (catalogo_ejercicios — no confundir con
 *  ejercicios_catalogo, el de entrenamiento; ver src/api/tablas.js). */
export async function fetchPruebasEvaluacion() {
  const { data, error } = await supabase
    .from(TABLA_PRUEBAS_EVALUACION)
    .select('*')
    .order('sub_pilar', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) { console.error(error); return []; }
  return data || [];
}

/**
 * Programa una sesión de evaluación (futura o de hoy) para un grupo o un atleta.
 * hora_inicio/hora_fin quedan en '00:00:00' hasta que el coach la INICIE en el
 * Modo Cancha (ahí se estampan la hora real y el marker [EN_CURSO]).
 */
export async function programarEvaluacionGrupal({ coach_id, fecha, grupo_id = null, atleta_id = null, pruebas_ids }) {
  const { data, error } = await supabase
    .from('sesiones_programadas')
    .insert({
      coach_id,
      fecha,
      hora_inicio: '00:00:00',
      hora_fin: '00:00:00',
      estado: 'Programada',
      tipo: atleta_id ? 'Individual' : 'Grupal',
      grupo_id,
      atleta_id,
      pruebas_ids,
      notas: 'Evaluación programada',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Evaluaciones programadas de HOY del coach que aún no se iniciaron
 *  (sin marker [EN_CURSO] — ese se estampa al iniciarlas en cancha). */
export async function fetchEvaluacionesProgramadasHoy(coachId) {
  const hoy = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('sesiones_programadas')
    .select('*, grupos_entrenamiento (nombre)')
    .eq('coach_id', coachId)
    .eq('fecha', hoy)
    .eq('estado', 'Programada')
    .not('pruebas_ids', 'is', null)
    .not('notas', 'ilike', '[EN_CURSO]%');
  if (error) { console.error(error); return []; }
  return data || [];
}

/** Sesiones PLANIFICADAS de hoy del coach (hero "Hoy" del home). Vienen de
 *  sesiones_control — la agenda que crea AdminSesiones — no de
 *  sesiones_programadas, que solo recibe filas al iniciar Modo Cancha o
 *  programar evaluaciones. */
export async function fetchSesionesPlanificadasHoy(coachId) {
  const hoy = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('sesiones_control')
    .select('*, grupos_entrenamiento (nombre, horario)')
    .eq('coach_id', coachId)
    .eq('fecha', hoy)
    .order('created_at', { ascending: true });
  if (error) { console.error(error); return []; }
  return data || [];
}

/** Sesiones en curso del coach (marker [EN_CURSO] estampado por Modo Cancha).
 *  Fuente única de la query que antes duplicaban Sidebar y ModoCanchaModal. */
export async function fetchSesionesEnCurso(coachId) {
  const { data, error } = await supabase
    .from('sesiones_programadas')
    .select('*')
    .eq('coach_id', coachId)
    .eq('estado', 'Programada')
    .ilike('notas', '[EN_CURSO]%');
  if (error) { console.error(error); return []; }
  return data || [];
}

// `club`: sin filtro de club en el select, la fila devuelta depende
// enteramente de RLS para no mezclar grupos de otros clubes — se filtra
// también acá como defensa en profundidad (mismo criterio que
// fetchTodosLosAtletas en atletasService.js).
export async function fetchGrupos(club = null) {
  let query = supabase
    .from('grupos_entrenamiento')
    .select('*')
    .order('nombre');
  if (club) {
    query = query.eq('club', club);
  }
  const { data, error } = await query;
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
    if (xpBase > 0) await otorgarXP(data.atleta_id, xpBase, {}, { coachId: data.coach_id ?? null, motivo: 'Evaluación de sesión', origen: 'sesiones_control' });
  }

  return data;
}

// Lanza si la consulta falla: devolver [] aquí sería indistinguible de "sin
// sesiones registradas todavía" (auditoría UX owner 2026-07-09) — quien
// llama decide cómo mostrar el error, en vez de que el historial se vea
// silenciosamente vacío.
export async function fetchSesionesControl({ grupoId = null, atletaId = null, limit = 20 } = {}) {
  let q = supabase
    .from('sesiones_control')
    .select(`
      *,
      grupos_entrenamiento (nombre, horario),
      atletas (id, usuarios!inner!atletas_usuario_id_fkey(nombre))
    `)
    .order('fecha', { ascending: false })
    .limit(limit);
  if (grupoId) q = q.eq('grupo_id', grupoId);
  if (atletaId) q = q.eq('atleta_id', atletaId);
  const { data, error } = await q;
  if (error) { console.error(error); throw error; }
  return data || [];
}
