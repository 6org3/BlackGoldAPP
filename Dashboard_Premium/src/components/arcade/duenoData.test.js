// src/components/arcade/duenoData.test.js
// Misma familia de bug que api-01 (readinessService.test.js): fetchAgendaHoy
// calculaba "hoy" con el día calendario UTC (new Date().toISOString().split('T')[0])
// para filtrar sesiones_control.fecha. Un dueño que abre el resumen de noche en
// Ecuador (UTC-5, entre las 19:00 y medianoche) ya vería "hoy" adelantado un día
// en UTC: la "Agenda de hoy" dejaba de encontrar las sesiones del día real en
// curso (fechadas con hoyLocal() por AdminSesiones tras su propio fix), aunque
// existieran.
//
// Se fuerza America/Guayaquil al TOPE del spec (antes de cualquier import que
// use Date), mismo enfoque ya verificado empíricamente en este runtime por
// src/lib/fechas.test.js y src/api/readinessService.test.js.
const TZ_ORIGINAL = process.env.TZ;
process.env.TZ = 'America/Guayaquil';

import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';

// duenoData importa la capa de servicios, que crea el cliente de Supabase en la
// carga del módulo (createClient revienta sin las VITE_SUPABASE_*). Se stubea
// ese único choke-point (igual que en readinessService.test.js) para poder
// controlar la query sin red ni envs.
const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }));
vi.mock('../../api/supabaseClient', () => ({ supabase: supabaseMock }));

import { fetchAgendaHoy } from './duenoData';

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
  ['select', 'eq'].forEach((m) => {
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

describe('fetchAgendaHoy', () => {
  it('consulta sesiones_control con el día calendario LOCAL, no el día UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA_NOCTURNO_ECUADOR);

    const { builder, llamadas } = builderTerminalEn('order', { data: [], error: null });
    supabaseMock.from.mockReturnValue(builder);

    await fetchAgendaHoy('Club Demo');

    expect(llamadas.eq).toContainEqual(['fecha', HOY_LOCAL_ESPERADO]);
  });

  it('con un instante que no cruza medianoche local, coincide con el día UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z')); // mediodía UTC: mismo día en UTC y UTC-5

    const { builder, llamadas } = builderTerminalEn('order', { data: [], error: null });
    supabaseMock.from.mockReturnValue(builder);

    await fetchAgendaHoy('Club Demo');

    expect(llamadas.eq).toContainEqual(['fecha', '2026-07-15']);
  });
});
