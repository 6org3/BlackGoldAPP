// src/components/AdminPlanificacion.test.js
// Regresión lote 3 (escrituras de sesiones_entrenamiento): handleSubmit
// insertaba sin `fecha`, y sesiones_entrenomiento.fecha es DATE DEFAULT
// CURRENT_DATE evaluado por Postgres en UTC — una sesión registrada de noche
// en Ecuador (ya "mañana" en UTC) quedaba archivada un día tarde. A
// diferencia de canchaData.js#startSession, aquí NO había ninguna variable
// de fecha local ya calculada en scope.
//
// El repo no tiene jsdom/testing-library (vite.config.js fija
// environment:'node'), así que un componente JSX no se puede montar ni
// ejecutar su handleSubmit en Vitest. Se extrae sesionPayloadDesdeForm()
// como función pura invocada por handleSubmit — mismo espíritu que las
// funciones puras que padreData.js ya expone para testearse sin renderer.
//
// Se fuerza America/Guayaquil al TOPE del spec (antes de cualquier import
// que use Date), mismo enfoque ya verificado empíricamente en este runtime
// por src/lib/fechas.test.js.
const TZ_ORIGINAL = process.env.TZ;
process.env.TZ = 'America/Guayaquil';

import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';

// AdminPlanificacion.jsx importa la capa de servicios, que crea el cliente
// de Supabase en la carga del módulo (createClient revienta sin las
// VITE_SUPABASE_*). Se stubea ese choke-point para importar la función pura
// sin red ni envs, mismo patrón que padreData.test.js.
vi.mock('../api/supabaseClient', () => ({ supabase: {} }));

import { sesionPayloadDesdeForm } from './AdminPlanificacion';

afterEach(() => vi.useRealTimers());
afterAll(() => {
  process.env.TZ = TZ_ORIGINAL;
});

// 2026-07-15 20:00 America/Guayaquil == 2026-07-16 01:00Z: en UTC "hoy" ya es
// el 16, mientras que el día calendario LOCAL sigue siendo el 15.
const AHORA_NOCTURNO_ECUADOR = new Date('2026-07-16T01:00:00Z');

const FORM = {
  meta_entrenamiento: 'Fuerza',
  tipo_pausa: 'Densidad Baja',
  intensidad_bpm: 'Media',
  parentesco_competencia: 'Generales',
  volumen_especifico_pct: '10',
  duracion_minutos: '60',
  tempo_hsr: 'Regular',
  volumen_series_reps: '4x15',
  notas: 'obs',
  eva_registro: '0',
};

const ATLETA = { atleta_id: 'atleta-1', nombre: 'Atleta Uno' };

describe('sesionPayloadDesdeForm', () => {
  it('incluye fecha LOCAL (no el DEFAULT CURRENT_DATE en UTC del servidor)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA_NOCTURNO_ECUADOR);

    const payload = sesionPayloadDesdeForm(FORM, ATLETA);

    expect(payload.fecha).toBe('2026-07-15');
    expect(payload.atleta_id).toBe('atleta-1');
  });

  it('sigue mapeando el resto de campos del form (parseInt en los numéricos)', () => {
    const payload = sesionPayloadDesdeForm(FORM, ATLETA, '2026-07-15');
    expect(payload.volumen_especifico_pct).toBe(10);
    expect(payload.duracion_minutos).toBe(60);
    expect(payload.eva_registro).toBe(0);
    expect(payload.meta_entrenamiento).toBe('Fuerza');
  });
});
