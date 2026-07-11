// src/lib/nombresCortos.js
// Alias cortos para chips de prueba (mockup v6, vista Comparar): el chip
// muestra "CMJ" en vez de "CMJ (salto vertical)". Concern de presentación —
// por eso vive aquí y no en packages/analytics-core (compartido con el MCP).

/**
 * Alias corto por nombre, desambiguado contra el resto de la lista.
 *
 * Cada nombre parte de su primer token; mientras dos nombres distintos
 * compartan alias, SOLO los que colisionan se extienden con un token más
 * (los demás se quedan cortos). Dos nombres idénticos terminan iguales —
 * no hay forma de desambiguarlos.
 *
 * @param {string[]} nombres — nombres completos visibles (con duplicados posibles)
 * @returns {Map<string, string>} nombre completo → alias corto
 */
export function nombresCortos(nombres) {
  const unicos = [...new Set(nombres)];
  const tokens = new Map(unicos.map(n => [n, String(n || '').trim().split(/\s+/).filter(Boolean)]));
  const usados = new Map(unicos.map(n => [n, Math.min(1, tokens.get(n).length)]));

  const alias = n => tokens.get(n).slice(0, usados.get(n)).join(' ') || '—';

  let cambio = true;
  while (cambio) {
    cambio = false;
    const porAlias = new Map();
    unicos.forEach(n => {
      const a = alias(n);
      if (!porAlias.has(a)) porAlias.set(a, []);
      porAlias.get(a).push(n);
    });
    porAlias.forEach(grupo => {
      if (grupo.length < 2) return;
      grupo.forEach(n => {
        if (usados.get(n) < tokens.get(n).length) {
          usados.set(n, usados.get(n) + 1);
          cambio = true;
        }
      });
    });
  }

  return new Map(unicos.map(n => [n, alias(n)]));
}
