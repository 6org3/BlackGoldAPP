// src/api/misionesService.test.js
// Regresión api-02: aprobarMision leía el estado de progreso_misiones por
// separado del UPDATE que lo marca 'aprobada' (read-modify-write NO atómico).
// Dos requests en vuelo (doble clic del coach en "Aprobar") podían leer
// 'pendiente_aprobacion' a la vez y las dos otorgaban XP — duplicado sin
// ningún rastro de que la segunda invocación fuera redundante.
//
// El fix hace el UPDATE condicional por estado (.eq('estado', 'pendiente_aprobacion'))
// y usa el `.select()` de la propia fila actualizada como fuente de si hubo
// match: solo la invocación que de verdad transiciona la fila (la primera)
// recibe filas de vuelta y otorga XP. La segunda no matchea nada (la fila ya
// está en 'aprobada') y no debe volver a llamar a otorgarXP.
import { describe, it, expect, vi, afterEach } from 'vitest';

const { supabaseMock, otorgarXPMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
  otorgarXPMock: vi.fn(),
}));
vi.mock('./supabaseClient', () => ({ supabase: supabaseMock }));
// otorgarXP (xpService) es la única fuente de mutación de xp_total; se
// stubea para aislar la prueba a la lógica de aprobarMision (el guard de
// estado), no a la implementación read-modify-write de otorgarXP en sí
// (deuda conocida y documentada aparte en xpService.js).
vi.mock('./xpService', () => ({ otorgarXP: otorgarXPMock }));

import { aprobarMision } from './misionesService';

afterEach(() => {
  vi.clearAllMocks();
});

/** Doble mínimo de un query builder de PostgREST: encadena y se resuelve
 *  como un thenable (como el builder real de supabase-js), para no atarse
 *  a cuál método es "el último" de la cadena. */
function builderThenable(resultado) {
  const llamadas = {};
  const builder = {};
  ['update', 'select', 'eq', 'single'].forEach((m) => {
    builder[m] = vi.fn((...args) => {
      (llamadas[m] ||= []).push(args);
      return builder;
    });
  });
  builder.then = (resolve) => resolve(resultado);
  return { builder, llamadas };
}

describe('aprobarMision', () => {
  it('otorga XP UNA sola vez cuando la fila sigue en pendiente_aprobacion', async () => {
    const actualizacion = builderThenable({
      data: [{ atleta_id: 'atleta-1', misiones: { xp_recompensa: 30, nivel_objetivo: 'Desarrollo' } }],
      error: null,
    });
    const atletaQuery = builderThenable({ data: { nivel_desarrollo: 'Desarrollo' }, error: null });
    supabaseMock.from
      .mockReturnValueOnce(actualizacion.builder) // UPDATE progreso_misiones condicional
      .mockReturnValueOnce(atletaQuery.builder); // SELECT nivel_desarrollo

    const resultado = await aprobarMision('progreso-1');

    // El UPDATE debe ser condicional por estado, no incondicional.
    expect(actualizacion.llamadas.eq).toContainEqual(['id', 'progreso-1']);
    expect(actualizacion.llamadas.eq).toContainEqual(['estado', 'pendiente_aprobacion']);
    expect(otorgarXPMock).toHaveBeenCalledTimes(1);
    expect(otorgarXPMock).toHaveBeenCalledWith(
      'atleta-1', 30, {}, expect.objectContaining({ origen: 'misiones' })
    );
    expect(resultado.success).toBe(true);
  });

  it('la segunda invocación en vuelo (doble clic) NO vuelve a otorgar XP', async () => {
    // La fila ya no está en 'pendiente_aprobacion' (la primera invocación ya
    // la aprobó) => el UPDATE condicional no matchea ninguna fila.
    const actualizacionSinMatch = builderThenable({ data: [], error: null });
    supabaseMock.from.mockReturnValueOnce(actualizacionSinMatch.builder);

    const resultado = await aprobarMision('progreso-1');

    expect(otorgarXPMock).not.toHaveBeenCalled();
    // No debe romper al caller (AdminMisiones.jsx solo hace await + catch).
    expect(resultado.success).toBe(true);
  });

  it('propaga el error de Supabase si el UPDATE falla', async () => {
    const fallo = builderThenable({ data: null, error: { message: 'boom' } });
    supabaseMock.from.mockReturnValueOnce(fallo.builder);

    await expect(aprobarMision('progreso-1')).rejects.toEqual({ message: 'boom' });
    expect(otorgarXPMock).not.toHaveBeenCalled();
  });
});
