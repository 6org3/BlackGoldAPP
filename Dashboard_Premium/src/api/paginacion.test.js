// PostgREST corta las respuestas en `db-max-rows` (1000 por defecto) sin avisar:
// no hay error ni bandera, simplemente llegan menos filas. Una consulta sin
// `.range()` explícito no trae "todo", trae "hasta 1000". `traerTodo` pagina
// hasta agotar; estos casos fijan su contrato de corte.
import { describe, it, expect } from 'vitest';
import { traerTodo } from './paginacion';

const PAGINA = 1000;

/** Doble de un builder de PostgREST: solo necesita responder a `.range()`.
 *  Registra los rangos pedidos para comprobar que se pagina de verdad. */
function fuente(totalFilas, { rangosPedidos = [] } = {}) {
  return () => ({
    range(desde, hasta) {
      rangosPedidos.push([desde, hasta]);
      const filas = [];
      for (let i = desde; i <= Math.min(hasta, totalFilas - 1); i++) filas.push({ id: i });
      return Promise.resolve({ data: filas, error: null });
    },
  });
}

describe('traerTodo', () => {
  it('trae todas las filas cuando hay más de una página', async () => {
    const rangosPedidos = [];
    const { data, error } = await traerTodo(fuente(2500, { rangosPedidos }));
    expect(error).toBeNull();
    expect(data).toHaveLength(2500);
    // Sin paginar habrían llegado 1000 en silencio.
    expect(rangosPedidos).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    // Y sin duplicar ni saltarse filas.
    expect(new Set(data.map((f) => f.id)).size).toBe(2500);
  });

  it('para en la primera página cuando cabe entera', async () => {
    const rangosPedidos = [];
    const { data } = await traerTodo(fuente(42, { rangosPedidos }));
    expect(data).toHaveLength(42);
    expect(rangosPedidos).toHaveLength(1);
  });

  it('no pide una página de más cuando el total es múltiplo exacto', async () => {
    const rangosPedidos = [];
    const { data } = await traerTodo(fuente(PAGINA, { rangosPedidos }));
    expect(data).toHaveLength(PAGINA);
    // La primera vino llena, así que pide una segunda; esa vuelve vacía y corta.
    expect(rangosPedidos).toHaveLength(2);
  });

  it('devuelve vacío sin error cuando no hay filas', async () => {
    const { data, error } = await traerTodo(fuente(0));
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('propaga el error y no devuelve datos a medias', async () => {
    const err = { message: 'boom' };
    const { data, error } = await traerTodo(() => ({
      range: () => Promise.resolve({ data: null, error: err }),
    }));
    expect(error).toBe(err);
    expect(data).toBeNull();
  });

  it('respeta el tope de páginas para no quedarse en bucle', async () => {
    const rangosPedidos = [];
    // Fuente que siempre devuelve una página llena: sin tope, no terminaría.
    const infinita = () => ({
      range(desde, hasta) {
        rangosPedidos.push([desde, hasta]);
        return Promise.resolve({ data: Array.from({ length: PAGINA }, (_, i) => ({ id: desde + i })), error: null });
      },
    });
    const { data } = await traerTodo(infinita, { maxPaginas: 3 });
    expect(rangosPedidos).toHaveLength(3);
    expect(data).toHaveLength(3 * PAGINA);
  });
});
