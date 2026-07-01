import { describe, it, expect } from 'vitest';
import { getXPProgress, NIVELES_XP } from './xpProgress';

describe('getXPProgress', () => {
  it('trata XP nulo/indefinido/no numérico como 0', () => {
    expect(getXPProgress(undefined).current).toBe(0);
    expect(getXPProgress(null).current).toBe(0);
    expect(getXPProgress('no-es-numero').current).toBe(0);
  });

  it.each([
    [0, 'rookie', 'Prospecto'],
    [999, 'rookie', 'Prospecto'],
    [1000, 'prospecto', 'Desarrollo'],
    [2499, 'prospecto', 'Desarrollo'],
    [2500, 'desarrollo', 'Élite'],
    [4999, 'desarrollo', 'Élite'],
    [5000, 'elite', 'Leyenda Mamba'],
    [7499, 'elite', 'Leyenda Mamba'],
  ])('xp=%i → rango actual %s, próximo %s', (xp, rangoIdEsperado, nombreSiguienteEsperado) => {
    const resultado = getXPProgress(xp);
    expect(resultado.currentRango.id).toBe(rangoIdEsperado);
    expect(resultado.nextLevelName).toBe(nombreSiguienteEsperado);
  });

  it('en el rango máximo (Leyenda Mamba) el progreso es 100% y no hay siguiente nivel', () => {
    const resultado = getXPProgress(7500);
    expect(resultado.currentRango.id).toBe('leyenda_mamba');
    expect(resultado.nextLevelName).toBe('MAX');
    expect(resultado.percentage).toBe(100);
  });

  it('XP muy por encima del máximo se sigue tratando como Leyenda Mamba al 100%', () => {
    const resultado = getXPProgress(999999);
    expect(resultado.currentRango.id).toBe('leyenda_mamba');
    expect(resultado.percentage).toBe(100);
  });

  it('el porcentaje es 0 justo al entrar a un rango nuevo', () => {
    const resultado = getXPProgress(1000);
    expect(resultado.percentage).toBe(0);
  });

  it('el porcentaje sube conforme se acerca al siguiente rango', () => {
    // Rango prospecto: 1000 a 2500 (rango de 1500 XP). A mitad de camino (1750) → 50%.
    const resultado = getXPProgress(1750);
    expect(resultado.percentage).toBe(50);
  });

  it('NIVELES_XP está ordenado ascendentemente por mínimo de XP', () => {
    for (let i = 1; i < NIVELES_XP.length; i++) {
      expect(NIVELES_XP[i].min).toBeGreaterThan(NIVELES_XP[i - 1].min);
    }
  });
});
