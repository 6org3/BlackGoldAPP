// src/api/coachesService.js
// Ranking de coaches del club — Black Gold (panel del dueño, D4 · Equipo técnico).
//
// Invoca la función SECURITY DEFINER fn_coach_stats (migración v31), que agrega
// asistencia % (pases de lista Presente/total), nº de sesiones dictadas y XP
// repartido (xp_eventos) por coach del club del usuario en los últimos p_dias, y
// la mapea a la forma que consume duenoSelectors.ctxEquipo vía duenoData.coaches.
// Ver duenoMock.js (DUENO_MOCK.coaches) para la forma exacta.

import { supabase } from './supabaseClient';

// Paleta de acentos por posición (fn_coach_stats no devuelve color); se asigna
// por índice del ranking, de forma estable dentro de una misma carga.
const HUES = ['gold', 'blue', 'green', 'cyan', 'orange', 'red'];

/**
 * Ranking de coaches del club para el panel del dueño.
 * @param {number} [dias=30] Ventana de días hacia atrás.
 * @returns {Promise<Array<{id:string, initial:string, hue:string, name:string,
 *   cats:string, asist:number, ses:number, xp:number}>>} Filas mapeadas, o []
 *   si la RPC falla / no hay permiso / migración sin aplicar (el panel degrada
 *   a DUENO_MOCK.coaches).
 */
export async function fetchCoachStats(dias = 30) {
  const { data, error } = await supabase.rpc('fn_coach_stats', { p_dias: dias });
  if (error || !Array.isArray(data)) return [];
  return data.map((r, i) => ({
    id: r.coach_id,
    initial: (r.nombre || '?').charAt(0).toUpperCase(),
    hue: HUES[i % HUES.length],
    name: r.nombre || 'Coach',
    cats: '—', // fn_coach_stats no devuelve categorías — TODO: lookup por grupos del coach.
    // Numéricos: el selector ordena por estos campos y normaliza celdas al máximo.
    asist: Number(r.asistencia_pct) || 0,
    ses: Number(r.sesiones) || 0,
    xp: Number(r.xp) || 0,
  }));
}

// ============================
// EQUIPO TÉCNICO (v35) — el dueño da de alta a los coaches de su club
// ============================
// Un coach NO tiene tabla propia: es una fila de `usuarios` con rol='coach' +
// una cuenta de Auth. La RLS scopea la lectura al club del staff que consulta
// (usuarios_select, v24) y la escritura la limita a owner/superadmin
// (usuarios_insert, v35) — aquí no se re-implementa ese gate, solo se evita
// ofrecer lo que el servidor rechazaría.

// Alcance del coach: `usuarios.categoria` se compara contra `categoria_feb` del
// atleta (atletasService, brainAuth). 'Todas' (o vacío) = el club entero. Es
// texto sin CHECK: un valor fuera de esta lista dejaría al coach sin ver a
// nadie, por eso la UI lo ofrece como select cerrado.
export const CATEGORIAS_COACH = [
  'Todas',
  'Premini (Sub-9)', 'Mini (Sub-11)', 'Menores (Sub-14)',
  'Prejuvenil (Sub-16)', 'Juvenil (Sub-18)', 'Mayores',
];

// El club va explícito y no se hereda de la RLS: para un owner el resultado es
// el mismo (usuarios_select ya lo scopea), pero un SUPERADMIN lee la tabla
// entera — sin este filtro vería los coaches de todos los clubes mezclados
// bajo el rótulo de uno solo.
export async function fetchCoachesDelClub(club) {
  let query = supabase
    .from('usuarios')
    .select('id, cedula, nombre, correo, telefono, categoria, club, estado, auth_user_id, created_at')
    .eq('rol', 'coach')
    .order('nombre');
  if (club) query = query.eq('club', club);
  const { data, error } = await query;
  if (error) throw new Error('No se pudo cargar el equipo técnico: ' + error.message);
  return (data || []).map((c) => ({
    ...c,
    // Sin cuenta de Auth no puede iniciar sesión: la UI lo señala y ofrece
    // reintentar la creación del acceso.
    tieneAcceso: !!c.auth_user_id,
  }));
}

// `club` es el club de trabajo de la pantalla: el del propio owner (la RLS
// exige que coincida con current_user_club()) o el que el superadmin eligió en
// el select. Cambiarlo después es imposible salvo superadmin (trigger v34), así
// que hay que acertar aquí.
export async function crearCoach({ cedula, nombre, correo, telefono, categoria }, club) {
  if (!club) throw new Error('Selecciona el club del coach.');
  const { data, error } = await supabase
    .from('usuarios')
    .insert({
      cedula: cedula?.trim() || null,
      nombre: nombre?.trim(),
      correo: correo?.trim() || null,
      telefono: telefono?.trim() || null,
      rol: 'coach',
      club,
      categoria: categoria || 'Todas',
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Solo datos de perfil: rol/club/estado no se tocan por aquí (el trigger v34 y
// cambiarEstadoCoach los gobiernan).
export async function actualizarCoach(usuarioId, { nombre, correo, telefono, categoria }) {
  const { error } = await supabase
    .from('usuarios')
    .update({
      nombre: nombre?.trim(),
      correo: correo?.trim() || null,
      telefono: telefono?.trim() || null,
      categoria: categoria || 'Todas',
    })
    .eq('id', usuarioId);
  if (error) throw new Error(error.message);
  return { success: true };
}

// Retirar/reincorporar a un coach. No se borra: sus FKs (asistencia,
// sesiones_control) son RESTRICT y su historial debe sobrevivir. 'inactivo'
// (v35) le corta el acceso — PrivateRoute solo deja pasar 'activo'.
export async function cambiarEstadoCoach(usuarioId, activo) {
  const { error } = await supabase
    .from('usuarios')
    .update({ estado: activo ? 'activo' : 'inactivo' })
    .eq('id', usuarioId);
  if (error) throw new Error(error.message);
  return { success: true };
}
