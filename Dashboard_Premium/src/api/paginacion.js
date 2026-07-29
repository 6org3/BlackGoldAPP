// src/api/paginacion.js
//
// PostgREST corta las respuestas al `db-max-rows` del proyecto (1000 por
// defecto en Supabase) SIN avisar: no hay error, no hay bandera, solo llegan
// menos filas. Una consulta sin `.range()` explícito no trae "todo", trae
// "hasta 1000", y eso se nota cuando ya es tarde: con varios clubes y meses de
// historial, las evaluaciones de los atletas ordenados al final simplemente no
// llegan, y un atleta con datos se ve igual que uno nunca evaluado.

const PAGINA = 1000;

/**
 * Recorre una consulta en páginas explícitas hasta agotarla.
 *
 * Recibe una FUNCIÓN que construye la consulta, no una consulta ya construida:
 * los builders de PostgREST no se pueden re-ejecutar una vez lanzados.
 *
 * Al paginar, el orden debe ser total. Si la consulta ordena por una columna
 * con empates (una fecha, por ejemplo), añádele un `.order('id')` de desempate:
 * sin él, dos páginas consecutivas pueden repetir o saltarse filas.
 *
 * @param {() => object} construirQuery Devuelve un builder de PostgREST nuevo.
 * @param {{maxPaginas?: number}} opciones Tope de páginas (guarda anti-bucle).
 * @returns {Promise<{data: Array|null, error: object|null}>}
 */
export async function traerTodo(construirQuery, { maxPaginas = 50 } = {}) {
  const filas = [];
  for (let p = 0; p < maxPaginas; p++) {
    const desde = p * PAGINA;
    const { data, error } = await construirQuery().range(desde, desde + PAGINA - 1);
    if (error) return { data: null, error };
    if (!data || data.length === 0) break;
    filas.push(...data);
    if (data.length < PAGINA) break; // última página
  }
  return { data: filas, error: null };
}
