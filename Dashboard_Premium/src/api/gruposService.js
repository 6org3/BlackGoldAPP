// src/api/gruposService.js
// Gestión de grupos de entrenamiento (v37: nivel / es_principal / activo).
//
// Punto de entrada de las ESCRITURAS sobre grupos_entrenamiento — antes no
// existía ninguna: los grupos solo se creaban a mano en la base o por seed.
// La RLS ya lo permite (grupos_write, v29: staff del propio club), así que aquí
// no hay que forzar nada de permisos; lo que se añade son las reglas que la RLS
// no sabe expresar (precio explícito, retirar archivando) y errores legibles.
//
// Deuda conocida: las LECTURAS siguen repartidas (fetchGrupos en
// sesionesService, fetchGruposClub en pagosService). Unificarlas aquí toca 5
// consumidores y se deja para su propio PR.

import { supabase } from './supabaseClient';

export const NIVELES_GRUPO = ['Micro', 'Desarrollo', 'Elite'];

/**
 * Grupos del club con su ocupación real.
 *
 * `atleta_grupo(count)` lo resuelve PostgREST en la misma consulta: la
 * pertenencia vive en esa tabla, no en la columna denormalizada
 * `atletas.grupo_id` (que es lo que se factura, no quién entrena).
 */
export async function fetchGruposConOcupacion(club = null, { incluirArchivados = false } = {}) {
  let query = supabase
    .from('grupos_entrenamiento')
    .select('id, nombre, club, nivel, es_principal, activo, horario, hora_inicio, hora_fin, dias_semana, descripcion, precio_mensual, precio_sesion_ind, cupo_max, atleta_grupo(count)')
    .order('es_principal', { ascending: false })
    .order('nombre');

  // Defensa en profundidad: la RLS ya scopea por club, se filtra igual (mismo
  // criterio que fetchTodosLosAtletas).
  if (club) query = query.eq('club', club);
  if (!incluirArchivados) query = query.eq('activo', true);

  const { data, error } = await query;
  if (error) {
    console.error('[gruposService] fetchGruposConOcupacion:', error);
    throw error;
  }
  return (data || []).map(({ atleta_grupo, ...g }) => ({
    ...g,
    inscritos: atleta_grupo?.[0]?.count ?? 0,
  }));
}

/**
 * Crea un grupo. `precio_mensual` es obligatorio a propósito: v37 quitó el
 * DEFAULT 30.00 justo para que nadie herede un precio que no escribió, y el
 * generador mensual cobra por cron sin intervención humana.
 */
export async function crearGrupo({ nombre, club, nivel = null, es_principal = false, horario, dias_semana = null, precio_mensual, cupo_max = null, descripcion = '' }) {
  if (!nombre?.trim()) throw new Error('El grupo necesita un nombre.');
  if (!horario?.trim()) throw new Error('El grupo necesita un horario.');
  if (precio_mensual === '' || precio_mensual == null || Number.isNaN(Number(precio_mensual))) {
    throw new Error('Escribe el precio mensual. Un grupo sin precio no factura, y uno con precio equivocado cobra de más.');
  }
  if (es_principal && !nivel) throw new Error('Un grupo principal debe declarar su nivel (Micro, Desarrollo o Elite).');

  const { data, error } = await supabase
    .from('grupos_entrenamiento')
    .insert({
      nombre: nombre.trim(),
      club,
      nivel,
      es_principal,
      horario: horario.trim(),
      dias_semana,
      precio_mensual: Number(precio_mensual),
      cupo_max: cupo_max === '' || cupo_max == null ? null : Number(cupo_max),
      descripcion,
    })
    .select()
    .single();

  if (error) throw new Error(traducirError(error, nombre));
  return data;
}

export async function actualizarGrupo(id, patch) {
  if ('precio_mensual' in patch) {
    if (patch.precio_mensual === '' || patch.precio_mensual == null || Number.isNaN(Number(patch.precio_mensual))) {
      throw new Error('El precio mensual no puede quedar vacío.');
    }
    patch = { ...patch, precio_mensual: Number(patch.precio_mensual) };
  }
  if (patch.es_principal && !patch.nivel) {
    throw new Error('Un grupo principal debe declarar su nivel (Micro, Desarrollo o Elite).');
  }
  const { data, error } = await supabase
    .from('grupos_entrenamiento')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(traducirError(error, patch.nombre));
  return data;
}

/**
 * Archivar / reactivar. Es la vía normal de retirar un grupo: el FK de
 * atletas.grupo_id NO tiene ON DELETE a propósito (v37 §4) — borrar un grupo
 * con atletas dentro dejaría a sus familias facturando la tarifa genérica de
 * $30 en la siguiente corrida del cron.
 */
export async function archivarGrupo(id, activo = false) {
  const { data, error } = await supabase
    .from('grupos_entrenamiento')
    .update({ activo })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(traducirError(error));
  return data;
}

/**
 * Borrado real. Solo tiene sentido en un grupo recién creado por error: en
 * cuanto tenga atletas, sesiones, comunicaciones o tarifas, la base lo impide
 * (y ese rechazo es deseable — protege el histórico y la facturación).
 */
export async function eliminarGrupo(id) {
  const { error } = await supabase.from('grupos_entrenamiento').delete().eq('id', id);
  if (error) throw new Error(traducirError(error));
  return true;
}

// ─── Membresía del atleta (v38) ─────────────────────────────────────────────
// `atleta_grupo.rol_membresia` dice qué es cada grupo PARA EL ATLETA: la
// `basica` (una sola, la que factura su mensualidad) y N `adicional` (add-ons
// que se cobran aparte). `atletas.grupo_id` es una caché derivada de la básica:
// NO se escribe desde aquí — la mantiene el trigger espejo.

/** Los grupos de un atleta, separados por rol. */
export async function fetchMembresiaAtleta(atletaId) {
  const { data, error } = await supabase
    .from('atleta_grupo')
    .select('grupo_id, rol_membresia, facturable, grupos_entrenamiento (id, nombre, nivel, es_principal, activo, horario, precio_mensual)')
    .eq('atleta_id', atletaId);
  if (error) {
    console.error('[gruposService] fetchMembresiaAtleta:', error);
    throw error;
  }
  const filas = (data || [])
    .filter((v) => v.grupos_entrenamiento)
    .map((v) => ({ ...v.grupos_entrenamiento, rol_membresia: v.rol_membresia, facturable: v.facturable }));
  return {
    basica: filas.find((f) => f.rol_membresia === 'basica') || null,
    adicionales: filas.filter((f) => f.rol_membresia === 'adicional'),
  };
}

/**
 * Asigna el grupo básico. Pasa por la RPC y no por un INSERT directo: valida lo
 * que la RLS no sabe expresar (que sea un principal activo, y el cupo) y
 * sustituye la básica anterior en una sola operación.
 */
export async function asignarGrupoBasico(atletaId, grupoId) {
  const { error } = await supabase.rpc('asignar_grupo_basico', {
    p_atleta_id: atletaId,
    p_grupo_id: grupoId,
  });
  if (error) throw new Error(traducirError(error));
  return true;
}

/** Alta/baja de un grupo extra (add-on). */
export async function setGrupoAdicional(atletaId, grupoId, activo, facturable = true) {
  const { error } = await supabase.rpc('set_grupo_adicional', {
    p_atleta_id: atletaId,
    p_grupo_id: grupoId,
    p_activo: activo,
    p_facturable: facturable,
  });
  if (error) throw new Error(traducirError(error));
  return true;
}

// Los códigos de Postgres no se le enseñan al dueño de un club.
function traducirError(error, nombre = '') {
  const msg = error?.message || '';
  if (error?.code === '23505' || msg.includes('duplicate key')) {
    if (msg.includes('grupos_principal_club_nivel_key')) {
      return 'Tu club ya tiene un grupo principal de ese nivel. Solo puede haber uno de cada (Micro, Desarrollo y Elite); los demás son grupos extra.';
    }
    return `Ya existe un grupo llamado "${nombre || 'ese'}" en tu club. Ponle otro nombre.`;
  }
  if (error?.code === '23503' || msg.includes('violates foreign key')) {
    return 'No se puede eliminar: el grupo ya tiene atletas o historial (sesiones, comunicaciones o cobros). Archívalo en vez de borrarlo — así conservas el histórico y nadie deja de facturar por error.';
  }
  if (msg.includes('grupos_principal_nivel_check')) {
    return 'Un grupo principal debe declarar su nivel (Micro, Desarrollo o Elite).';
  }
  if (msg.includes('grupos_nivel_check')) {
    return 'El nivel debe ser Micro, Desarrollo o Elite.';
  }
  if (msg.includes('grupos_precio_check')) {
    return 'El precio mensual no puede ser negativo.';
  }
  if (error?.code === '42501' || msg.includes('row-level security')) {
    return 'No tienes permiso para gestionar los grupos de este club.';
  }
  return msg || 'No se pudo completar la operación.';
}
