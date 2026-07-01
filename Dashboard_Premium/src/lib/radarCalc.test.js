import { describe, it, expect } from 'vitest';
import { getSubPilarScores, build3LayerRadarData, RADAR_AXES } from './radarCalc';

describe('getSubPilarScores', () => {
  it('devuelve todos los ejes en 0 sin evaluaciones', () => {
    const scores = getSubPilarScores([]);
    RADAR_AXES.forEach(({ key }) => {
      expect(scores[key]).toBe(0);
    });
  });

  it('promedia las puntuaciones por sub_pilar', () => {
    const scores = getSubPilarScores([
      { sub_pilar: 'fuerza', puntuacion_normalizada: 60 },
      { sub_pilar: 'fuerza', puntuacion_normalizada: 80 },
      { sub_pilar: 'tiro', puntuacion_normalizada: 95 },
    ]);
    expect(scores.fuerza).toBe(70);
    expect(scores.tiro).toBe(95);
    expect(scores.explosividad).toBe(0); // sin datos
  });

  it('redondea el promedio al entero más cercano', () => {
    const scores = getSubPilarScores([
      { sub_pilar: 'agilidad', puntuacion_normalizada: 55 },
      { sub_pilar: 'agilidad', puntuacion_normalizada: 56 },
    ]);
    expect(scores.agilidad).toBe(56); // (55+56)/2 = 55.5 → redondea a 56
  });

  it('ignora sub_pilares que no están en RADAR_AXES', () => {
    const scores = getSubPilarScores([
      { sub_pilar: 'sub_pilar_desconocido', puntuacion_normalizada: 100 },
    ]);
    expect(scores.sub_pilar_desconocido).toBeUndefined();
  });
});

describe('build3LayerRadarData', () => {
  it('construye una fila por eje con las 3 capas (atleta/categoría/club)', () => {
    const atletaScores = { fuerza: 70, explosividad: 60, movilidad: 50, tiro: 40, agilidad: 30, tactica: 20, resiliencia: 10 };
    const categoriaScores = [{ fuerza: 60 }, { fuerza: 80 }];
    const clubScores = [{ fuerza: 50 }];

    const data = build3LayerRadarData(atletaScores, categoriaScores, clubScores);

    expect(data).toHaveLength(RADAR_AXES.length);
    const filaFuerza = data.find(d => d.subject === 'Fuerza');
    expect(filaFuerza.Atleta).toBe(70);
    expect(filaFuerza.Categoria).toBe(70); // promedio de [60,80]
    expect(filaFuerza.Club).toBe(50);
    expect(filaFuerza.fullMark).toBe(100);
  });

  it('usa 0 cuando faltan datos del atleta o de los arrays de comparación', () => {
    const data = build3LayerRadarData({}, [], []);
    data.forEach(fila => {
      expect(fila.Atleta).toBe(0);
      expect(fila.Categoria).toBe(0);
      expect(fila.Club).toBe(0);
    });
  });
});
