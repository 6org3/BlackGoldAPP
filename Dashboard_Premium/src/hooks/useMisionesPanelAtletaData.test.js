// src/hooks/useMisionesPanelAtletaData.test.js
// Misma familia de bug que api-01 (readinessService.test.js): este hook
// seguía calculando "hoy" con el día calendario UTC
// (new Date().toISOString().split('T')[0]) para leer atleta_readiness, en vez
// de hoyLocal() (día calendario LOCAL del runtime). Un check-in guardado con
// hoyLocal() (fix ya aplicado en readinessService.js) después de ~19:00 hora
// Ecuador ya cruzó medianoche UTC: este hook seguía consultando el día de
// MAÑANA en UTC, no encontraba la fila recién guardada, y estadoRecuperacion
// caía a un fallback stale (evaluación vieja o el default 'Óptimo').
//
// Se fuerza America/Guayaquil al TOPE del spec (antes de cualquier import que
// use Date), mismo enfoque ya verificado empíricamente en este runtime por
// src/api/readinessService.test.js y src/lib/fechas.test.js.
const TZ_ORIGINAL = process.env.TZ;
process.env.TZ = 'America/Guayaquil';

import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';

// El hook solo usa useEffect de 'react'. Este repo no tiene jsdom ni un
// renderer de hooks instalado (entorno de test = 'node', ver vite.config.js),
// así que se mockea 'react' para invocar el efecto de forma síncrona (como lo
// haría React al montar) sin necesitar un renderer real.
vi.mock('react', () => ({ useEffect: (fn) => fn() }));

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }));
vi.mock('../api/supabaseClient', () => ({ supabase: supabaseMock }));

import { useMisionesPanelAtletaData } from './useMisionesPanelAtletaData';

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

/** Doble mínimo de un query builder de PostgREST: encadena y registra, y
 *  resuelve en el método terminal indicado. */
function builderTerminalEn(metodoTerminal, resultado) {
  const llamadas = {};
  const builder = {};
  ['select', 'eq', 'order'].forEach((m) => {
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

/** El hook dispara su efecto sin esperar la promesa interna de loadAtleta(),
 *  así que hay que dejar drenar la cola de microtasks (3 awaits reales en
 *  cadena, ya resueltos de antemano por el mock) antes de asertar. */
async function flushMicrotasks(veces = 10) {
  for (let i = 0; i < veces; i++) {
    await Promise.resolve();
  }
}

describe('useMisionesPanelAtletaData', () => {
  it('consulta atleta_readiness con el día calendario LOCAL, no el día UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA_NOCTURNO_ECUADOR);

    const atletas = builderTerminalEn('single', {
      data: { id: 'atleta-pk-1', estado_recuperacion: 'Óptimo', usuarios: { nombre: 'Test', categoria: 'Sub-15' } },
      error: null,
    });
    const evaluaciones = builderTerminalEn('limit', { data: [], error: null });
    const readiness = builderTerminalEn('maybeSingle', { data: null, error: null });

    supabaseMock.from
      .mockReturnValueOnce(atletas.builder)
      .mockReturnValueOnce(evaluaciones.builder)
      .mockReturnValueOnce(readiness.builder);

    const setAtletaData = vi.fn();
    useMisionesPanelAtletaData('atleta-usuario-1', setAtletaData);

    await flushMicrotasks();

    expect(readiness.llamadas.eq).toContainEqual(['fecha', HOY_LOCAL_ESPERADO]);
  });
});
