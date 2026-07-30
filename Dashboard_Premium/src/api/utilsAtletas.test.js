import { describe, it, expect } from 'vitest';
import { calcularEdad, calcularCategoriaFEB, RANGOS_EDAD_FEB } from './utilsAtletas';

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

// coherencia-01: RANGOS_EDAD_FEB es la tabla que atletasService.js/
// AdminMisiones.jsx/blackgold-negocio-mcp traducen a rangos de
// fecha_nacimiento para no leer la columna congelada usuarios.categoria_feb.
// Si alguien cambia un umbral en un solo lado (esta tabla o
// calcularCategoriaFEB), esta suite lo detecta recorriendo todas las edades.
describe('RANGOS_EDAD_FEB — no diverge de calcularCategoriaFEB', () => {
  it('cubre exactamente las 6 categorías canónicas', () => {
    expect(Object.keys(RANGOS_EDAD_FEB).sort()).toEqual(
      [
        'Premini (Sub-9)',
        'Mini (Sub-11)',
        'Menores (Sub-14)',
        'Prejuvenil (Sub-16)',
        'Juvenil (Sub-18)',
        'Mayores',
      ].sort()
    );
  });

  it.each(Array.from({ length: 40 }, (_, i) => i))('edad %i: la categoría de la tabla coincide con calcularCategoriaFEB', (edad) => {
    const esperada = calcularCategoriaFEB(edad);
    const categoriaDeTabla = Object.entries(RANGOS_EDAD_FEB).find(
      ([, { min, max }]) => edad >= min && (max === null || edad <= max)
    )?.[0] ?? null;
    expect(categoriaDeTabla).toBe(esperada);
  });

  it('Mayores no tiene techo de edad (max: null)', () => {
    expect(RANGOS_EDAD_FEB['Mayores'].max).toBeNull();
    expect(calcularCategoriaFEB(120)).toBe('Mayores');
  });
});
