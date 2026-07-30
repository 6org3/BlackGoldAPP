// Edge Function: actualizar-correo — la persona cambia su correo, y el de su
// cuenta de Auth cambia con él.
//
// Entrega 3 del arranque con datos reales. Sin esto, "olvidé mi contraseña" es
// una promesa vacía para casi todo el mundo.
//
// EL PROBLEMA QUE RESUELVE.
// El login traduce identificador → correo con `resolver_email_login()` (v19,
// endurecida en v52):
//
//     COALESCE(usuarios.correo, usuarios.cedula || '@sinacceso.blackgoldapp.internal')
//
// O sea que la dirección con la que se entra sale de la TABLA. Pero la cuenta
// de Auth guarda la suya aparte, fijada en el alta. Hasta ahora, editar el
// perfil escribía `usuarios.correo` y no tocaba Auth, así que las dos se
// separaban en silencio y pasaban dos cosas malas a la vez:
//
//   1. El login se rompía. `resolver_email_login` empezaba a devolver el correo
//      nuevo, que en Auth no existe → "credenciales inválidas" para siempre,
//      con la contraseña correcta.
//   2. La recuperación iba al buzón equivocado. `resetPasswordForEmail` usa el
//      correo de AUTH, que seguía siendo el sintético `<cédula>@sinacceso…` —
//      un dominio que no existe—, así que el enlace no llegaba a ninguna parte
//      mientras la familia veía "te enviamos un correo".
//
// Por eso el cambio de correo pasa por aquí: las dos mitades se mueven juntas o
// no se mueve ninguna. Y por eso hace falta service_role — el navegador no
// puede escribir en `auth.users`.
//
// Contrato: POST { correo }. El sujeto sale del JWT, nunca de un id del
// cliente. `correo: null` o "" lo borra y devuelve la cuenta al sintético.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { autenticar, jsonResponse, reintentarAuth } from "../_shared/brainAuth.ts";

// Misma regla que resolver_email_login(), crear-acceso-usuario y
// registro-publico. Si esta fórmula cambia, cambia en los cuatro sitios.
const emailSintetico = (cedula: string) =>
  `${cedula}@sinacceso.blackgoldapp.internal`.toLowerCase();

// Laxa a propósito: el formulario ya trae `type="email"` y el servidor de
// correo es el juez final. Solo descarta lo que seguro no es una dirección.
const pareceCorreo = (valor: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);

serve(async (req) => {
  const { error, caller, admin } = await autenticar(req);
  if (error) return error;

  let body: { correo?: string | null };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Cuerpo JSON inválido.' }, 400);
  }

  const correoNuevo = (body?.correo ?? '').trim().toLowerCase() || null;
  if (correoNuevo && !pareceCorreo(correoNuevo)) {
    return jsonResponse({ error: 'Ese correo no parece una dirección válida.' }, 400);
  }

  const { data: yo, error: eYo } = await admin
    .from('usuarios')
    .select('auth_user_id, cedula, correo')
    .eq('id', caller!.id)
    .single();
  if (eYo || !yo) return jsonResponse({ error: 'No se pudo leer tu perfil.' }, 500);
  if (!yo.auth_user_id) {
    return jsonResponse({ error: 'Tu cuenta no tiene un acceso vinculado. Avisa al club.' }, 409);
  }

  const correoAnterior = yo.correo ?? null;
  if (correoNuevo === correoAnterior) return jsonResponse({ ok: true, sin_cambios: true }, 200);

  // Al borrar el correo, la cuenta de Auth vuelve al sintético: si se quedara
  // con el real, `resolver_email_login` devolvería el derivado de la cédula y
  // la persona no podría volver a entrar.
  const emailParaAuth = correoNuevo ?? emailSintetico(yo.cedula);

  // Auth PRIMERO porque es el que puede rechazar (otra cuenta ya usa ese
  // correo). Si fuera al revés, `usuarios` quedaría con un correo que Auth no
  // reconoce y el login se rompería justo por lo que esta función existe.
  // `email_confirm: true`: es un cambio hecho por el titular con sesión válida,
  // no hay a quién mandarle una confirmación que todavía no puede leer.
  const { error: eAuth } = await reintentarAuth(() =>
    admin.auth.admin.updateUserById(yo.auth_user_id, { email: emailParaAuth, email_confirm: true })
  );
  if (eAuth) {
    console.error('[actualizar-correo] Auth rechazó el cambio', eAuth);
    const yaUsado = /already|registered|exists|duplicate/i.test(eAuth.message ?? '');
    return jsonResponse({
      error: yaUsado
        ? 'Ese correo ya está en uso por otra cuenta del club.'
        : 'No se pudo actualizar tu correo. Inténtalo de nuevo.',
    }, 409);
  }

  const { error: eFila } = await admin
    .from('usuarios')
    .update({ correo: correoNuevo })
    .eq('id', caller!.id);

  if (eFila) {
    // Compensación: Auth ya cambió. Dejarlo así rompería el login —
    // `resolver_email_login` seguiría devolviendo el correo viejo de la tabla,
    // que en Auth ya no existe—. Se vuelve atrás y se reporta el fallo.
    console.error('[actualizar-correo] la tabla rechazó el cambio; revirtiendo Auth', eFila);
    const { error: eRevertir } = await reintentarAuth(() =>
      admin.auth.admin.updateUserById(yo.auth_user_id, {
        email: correoAnterior ?? emailSintetico(yo.cedula),
        email_confirm: true,
      })
    );
    if (eRevertir) {
      // Las dos mitades quedaron separadas y no se pudo arreglar solo. Se dice
      // en claro, porque el síntoma que verá la persona —no puedo entrar con mi
      // contraseña de siempre— no apunta a nada.
      console.error('[actualizar-correo] REVERSIÓN FALLIDA: Auth y usuarios divergen', eRevertir);
      return jsonResponse({
        error: 'Tu correo quedó a medio cambiar y el acceso puede fallar. Avisa al club para que regenere tu acceso.',
      }, 500);
    }
    const duplicado = /duplicate|unique/i.test(eFila.message ?? '');
    return jsonResponse({
      error: duplicado
        ? 'Ese correo ya está en uso por otra cuenta del club.'
        : 'No se pudo guardar tu correo. Inténtalo de nuevo.',
    }, 409);
  }

  return jsonResponse({ ok: true, correo: correoNuevo }, 200);
});
