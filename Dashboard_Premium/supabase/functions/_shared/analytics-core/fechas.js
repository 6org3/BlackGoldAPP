// AUTO-GENERADO desde packages/analytics-core — NO EDITAR. Regenerar con: npm run functions:sync
// packages/analytics-core/fechas.js
//
// Día calendario LOCAL del runtime (dispositivo del usuario en el navegador,
// proceso del MCP en el servidor) — "el día del club es el día calendario
// local de quien corre el proceso", mismo enfoque que hoyLocal() en
// Dashboard_Premium/src/api/retencionService.js:27-32, fijado aquí una sola
// vez para que tendencias.js (y cualquier otro consumidor futuro) no lo
// reimplemente.
//
// REGLA DEL PAQUETE: módulo ES plano compartido entre web (Vite), Node y
// Deno. Sin dependencias npm, sin APIs de Node, funciones puras.

const FORMATO_FECHA_PURA = /^\d{4}-\d{2}-\d{2}$/;

function formatearFechaLocal(d) {
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * Día calendario local de HOY, 'YYYY-MM-DD'.
 * @returns {string}
 */
export function hoyLocal() {
  return formatearFechaLocal(new Date());
}

/**
 * Día calendario local 'YYYY-MM-DD' de un timestamp.
 *
 * Si `ts` ya es una fecha pura 'YYYY-MM-DD' (sin componente de hora — p.ej.
 * una columna `date` de Postgres) se devuelve TAL CUAL: pasarla por
 * `new Date('YYYY-MM-DD')` la interpretaría como medianoche UTC y, en un
 * huso detrás de UTC (Ecuador, UTC-5), restaría un día al leerla luego con
 * getters locales — sería una regresión, no una corrección.
 *
 * @param {string|Date} ts
 * @returns {string} 'YYYY-MM-DD'
 */
export function claveDiaLocal(ts) {
  if (typeof ts === 'string' && FORMATO_FECHA_PURA.test(ts)) return ts;
  return formatearFechaLocal(new Date(ts));
}

/**
 * Mes calendario local 'YYYY-MM' de un timestamp. Misma regla de `ts` puro
 * que claveDiaLocal().
 * @param {string|Date} ts
 * @returns {string} 'YYYY-MM'
 */
export function claveMesLocal(ts) {
  return claveDiaLocal(ts).slice(0, 7);
}
