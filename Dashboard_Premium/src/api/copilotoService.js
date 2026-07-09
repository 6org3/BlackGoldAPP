// src/api/copilotoService.js
// Cliente del copiloto conversacional (Edge Function `copiloto`, PR6).
// El navegador NUNCA habla con el LLM directo: el hilo viaja con el JWT del
// usuario y el server resuelve rol, alcance por club y herramientas.
// Sin caché: es conversacional (cada llamada lleva TODO el hilo).
import { supabase } from './supabaseClient';

/**
 * Envía el hilo completo al copiloto y devuelve su respuesta.
 *
 * @param {Object} params
 * @param {Array<{role: 'user'|'assistant', content: string}>} params.mensajes
 *   Hilo completo de la conversación (máx. 20 mensajes, el último 'user').
 * @param {string|null} [params.atletaId] Atleta de contexto (p.ej. si el panel
 *   se abrió desde su ficha); el server re-valida el alcance igualmente.
 * @returns {Promise<{respuesta: string, tono: 'simple'|'tecnico', herramientas_usadas: string[], modelo: string}>}
 * @throws {Error} con el mensaje amable del server (rol sin acceso, copiloto
 *   sin configurar, hilo inválido) o uno genérico si no hubo respuesta JSON.
 */
export const enviarMensajeCopiloto = async ({ mensajes, atletaId = null }) => {
  const { data, error } = await supabase.functions.invoke('copiloto', {
    body: { mensajes, atleta_id: atletaId },
  });
  if (error) {
    // FunctionsHttpError conserva la Response original: rescatar el mensaje
    // amable que mandó la Edge Function (403 por rol, 503 sin configurar...).
    let mensaje = 'El copiloto no está disponible en este momento.';
    try {
      const cuerpo = await error.context?.json?.();
      if (cuerpo?.error) mensaje = cuerpo.error;
    } catch {
      // sin cuerpo JSON: se queda el mensaje genérico
    }
    throw new Error(mensaje);
  }
  return data;
};
