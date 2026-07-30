// src/components/arcade/atletaData.test.js
// Regresión lote 3 (lectura): hoyEntrenasDe() comparaba sesiones[].fecha
// contra el hoyISO() del módulo (new Date().toISOString().slice(0,10), UTC).
// sesiones_entrenamiento.fecha ya se escribe en día LOCAL (Ecuador UTC-5)
// desde el fix de la escritura (canchaData.js#startSession y
// AdminPlanificacion.jsx#sesionPayloadDesdeForm), así que compararla contra
// un "hoy" en UTC volvía a desalinear justo de noche en Ecuador: una sesión
// de hoy (fecha local) dejaba de reconocerse como "hoy entrenas" entre las
// 19:00 y medianoche.
//
// OJO: hoyISO() sigue existiendo en el módulo y se sigue usando para filtrar
// eventos (fecha_evento, convocatorias) — tabla y concern DISTINTO, fuera de
// este lote. Este test solo cubre hoyEntrenasDe(), que ahora usa su propio
// hoy en día LOCAL (hoyLocal(), importado de ../../lib/fechasLocal).
//
// Se fuerza America/Guayaquil al TOPE del spec (antes de cualquier import que
// use Date), mismo enfoque ya verificado empíricamente en este runtime por
// src/lib/fechas.test.js.
const TZ_ORIGINAL = process.env.TZ;
process.env.TZ = 'America/Guayaquil';

import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';

// atletaData importa la capa de servicios (vía padreData también), que crea
// el cliente de Supabase en la carga del módulo (createClient revienta sin
// las VITE_SUPABASE_*). Se stubea ese único choke-point, sin mockear
// Promise.all ni nada más — mismo patrón liviano de padreData.test.js.
vi.mock('../../api/supabaseClient', () => ({ supabase: {} }));

import { hoyEntrenasDe } from './atletaData';

afterEach(() => vi.useRealTimers());
afterAll(() => {
  process.env.TZ = TZ_ORIGINAL;
});

// 2026-07-15 20:00 America/Guayaquil == 2026-07-16 01:00Z: en UTC "hoy" ya es
// el 16, mientras que el día calendario LOCAL sigue siendo el 15.
const AHORA_NOCTURNO_ECUADOR = new Date('2026-07-16T01:00:00Z');

describe('hoyEntrenasDe', () => {
  it('reconoce una sesión de HOY (fecha local) en el instante nocturno, sin desalinearse por el día UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA_NOCTURNO_ECUADOR);

    const sesiones = [{ fecha: '2026-07-15', pilar_objetivo: 'Fuerza', notas: 'Sesión de hoy' }];
    const r = hoyEntrenasDe(sesiones);

    expect(r).not.toBeNull();
    expect(r.chip).toBe('HOY');
  });

  it('devuelve null si no hay ninguna sesión con fecha de hoy', () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA_NOCTURNO_ECUADOR);

    expect(hoyEntrenasDe([{ fecha: '2026-07-14' }])).toBeNull();
    expect(hoyEntrenasDe([])).toBeNull();
    expect(hoyEntrenasDe(null)).toBeNull();
  });
});
