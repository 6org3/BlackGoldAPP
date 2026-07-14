// src/api/solicitudesService.js
import { supabase } from './supabaseClient';

// ============================
// SOLICITUDES DE REGISTRO (v33)
// ============================
// El registro público deja al atleta (y a su representante nuevo) con
// usuarios.estado = 'pendiente'. La bandeja del owner lista esos pendientes
// de su club (RLS scopea usuarios/padres_atletas por club; superadmin ve
// todos) y resuelve con la RPC resolver_solicitud_registro, que es quien
// valida server-side que el caller sea owner/superadmin del club correcto.

export const fetchSolicitudesPendientes = async () => {
  const { data: pendientes, error } = await supabase
    .from('usuarios')
    .select(`
      id, cedula, nombre, correo, telefono, fecha_nacimiento, genero, club, created_at,
      atletas!atletas_usuario_id_fkey ( id, posicion )
    `)
    .eq('rol', 'atleta')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true });
  if (error) throw new Error('No se pudieron cargar las solicitudes: ' + error.message);

  const filas = (pendientes || []).map((u) => ({
    ...u,
    atleta_id: u.atletas?.[0]?.id ?? null,
    posicion: u.atletas?.[0]?.posicion ?? null,
    padre: null,
  }));

  // Representante vinculado (si el registro lo incluyó).
  const atletaIds = filas.map((f) => f.atleta_id).filter(Boolean);
  if (atletaIds.length > 0) {
    const { data: vinculos } = await supabase
      .from('padres_atletas')
      .select('atleta_id, usuarios!padres_atletas_padre_id_fkey ( id, nombre, telefono, estado )')
      .in('atleta_id', atletaIds);
    const padrePorAtleta = {};
    (vinculos || []).forEach((v) => {
      if (v.usuarios && !padrePorAtleta[v.atleta_id]) padrePorAtleta[v.atleta_id] = v.usuarios;
    });
    filas.forEach((f) => { f.padre = padrePorAtleta[f.atleta_id] ?? null; });
  }

  return filas;
};

// accion: 'aprobar' | 'rechazar'. Aprueba/rechaza también a los padres
// pendientes vinculados (el rechazo de un padre solo si no le queda otro
// hijo activo/pendiente) — lógica server-side en la RPC.
export const resolverSolicitud = async (usuarioId, accion) => {
  const { data, error } = await supabase.rpc('resolver_solicitud_registro', {
    p_usuario_id: usuarioId,
    p_accion: accion,
  });
  if (error) throw new Error(error.message);
  return data;
};

// Contador para badges (home del dueño). head: true no descarga filas.
export const contarSolicitudesPendientes = async () => {
  const { count, error } = await supabase
    .from('usuarios')
    .select('id', { count: 'exact', head: true })
    .eq('rol', 'atleta')
    .eq('estado', 'pendiente');
  if (error) {
    console.error('Error contando solicitudes pendientes:', error);
    return 0;
  }
  return count ?? 0;
};
