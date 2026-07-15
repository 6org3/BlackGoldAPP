// Edge Function: crear-acceso-usuario — credenciales para altas hechas por el
// staff desde el panel (/admin/atletas).
//
// Motivo (revisión del flujo de registro, 2026-07-14): el alta por panel solo
// insertaba filas en usuarios/atletas; a diferencia del registro público,
// nunca creaba la cuenta de Supabase Auth, así que el atleta (y su
// representante) no podían iniciar sesión. El navegador no puede llamar
// auth.admin.createUser (service_role), por eso vive aquí.
//
// Contrato: POST { usuario_id, hijo_usuario_id? }, autenticado con el JWT del
// staff (brainAuth.autenticar). Reglas:
//   - Solo staff; owner/coach solo sobre usuarios de SU club.
//   - Roles 'atleta' y 'padre': los crea cualquier staff.
//   - Roles 'coach' (v35) y 'owner' (v36, co-dueño): SOLO owner/superadmin. Sin
//     este gate, un coach podría darle acceso real a un usuario privilegiado de
//     su club — la RLS `usuarios_insert` ya le impide crear esa fila, y esto
//     cierra la otra mitad por si alguna vez la fila llega por otra vía.
//   - Nunca 'superadmin': ese acceso no nace del panel.
//   - Idempotente: si el usuario ya tiene auth_user_id responde ya_existia.
//   - Password inicial: la cédula del propio usuario (atleta, coach o dueño);
//     para un padre, la cédula del hijo indicado en hijo_usuario_id (mismo
//     esquema que registro-publico), validando el vínculo real en
//     padres_atletas — el cliente nunca envía contraseñas.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { autenticar, jsonResponse, ROLES_STAFF } from "../_shared/brainAuth.ts";

// Misma regla que resolver_email_login() (v19), el trigger de v24 y
// registro-publico.
const emailParaAuth = (correo: string | null | undefined, cedula: string) =>
  (correo || `${cedula}@sinacceso.blackgoldapp.internal`).toLowerCase();

serve(async (req) => {
  const { error, caller, admin } = await autenticar(req);
  if (error) return error;
  if (!ROLES_STAFF.has(caller!.rol)) {
    return jsonResponse({ error: 'Solo el staff puede crear accesos.' }, 403);
  }

  let body: { usuario_id?: string; hijo_usuario_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Cuerpo JSON inválido.' }, 400);
  }
  const usuarioId = body?.usuario_id;
  if (!usuarioId) return jsonResponse({ error: 'usuario_id es obligatorio.' }, 400);

  const { data: target, error: eTarget } = await admin!
    .from('usuarios')
    .select('id, cedula, correo, club, rol, auth_user_id')
    .eq('id', usuarioId)
    .single();
  if (eTarget || !target) return jsonResponse({ error: 'Usuario no encontrado.' }, 404);

  if (caller!.rol !== 'superadmin' && target.club !== caller!.club) {
    return jsonResponse({ error: 'El usuario no pertenece a tu club.' }, 403);
  }
  if (target.auth_user_id) {
    return jsonResponse({ success: true, ya_existia: true }, 200);
  }
  if (!['atleta', 'padre', 'coach', 'owner'].includes(target.rol as string)) {
    return jsonResponse({ error: 'Por esta vía solo se crean accesos de atletas, representantes, coaches y dueños.' }, 400);
  }
  // El acceso de un coach (v35) o de un co-dueño (v36) lo habilita el dueño del
  // club, nunca otro coach. Quién pudo crear la FILA ya lo decidió
  // `usuarios_insert` (a un owner solo lo crea el dueño original); esto impide
  // que un tercero le dé acceso a una fila que él no habría podido crear.
  if ((target.rol === 'coach' || target.rol === 'owner')
      && caller!.rol !== 'owner' && caller!.rol !== 'superadmin') {
    return jsonResponse({ error: 'Solo el dueño del club puede crear el acceso de un coach o de un co-dueño.' }, 403);
  }

  // Password inicial según el rol del target.
  let password: string;
  if (target.rol === 'atleta' || target.rol === 'coach' || target.rol === 'owner') {
    if (!target.cedula) return jsonResponse({ error: 'El usuario no tiene cédula registrada.' }, 400);
    password = target.cedula as string;
  } else {
    const hijoUsuarioId = body?.hijo_usuario_id;
    if (!hijoUsuarioId) {
      return jsonResponse({ error: 'Para un representante se requiere hijo_usuario_id.' }, 400);
    }
    const { data: hijo } = await admin!
      .from('usuarios')
      .select('id, cedula')
      .eq('id', hijoUsuarioId)
      .single();
    if (!hijo?.cedula) return jsonResponse({ error: 'El atleta vinculado no existe o no tiene cédula.' }, 400);

    // El vínculo debe existir de verdad: padres_atletas(padre, atleta-del-hijo).
    const { data: atletaHijo } = await admin!
      .from('atletas')
      .select('id')
      .eq('usuario_id', hijoUsuarioId)
      .single();
    const { data: vinculo } = atletaHijo
      ? await admin!
          .from('padres_atletas')
          .select('atleta_id')
          .eq('padre_id', target.id)
          .eq('atleta_id', atletaHijo.id)
          .maybeSingle()
      : { data: null };
    if (!vinculo) {
      return jsonResponse({ error: 'El representante no está vinculado a ese atleta.' }, 400);
    }
    password = hijo.cedula as string;
  }

  const { data: created, error: eAuth } = await admin!.auth.admin.createUser({
    email: emailParaAuth(target.correo as string | null, target.cedula as string),
    password,
    email_confirm: true,
  });
  if (eAuth) {
    return jsonResponse({ error: 'No se pudo crear la cuenta de acceso: ' + eAuth.message }, 409);
  }

  // El trigger trg_vincular_auth_usuario (v24) vincula por email; este update
  // por id exacto es el cinturón por si otro usuario compartiera el correo.
  await admin!
    .from('usuarios')
    .update({ auth_user_id: created.user!.id })
    .eq('id', target.id)
    .is('auth_user_id', null);

  return jsonResponse({ success: true }, 200);
});
