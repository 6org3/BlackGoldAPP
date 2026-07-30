// src/api/asistenciaService.test.js
// Regresión lote 1b (servicios/hooks/páginas): fetchAsistenciaPct y
// fetchHistorialAtleta calculaban el corte de "hace N días" con
// desde.toISOString().split('T')[0] (día UTC de un Date ya desplazado por
// setDate). Cerca de medianoche en Ecuador (UTC-5, 19:00-23:59 hora local) el
// día UTC ya se adelantó un día: el corte quedaba un día MÁS TARDE de lo que
// debía, dejando fuera de la ventana el día más antiguo (asistencia.fecha se
// escribe en día LOCAL — ver canchaData.js#startSession y AdminAsistencia.jsx,
// que ya usa hoyLocal()). El fix usa claveDiaLocal(desde), que formatea con
// getters LOCALES en vez de toISOString() (UTC).
//
// Se fuerza America/Guayaquil al TOPE del spec (antes de cualquier import que
// use Date), mismo enfoque ya verificado empíricamente en este runtime por
// src/lib/fechas.test.js y src/api/readinessService.test.js.
const TZ_ORIGINAL = process.env.TZ;
process.env.TZ = 'America/Guayaquil';

import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }));
vi.mock('./supabaseClient', () => ({ supabase: supabaseMock }));

import { fetchAsistenciaPct, fetchHistorialAtleta } from './asistenciaService';

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

/** Doble mínimo de un query builder de PostgREST: encadena y registra, y
 *  resuelve en el método terminal indicado. */
function builderTerminalEn(metodoTerminal, resultado) {
  const llamadas = {};
  const builder = {};
  ['select', 'in', 'eq', 'gte', 'order'].forEach((m) => {
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

describe('fetchAsistenciaPct', () => {
  it('el corte de "hace 7 días" es el día calendario LOCAL, no el día UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA_NOCTURNO_ECUADOR);

    const { builder, llamadas } = builderTerminalEn('gte', { data: [], error: null });
    supabaseMock.from.mockReturnValue(builder);

    await fetchAsistenciaPct(['atleta-1'], 7);

    // Hoy local = 2026-07-15 → hace 7 días (calendario local) = 2026-07-08.
    // Con el bug viejo (toISOString() de un Date ya desplazado -7 días en
    // hora local) el corte caía en 2026-07-09, un día tarde.
    expect(llamadas.gte).toContainEqual(['fecha', '2026-07-08']);
  });
});

describe('fetchHistorialAtleta', () => {
  it('el corte de "hace 30 días" es el día calendario LOCAL, no el día UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA_NOCTURNO_ECUADOR);

    const { builder, llamadas } = builderTerminalEn('order', { data: [], error: null });
    supabaseMock.from.mockReturnValue(builder);

    await fetchHistorialAtleta('atleta-1');

    // Hoy local = 2026-07-15 → hace 30 días (calendario local) = 2026-06-15.
    expect(llamadas.gte).toContainEqual(['fecha', '2026-06-15']);
  });
});
