// Edge Function: cambiar-password — la persona sustituye la contraseña que le
// dio el club por una suya.
//
// Entrega 2 del arranque con datos reales. La entrega 1 quitó la cédula como
// contraseña inicial y dejó cada cuenta nueva marcada con
// `app_metadata.debe_cambiar_password` (ver _shared/credenciales.ts). Esa marca
// no sirve de nada por sí sola: hace falta algo que la consuma y que solo se
// pueda apagar cambiando la contraseña de verdad.
//
// POR QUÉ ES UNA EDGE FUNCTION Y NO `supabase.auth.updateUser` A SECAS.
// El navegador puede cambiar su propia contraseña, pero NO puede escribir
// `app_metadata` — eso es Admin API (service_role), y está así a propósito:
// si la marca viviera en `user_metadata` el propio usuario la borraría desde la
// consola sin cambiar nada. Partirlo en dos pasos (updateUser en el cliente +
// una RPC que apague la marca) tendría el mismo agujero por otra puerta:
// cualquiera podría llamar a la RPC a secas y saltarse el cambio. Aquí las dos
// cosas ocurren en la misma llamada, así que la marca SOLO se apaga cuando la
// contraseña cambió de verdad.
//
// Contrato: POST { password_nueva }, autenticado con el JWT del propio usuario.
// El sujeto sale SIEMPRE del token — nunca de un id que mande el cliente—, así
// que nadie puede cambiarle la contraseña a otro por esta vía.
// Respuesta: { ok: true, session? }. Ver "LA SESIÓN MUERE CON EL CAMBIO".

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { autenticar, jsonResponse, reintentarAuth } from "../_shared/brainAuth.ts";
import { validarPasswordNueva } from "../_shared/passwordPolicy.ts";

serve(async (req) => {
  // autenticar() exige POST, JWT válido, perfil en `usuarios` y cuenta activa.
  // Lo último importa: una cuenta pendiente o dada de baja no pasa por aquí, y
  // tampoco llega a la pantalla de cambio (PrivateRoute la manda antes a
  // CuentaEnRevision), así que las dos mitades coinciden.
  const { error, caller, admin } = await autenticar(req);
  if (error) return error;

  let body: { password_nueva?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Cuerpo JSON inválido.' }, 400);
  }
  const passwordNueva = body?.password_nueva;
  if (typeof passwordNueva !== 'string' || !passwordNueva) {
    return jsonResponse({ error: 'Escribe tu contraseña nueva.' }, 400);
  }

  // Los datos que el club ya conoce de esta persona: no pueden ser su
  // contraseña. `autenticar` no trae ni auth_user_id ni estos campos, y
  // ampliarlo tocaría a todas las funciones del cerebro — se leen aquí.
  const { data: yo, error: eYo } = await admin
    .from('usuarios')
    .select('auth_user_id, cedula, correo, telefono')
    .eq('id', caller!.id)
    .single();
  if (eYo || !yo?.auth_user_id) {
    return jsonResponse({ error: 'Tu cuenta no tiene un acceso vinculado. Avisa al club.' }, 409);
  }

  // El correo con el que entra sale de la cuenta de Auth, NO de reconstruirlo
  // con usuarios.correo: si alguien añadió un correo después de crear la
  // cuenta, la fila y Auth ya no coinciden y la reconstrucción apuntaría a una
  // dirección que no existe.
  const { data: cuenta, error: eCuenta } = await reintentarAuth(() =>
    admin.auth.admin.getUserById(yo.auth_user_id)
  );
  const emailDeAuth = cuenta?.user?.email;
  if (eCuenta || !emailDeAuth) {
    return jsonResponse({ error: 'Tu cuenta no tiene un acceso vinculado. Avisa al club.' }, 409);
  }

  const problema = validarPasswordNueva(passwordNueva, {
    datosPersonales: [yo.cedula, yo.correo, yo.telefono],
  });
  if (problema) return jsonResponse({ error: problema }, 400);

  const anon = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // La contraseña nueva no puede ser la MISMA que ya tiene. Sin esto, quien
  // recibió la clave dictada por teléfono la vuelve a escribir aquí, la marca
  // se apaga y esa clave —que pasó por WhatsApp y sigue en el chat— queda como
  // definitiva: justo lo que esta entrega existe para impedir.
  //
  // No hay forma de "leer" la actual (está hasheada), así que se prueba: si
  // entrar con ella funciona, es la que ya tenía. Solo el ÉXITO decide; ante
  // cualquier error se sigue adelante, porque un fallo de red o un límite de
  // intentos de GoTrue no es prueba de nada y bloquear el cambio por eso
  // dejaría a la persona atrapada en la pantalla.
  const { data: mismaPassword } = await anon.auth.signInWithPassword({
    email: emailDeAuth,
    password: passwordNueva,
  });
  if (mismaPassword?.user) {
    // scope 'local' y no el 'global' por defecto: global cerraría TODAS las
    // sesiones de esta persona, incluida la que está usando ahora mismo.
    await anon.auth.signOut({ scope: 'local' }).catch(() => {});

    // Puede que sea la contraseña del club… o la suya, si el cambio ya se hizo
    // y la respuesta se perdió por el camino (3G/4G rural: pasa). Distinguirlo
    // mirando si la marca sigue puesta evita el peor final posible — decirle
    // "esa es la que te dio el club" sobre la contraseña que ella misma acaba
    // de elegir, y dejarla dando vueltas en una pantalla sin salida.
    if (cuenta.user.app_metadata?.debe_cambiar_password !== true) {
      return jsonResponse({ ok: true, ya_estaba: true, session: mismaPassword.session ?? null }, 200);
    }
    return jsonResponse(
      { error: 'Esa es la contraseña que te dio el club. Elige una distinta, que solo sepas tú.' },
      400,
    );
  }

  // El cambio y el apagado de la marca, en la misma llamada. `app_metadata` se
  // fusiona por clave en GoTrue, así que esto no pisa `provider`/`providers`.
  const { error: eCambio } = await reintentarAuth(() =>
    admin.auth.admin.updateUserById(yo.auth_user_id, {
      password: passwordNueva,
      app_metadata: { debe_cambiar_password: false },
    })
  );
  if (eCambio) {
    console.error('[cambiar-password] fallo al actualizar', eCambio);
    // GoTrue valida por su cuenta (longitud mínima del proyecto, contraseñas
    // filtradas si está activado). Ese mensaje SÍ es para el usuario; el resto
    // no se reenvía.
    const suyo = /password/i.test(eCambio.message ?? '') ? eCambio.message : null;
    return jsonResponse({ error: suyo || 'No se pudo cambiar la contraseña. Inténtalo de nuevo.' }, 400);
  }

  // ── LA SESIÓN MUERE CON EL CAMBIO ────────────────────────────────────────
  // Cambiar la contraseña por la Admin API revoca TODAS las sesiones del
  // usuario, también la de quien la está cambiando (comprobado: el access
  // token pasa a dar "Auth session missing" y el refresh token deja de existir).
  // Eso es lo que queremos —si la clave dictada llegó a otras manos, esas
  // sesiones se caen—, pero deja a esta persona sin sesión justo después de
  // hacer lo que le pedimos. Así que se le devuelve una nueva: ya demostró que
  // conoce la contraseña, es exactamente lo que le daría signInWithPassword.
  //
  // Si esto falla, la contraseña YA cambió: se responde ok igual y el cliente
  // la manda a iniciar sesión con la nueva. Devolver error aquí sería mentir e
  // invitarla a repetir un cambio que ya ocurrió.
  const { data: sesionNueva, error: eSesion } = await anon.auth.signInWithPassword({
    email: emailDeAuth,
    password: passwordNueva,
  });
  if (eSesion) console.warn('[cambiar-password] contraseña cambiada, pero sin sesión nueva', eSesion);

  return jsonResponse({ ok: true, session: sesionNueva?.session ?? null }, 200);
});
