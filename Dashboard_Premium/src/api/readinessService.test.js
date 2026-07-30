// src/api/readinessService.test.js
// Regresión api-01: fetchReadinessHoy/guardarReadinessDiario usaban el día
// calendario UTC (new Date().toISOString().split('T')[0]) para leer y
// escribir readiness_hoy. Un check-in nocturno en Ecuador (UTC-5) ya cayó al
// otro lado de medianoche UTC: se guardaba con la fecha de MAÑANA (columna
// `fecha` con DEFAULT CURRENT_DATE del servidor, en UTC) y la siguiente
// lectura del mismo instante consultaba también el día de mañana — así que en
// apariencia "coincidían", pero ambos estaban corridos frente al día real del
// club. El fix hace que ambos usen hoyLocal() (día calendario LOCAL del
// runtime, mismo criterio que retencionService.js).
//
// Se fuerza America/Guayaquil al TOPE del spec (antes de cualquier import que
// use Date) para que el escenario de cruce de medianoche reproduzca igual en
// CI (ubuntu, UTC) y en local — mismo enfoque, ya verificado empíricamente en
// este runtime, que src/lib/fechas.test.js.
const TZ_ORIGINAL = process.env.TZ;
process.env.TZ = 'America/Guayaquil';

import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';

// vi.mock() se iza sobre las importaciones (y sobre este const), así que el
// doble del cliente se declara con vi.hoisted() para poder referenciarlo
// dentro de la factory.
const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }));
vi.mock('./supabaseClient', () => ({ supabase: supabaseMock }));
// invalidarReadiness solo toca una cache en memoria; se stubea para no
// arrastrar el resto de brainService (que también importa supabaseClient).
vi.mock('./brainService', () => ({ invalidarReadiness: vi.fn() }));

import { fetchReadinessHoy, guardarReadinessDiario } from './readinessService';

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
  ['insert', 'select', 'eq'].forEach((m) => {
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

describe('fetchReadinessHoy', () => {
  it('consulta atleta_readiness con el día calendario LOCAL, no el día UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA_NOCTURNO_ECUADOR);

    const { builder, llamadas } = builderTerminalEn('maybeSingle', { data: null, error: null });
    supabaseMock.from.mockReturnValue(builder);

    await fetchReadinessHoy('atleta-1');

    expect(llamadas.eq).toContainEqual(['fecha', HOY_LOCAL_ESPERADO]);
  });
});

describe('guardarReadinessDiario', () => {
  it('fija fecha = día LOCAL cuando el registro no la trae, para coincidir con la lectura', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA_NOCTURNO_ECUADOR);

    const { builder, llamadas } = builderTerminalEn('single', { data: { id: 'r1' }, error: null });
    supabaseMock.from.mockReturnValue(builder);

    await guardarReadinessDiario({
      atleta_id: 'atleta-1',
      sueno_calidad: 5,
      fatiga_fisica: 5,
      color_orina: 1,
    });

    // insert([payload]): el único argumento es el array [payload].
    expect(llamadas.insert[0][0][0].fecha).toBe(HOY_LOCAL_ESPERADO);
  });

  it('no pisa una fecha explícita si el caller ya la trae', async () => {
    const { builder, llamadas } = builderTerminalEn('single', { data: { id: 'r1' }, error: null });
    supabaseMock.from.mockReturnValue(builder);

    await guardarReadinessDiario({
      atleta_id: 'atleta-1',
      fecha: '2026-01-01',
      sueno_calidad: 5,
      fatiga_fisica: 5,
      color_orina: 1,
    });

    expect(llamadas.insert[0][0][0].fecha).toBe('2026-01-01');
  });
});

describe('coherencia escritura/lectura (mismo UNIQUE(atleta_id, fecha))', () => {
  it('el mismo instante nocturno produce la MISMA fecha al guardar y al consultar', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA_NOCTURNO_ECUADOR);

    const guardar = builderTerminalEn('single', { data: { id: 'r1' }, error: null });
    supabaseMock.from.mockReturnValueOnce(guardar.builder);
    await guardarReadinessDiario({
      atleta_id: 'atleta-1',
      sueno_calidad: 5,
      fatiga_fisica: 5,
      color_orina: 1,
    });

    const consultar = builderTerminalEn('maybeSingle', { data: null, error: null });
    supabaseMock.from.mockReturnValueOnce(consultar.builder);
    await fetchReadinessHoy('atleta-1');

    const fechaGuardada = guardar.llamadas.insert[0][0][0].fecha;
    const fechaConsultada = consultar.llamadas.eq.find(([col]) => col === 'fecha')[1];
    expect(fechaGuardada).toBe(fechaConsultada);
  });
});
