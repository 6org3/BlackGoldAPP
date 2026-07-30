// Regresión analytics-01: calcularEdad/calcularCategoriaFEB reciben
// fecha_nacimiento como 'YYYY-MM-DD' puro en producción — columna `date` de
// Postgres (usuarios.fecha_nacimiento) o el value de un <input type="date">,
// NUNCA un objeto Date (ver callers reales trazados: AdminAtletasForm.jsx,
// useAdminAtletasForm.js, atletasService.js, AdminMisiones.jsx,
// SolicitudesPanel.jsx, RegistroPage.jsx).
//
// El bug: `new Date('YYYY-MM-DD')` la interpreta como medianoche UTC; leerla
// luego con getFullYear/getMonth/getDate (locales) en un huso detrás de UTC
// (Ecuador, UTC-5) la lee un día antes, así que el cumpleaños se adelanta.
//
// El corrimiento es cero en UTC (medianoche UTC leída con getters UTC no se
// mueve), así que el bug es invisible si la suite corre en CI (ubuntu, UTC).
// Se fuerza America/Guayaquil al TOPE del spec para que reproduzca igual en
// CI y en local — mismo enfoque y misma verificación empírica que
// src/lib/fechas.test.js.
const TZ_ORIGINAL = process.env.TZ;
process.env.TZ = 'America/Guayaquil';

import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import { calcularEdad, calcularCategoriaFEB } from './utilsAtletas';

afterEach(() => vi.useRealTimers());
afterAll(() => {
  process.env.TZ = TZ_ORIGINAL;
});

// Mediodía UTC: mismo día calendario en UTC y en America/Guayaquil (UTC-5),
// así "hoy" no depende del huso donde corra la suite.
const HOY_UTC_MEDIODIA = new Date('2026-07-15T12:00:00Z');

describe('calcularEdad — fecha_nacimiento como string YYYY-MM-DD (dato real)', () => {
  it('cumpleaños MAÑANA: no cuenta el año todavía (el bug lo adelantaba a hoy)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(HOY_UTC_MEDIODIA);
    expect(calcularEdad('2011-07-16')).toBe(14);
  });

  it('cumpleaños HOY: cuenta el año completo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(HOY_UTC_MEDIODIA);
    expect(calcularEdad('2011-07-15')).toBe(15);
  });

  it('cumpleaños AYER: ya cuenta el año', () => {
    vi.useFakeTimers();
    vi.setSystemTime(HOY_UTC_MEDIODIA);
    expect(calcularEdad('2011-07-14')).toBe(15);
  });
});

describe('calcularCategoriaFEB — mismo string, en el borde de categoría', () => {
  it('quien cumple 10 mañana sigue Premini hoy (el bug lo pasaba a Mini un año antes)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(HOY_UTC_MEDIODIA);
    expect(calcularCategoriaFEB('2016-07-16')).toBe('Premini (Sub-9)');
  });
});
