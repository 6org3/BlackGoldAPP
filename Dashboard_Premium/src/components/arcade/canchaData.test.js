// src/components/arcade/canchaData.test.js
// Regresión lote 3 (escrituras de sesiones_entrenamiento): startSession()
// calcula fechaStr en día LOCAL (Ecuador UTC-5) y ya lo usa para
// sesiones_programadas y asistencia, pero el insert histórico vía
// crearSesionEntrenamiento() no lo pasaba. sesiones_entrenamiento.fecha es
// DATE DEFAULT CURRENT_DATE evaluado por Postgres en UTC — sin pasar `fecha`
// explícita, una sesión iniciada de noche en Ecuador (ya "mañana" en UTC)
// quedaba archivada un día tarde. El fix agrega `fecha: fechaStr`.
//
// Se fuerza America/Guayaquil al TOPE del spec (antes de cualquier import que
// use Date), mismo enfoque ya verificado empíricamente en este runtime por
// src/lib/fechas.test.js.
const TZ_ORIGINAL = process.env.TZ;
process.env.TZ = 'America/Guayaquil';

import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';

// canchaData importa varios servicios cuyo único choke-point de red es
// supabaseClient (createClient revienta sin las VITE_SUPABASE_*): se stubea
// ahí, mismo patrón que padreData.test.js.
vi.mock('../../api/supabaseClient', () => ({ supabase: { from: vi.fn() } }));

const { crearSesionEntrenamientoMock } = vi.hoisted(() => ({
  crearSesionEntrenamientoMock: vi.fn().mockResolvedValue({ id: 'hist-1' }),
}));
vi.mock('../../api/sesionesEntrenamientoService', () => ({
  crearSesionEntrenamiento: crearSesionEntrenamientoMock,
  fetchSesionesAtleta: vi.fn().mockResolvedValue([]),
}));

const { upsertAsistenciaMock } = vi.hoisted(() => ({
  upsertAsistenciaMock: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../api/asistenciaService', () => ({
  upsertAsistencia: upsertAsistenciaMock,
}));

import { supabase } from '../../api/supabaseClient';
import { startSession } from './canchaData';

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

function builderSesionesProgramadas(sesionCreada) {
  const builder = {};
  builder.insert = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.single = vi.fn(() => Promise.resolve({ data: sesionCreada, error: null }));
  return builder;
}

describe('startSession — historial (crearSesionEntrenamiento)', () => {
  it('pasa fecha LOCAL (no el DEFAULT CURRENT_DATE en UTC del servidor) al insert histórico', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA_NOCTURNO_ECUADOR);

    supabase.from.mockReturnValue(builderSesionesProgramadas({ id: 'sp-1' }));

    const roster = [{ id: 'atleta-1', name: 'Atleta Uno' }];
    const present = { 'atleta-1': 'P' };

    await startSession({
      user: { id: 'coach-1' },
      classType: 'grupal',
      level: 'Micro',
      present,
      roster,
      focusName: null,
    });

    expect(crearSesionEntrenamientoMock).toHaveBeenCalledTimes(1);
    const payload = crearSesionEntrenamientoMock.mock.calls[0][0];
    // Hoy LOCAL (Ecuador) = 2026-07-15, aunque en UTC ya sea 2026-07-16.
    expect(payload.fecha).toBe('2026-07-15');
  });
});
