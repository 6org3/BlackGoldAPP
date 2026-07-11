import { describe, it, expect } from 'vitest';
import { nombresCortos } from './nombresCortos';

describe('nombresCortos', () => {
  it('sin colisión: primer token de cada nombre', () => {
    const m = nombresCortos(['CMJ (salto vertical)', 'Yo-Yo IR1', 'Lane Agility']);
    expect(m.get('CMJ (salto vertical)')).toBe('CMJ');
    expect(m.get('Yo-Yo IR1')).toBe('Yo-Yo');
    expect(m.get('Lane Agility')).toBe('Lane');
  });

  it('colisión a un token: extiende solo a los que chocan', () => {
    const m = nombresCortos(['Sprint 20m', 'Sprint 40m', 'Tiro libre']);
    expect(m.get('Sprint 20m')).toBe('Sprint 20m');
    expect(m.get('Sprint 40m')).toBe('Sprint 40m');
    expect(m.get('Tiro libre')).toBe('Tiro');
  });

  it('colisión en cascada: extiende hasta ser único', () => {
    const m = nombresCortos(['Salto vertical con impulso', 'Salto vertical sin impulso']);
    expect(m.get('Salto vertical con impulso')).toBe('Salto vertical con');
    expect(m.get('Salto vertical sin impulso')).toBe('Salto vertical sin');
  });

  it('nombre de un solo token que colisiona con el prefijo de otro se queda corto', () => {
    const m = nombresCortos(['Sprint', 'Sprint 20m']);
    expect(m.get('Sprint')).toBe('Sprint');
    expect(m.get('Sprint 20m')).toBe('Sprint 20m');
  });

  it('nombres idénticos no cuelgan el bucle y terminan iguales', () => {
    const m = nombresCortos(['CMJ', 'CMJ']);
    expect(m.get('CMJ')).toBe('CMJ');
  });

  it('string vacío o espacios → "—"', () => {
    const m = nombresCortos(['', '   ']);
    expect(m.get('')).toBe('—');
    expect(m.get('   ')).toBe('—');
  });
});
