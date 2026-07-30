// src/api/registroPublicoService.js
import { supabase } from './supabaseClient';

// ============================
// REGISTRO PÚBLICO (Formulario Padre)
// ============================
// Todo el registro ocurre server-side en la Edge Function
// `registro-publico`: filas vía la RPC registrar_publico() (v24, roles
// forzados a atleta/padre) + cuentas de Auth con admin.createUser.
//
// Por qué no se hace nada desde el navegador: (1) con RLS v24 el rol anon
// no puede tocar tablas, y (2) GoTrue rechaza los emails sintéticos
// (cedula@sinacceso...) en el signUp público — solo la Admin API los
// acepta (hallazgo de scripts/validar_rls_por_rol.js). Bonus: el
// navegador ya no queda logueado como el último registrado.

// Clubes que aceptan inscripción en línea (tienen owner activo que apruebe).
// Única lectura disponible para anon (v33): RPC SECURITY DEFINER.
export const fetchClubesPublicos = async () => {
  const { data, error } = await supabase.rpc('listar_clubes_publicos');
  if (error) throw new Error('No se pudo cargar la lista de clubes.');
  return (data || []).map((r) => r.club);
};

// `captchaToken` viaja solo si el club activó Turnstile (VITE_TURNSTILE_SITE_KEY
// en el cliente + TURNSTILE_SECRET_KEY en la función). La función lo valida
// server-side contra siteverify; si el captcha no está configurado allí, lo
// ignora. La defensa que aplica siempre es el límite por IP y por club (v52/v54),
// que puede responder 429 — su mensaje llega por la misma vía que los demás.
export const registrarDesdeFormularioPublico = async (datosAtleta, datosPadre = null, captchaToken = null) => {
  const { data, error } = await supabase.functions.invoke('registro-publico', {
    body: {
      captcha_token: captchaToken,
      atleta: {
        cedula: datosAtleta.cedula,
        nombre: datosAtleta.nombre,
        correo: datosAtleta.correo || null,
        telefono: datosAtleta.telefono || null,
        fecha_nacimiento: datosAtleta.fecha_nacimiento,
        posicion: datosAtleta.posicion || null,
        club: datosAtleta.club || null,
        genero: datosAtleta.genero || null,
      },
      padre: datosPadre && datosPadre.telefono
        ? {
            nombre: datosPadre.nombre,
            telefono: datosPadre.telefono,
            correo: datosPadre.correo || null,
          }
        : null,
    },
  });

  if (error) {
    // FunctionsHttpError: el mensaje real (cédula duplicada, etc.) viene en
    // el cuerpo de la respuesta, no en error.message.
    let msg = 'No se pudo completar el registro. Intenta de nuevo.';
    try {
      const cuerpo = await error.context?.json();
      if (cuerpo?.error) msg = cuerpo.error;
    } catch { /* respuesta sin JSON: se usa el mensaje genérico */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);

  // `credenciales` llega UNA sola vez y no se guarda en ningún lado: la
  // contraseña inicial es aleatoria (ya no es la cédula) y la pantalla de fin
  // de registro es el único momento en que la familia puede anotarla.
  return { success: true, atletaId: data?.atleta_id, credenciales: data?.credenciales ?? null };
};
