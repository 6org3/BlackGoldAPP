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

// ============================
// CUENTAS RECHAZADAS (v45)
// ============================
// Rechazar una solicitud (arriba) deja usuarios.estado='rechazado' PARA
// SIEMPRE — usuarios.cedula es UNIQUE, así que esa cédula queda bloqueada
// para cualquier reintento de registro. Esta bandeja (solo superadmin, RLS
// usuarios_select de v24/v29 ya deja leer cross-club) permite "liberar" la
// cédula purgando la cuenta por completo, vía purgarUsuarioRechazado.
export const fetchUsuariosRechazados = async () => {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, cedula, nombre, correo, telefono, rol, club, created_at')
    .eq('estado', 'rechazado')
    .order('created_at', { ascending: true });
  if (error) throw new Error('No se pudieron cargar las cuentas rechazadas: ' + error.message);
  return data || [];
};

// Purga irreversible de una cuenta rechazada (Edge Function purgar-usuario-
// rechazado): borra usuarios/atletas/padres_atletas y, si tenía cuenta de
// Auth, también esa. La RPC purgar_usuario_rechazado re-valida server-side
// que sea superadmin y que el estado sea 'rechazado' — el gate de acá no es
// la única barrera. Mismo patrón de invocación/errores que crearAccesoUsuario
// (accesosService.js).
export const purgarUsuarioRechazado = async (usuarioId) => {
  const { data, error } = await supabase.functions.invoke('purgar-usuario-rechazado', {
    body: { usuario_id: usuarioId },
  });

  if (error) {
    // FunctionsHttpError: el mensaje real viene en el cuerpo de la respuesta.
    let msg = 'No se pudo liberar la cédula.';
    try {
      const cuerpo = await error.context?.json();
      if (cuerpo?.error) msg = cuerpo.error;
    } catch { /* respuesta sin JSON: se usa el mensaje genérico */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);

  return data;
};
