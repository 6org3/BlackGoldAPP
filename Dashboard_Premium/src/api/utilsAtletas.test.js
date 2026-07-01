import { describe, it, expect } from 'vitest';
import { calcularEdad, calcularCategoriaFEB } from './utilsAtletas';

describe('calcularEdad', () => {
  it('devuelve 0 si no hay fecha de nacimiento', () => {
    expect(calcularEdad(null)).toBe(0);
    expect(calcularEdad(undefined)).toBe(0);
  });

  it('devuelve 0 si la fecha es inválida', () => {
    expect(calcularEdad('no-es-una-fecha')).toBe(0);
  });

  it('calcula años completos, no adelanta el cumpleaños del día', () => {
    const hoy = new Date();
    const cumpleHoy = new Date(hoy.getFullYear() - 15, hoy.getMonth(), hoy.getDate());
    expect(calcularEdad(cumpleHoy)).toBe(15);
  });

  it('no cuenta el año si el cumpleaños todavía no llegó este año', () => {
    const hoy = new Date();
    // Cumpleaños mañana (respecto al mes actual, dentro del mismo año relativo).
    const cumpleManana = new Date(hoy.getFullYear() - 15, hoy.getMonth(), hoy.getDate() + 1);
    expect(calcularEdad(cumpleManana)).toBe(14);
  });

  it('cuenta el año si el cumpleaños ya pasó este año', () => {
    const hoy = new Date();
    const cumpleAyer = new Date(hoy.getFullYear() - 15, hoy.getMonth(), hoy.getDate() - 1);
    expect(calcularEdad(cumpleAyer)).toBe(15);
  });
});

describe('calcularCategoriaFEB', () => {
  it('devuelve null sin fecha de nacimiento', () => {
    expect(calcularCategoriaFEB(null)).toBeNull();
    expect(calcularCategoriaFEB(undefined)).toBeNull();
  });

  it('devuelve null para edad 0 o negativa (fecha inválida/futura)', () => {
    expect(calcularCategoriaFEB(0)).toBeNull();
    expect(calcularCategoriaFEB(-1)).toBeNull();
  });

  // Casos límite exactos de cada categoría FEB. Estos umbrales deben coincidir
  // con calcular_categoria_feb() en
  // Dashboard_Premium/supabase/migrations/20260625124501_v18_comunicaciones_eventos.sql:273-287
  // (gemelo SQL) — si cambia uno, hay que cambiar el otro.
  it.each([
    [9, 'Premini (Sub-9)'],
    [10, 'Mini (Sub-11)'],
    [11, 'Mini (Sub-11)'],
    [12, 'Menores (Sub-14)'],
    [14, 'Menores (Sub-14)'],
    [15, 'Prejuvenil (Sub-16)'],
    [16, 'Prejuvenil (Sub-16)'],
    [17, 'Juvenil (Sub-18)'],
    [18, 'Juvenil (Sub-18)'],
    [19, 'Mayores'],
    [30, 'Mayores'],
  ])('edad %i → %s', (edad, categoriaEsperada) => {
    expect(calcularCategoriaFEB(edad)).toBe(categoriaEsperada);
  });

  it('acepta una fecha de nacimiento y deriva la edad internamente', () => {
    const hoy = new Date();
    const fecha16 = new Date(hoy.getFullYear() - 16, hoy.getMonth(), hoy.getDate());
    expect(calcularCategoriaFEB(fecha16)).toBe('Prejuvenil (Sub-16)');
  });
});
