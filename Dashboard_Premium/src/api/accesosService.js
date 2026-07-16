// src/api/accesosService.js
import { supabase } from './supabaseClient';

// ============================
// CREACIÓN DE ACCESOS (v33)
// ============================
// El alta desde el panel del staff inserta filas en usuarios/atletas, pero la
// cuenta de Supabase Auth solo puede crearla el service_role: lo hace la Edge
// Function crear-acceso-usuario (valida JWT del staff, mismo club, vínculo
// padre↔hijo).
//
// Password inicial (v41): para un COACH o DUEÑO es ALEATORIA y viene en
// `password_temporal` — se muestra una sola vez y no se puede volver a
// consultar (no se guarda en ningún lado). Antes era la cédula, y como la
// cédula se lee de `usuarios` y `resolver_email_login` la traduce a email
// hasta para `anon`, era el par de credenciales completo: un coach entraba
// como el dueño de su club sin escribir nada. Para un ATLETA o REPRESENTANTE
// sigue siendo la cédula (su onboarding depende de eso) y `password_temporal`
// llega null.

export const crearAccesoUsuario = async ({ usuarioId, hijoUsuarioId = null, regenerar = false }) => {
  const { data, error } = await supabase.functions.invoke('crear-acceso-usuario', {
    body: { usuario_id: usuarioId, hijo_usuario_id: hijoUsuarioId, regenerar },
  });

  if (error) {
    // FunctionsHttpError: el mensaje real viene en el cuerpo de la respuesta.
    let msg = 'No se pudo crear la cuenta de acceso.';
    try {
      const cuerpo = await error.context?.json();
      if (cuerpo?.error) msg = cuerpo.error;
    } catch { /* respuesta sin JSON: se usa el mensaje genérico */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);

  return data;
};
