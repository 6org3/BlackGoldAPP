// src/api/sesionesService.test.js
// Regresión lote 1b (servicios/hooks/páginas): fetchEvaluacionesProgramadasHoy
// y fetchSesionesPlanificadasHoy calculaban "hoy" con
// new Date().toISOString().split('T')[0] (día UTC) para comparar contra
// sesiones_programadas.fecha / sesiones_control.fecha. Ambas columnas se
// escriben en día calendario LOCAL (AdminSesiones.jsx inicializa su form con
// hoyLocal() y pasa esa `fecha` explícita a programarEvaluacionGrupal() y
// crearSesionControl(); canchaData.js#startSession también fija su fechaStr en
// LOCAL) — comparar el lado de lectura en UTC dejaba de encontrar la
// evaluación/sesión de hoy entre las 19:00 y medianoche hora Ecuador (UTC-5),
// cuando el día UTC ya se adelantó al de mañana. El fix usa hoyLocal(), como
// ya escribe el lado de escritura.
//
// Se fuerza America/Guayaquil al TOPE del spec (antes de cualquier import que
// use Date), mismo enfoque ya verificado empíricamente en este runtime por
// src/lib/fechas.test.js y src/api/readinessService.test.js.
const TZ_ORIGINAL = process.env.TZ;
process.env.TZ = 'America/Guayaquil';

import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }));
vi.mock('./supabaseClient', () => ({ supabase: supabaseMock }));

import { fetchEvaluacionesProgramadasHoy, fetchSesionesPlanificadasHoy } from './sesionesService';

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
afterAll(() => {
  process.env.TZ = TZ_ORIGINAL;
});

// 2026-07-15 20:00 America/Guayaquil == 2026-07-16 01:00Z: en UTC "hoy" ya es
// el 16, mientras que el día calendario LOCAL sigue siendo el 15.
const AHORA_NOCTURNO_ECUADOR = new Date('2026-07-16T01:00:00Z');
const HOY_LOCAL_ESPERADO = '2026-07-15';

/** Doble mínimo de un query builder de PostgREST: encadena y registra, y se
 *  resuelve como un thenable (como el builder real de supabase-js) para no
 *  depender de cuál método sea "el último" de la cadena — fetchEvaluacionesProgramadasHoy
 *  encadena `.not(...)` dos veces con nombres repetidos. */
function builderThenable(resultado) {
  const llamadas = {};
  const builder = {};
  ['select', 'eq', 'not', 'order'].forEach((m) => {
    builder[m] = vi.fn((...args) => {
      (llamadas[m] ||= []).push(args);
      return builder;
    });
  });
  builder.then = (resolve) => resolve(resultado);
  return { builder, llamadas };
}

describe('fetchEvaluacionesProgramadasHoy', () => {
  it('consulta sesiones_programadas con el día calendario LOCAL, no el día UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA_NOCTURNO_ECUADOR);

    const { builder, llamadas } = builderThenable({ data: [], error: null });
    supabaseMock.from.mockReturnValue(builder);

    await fetchEvaluacionesProgramadasHoy('coach-1');

    expect(llamadas.eq).toContainEqual(['fecha', HOY_LOCAL_ESPERADO]);
  });
});

describe('fetchSesionesPlanificadasHoy', () => {
  it('consulta sesiones_control con el día calendario LOCAL, no el día UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA_NOCTURNO_ECUADOR);

    const { builder, llamadas } = builderThenable({ data: [], error: null });
    supabaseMock.from.mockReturnValue(builder);

    await fetchSesionesPlanificadasHoy('coach-1');

    expect(llamadas.eq).toContainEqual(['fecha', HOY_LOCAL_ESPERADO]);
  });
});
