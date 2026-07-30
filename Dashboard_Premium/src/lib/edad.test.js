import { describe, it, expect } from 'vitest';
import { fechaNacimientoDeEdad, parseEdad, rangoFechaNacimientoPorCategoria } from './edad';

// Fecha fija: sin esto los casos de borde (cumpleaños hoy) dependerían del día
// en que se corre la suite.
const HOY = new Date(2026, 6, 15); // 15 de julio de 2026

describe('fechaNacimientoDeEdad', () => {
  it('devuelve la fecha de quien cumple esa edad hoy', () => {
    expect(fechaNacimientoDeEdad(10, HOY)).toBe('2016-07-15');
    expect(fechaNacimientoDeEdad(0, HOY)).toBe('2026-07-15');
  });

  it('rellena mes y día a dos dígitos', () => {
    expect(fechaNacimientoDeEdad(12, new Date(2026, 0, 5))).toBe('2014-01-05');
  });

  it('no se desplaza un día por la zona horaria', () => {
    // El bug clásico: toISOString() pasa a UTC y en Ecuador (UTC-5) devolvería
    // el día anterior. La fecha local debe conservarse tal cual.
    expect(fechaNacimientoDeEdad(9, new Date(2026, 2, 1))).toBe('2017-03-01');
  });

  it('un 29 de febrero se normaliza al 1 de marzo en año no bisiesto', () => {
    // 2024 es bisiesto, 2014 no: Date normaliza el 29-feb-2014 inexistente.
    // Documenta el comportamiento real; el desplazamiento de un día no afecta
    // al filtro (el rango sigue siendo un intervalo contiguo).
    expect(fechaNacimientoDeEdad(10, new Date(2024, 1, 29))).toBe('2014-03-01');
  });
});

describe('parseEdad', () => {
  it('vacío o nulo no acota', () => {
    expect(parseEdad('')).toBeUndefined();
    expect(parseEdad(null)).toBeUndefined();
    expect(parseEdad(undefined)).toBeUndefined();
  });

  it('cero es un valor real, no "sin acotar"', () => {
    expect(parseEdad('0')).toBe(0);
  });

  it('convierte números válidos', () => {
    expect(parseEdad('14')).toBe(14);
    expect(parseEdad(14)).toBe(14);
  });

  it('descarta negativos y basura', () => {
    expect(parseEdad('-3')).toBeUndefined();
    expect(parseEdad('abc')).toBeUndefined();
    expect(parseEdad(NaN)).toBeUndefined();
  });
});

// coherencia-01: reemplaza los .eq('usuarios.categoria_feb', X) de
// atletasService.js/AdminMisiones.jsx — la categoría se traduce a un rango de
// fecha_nacimiento en vez de leer la columna GENERATED congelada.
describe('rangoFechaNacimientoPorCategoria', () => {
  it('categoría intermedia (con techo): fechaNacLte y fechaNacGt acotan ambos extremos', () => {
    // Menores (Sub-14): min 12, max 14.
    expect(rangoFechaNacimientoPorCategoria('Menores (Sub-14)', HOY)).toEqual({
      fechaNacLte: fechaNacimientoDeEdad(12, HOY), // nació hace AL MENOS 12 años
      fechaNacGt: fechaNacimientoDeEdad(15, HOY),  // no ha cumplido 15 todavía
    });
  });

  it('Premini (Sub-9): min 1, max 9', () => {
    expect(rangoFechaNacimientoPorCategoria('Premini (Sub-9)', HOY)).toEqual({
      fechaNacLte: fechaNacimientoDeEdad(1, HOY),
      fechaNacGt: fechaNacimientoDeEdad(10, HOY),
    });
  });

  it('Mayores: sin techo de edad, fechaNacGt viene undefined (no se aplica .gt)', () => {
    const rango = rangoFechaNacimientoPorCategoria('Mayores', HOY);
    expect(rango.fechaNacLte).toBe(fechaNacimientoDeEdad(19, HOY));
    expect(rango.fechaNacGt).toBeUndefined();
  });

  it('categoría no canónica devuelve null (el caller debe aplicar un filtro de "cero resultados")', () => {
    expect(rangoFechaNacimientoPorCategoria('Sub-15', HOY)).toBeNull();
    expect(rangoFechaNacimientoPorCategoria('', HOY)).toBeNull();
    expect(rangoFechaNacimientoPorCategoria(undefined, HOY)).toBeNull();
  });
});
