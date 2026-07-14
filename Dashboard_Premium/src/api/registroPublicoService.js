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

export const registrarDesdeFormularioPublico = async (datosAtleta, datosPadre = null) => {
  const { data, error } = await supabase.functions.invoke('registro-publico', {
    body: {
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

  return { success: true, atletaId: data?.atleta_id };
};
