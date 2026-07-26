// core/estado.mjs — Estado del club de simulación en memoria.
// Se reconstruye leyendo de la base (solo filas del club de simulación) para
// que el loop sea reanudable: podés correrlo hoy, mañana seguir donde quedó.
//
// TODO(Antigravity): completar los SELECT de grupos/atletas con las columnas
// reales que uses en las acciones (revisá src/api/atletasService.js y
// src/api/sesionesService.js para nombres exactos de columnas).

import { admin } from './supa.mjs';

export const CLUB = process.env.SIM_CLUB || 'SIM Loop Diario';
export const PREFIJO = process.env.SIM_PREFIJO || 'SIMLOOP-'; // cédulas/ids de simulación
export const emailInterno = (cedula) => `${String(cedula).toLowerCase()}@sinacceso.blackgoldapp.internal`;

export async function cargarEstado() {
  // Usuarios del club de simulación, por rol.
  const { data: usuarios = [] } = await admin
    .from('usuarios').select('id, auth_user_id, cedula, nombre, rol, fecha_nacimiento, genero, club')
    .eq('club', CLUB);

  const porRol = (r) => usuarios.filter((u) => u.rol === r);
  const idsUsuarioAtleta = porRol('atleta').map((u) => u.id);

  // Filas atletas ligadas a esos usuarios.
  let atletas = [];
  if (idsUsuarioAtleta.length) {
    const { data = [] } = await admin
      .from('atletas').select('id, usuario_id, categoria_feb, nivel_desarrollo, estado_membresia, es_becado')
      .in('usuario_id', idsUsuarioAtleta);
    atletas = data;
  }

  const { data: grupos = [] } = await admin
    .from('grupos_entrenamiento').select('id, nombre').ilike('descripcion', '%simulaci%');

  return {
    club: CLUB,
    usuarios,
    coaches: porRol('coach'),
    padres: porRol('padre'),
    owner: porRol('owner')[0] || null,
    atletas, // [{id, usuario_id, categoria_feb, ...}]
    grupos,  // [{id, nombre}]
    // índice cédula->usuario para idempotencia
    byCedula: Object.fromEntries(usuarios.map((u) => [u.cedula, u])),
  };
}
