// Integración de plantillas (catalogo_sesiones) + drills (ejercicios_catalogo)
// en Modo Cancha: gating/auto-omisión del paso 'objetivo', toggle de plantilla,
// navegación BACK, adjunción a la sesión creada, RESET, y resolución de drills.
import { describe, it, expect, vi } from 'vitest';

// useCanchaSession → canchaData → supabaseClient (createClient lanza sin env en
// node); se mockea para poder importar el reducer puro y resolveDrills.
vi.mock('../../api/supabaseClient', () => ({ supabase: {} }));

import { reducer, initialState } from './useCanchaSession';
import { resolveDrills } from './canchaData';

const base = (over = {}) => ({ ...initialState(), ...over });
const P = (over = {}) => ({
  id: 'pl1',
  titulo: 'Físico - Fuerza',
  pilar: 'fisico',
  sub_pilar: 'fuerza',
  enfoque: 'Fuerza',
  ejerciciosIds: [],
  drills: [],
  ...over,
});

describe('reducer · gating y auto-omisión del paso objetivo', () => {
  it('SET_PLANTILLAS fija hasPlantillas en ambos sentidos', () => {
    expect(reducer(base(), { type: 'SET_PLANTILLAS', has: true }).hasPlantillas).toBe(true);
    expect(reducer(base({ hasPlantillas: true }), { type: 'SET_PLANTILLAS', has: false }).hasPlantillas).toBe(false);
  });

  it('PICK_LEVEL → objetivo con plantillas, → lista sin ellas', () => {
    expect(reducer(base({ hasPlantillas: true }), { type: 'PICK_LEVEL', level: 'Micro' }).step).toBe('objetivo');
    expect(reducer(base({ hasPlantillas: false }), { type: 'PICK_LEVEL', level: 'Micro' }).step).toBe('lista');
  });

  it('TO_OBJETIVO (avance desde buscador) respeta el mismo gating', () => {
    expect(reducer(base({ hasPlantillas: true }), { type: 'TO_OBJETIVO' }).step).toBe('objetivo');
    expect(reducer(base({ hasPlantillas: false }), { type: 'TO_OBJETIVO' }).step).toBe('lista');
  });

  it('OBJETIVO_DONE avanza a lista', () => {
    expect(reducer(base({ step: 'objetivo', hasPlantillas: true }), { type: 'OBJETIVO_DONE' }).step).toBe('lista');
  });
});

describe('reducer · PICK_PLANTILLA (toggle exclusivo)', () => {
  it('selecciona cuando no había ninguna', () => {
    const s = reducer(base(), { type: 'PICK_PLANTILLA', plantilla: P() });
    expect(s.plantilla?.id).toBe('pl1');
  });

  it('deselecciona al reelegir la misma (toggle off)', () => {
    const s = reducer(base({ plantilla: P() }), { type: 'PICK_PLANTILLA', plantilla: P() });
    expect(s.plantilla).toBeNull();
  });

  it('reemplaza al elegir otra distinta', () => {
    const s = reducer(base({ plantilla: P() }), { type: 'PICK_PLANTILLA', plantilla: P({ id: 'pl2', titulo: 'Otra' }) });
    expect(s.plantilla?.id).toBe('pl2');
  });
});

describe('reducer · BACK desde objetivo y lista', () => {
  it('BACK desde objetivo: 1v1 → buscador, grupal → nivel', () => {
    expect(reducer(base({ step: 'objetivo', classType: '1v1' }), { type: 'BACK' }).step).toBe('buscador');
    expect(reducer(base({ step: 'objetivo', classType: 'grupal' }), { type: 'BACK' }).step).toBe('nivel');
  });

  it('BACK desde lista con plantillas → objetivo (1v1 y grupal)', () => {
    expect(reducer(base({ step: 'lista', hasPlantillas: true, classType: 'grupal' }), { type: 'BACK' }).step).toBe('objetivo');
    expect(reducer(base({ step: 'lista', hasPlantillas: true, classType: '1v1' }), { type: 'BACK' }).step).toBe('objetivo');
  });

  it('BACK desde lista sin plantillas → buscador (1v1) o nivel (grupal)', () => {
    expect(reducer(base({ step: 'lista', hasPlantillas: false, classType: '1v1' }), { type: 'BACK' }).step).toBe('buscador');
    expect(reducer(base({ step: 'lista', hasPlantillas: false, classType: 'grupal' }), { type: 'BACK' }).step).toBe('nivel');
  });
});

describe('reducer · la plantilla viaja a la sesión creada', () => {
  it('ADD_SESSION (real) adjunta state.plantilla', () => {
    const pl = P({ drills: [{ nombre: 'Sentadilla', tipo: 'Físico' }] });
    const s = reducer(base({ sessions: [], plantilla: pl }), { type: 'ADD_SESSION', session: { id: 'sess1', label: 'L' } });
    expect(s.step).toBe('activa');
    expect(s.focusedId).toBe('sess1');
    expect(s.sessions.at(-1).plantilla).toBe(pl);
  });

  it('START (mock local) adjunta state.plantilla y conserva el marker [EN_CURSO]', () => {
    const pl = P();
    const s = reducer(base({ sessions: [], plantilla: pl }), { type: 'START', id: 'main-1', label: 'L', start: '10:00', present: 3 });
    expect(s.sessions.at(-1).plantilla).toBe(pl);
    expect(s.sessions.at(-1).notas).toBe('[EN_CURSO] L');
  });

  it('sin plantilla elegida, la sesión creada lleva plantilla null', () => {
    const s = reducer(base({ sessions: [], plantilla: null }), { type: 'START', id: 'main-2', label: 'X', start: '11:00', present: 1 });
    expect(s.sessions.at(-1).plantilla).toBeNull();
  });
});

describe('reducer · RESET', () => {
  it('limpia plantilla y conserva hasPlantillas (el catálogo no cambia)', () => {
    const s = reducer(base({ plantilla: P(), hasPlantillas: true, step: 'cierre' }), { type: 'RESET' });
    expect(s.plantilla).toBeNull();
    expect(s.hasPlantillas).toBe(true);
    expect(s.step).toBe('cancha');
  });
});

describe('resolveDrills', () => {
  const map = new Map([
    ['a', { nombre: 'Sentadilla', tipo: 'Físico' }],
    ['b', { nombre: 'Dominadas', tipo: 'Físico' }],
  ]);

  it('resuelve ids conocidos a { nombre, tipo } en orden', () => {
    expect(resolveDrills(['a', 'b'], map)).toEqual([
      { nombre: 'Sentadilla', tipo: 'Físico' },
      { nombre: 'Dominadas', tipo: 'Físico' },
    ]);
  });

  it('filtra ids huérfanos (no presentes en el mapa)', () => {
    expect(resolveDrills(['a', 'zzz', 'b'], map)).toEqual([
      { nombre: 'Sentadilla', tipo: 'Físico' },
      { nombre: 'Dominadas', tipo: 'Físico' },
    ]);
  });

  it('array vacío → []', () => {
    expect(resolveDrills([], map)).toEqual([]);
  });

  it('entrada no-array o mapa ausente → []', () => {
    expect(resolveDrills(null, map)).toEqual([]);
    expect(resolveDrills(undefined, map)).toEqual([]);
    expect(resolveDrills(['a'], null)).toEqual([]);
  });
});
