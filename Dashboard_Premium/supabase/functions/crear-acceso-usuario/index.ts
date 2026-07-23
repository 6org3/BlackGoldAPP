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
//   - Idempotente: si el usuario ya tiene auth_user_id responde ya_existia
//     (salvo `regenerar: true`, ver abajo).
//   - Password inicial: ALEATORIA para coach y dueño (v41); la cédula para un
//     atleta, y la cédula del hijo indicado en hijo_usuario_id para un padre
//     (validando el vínculo real en padres_atletas) — el cliente nunca envía
//     contraseñas.
//
// v41 — POR QUÉ LA CONTRASEÑA DE UN PRIVILEGIADO YA NO SALE DE LA CÉDULA.
// Hasta v40 esta función fijaba `password = target.cedula` también para coach y
// owner. La cédula NO es un secreto: está en el documento físico, en la ficha
// del atleta, la conoce la familia… y `usuarios_select` (v24) deja a cualquier
// staff leer la fila COMPLETA de todo su club. Peor: `resolver_email_login`
// (v19) está concedida a `anon` y traduce cédula → email sin sesión. O sea que
// la cédula del dueño era, ella sola, el par de credenciales completo:
//     SELECT cedula FROM usuarios WHERE club = <mi club> AND rol = 'owner'
//     → signInWithPassword(resolver_email_login(cedula), cedula) → eres el dueño.
// Escalada coach → owner sin escribir nada y sin cruzar ningún guard: ninguno
// de v34/v36/v36b/v40 protege una LECTURA.
//
// El fix NO es esconder la cédula (se sabe fuera de la base: fighting the
// symptom), sino que deje de ser la contraseña donde hay privilegios que robar.
// Atleta/padre siguen con la cédula a propósito: son ~860 cuentas cuyo
// onboarding entero ("entra con tu cédula") depende de eso y que en su mayoría
// no tienen correo. Que un coach pueda entrar como un atleta de SU club sigue
// abierto y anotado — es suplantación, no escalada, y su fix es un cambio de
// producto (ver el PR de v41).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { autenticar, jsonResponse, reintentarAuth, ROLES_STAFF } from "../_shared/brainAuth.ts";

// Misma regla que resolver_email_login() (v19), el trigger de v24 y
// registro-publico.
const emailParaAuth = (correo: string | null | undefined, cedula: string) =>
  (correo || `${cedula}@sinacceso.blackgoldapp.internal`).toLowerCase();

// Los roles cuya contraseña NO puede derivarse de un dato legible.
const ROLES_PASS_ALEATORIA = new Set(['coach', 'owner']);

// Contraseña temporal: 14 caracteres de un alfabeto sin ambigüedades visuales
// (sin O/0, l/1/I), porque el dueño se la va a dictar al coach por WhatsApp o
// en persona. `crypto.getRandomValues` es el CSPRNG del runtime; se descartan
// los bytes del último tramo incompleto para no meter sesgo de módulo.
const generarPasswordTemporal = (largo = 14): string => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const limite = Math.floor(256 / abc.length) * abc.length;
  const salida: string[] = [];
  while (salida.length < largo) {
    const bytes = new Uint8Array(largo * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= limite) continue;      // sesgo de módulo: se descarta
      salida.push(abc[b % abc.length]);
      if (salida.length === largo) break;
    }
  }
  return salida.join('');
};

serve(async (req) => {
  const { error, caller, admin } = await autenticar(req);
  if (error) return error;
  if (!ROLES_STAFF.has(caller!.rol)) {
    return jsonResponse({ error: 'Solo el staff puede crear accesos.' }, 403);
  }

  let body: { usuario_id?: string; hijo_usuario_id?: string | null; regenerar?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Cuerpo JSON inválido.' }, 400);
  }
  const usuarioId = body?.usuario_id;
  if (!usuarioId) return jsonResponse({ error: 'usuario_id es obligatorio.' }, 400);
  // v41: rotar la contraseña de un staff que YA tiene acceso. Existe porque las
  // cuentas creadas antes de v41 nacieron con password = cédula: sin rotarlas,
  // el fix solo protege a las nuevas y las viejas siguen abiertas para siempre
  // (no hay caducidad de contraseñas).
  const regenerar = body?.regenerar === true;

  const { data: target, error: eTarget } = await admin!
    .from('usuarios')
    .select('id, cedula, correo, club, rol, auth_user_id')
    .eq('id', usuarioId)
    .single();
  if (eTarget || !target) return jsonResponse({ error: 'Usuario no encontrado.' }, 404);

  if (caller!.rol !== 'superadmin' && target.club !== caller!.club) {
    return jsonResponse({ error: 'El usuario no pertenece a tu club.' }, 403);
  }
  if (target.auth_user_id && !regenerar) {
    return jsonResponse({ success: true, ya_existia: true }, 200);
  }
  if (!['atleta', 'padre', 'coach', 'owner'].includes(target.rol as string)) {
    return jsonResponse({ error: 'Por esta vía solo se crean accesos de atletas, representantes, coaches y dueños.' }, 400);
  }
  if (regenerar) {
    if (!target.auth_user_id) {
      return jsonResponse({ error: 'Ese usuario todavía no tiene acceso: créalo en vez de regenerarlo.' }, 400);
    }
    // Regenerar a un atleta/padre le pondría una contraseña aleatoria y le
    // rompería el "entra con tu cédula" que su familia conoce; y con la cédula
    // intacta no hay nada que rotar. Los gates de rol de abajo (coach/owner
    // solo los toca el dueño) valen igual para crear que para regenerar.
    if (!ROLES_PASS_ALEATORIA.has(target.rol as string)) {
      return jsonResponse({ error: 'Solo se regenera el acceso de coaches y dueños.' }, 400);
    }
  }
  // El acceso de un coach (v35) lo habilita el dueño del club, nunca otro coach.
  if ((target.rol === 'coach' || target.rol === 'owner')
      && caller!.rol !== 'owner' && caller!.rol !== 'superadmin') {
    return jsonResponse({ error: 'Solo el dueño del club puede crear el acceso de un coach o de un co-dueño.' }, 403);
  }
  // El de un DUEÑO, solo el dueño ORIGINAL (o el superadmin): el mismo gate que
  // `usuarios_insert` pone a la fila (es_owner_principal, v36). Sin esto un
  // co-dueño no podría crear la fila de otro dueño… pero sí emitirle el acceso
  // a una que llegara por otra vía, que es la mitad que de verdad da entrada.
  if (target.rol === 'owner' && caller!.rol !== 'superadmin') {
    const { data: yo } = await admin!
      .from('usuarios').select('creado_por').eq('id', caller!.id).single();
    if (yo?.creado_por) {
      return jsonResponse({ error: 'Solo el dueño original del club puede dar acceso a un co-dueño.' }, 403);
    }
  }

  // Password inicial según el rol del target (v41: aleatoria si hay privilegios).
  let password: string;
  let passwordTemporal: string | null = null;
  if (ROLES_PASS_ALEATORIA.has(target.rol as string)) {
    password = generarPasswordTemporal();
    passwordTemporal = password;   // se devuelve UNA vez; no se guarda en ningún lado
  } else if (target.rol === 'atleta') {
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

  // v41: rotar el acceso existente. La cuenta de Auth ya existe y ya está
  // vinculada, así que aquí solo se cambia la contraseña.
  if (regenerar) {
    const { error: eRotar } = await reintentarAuth(() => admin!.auth.admin
      .updateUserById(target.auth_user_id as string, { password }));
    if (eRotar) {
      return jsonResponse({ error: 'No se pudo regenerar el acceso: ' + eRotar.message }, 409);
    }
    return jsonResponse({ success: true, regenerado: true, password_temporal: passwordTemporal }, 200);
  }

  const { data: created, error: eAuth } = await reintentarAuth(() => admin!.auth.admin.createUser({
    email: emailParaAuth(target.correo as string | null, target.cedula as string),
    password,
    email_confirm: true,
  }));
  if (eAuth) {
    return jsonResponse({ error: 'No se pudo crear la cuenta de acceso: ' + eAuth.message }, 409);
  }

  // El trigger trg_vincular_auth_usuario (v24) vincula por email; este update
  // por id exacto es el cinturón por si otro usuario compartiera el correo.
  // (v40 acotó ese trigger a atleta/padre: para coach/owner este update ES la
  // única vinculación, no un cinturón.)
  await admin!
    .from('usuarios')
    .update({ auth_user_id: created.user!.id })
    .eq('id', target.id)
    .is('auth_user_id', null);

  // `password_temporal` va SOLO para coach/owner y solo en esta respuesta: no se
  // guarda en la base ni se puede volver a consultar. Para atleta/padre es null
  // — su contraseña sigue siendo la cédula, que el panel ya muestra.
  return jsonResponse({ success: true, password_temporal: passwordTemporal }, 200);
});
