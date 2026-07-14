// src/api/accesosService.js
import { supabase } from './supabaseClient';

// ============================
// CREACIÓN DE ACCESOS (v33)
// ============================
// El alta desde el panel del staff inserta filas en usuarios/atletas, pero la
// cuenta de Supabase Auth solo puede crearla el service_role: lo hace la Edge
// Function crear-acceso-usuario (valida JWT del staff, mismo club, vínculo
// padre↔hijo). Password inicial = cédula del atleta (o del hijo, para un
// representante) — el mismo esquema que el registro público.

export const crearAccesoUsuario = async ({ usuarioId, hijoUsuarioId = null }) => {
  const { data, error } = await supabase.functions.invoke('crear-acceso-usuario', {
    body: { usuario_id: usuarioId, hijo_usuario_id: hijoUsuarioId },
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
