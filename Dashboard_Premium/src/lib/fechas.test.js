// packages/analytics-core/fechas.js — helper único de "día del club" (día
// calendario LOCAL del runtime: dispositivo del usuario o proceso del MCP),
// mismo enfoque que hoyLocal() en
// Dashboard_Premium/src/api/retencionService.js:27-32.
//
// Se fuerza America/Guayaquil al TOPE del spec (antes de cualquier uso de
// Date) para que las aserciones de "huso detrás de UTC" reproduzcan igual en
// CI (ubuntu, corre en UTC) y en local (America/Guayaquil): verificado
// empíricamente que Node respeta process.env.TZ asignado aquí en este
// runtime (Windows) antes de construir cualquier Date.
const TZ_ORIGINAL = process.env.TZ;
process.env.TZ = 'America/Guayaquil';

import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import { hoyLocal, claveDiaLocal, claveMesLocal } from '../../../packages/analytics-core/fechas.js';

afterEach(() => vi.useRealTimers());
afterAll(() => {
  process.env.TZ = TZ_ORIGINAL;
});

describe('hoyLocal', () => {
  it('devuelve el día calendario local de hoy (mediodía UTC: mismo día en UTC y en UTC-5)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
    expect(hoyLocal()).toBe('2026-07-15');
  });
});

describe('claveDiaLocal', () => {
  it('una evaluación nocturna de Ecuador (20:00) cae en el día LOCAL, no en el día UTC siguiente', () => {
    // 2026-07-15 20:00 America/Guayaquil == 2026-07-16 01:00Z
    expect(claveDiaLocal('2026-07-16T01:00:00Z')).toBe('2026-07-15');
  });

  it('una fecha "YYYY-MM-DD" pura se devuelve TAL CUAL, sin pasar por new Date (evitaría restar un día en UTC-5)', () => {
    expect(claveDiaLocal('2026-07-15')).toBe('2026-07-15');
  });

  it('con un timestamp que no cruza medianoche local, coincide con el día UTC', () => {
    expect(claveDiaLocal('2026-07-15T12:00:00Z')).toBe('2026-07-15');
  });
});

describe('claveMesLocal', () => {
  it('una evaluación nocturna de fin de mes cae en el MES local, no en el mes UTC siguiente', () => {
    // 2026-07-31 20:00 America/Guayaquil == 2026-08-01 01:00Z
    expect(claveMesLocal('2026-08-01T01:00:00Z')).toBe('2026-07');
  });

  it('una fecha "YYYY-MM-DD" pura se devuelve con su mes TAL CUAL', () => {
    expect(claveMesLocal('2026-07-15')).toBe('2026-07');
  });
});
