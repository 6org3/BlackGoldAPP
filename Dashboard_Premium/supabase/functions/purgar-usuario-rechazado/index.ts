// Edge Function: purgar-usuario-rechazado — libera para siempre la cédula de
// una solicitud rechazada (v45).
//
// Motivo: `resolver_solicitud_registro` (v33) solo aprueba o rechaza; rechazar
// deja la fila `usuarios` y su cuenta de Supabase Auth vivas para siempre, y
// como `usuarios.cedula` es UNIQUE esa cédula queda bloqueada de por vida
// (`registrar_publico` rechaza cualquier reintento). La RPC
// `purgar_usuario_rechazado` (v45) borra las filas del lado Postgres, pero no
// puede tocar `auth.users` — eso es Admin API / service_role, por eso vive
// aquí, mismo motivo que `registro-publico` y `crear-acceso-usuario`.
//
// Contrato: POST { usuario_id }, autenticado con el JWT del caller
// (brainAuth.autenticar). El gate es SOLO superadmin — más estricto que
// crear-acceso-usuario (que abre a todo el staff) porque esto es
// irreversible y la nota de v36b aplica: "una RLS y su Edge Function son DOS
// MITADES", así que el gate de acá no se apoya solo en el de la RPC.
// Flujo: rpc purgar_usuario_rechazado (borra usuarios/atletas/padres_atletas,
// re-valida estado='rechazado' server-side) → si devuelve auth_user_id,
// auth.admin.deleteUser lo borra también de Auth.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { autenticar, jsonResponse } from "../_shared/brainAuth.ts";

serve(async (req) => {
  const { error, caller, admin } = await autenticar(req);
  if (error) return error;
  if (caller!.rol !== 'superadmin') {
    return jsonResponse({ error: 'Solo un superadministrador puede liberar una cédula rechazada.' }, 403);
  }

  let body: { usuario_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Cuerpo JSON inválido.' }, 400);
  }
  const usuarioId = body?.usuario_id;
  if (!usuarioId) return jsonResponse({ error: 'usuario_id es obligatorio.' }, 400);

  // La RPC vuelve a validar todo server-side (superadmin + estado='rechazado'
  // + huérfanos de un padre): este gate de arriba no es la única barrera.
  const { data: purga, error: eRpc } = await admin!.rpc('purgar_usuario_rechazado', {
    p_usuario_id: usuarioId,
  });
  if (eRpc) return jsonResponse({ error: eRpc.message }, 400);

  // La fila ya no existe en Postgres; borrar también la cuenta de Auth si la
  // tenía (puede ser null: un rechazo puede haber llegado antes de que se le
  // creara acceso, aunque en la práctica registrar_publico siempre lo crea).
  if (purga?.auth_user_id) {
    const { error: eAuth } = await admin!.auth.admin.deleteUser(purga.auth_user_id as string);
    if (eAuth) {
      return jsonResponse({
        error: 'Se liberó la cédula pero no se pudo borrar la cuenta de acceso: ' + eAuth.message,
        cedula_liberada: purga?.cedula ?? null,
      }, 500);
    }
  }

  return jsonResponse({ success: true, cedula_liberada: purga?.cedula ?? null }, 200);
});
