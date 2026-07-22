// Normalización unicode para búsquedas insensibles a tildes/diacríticos.
// Con apellidos ecuatorianos ('Núñez', 'Jiménez') una comparación literal deja
// la búsqueda inutilizable: 'Nuñez' no encuentra 'Núñez'. NFD separa cada letra
// de su diacrítico combinante (U+0300-U+036F) y este se descarta — la ñ (n +
// virgulilla U+0303) queda como 'n', igual que las vocales tildadas.

export const normalizarTexto = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

// ¿`texto` contiene `termino` ignorando tildes y mayúsculas? Se normalizan
// AMBOS lados, así 'Nuñez' encuentra 'Núñez' y 'JIMENEZ' encuentra 'jiménez'.
export const coincideBusqueda = (texto, termino) =>
  normalizarTexto(texto).includes(normalizarTexto(termino));

// Patrón ilike "relajado" para el lado servidor (PostgREST no expone
// `unaccent`): cada letra que puede llevar diacrítico en español (vocales y n)
// se sustituye por `_` — comodín de UN carácter en LIKE — de modo que Postgres
// devuelva un SUPERCONJUNTO de candidatos sin importar cómo estén acentuados
// en la base. El superconjunto se refina después con `coincideBusqueda`
// (p. ej. 'nunez' → '____z' también atrapa 'Sánchez'; el refino lo descarta).
export const patronBusquedaRelajado = (termino) =>
  normalizarTexto(termino).replace(/[aeioun]/g, '_');
