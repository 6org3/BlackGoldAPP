// src/api/pagosService.test.js
// Regresión api-03: crearCargo/marcarPagado/actualizarEstadoVencidos (fallback
// pre-v27) fechaban con el día UTC (new Date().toISOString().split('T')[0])
// en vez del día LOCAL del club. Mismo criterio que fetchReadinessHoy/
// guardarReadinessDiario (api-01): ver src/api/readinessService.test.js.
const TZ_ORIGINAL = process.env.TZ;
process.env.TZ = 'America/Guayaquil';

import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';

// vi.mock() se iza sobre las importaciones (y sobre este const), así que el
// doble del cliente se declara con vi.hoisted() para poder referenciarlo
// dentro de la factory.
const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('./supabaseClient', () => ({ supabase: supabaseMock }));

import { crearCargo, marcarPagado, actualizarEstadoVencidos } from './pagosService';

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
afterAll(() => {
  process.env.TZ = TZ_ORIGINAL;
});

// 2026-07-15 20:00 America/Guayaquil == 2026-07-16 01:00Z: en UTC "hoy" ya es
// el 16, mientras que el día calendario LOCAL del club sigue siendo el 15.
const AHORA_NOCTURNO_ECUADOR = new Date('2026-07-16T01:00:00Z');
const HOY_LOCAL_ESPERADO = '2026-07-15';

/** Doble mínimo de un query builder de PostgREST: encadena y registra, y
 *  resuelve en el método terminal indicado. */
function builderTerminalEn(metodoTerminal, resultado) {
  const llamadas = {};
  const builder = {};
  ['insert', 'update', 'select', 'eq', 'in', 'lt'].forEach((m) => {
    builder[m] = vi.fn((...args) => {
      (llamadas[m] ||= []).push(args);
      return builder;
    });
  });
  builder[metodoTerminal] = vi.fn((...args) => {
    (llamadas[metodoTerminal] ||= []).push(args);
    return Promise.resolve(resultado);
  });
  return { builder, llamadas };
}

describe('crearCargo', () => {
  it('escribe fecha_servicio con el día LOCAL, no el día UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA_NOCTURNO_ECUADOR);

    const { builder, llamadas } = builderTerminalEn('single', { data: { id: 'p1' }, error: null });
    supabaseMock.from.mockReturnValue(builder);

    await crearCargo({ atletaId: 'a1', servicioId: 's1', concepto: 'x', monto: 10 }, 'staff1');

    expect(llamadas.insert[0][0].fecha_servicio).toBe(HOY_LOCAL_ESPERADO);
  });
});

describe('marcarPagado', () => {
  it('escribe fecha_pago con el día LOCAL, no el día UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA_NOCTURNO_ECUADOR);

    const consulta = builderTerminalEn('single', { data: { monto_final: 100, monto_base: 100 }, error: null });
    const actualizacion = builderTerminalEn('single', { data: { id: 'pago1' }, error: null });
    supabaseMock.from
      .mockReturnValueOnce(consulta.builder)
      .mockReturnValueOnce(actualizacion.builder);

    await marcarPagado('pago1', { forma_pago: 'Efectivo' });

    expect(actualizacion.llamadas.update[0][0].fecha_pago).toBe(HOY_LOCAL_ESPERADO);
  });
});

describe('actualizarEstadoVencidos — fallback pre-v27', () => {
  it('usa el día LOCAL como corte de vencimiento cuando la RPC todavía no existe', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA_NOCTURNO_ECUADOR);

    supabaseMock.rpc.mockResolvedValue({ error: { message: 'no existe la función' } });
    const { builder, llamadas } = builderTerminalEn('lt', { error: null });
    supabaseMock.from.mockReturnValue(builder);

    await actualizarEstadoVencidos();

    expect(llamadas.lt[0][1]).toBe(HOY_LOCAL_ESPERADO);
  });
});
