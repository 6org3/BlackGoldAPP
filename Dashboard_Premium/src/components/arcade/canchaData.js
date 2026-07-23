/* ============================================================
   Capa de datos del Modo Cancha Arcade (fase 5 — Supabase real).

   Envuelve los MISMOS servicios/lógica probados por ModoCanchaModal, para
   no reinventar el flujo de datos. Convención de identidades crítica:
     - user.id            = usuarios.id  → coach_id en TODAS las escrituras
     - atleta.id (Arcade) = atletas.id   → clave de asistencia/eval/XP
   El objeto atleta Arcade usa `id = atletas.id` a propósito, para que
   present/scores/destacados (keyed por ese id) escriban directo sin remapear.

   Flujo Arcade = subjetivo: escribe observaciones_cancha + XP (asistencia +
   evaluación + insignias). NO mueve overall_score/rango (eso es el pipeline
   de pruebas objetivas, fuera del alcance de este flujo — igual que el modal).
   ============================================================ */
import { supabase } from '../../api/supabaseClient';
import { fetchTodosLosAtletas } from '../../api/atletasService';
import { upsertAsistencia } from '../../api/asistenciaService';
import { crearSesionEntrenamiento } from '../../api/sesionesEntrenamientoService';
import { insertarObservacion } from '../../api/observacionesService';
import { otorgarXP } from '../../api/xpService';
import { fetchSesionesPlanificadasHoy, fetchPlantillas, fetchEjercicios } from '../../api/sesionesService';
import { xpBaseSesion, xpEvaluacion } from '../../../../packages/analytics-core/xp.js';

// Eje Arcade → columna de observaciones_cancha + insignia (umbral 5★). El XP de
// la evaluación lo calcula xpEvaluacion (analytics-core), no una tabla local (#7).
const AXIS_DB = {
  fisico: { col: 'esfuerzo', insignia: 'Motor Inagotable' },
  actitud: { col: 'actitud', insignia: 'Mamba Mentality' },
  foco: { col: 'foco', insignia: 'Sangre Fría' },
  equipo: { col: 'trabajo_equipo', insignia: 'Líder' },
};

/** Deriva hue + alerta de readiness/estado (cosmético). */
function deriveHue(a) {
  const est = (a.estado_recuperacion || '').toLowerCase();
  const r = a.readiness_hoy || null;
  if (est.includes('sobre') || est.includes('agot')) return { hue: 'red', alert: '▲▲ Sobreent.' };
  if (est.includes('fatiga')) return { hue: 'orange', alert: '● Fatiga silenciosa' };
  if (r && (r.hidratacion === false || r.hidratacion_baja || (typeof r.hidratacion === 'number' && r.hidratacion <= 2)))
    return { hue: 'gold', alert: '💧 Hidratación' };
  const ov = a.overall_score || 0;
  if (ov >= 75) return { hue: 'green', alert: undefined };
  return { hue: 'blue', alert: undefined };
}

/** Fila de atleta (fetchTodosLosAtletas) → shape que consume la UI Arcade. */
export function mapAtleta(a) {
  return {
    id: a.atleta_id, // atletas.id — clave de escritura
    usuarioId: a.id,
    name: a.nombre || 'Atleta',
    pos: a.posicion || '—',
    cedula: a.cedula || '', // búsqueda 1v1 por cédula (#9)
    pwr: a.overall_score || 0,
    nivel: a.nivel_desarrollo || 'Desarrollo',
    categoria: a.categoria || null,
    ...deriveHue(a),
  };
}

/** Roster del coach (scoping server-side por club/categoría). Array plano. */
export async function fetchRoster(user) {
  const res = await fetchTodosLosAtletas(user);
  const list = Array.isArray(res) ? res : res?.data || [];
  return list.map(mapAtleta).filter((a) => a.id);
}

const hhmm = (t) => (t || '00:00:00').slice(0, 5);

/** Sesiones activas del coach ([EN_CURSO] + estado Programada) con present count. */
export async function fetchActiveSessions(user) {
  const { data, error } = await supabase
    .from('sesiones_programadas')
    .select('*')
    .eq('coach_id', user.id)
    .eq('estado', 'Programada')
    .ilike('notas', '[EN_CURSO]%');
  if (error || !data?.length) return [];

  // Present count por sesión en una sola query de asistencia.
  const ids = data.map((s) => s.id);
  const { data: asis } = await supabase
    .from('asistencia')
    .select('sesion_id, estado')
    .in('sesion_id', ids)
    .eq('estado', 'Presente');
  const presentBy = {};
  (asis || []).forEach((r) => {
    presentBy[r.sesion_id] = (presentBy[r.sesion_id] || 0) + 1;
  });

  return data.map((s) => mapSession(s, presentBy[s.id] || 0));
}

/** Fila de sesiones_programadas → sesión Arcade (elapsed derivado de hora_inicio). */
export function mapSession(s, present = 0) {
  const label = (s.notas || '').replace('[EN_CURSO]', '').trim() || s.tipo || 'Sesión';
  // Inicio real desde la fecha+hora guardadas (no HOY): así el cronómetro no se
  // resetea al cruzar medianoche ni pierde sesiones de días anteriores (#6).
  const horaStr = s.hora_inicio || '00:00:00';
  let inicio;
  if (s.fecha) {
    inicio = new Date(`${String(s.fecha).slice(0, 10)}T${horaStr}`);
  } else {
    const [h, m, sec] = horaStr.split(':').map(Number);
    inicio = new Date();
    inicio.setHours(h || 0, m || 0, sec || 0, 0);
  }
  const elapsed = Math.max(0, Math.floor((Date.now() - inicio.getTime()) / 1000));
  return {
    id: s.id,
    label,
    block: s.pilar_objetivo || s.tipo || '—',
    start: hhmm(s.hora_inicio),
    elapsed,
    present,
    hue: 'gold',
    evaluable: true,
    notas: s.notas || label,
    // Crudos de la plantilla persistida (v49) — la plantilla resuelta (título +
    // drills) la reconstruye el hook, que tiene el ejerciciosMap + índice vivos.
    ejerciciosIds: Array.isArray(s.ejercicios_ids) ? s.ejercicios_ids : null,
    plantillaId: s.plantilla_id || null,
  };
}

/**
 * Reconstruye la plantilla de una sesión reanudada a partir de sus crudos
 * persistidos (v49) → { id, titulo, drills } | null. Los drills salen del
 * SNAPSHOT `ejerciciosIds` (inmutable) resuelto contra el catálogo vivo; el
 * título se busca en el índice de plantillas actuales y cae a genérico si la
 * plantilla fue editada/borrada. Sin ids o sin drills resolubles → null (el
 * panel PLAN DE SESIÓN simplemente no se pinta).
 */
export function reconstruirPlantillaSesion(sess, plantillasIndex, ejerciciosMap) {
  const ids = sess?.ejerciciosIds;
  if (!Array.isArray(ids) || !ids.length) return null;
  const drills = resolveDrills(ids, ejerciciosMap);
  if (!drills.length) return null;
  const titulo = plantillasIndex?.get?.(sess.plantillaId)?.titulo || 'Plan de sesión';
  return { id: sess.plantillaId || null, titulo, drills };
}

/**
 * Asistencia guardada de una sesión (para REANUDAR una sesión abierta desde el
 * landing): { [atletaId]: 'P' | 'A' }. Así el cierre puede otorgar XP base a los
 * presentes aunque no se haya pasado lista en este flujo.
 */
export async function fetchSessionAttendance(sesionId) {
  const { data } = await supabase.from('asistencia').select('atleta_id, estado').eq('sesion_id', sesionId);
  const present = {};
  (data || []).forEach((r) => {
    if (r.estado === 'Presente') present[r.atleta_id] = 'P';
    else if (r.estado === 'Ausente') present[r.atleta_id] = 'A';
  });
  return present;
}

/** Sesiones planificadas de hoy (agenda de AdminSesiones) para el landing. */
export async function fetchPlannedToday(user) {
  const rows = await fetchSesionesPlanificadasHoy(user.id).catch(() => []);
  return (rows || []).map((s) => {
    const grupo = s.grupos_entrenamiento?.nombre;
    const esIndividual = s.tipo === 'Individual' || !grupo;
    return {
      id: s.id,
      label: `${esIndividual ? 'Individual' : grupo} · ${s.objetivo_tipo || 'Sesión'}`,
      sub: s.grupos_entrenamiento?.horario || s.objetivo_descripcion || '',
    };
  });
}

/**
 * Plantillas de sesión (catalogo_sesiones) para el paso "Objetivo" de Modo
 * Cancha. NO se filtra por club: la RLS v24 ya scopea las filas del club, y las
 * 8 semillas globales tienen club_id NULL — un .eq('club_id', …) las ocultaría.
 * `ejercicios_ids` es jsonb → llega como array JS (sin JSON.parse).
 */
export async function fetchPlantillasCancha() {
  const rows = await fetchPlantillas();
  return (rows || []).map((p) => ({
    id: p.id,
    titulo: p.titulo,
    pilar: p.pilar,
    sub_pilar: p.sub_pilar,
    enfoque: p.enfoque_principal,
    ejerciciosIds: p.ejercicios_ids || [],
  }));
}

/** Mapa id → { nombre, tipo } del catálogo de drills (ejercicios_catalogo). */
export async function fetchEjerciciosMap() {
  const ejercicios = await fetchEjercicios();
  return new Map((ejercicios || []).map((e) => [e.id, { nombre: e.nombre, tipo: e.tipo }]));
}

/**
 * Resuelve una lista de ids de ejercicios contra el mapa del catálogo →
 * [{ nombre, tipo }]. Filtra ids huérfanos (que ya no existen en el catálogo).
 */
export function resolveDrills(ejerciciosIds, map) {
  if (!Array.isArray(ejerciciosIds) || !map) return [];
  return ejerciciosIds.map((id) => map.get(id)).filter(Boolean);
}

/** Agrupa drills resueltos por `tipo` → [[tipo, drills[]], …] (para la UI). */
export function agruparDrillsPorTipo(drills) {
  const grupos = new Map();
  (drills || []).forEach((d) => {
    const key = d.tipo || 'Otros';
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(d);
  });
  return [...grupos.entries()];
}

// Etiqueta legible del tipo (para notas — la columna `tipo` solo acepta Grupal|Individual).
function labelTipo(classType, level) {
  if (classType === '1v1') return 'Privada 1v1';
  if (classType === 'indiv') return 'Grupal Individualizada';
  if (classType === 'eval') return 'Evaluación Grupal';
  return `Grupal (Niveles) - ${level || 'Micro'}`;
}

/**
 * Crea la sesión en curso: inserta en sesiones_programadas + asistencia
 * (upsert por atleta marcado) + historial (crearSesionEntrenamiento por
 * presente). Devuelve la sesión Arcade lista para enfocar.
 */
export async function startSession({ user, classType, level, present, roster, focusName, plantilla = null }) {
  const ahora = new Date();
  const horaStr = ahora.toTimeString().split(' ')[0]; // HH:MM:SS (local)
  // Fecha en hora LOCAL (Ecuador UTC-5), no UTC: cerca de medianoche toISOString
  // daría el día siguiente y descuadraría fecha vs hora y el filtro por día (#6).
  const fechaStr = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  const tipoStr = labelTipo(classType, level);
  const tipoDB = classType === '1v1' ? 'Individual' : 'Grupal';
  const notasStr = `[EN_CURSO] ${tipoStr}`;
  // La RLS de sesiones_programadas (v29) exige atleta_id O grupo_id del club del
  // coach. El flujo Arcade no elige grupo, así que anclamos la sesión al primer
  // presente (siempre en el club del coach) — la asistencia real va por atleta en
  // la tabla `asistencia`; este atleta_id solo scopea la fila para la RLS.
  const ancla = roster.find((a) => present[a.id] === 'P') || null;

  const { data: sesion, error } = await supabase
    .from('sesiones_programadas')
    .insert({
      coach_id: user.id,
      atleta_id: ancla ? ancla.id : null,
      fecha: fechaStr,
      hora_inicio: horaStr,
      hora_fin: horaStr,
      estado: 'Programada',
      tipo: tipoDB,
      pilar_objetivo: plantilla?.sub_pilar || plantilla?.pilar || null,
      pruebas_ids: null,
      // Persistimos la plantilla (v49) para que el panel PLAN DE SESIÓN
      // reaparezca al reanudar: snapshot de drills + referencia para el título.
      ejercicios_ids: plantilla?.ejerciciosIds?.length ? plantilla.ejerciciosIds : null,
      plantilla_id: plantilla?.id || null,
      notas: notasStr,
    })
    .select()
    .single();
  if (error) throw error;

  const marked = roster.filter((a) => present[a.id]);
  await Promise.all([
    ...marked.map((a) =>
      upsertAsistencia({
        atleta_id: a.id,
        coach_id: user.id,
        fecha: fechaStr,
        estado: present[a.id] === 'P' ? 'Presente' : 'Ausente',
        notas: tipoStr,
        sesion_id: sesion.id,
      }),
    ),
    ...marked
      .filter((a) => present[a.id] === 'P')
      .map((a) =>
        crearSesionEntrenamiento({
          atleta_id: a.id,
          pilar_objetivo: '',
          volumen_series_reps: '',
          notas: tipoStr,
          eva_registro: 0,
        }),
      ),
  ]);

  const presentCount = marked.filter((a) => present[a.id] === 'P').length;
  const label = classType === '1v1' && focusName ? `1v1 · ${focusName}` : 'Sub-16 · Físico';
  return {
    id: sesion.id,
    label,
    block: level || (classType === '1v1' ? '1v1' : 'Sesión'),
    start: hhmm(horaStr),
    elapsed: 0,
    present: presentCount,
    hue: 'gold',
    evaluable: true,
    notas: notasStr,
    plantilla: plantilla || null, // con drills ya resueltos (los resuelve la pantalla al elegir)
  };
}

/**
 * Evaluación subjetiva de un atleta: observaciones_cancha (ratings ×2 → 0-10)
 * + insignias (labels a 5★) + XP (suma de ejes ×5 + bono de insignias).
 * Devuelve { xpGanada, insignias }.
 */
export async function saveSubjectiveEval({ user, atletaId, scores }) {
  const cols = {};
  const labels = [];
  Object.entries(AXIS_DB).forEach(([axis, def]) => {
    const v = scores?.[axis] || 0;
    cols[def.col] = v * 2; // 1-5 → 0-10 (CHECK de la columna)
    if (v === 5) labels.push(def.insignia);
  });
  // FUENTE ÚNICA de XP de evaluación — idéntica a la que muestra el cierre (#7).
  const xpGanada = xpEvaluacion(scores);

  await insertarObservacion({
    atleta_id: atletaId,
    coach_id: user.id,
    ...cols,
    insignia: labels.length ? labels.join(', ') : null,
    xp_ganada: xpGanada,
    notas: 'Evaluación Modo Cancha',
  });
  await otorgarXP(atletaId, xpGanada, {}, { coachId: user.id, motivo: 'Evaluación Modo Cancha', origen: 'observaciones_cancha' });
  return { xpGanada, insignias: labels };
}

/**
 * Cierra la clase: otorga XP base de asistencia a cada presente (xpBaseSesion
 * según el tipo/nivel embebido en notas) y marca la sesión Completada.
 */
export async function closeClass({ user, session, presentAtletaIds }) {
  const baseXP = xpBaseSesion(session?.notas || '');
  await Promise.all(presentAtletaIds.map((id) => otorgarXP(id, baseXP, {}, { coachId: user.id, motivo: 'Asistencia a sesión', origen: 'modo_cancha' })));
  const notasLimpias = (session?.notas || '').replace('[EN_CURSO]', '').trim();
  await supabase.from('sesiones_programadas').update({ estado: 'Completada', notas: notasLimpias }).eq('id', session.id);
  return { baseXP, count: presentAtletaIds.length };
}
