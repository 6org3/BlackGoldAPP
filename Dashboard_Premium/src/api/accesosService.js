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
// Password inicial: ALEATORIA para TODOS los roles, y viene en
// `password_temporal` — se muestra una sola vez y no se puede volver a
// consultar (no se guarda en ningún lado). Antes era la cédula, y como la
// cédula se lee de `usuarios` y `resolver_email_login` la traduce a email
// hasta para `anon`, era el par de credenciales completo: un coach entraba
// como el dueño de su club sin escribir nada.
//
// v41 arregló eso solo para coach y dueño; atleta y representante siguieron
// con la cédula porque el onboarding de las ~860 cuentas sembradas dependía de
// ella. Al arrancar de cero con personas reales esa excusa desaparece y la
// excepción se cierra: con menores, quien haya visto el documento del chico
// tenía su cuenta. Quien pierda la contraseña necesita `regenerar: true`.

// FunctionsHttpError esconde el motivo real en el cuerpo de la respuesta: sin
// esto el usuario ve siempre el mensaje genérico y nunca el que la función
// escribió para él ("esa es la contraseña que te dio el club", etc.).
const mensajeDeError = async (error, porDefecto) => {
  try {
    const cuerpo = await error.context?.json();
    if (cuerpo?.error) return cuerpo.error;
  } catch { /* respuesta sin JSON: se usa el mensaje genérico */ }
  return porDefecto;
};

export const crearAccesoUsuario = async ({ usuarioId, hijoUsuarioId = null, regenerar = false }) => {
  const { data, error } = await supabase.functions.invoke('crear-acceso-usuario', {
    body: { usuario_id: usuarioId, hijo_usuario_id: hijoUsuarioId, regenerar },
  });

  if (error) throw new Error(await mensajeDeError(error, 'No se pudo crear la cuenta de acceso.'));
  if (data?.error) throw new Error(data.error);

  return data;
};

// ============================
// CAMBIO DE CONTRASEÑA PROPIA
// ============================
// No usa `supabase.auth.updateUser` a propósito. La marca
// `app_metadata.debe_cambiar_password` que siembra el alta solo la puede apagar
// el service_role, y tiene que apagarse EN EL MISMO ACTO que el cambio: si
// fueran dos pasos, llamar al segundo por su cuenta limpiaría la marca sin
// haber cambiado nada. La Edge Function cambiar-password hace las dos cosas y
// además comprueba que la contraseña nueva no sea la que repartió el club.
export const cambiarPasswordPropia = async (passwordNueva) => {
  const { data, error } = await supabase.functions.invoke('cambiar-password', {
    body: { password_nueva: passwordNueva },
  });

  if (error) throw new Error(await mensajeDeError(error, 'No se pudo cambiar la contraseña.'));
  if (data?.error) throw new Error(data.error);

  return data;
};

// ============================
// CAMBIO DE CORREO PROPIO
// ============================
// Tampoco escribe `usuarios.correo` directamente. El login traduce
// identificador → correo leyendo esa columna (`resolver_email_login`), pero la
// dirección con la que Auth reconoce la cuenta se guarda aparte: si solo se
// cambia la de la tabla, las dos se separan, el login empieza a resolver a un
// correo que Auth no conoce y la persona se queda fuera con su contraseña
// correcta. La Edge Function mueve las dos a la vez o ninguna.
export const actualizarCorreoPropio = async (correo) => {
  const { data, error } = await supabase.functions.invoke('actualizar-correo', {
    body: { correo },
  });

  if (error) throw new Error(await mensajeDeError(error, 'No se pudo actualizar tu correo.'));
  if (data?.error) throw new Error(data.error);

  return data;
};
