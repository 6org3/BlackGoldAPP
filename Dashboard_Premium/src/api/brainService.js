// src/api/brainService.js
// Puerta del cliente al "cerebro" Black Gold: la Edge Function brain-gateway,
// que reusa las tools analíticas del MCP (analyze_athlete_pillars /
// analyze_athlete_readiness). Convención *Service.js: los componentes llaman
// aquí, nunca a supabase.functions directamente.
//
// Caché a nivel módulo POR ATLETA (handoff PR5): el diagnóstico solo cambia
// cuando entra una evaluación nueva y el readiness cuando hay un check-in
// nuevo, así que cada recurso se pide UNA vez por atleta por sesión de
// navegación. Se guarda la PROMESA (no el valor resuelto) para deduplicar
// llamadas concurrentes: dos cards montándose a la vez comparten el mismo
// request en vuelo. Los servicios de escritura (evaluacionesService,
// readinessService) invalidan la clave del atleta tras cada insert exitoso.
import { supabase } from './supabaseClient';

const cacheDiagnostico = new Map();
const cacheReadiness = new Map();

/**
 * Invoca un recurso del gateway (`POST /brain-gateway/atleta/{id}/{recurso}`)
 * con caché de promesas por atleta. El JWT de la sesión viaja solo con
 * `functions.invoke` (mismo precedente que generar-misiones-ia).
 *
 * Si la promesa rechaza se borra del Map — los fallos NO se cachean: el
 * siguiente intento vuelve a golpear el gateway. La borradura está guardada
 * contra carreras: solo elimina la clave si sigue apuntando a ESTA promesa
 * (una invalidación + refetch intermedios no pierden su promesa nueva).
 *
 * @param {Map<string, Promise<Object>>} cache - Map del recurso.
 * @param {string} atletaId - atletas.id.
 * @param {'diagnostico'|'readiness'} recurso - endpoint del gateway.
 * @returns {Promise<Object>} el `data` crudo del gateway.
 */
function invocarConCache(cache, atletaId, recurso) {
  const enVuelo = cache.get(atletaId);
  if (enVuelo) return enVuelo;

  const promesa = supabase.functions
    .invoke(`brain-gateway/atleta/${atletaId}/${recurso}`, { body: {} })
    .then(({ data, error }) => {
      if (error) throw error;
      return data;
    })
    .catch((err) => {
      if (cache.get(atletaId) === promesa) cache.delete(atletaId);
      throw err;
    });

  cache.set(atletaId, promesa);
  return promesa;
}

/**
 * Diagnóstico 360° del atleta: sub-pilares ordenados débil→fuerte con tier y
 * promedio, debilidades, y notas del coach (solo si el caller es staff).
 *
 * @param {string} atletaId - atletas.id.
 * @returns {Promise<Object>} { atleta, diagnostico, fuente, generado_en }
 */
export const fetchDiagnosticoAtleta = (atletaId) =>
  invocarConCache(cacheDiagnostico, atletaId, 'diagnostico');

/**
 * Readiness del día del atleta: score, check-in, estado de recuperación,
 * alertas priorizadas y misiones recomendadas (o `sinDatos` si no hay check-in).
 *
 * @param {string} atletaId - atletas.id.
 * @returns {Promise<Object>} { atleta, readiness, fuente, generado_en }
 */
export const fetchReadinessAtleta = (atletaId) =>
  invocarConCache(cacheReadiness, atletaId, 'readiness');

/**
 * Invalida el diagnóstico cacheado. Llamar cuando entra una evaluación nueva
 * (lo hace evaluacionesService tras cada insert exitoso): el diagnóstico del
 * cerebro quedó obsoleto y la próxima lectura debe regenerarse.
 *
 * @param {string} [atletaId] - sin argumento limpia TODO el Map.
 */
export const invalidarDiagnostico = (atletaId) => {
  if (atletaId === undefined) cacheDiagnostico.clear();
  else cacheDiagnostico.delete(atletaId);
};

/**
 * Invalida el readiness cacheado. Llamar cuando entra un check-in diario
 * nuevo (lo hace readinessService tras el insert exitoso).
 *
 * @param {string} [atletaId] - sin argumento limpia TODO el Map.
 */
export const invalidarReadiness = (atletaId) => {
  if (atletaId === undefined) cacheReadiness.clear();
  else cacheReadiness.delete(atletaId);
};
