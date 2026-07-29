// Purga de la sesión persistida por supabase-js.
//
// Existe porque supabase-js NO garantiza dejar el dispositivo limpio al cerrar
// sesión: en GoTrueClient._signOut, si el POST a /auth/v1/logout falla por algo
// que no sea 401/403/404 (un corte de red, por ejemplo), hay un `return`
// anticipado ANTES de `_removeSession()`. El token se queda en localStorage y
// al recargar la sesión revive. Tampoco lanza: devuelve `{ error }`, así que
// envolverlo en try/catch no basta.
//
// En este club importa más de lo habitual: padres y atletas comparten teléfono
// y la conexión es 3G/4G rural, así que "cerré sesión y el siguiente entró a mi
// cuenta" es un escenario esperable, no un caso de borde.

/** ¿Es una clave de sesión de Supabase Auth? `sb-<project-ref>-auth-token`, más
 *  los sufijos que usa para partir valores grandes (`.0`, `.1`, …).
 *  Se reconoce por patrón y no componiendo la clave exacta, para no acoplarse
 *  al formato interno de `storageKey`, que puede cambiar entre versiones. */
export const esClaveDeSesion = (clave) =>
  typeof clave === 'string' && clave.startsWith('sb-') && clave.includes('-auth-token');

/** Borra toda clave de sesión del storage dado. Devuelve las claves borradas.
 *  `storage` se inyecta para poder probarlo; por defecto, el localStorage real. */
export function purgarSesionLocal(storage = globalThis.localStorage) {
  if (!storage) return [];
  try {
    const claves = Object.keys(storage).filter(esClaveDeSesion);
    claves.forEach((k) => storage.removeItem(k));
    return claves;
  } catch (error) {
    // Storage bloqueado (modo privado, cuota llena). No hay nada más que hacer
    // acá; quien llama igual limpia el estado de React.
    console.warn('No se pudo purgar la sesión local.', error);
    return [];
  }
}
