// Fixes de racha e insignias del portal Atleta (revisión E2E del PR #49):
//  1. contarRachaDias: cuenta DÍAS, no filas (dedup por fecha) — evita inflar la
//     racha cuando hay >1 asistencia por día (pase de lista + Modo Cancha).
//  2. insignias del selector: para un atleta real sin conteos (error de lectura)
//     muestra 0/bloqueadas, no los conteos mock; el mock se reserva a demo.
import { describe, it, expect, vi } from 'vitest';

// atletaData importa supabaseClient (createClient con env ausente lanza en node);
// se mockea para poder importar la función pura contarRachaDias.
vi.mock('../../api/supabaseClient', () => ({ supabase: {} }));

import { contarRachaDias } from './atletaData';
import { buildAtletaCtx } from './atletaSelectors';

// filas YA ordenadas por fecha desc (como las entrega la query .order(fecha desc)).
const row = (fecha, estado) => ({ fecha, estado, created_at: fecha });

describe('contarRachaDias · racha por días, no por filas', () => {
  it('un día con 2 "Presente" (pase de lista + Modo Cancha) cuenta 1, no 2', () => {
    expect(contarRachaDias([
      row('2026-07-13', 'Presente'), row('2026-07-13', 'Presente'), // mismo día
      row('2026-07-12', 'Presente'),
    ])).toBe(2); // 2 días, no 3 filas
  });

  it('"Ausente" rompe la racha', () => {
    expect(contarRachaDias([
      row('2026-07-13', 'Presente'), row('2026-07-12', 'Ausente'), row('2026-07-11', 'Presente'),
    ])).toBe(1);
  });

  it('un día con Presente y Ausente rompe (Ausente manda)', () => {
    expect(contarRachaDias([
      row('2026-07-13', 'Presente'), row('2026-07-13', 'Ausente'), row('2026-07-12', 'Presente'),
    ])).toBe(0); // el día más reciente tiene Ausente → rompe de entrada
  });

  it('Justificada/Lesionado son días neutros: ni suman ni rompen', () => {
    expect(contarRachaDias([
      row('2026-07-13', 'Presente'), row('2026-07-12', 'Justificada'),
      row('2026-07-11', 'Presente'), row('2026-07-10', 'Lesionado'),
      row('2026-07-09', 'Presente'),
    ])).toBe(3); // 13, 11, 09 presentes; 12 y 10 neutros; sin Ausente
  });
});

describe('selector insignias · fallback correcto por demo vs real', () => {
  const baseData = (over) => ({
    demo: false, profile: { nivelDesarrollo: 'Micro', pwr: 64, xp: { current: 1200 } },
    radar: [], weeks: null, insigniasCounts: null, ...over,
  });
  const state = { aTab: 'progreso', aPilar: 'explosividad' };
  const actions = { pilarPick: () => {}, back: () => {} };
  const insigniasDe = (data) => buildAtletaCtx(state, data, actions).insignias;

  it('atleta REAL sin conteos (error de lectura) → todas bloqueadas, NO mock', () => {
    const ins = insigniasDe(baseData({ demo: false, insigniasCounts: null }));
    expect(ins.every((b) => b.unlocked === false)).toBe(true);
    expect(ins.every((b) => b.countLabel === '—')).toBe(true);
  });

  it('DEMO sin conteos → usa los conteos mock (Motor ×2, Mamba ×1)', () => {
    const ins = insigniasDe(baseData({ demo: true, insigniasCounts: null }));
    expect(ins[0].unlocked).toBe(true); expect(ins[0].countLabel).toBe('×2'); // Motor Inagotable
    expect(ins[1].unlocked).toBe(true); expect(ins[1].countLabel).toBe('×1'); // Mamba Mentality
  });

  it('atleta REAL con conteos reales → refleja el conteo, 0 = bloqueada', () => {
    const ins = insigniasDe(baseData({ demo: false, insigniasCounts: { 'Motor Inagotable': 3 } }));
    expect(ins[0].countLabel).toBe('×3'); // Motor real
    expect(ins[1].countLabel).toBe('—');  // Mamba ausente en counts → 0/bloqueada
  });
});
