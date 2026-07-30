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
//   - Password inicial: ALEATORIA para TODOS los roles — el cliente nunca envía
//     contraseñas. Para un padre se sigue exigiendo hijo_usuario_id y el
//     vínculo real en padres_atletas, ya no para derivar de ahí la contraseña
//     sino porque un representante existe en función de sus hijos.
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
//
// ACTUALIZACIÓN — la excepción de atleta/padre ya no existe. v41 dejó a esos
// dos roles con `password = cédula` a propósito: eran ~860 cuentas sembradas
// cuyo onboarding entero ("entra con tu cédula") dependía de eso, y casi
// ninguna tenía correo. Ese motivo se cae al arrancar de cero con personas
// reales, y entonces el mismo razonamiento de arriba aplica igual: cualquiera
// que haya visto el documento de un menor tiene su par de credenciales
// completo. De paso cierra la suplantación que v41 dejó anotada — un coach
// leía la cédula de cualquier atleta de su club y con eso entraba como él.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { autenticar, jsonResponse, reintentarAuth, ROLES_STAFF } from "../_shared/brainAuth.ts";
import { generarPasswordTemporal, MARCA_PASSWORD_TEMPORAL } from "../_shared/credenciales.ts";

// Misma regla que resolver_email_login() (v19), el trigger de v24 y
// registro-publico.
const emailParaAuth = (correo: string | null | undefined, cedula: string) =>
  (correo || `${cedula}@sinacceso.blackgoldapp.internal`).toLowerCase();

// El generador de contraseñas y la marca de "debe cambiarla" viven en
// _shared/credenciales.ts: los usan también el registro público y cualquier
// vía futura de alta, para que no vuelva a haber una excepción por rol.

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
    .select('id, cedula, correo, club, rol, estado, auth_user_id')
    .eq('id', usuarioId)
    .single();
  if (eTarget || !target) return jsonResponse({ error: 'Usuario no encontrado.' }, 404);

  if (caller!.rol !== 'superadmin' && target.club !== caller!.club) {
    return jsonResponse({ error: 'El usuario no pertenece a tu club.' }, 403);
  }
  // Emitir acceso a una cuenta rechazada o retirada le daba credenciales
  // funcionales: PrivateRoute la manda a CuentaEnRevision, pero la sesión de
  // Auth es real y sirve para llamar a la API por fuera de la app. Se
  // comprueba por exclusión, no por lista, para que un estado nuevo cierre la
  // puerta por defecto en vez de abrirla por olvido. (Estado ausente = activo:
  // la columna es NOT NULL DEFAULT 'activo'.)
  if (target.estado && target.estado !== 'activo') {
    return jsonResponse({
      error: `No se puede dar acceso a una cuenta en estado "${target.estado}". Apruébala primero.`,
    }, 409);
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
    // Antes esto se le negaba a atleta y padre: con la contraseña fijada a la
    // cédula no había nada que rotar, y rotarla les rompía el "entra con tu
    // cédula" que su familia conocía. Ahora que la contraseña es aleatoria,
    // regenerar es justo lo que necesita la familia que la perdió — y es la
    // única vía de recuperación mientras no haya correo real ni SMTP.
    //
    // Pero SOLO el dueño. Crear un acceso y rotarlo no son la misma operación:
    // crear es parte de la inscripción y la hace cualquier staff; rotar es
    // recuperación de cuenta y le entrega al que la pide la contraseña NUEVA de
    // otra persona, en claro. Sin este gate, un coach podía POSTear
    // { usuario_id: <cualquier atleta de su club>, regenerar: true } y quedarse
    // con la cuenta del menor —y con la de su representante—, en silencio y sin
    // pasar por ninguna pantalla: la ausencia de botón no es un control.
    // Cada club tiene su dueño, así que la recuperación siempre tiene a quién
    // acudir.
    if (caller!.rol !== 'owner' && caller!.rol !== 'superadmin') {
      return jsonResponse({
        error: 'Solo el dueño del club puede regenerar el acceso de un deportista o de un representante.',
      }, 403);
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

  // La cédula sigue haciendo falta cuando no hay correo: es la que forma el
  // email sintético con el que nace la cuenta. Ya NO se usa como contraseña.
  if (!target.correo && !target.cedula) {
    return jsonResponse({ error: 'El usuario no tiene ni correo ni cédula: no se le puede crear una cuenta.' }, 400);
  }

  // Para un representante se sigue exigiendo el vínculo con un hijo. Ya no es
  // para sacar de ahí la contraseña (era la cédula del hijo), sino porque un
  // representante existe EN FUNCIÓN de sus hijos: emitir acceso a uno suelto
  // sería crear una cuenta sin nada que representar.
  if (target.rol === 'padre') {
    const hijoUsuarioId = body?.hijo_usuario_id;
    if (!hijoUsuarioId) {
      return jsonResponse({ error: 'Para un representante se requiere hijo_usuario_id.' }, 400);
    }
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
  }

  // Contraseña inicial: aleatoria para TODOS los roles, sin excepción.
  // Hasta aquí atleta y padre nacían con `password = cédula` (la del propio
  // atleta, o la del hijo para el representante). Ver la nota de
  // _shared/credenciales.ts: la cédula no es un secreto, así que ese par
  // (cédula, cédula) lo podía usar cualquiera que hubiera visto el documento
  // del menor. Se devuelve UNA vez en esta respuesta y no se guarda en ningún
  // lado; quien la pierda necesita una regeneración.
  const password = generarPasswordTemporal();
  const passwordTemporal = password;

  // v41: rotar el acceso existente. La cuenta de Auth ya existe y ya está
  // vinculada, así que aquí solo se cambia la contraseña.
  if (regenerar) {
    const { error: eRotar } = await reintentarAuth(() => admin!.auth.admin
      .updateUserById(target.auth_user_id as string, {
        password,
        // Vuelve a quedar marcada como temporal: quien reciba esta contraseña
        // tendrá que fijar la suya en el primer ingreso, igual que en un alta.
        app_metadata: MARCA_PASSWORD_TEMPORAL,
      }));
    if (eRotar) {
      // El mensaje de GoTrue va al log, no al cliente. Esta pantalla la usa el
      // staff, pero el detalle igual delata el estado interno de Auth.
      console.error('[crear-acceso-usuario] rotar:', eRotar.message);
      return jsonResponse({ error: 'No se pudo regenerar el acceso. Reintenta en un momento.' }, 409);
    }
    return jsonResponse({ success: true, regenerado: true, password_temporal: passwordTemporal }, 200);
  }

  const { data: created, error: eAuth } = await reintentarAuth(() => admin!.auth.admin.createUser({
    email: emailParaAuth(target.correo as string | null, target.cedula as string),
    password,
    email_confirm: true,
    app_metadata: MARCA_PASSWORD_TEMPORAL,
  }));
  if (eAuth) {
    console.error('[crear-acceso-usuario] createUser:', eAuth.message);
    return jsonResponse({ error: 'No se pudo crear la cuenta de acceso. Reintenta en un momento.' }, 409);
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

  // `password_temporal` viaja SOLO en esta respuesta: no se guarda en la base
  // ni se puede volver a consultar. Si el staff no la anota, la única salida es
  // regenerar el acceso (`regenerar: true`), que emite otra.
  return jsonResponse({ success: true, password_temporal: passwordTemporal }, 200);
});
