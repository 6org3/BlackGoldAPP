// src/hooks/useMisionesPanelSesionYObservacion.test.js
// Regresión lote 1b: la comparación "¿esta observación es de hoy?" usaba
// o.created_at?.startsWith(today) con `today` calculado en día UTC
// (new Date().toISOString().split('T')[0]). created_at es un timestamp real
// (siempre `now()`, sin ambigüedad de escritura como sesiones_entrenamiento.fecha
// — ver el comentario dejado en el propio hook): una observación registrada
// esta MAÑANA (hora Ecuador) dejaba de reconocerse como "de hoy" al revisarla
// ya entrada la NOCHE del mismo día local, porque para entonces el día UTC ya
// había avanzado uno. El fix compara claveDiaLocal(created_at) con hoyLocal().
//
// (La comparación de sesionDeHoy contra sesiones_entrenamiento.fecha se deja
// intacta a propósito — ver el comentario en el hook — porque esa columna se
// escribe con el DEFAULT CURRENT_DATE del servidor en UTC; no es sitio de este lote.)
//
// Se fuerza America/Guayaquil al TOPE del spec (antes de cualquier import que
// use Date), mismo enfoque ya verificado empíricamente en este runtime por
// src/hooks/useMisionesPanelAtletaData.test.js.
const TZ_ORIGINAL = process.env.TZ;
process.env.TZ = 'America/Guayaquil';

import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';

// El hook solo usa useEffect de 'react'. Este repo no tiene jsdom ni un
// renderer de hooks instalado (entorno de test = 'node'), así que se mockea
// 'react' para invocar el efecto de forma síncrona (como lo haría React al
// montar), sin necesitar un renderer real — mismo patrón que
// useMisionesPanelAtletaData.test.js.
vi.mock('react', () => ({ useEffect: (fn) => fn() }));

const { fetchSesionesAtletaMock } = vi.hoisted(() => ({ fetchSesionesAtletaMock: vi.fn() }));
vi.mock('../api/sesionesEntrenamientoService', () => ({ fetchSesionesAtleta: fetchSesionesAtletaMock }));

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: { from: vi.fn() } }));
vi.mock('../api/supabaseClient', () => ({ supabase: supabaseMock }));

import { useMisionesPanelSesionYObservacion } from './useMisionesPanelSesionYObservacion';

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

/** Doble mínimo de un query builder de PostgREST: encadena y resuelve como
 *  thenable (como el builder real de supabase-js) en el `limit(...)` final. */
function builderObservaciones(resultado) {
  const builder = {};
  ['select', 'eq', 'order'].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.limit = vi.fn(() => Promise.resolve(resultado));
  return builder;
}

/** El hook dispara su efecto sin esperar la promesa interna de loadSesion(),
 *  así que hay que dejar drenar la cola de microtasks antes de asertar. */
async function flushMicrotasks(veces = 10) {
  for (let i = 0; i < veces; i++) {
    await Promise.resolve();
  }
}

describe('useMisionesPanelSesionYObservacion', () => {
  it('reconoce una observación de esta mañana como "de hoy" al revisarla ya entrada la noche (día LOCAL, no UTC)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA_NOCTURNO_ECUADOR);

    fetchSesionesAtletaMock.mockResolvedValue([]);
    const observacionMañana = { id: 'obs-1', created_at: '2026-07-15T14:00:00Z' }; // 09:00 Ecuador, mismo día local
    supabaseMock.from.mockReturnValue(builderObservaciones({ data: [observacionMañana], error: null }));

    const setObservacionHoy = vi.fn();
    useMisionesPanelSesionYObservacion('atleta-pk-1', vi.fn(), vi.fn(), vi.fn(), setObservacionHoy);

    await flushMicrotasks();

    expect(setObservacionHoy).toHaveBeenCalledWith(observacionMañana);
  });
});
