import { describe, it, expect } from 'vitest';
import {
  seriePorPrueba,
  seriesPorSubPilar,
  agregarDebilidadesGrupo,
  serieGrupalPorSubPilar,
  calcularDelta,
  ultimoValorPrueba,
  compararPruebaGrupo,
} from '../../../packages/analytics-core/tendencias.js';

// Helper para fabricar evaluaciones con la forma de evaluaciones_pruebas.
function evaluacion({ prueba, subPilar, score, fecha, valor = null, tier = null, lado = null }) {
  return {
    prueba_tipo: prueba,
    sub_pilar: subPilar,
    puntuacion_normalizada: score,
    created_at: fecha,
    valor_crudo: valor,
    tier,
    lado,
  };
}

describe('seriePorPrueba', () => {
  it('ordena ascendente por created_at y conserva valor_crudo, tier y lado', () => {
    const evaluaciones = [
      evaluacion({ prueba: 'cmj_salto', subPilar: 'explosividad', score: 75, fecha: '2026-05-10T09:00:00Z', valor: 42, tier: 'above_avg' }),
      evaluacion({ prueba: 'cmj_salto', subPilar: 'explosividad', score: 35, fecha: '2026-01-15T10:30:00Z', valor: 30, tier: 'below_avg' }),
      evaluacion({ prueba: 'dorsiflexion', subPilar: 'movilidad', score: 55, fecha: '2026-02-01T08:00:00Z', valor: 10, tier: 'average', lado: 'izq' }),
      evaluacion({ prueba: 'cmj_salto', subPilar: 'explosividad', score: 55, fecha: '2026-03-20T18:45:00Z', valor: 36, tier: 'average' }),
    ];

    const serie = seriePorPrueba(evaluaciones, 'cmj_salto');

    // Solo las 3 de cmj_salto, de la más antigua a la más reciente
    expect(serie.map(p => p.fecha)).toEqual([
      '2026-01-15T10:30:00Z',
      '2026-03-20T18:45:00Z',
      '2026-05-10T09:00:00Z',
    ]);
    expect(serie[0]).toEqual({
      fecha: '2026-01-15T10:30:00Z',
      valor_crudo: 30,
      puntuacion: 35,
      tier: 'below_avg',
      lado: null,
    });
    expect(serie[2].valor_crudo).toBe(42);
    expect(serie[2].tier).toBe('above_avg');
  });

  it('conserva el lado cuando la prueba es bilateral', () => {
    const serie = seriePorPrueba(
      [evaluacion({ prueba: 'dorsiflexion', subPilar: 'movilidad', score: 55, fecha: '2026-02-01T08:00:00Z', valor: 10, tier: 'average', lado: 'izq' })],
      'dorsiflexion',
    );
    expect(serie[0].lado).toBe('izq');
  });

  it('devuelve array vacío sin datos de esa prueba', () => {
    expect(seriePorPrueba([], 'cmj_salto')).toEqual([]);
    expect(seriePorPrueba(
      [evaluacion({ prueba: 'tiro_libre', subPilar: 'tiro', score: 55, fecha: '2026-01-01T00:00:00Z' })],
      'cmj_salto',
    )).toEqual([]);
  });
});

describe('seriesPorSubPilar', () => {
  it('agrupa por día y promedia las mediciones del mismo día en un solo punto', () => {
    const evaluaciones = [
      // Dos mediciones de movilidad el MISMO día → un punto con el promedio redondeado
      evaluacion({ prueba: 'sit_reach', subPilar: 'movilidad', score: 60, fecha: '2026-01-15T09:00:00Z' }),
      evaluacion({ prueba: 'dorsiflexion', subPilar: 'movilidad', score: 71, fecha: '2026-01-15T17:30:00Z' }),
      // Otro día, desordenado a propósito (anterior al 15)
      evaluacion({ prueba: 'sit_reach', subPilar: 'movilidad', score: 40, fecha: '2026-01-02T10:00:00Z' }),
    ];

    const series = seriesPorSubPilar(evaluaciones);

    expect(series.movilidad).toEqual([
      { fecha: '2026-01-02', score: 40 },
      { fecha: '2026-01-15', score: 66 }, // Math.round((60 + 71) / 2) = 66
    ]);
  });

  it('ignora sub-pilares fuera de RADAR_AXES (p.ej. antropométrico)', () => {
    const series = seriesPorSubPilar([
      evaluacion({ prueba: 'peso_kg', subPilar: 'antropometrico', score: 80, fecha: '2026-01-10T09:00:00Z' }),
      evaluacion({ prueba: 'cmj_salto', subPilar: 'explosividad', score: 55, fecha: '2026-01-10T09:00:00Z' }),
    ]);

    expect(series.antropometrico).toBeUndefined();
    expect(series.explosividad).toEqual([{ fecha: '2026-01-10', score: 55 }]);
  });

  it('siempre expone los 8 ejes del radar, con array vacío si no hay datos', () => {
    const series = seriesPorSubPilar([]);
    expect(Object.keys(series).sort()).toEqual(
      ['agilidad', 'explosividad', 'fuerza', 'movilidad', 'resiliencia', 'resistencia', 'tactica', 'tiro'],
    );
    expect(series.fuerza).toEqual([]);
  });
});

describe('agregarDebilidadesGrupo', () => {
  it('usa la última evaluación por prueba, cuenta débiles y excluye del denominador a atletas sin datos', () => {
    const evaluacionesPorAtleta = {
      atletaA: [
        // Dos mediciones de la misma prueba: solo cuenta la ÚLTIMA (score 20, no 90)
        evaluacion({ prueba: 'sentadilla_rel', subPilar: 'fuerza', score: 90, fecha: '2026-01-05T09:00:00Z' }),
        evaluacion({ prueba: 'sentadilla_rel', subPilar: 'fuerza', score: 20, fecha: '2026-04-05T09:00:00Z' }),
        evaluacion({ prueba: 'sit_reach', subPilar: 'movilidad', score: 80, fecha: '2026-04-05T09:30:00Z' }),
      ],
      atletaB: [
        // Solo tiene datos de fuerza → NO cuenta en el denominador de movilidad
        evaluacion({ prueba: 'sentadilla_rel', subPilar: 'fuerza', score: 60, fecha: '2026-04-06T09:00:00Z' }),
      ],
    };

    const resultado = agregarDebilidadesGrupo(evaluacionesPorAtleta);

    expect(resultado).toEqual([
      // Peor primero: fuerza (40) antes que movilidad (80)
      { sub_pilar: 'fuerza', scorePromedio: 40, atletasDebiles: 1, totalAtletasConDatos: 2 }, // (20+60)/2; solo A (20 → poor) es débil
      { sub_pilar: 'movilidad', scorePromedio: 80, atletasDebiles: 0, totalAtletasConDatos: 1 }, // B no entra al denominador
    ]);
  });

  it('aplica el borde del tier: score 44 es débil (below_avg), score 45 ya no (average)', () => {
    const resultado = agregarDebilidadesGrupo({
      atletaDebil: [evaluacion({ prueba: 'tiro_libre', subPilar: 'tiro', score: 44, fecha: '2026-03-01T09:00:00Z' })],
      atletaJusto: [evaluacion({ prueba: 'tiro_libre', subPilar: 'tiro', score: 45, fecha: '2026-03-01T09:00:00Z' })],
    });

    expect(resultado).toEqual([
      { sub_pilar: 'tiro', scorePromedio: 45, atletasDebiles: 1, totalAtletasConDatos: 2 }, // Math.round(44.5) = 45 (redondeo half-up)
    ]);
  });

  it('devuelve array vacío si ningún atleta tiene evaluaciones', () => {
    expect(agregarDebilidadesGrupo({})).toEqual([]);
    expect(agregarDebilidadesGrupo({ atletaA: [] })).toEqual([]);
  });
});

describe('serieGrupalPorSubPilar', () => {
  it('agrupa por mes todas las mediciones del grupo, con promedio y n correctos', () => {
    const evaluacionesPorAtleta = {
      atletaA: [
        evaluacion({ prueba: 'sit_reach', subPilar: 'movilidad', score: 40, fecha: '2026-01-10T09:00:00Z' }),
        evaluacion({ prueba: 'dorsiflexion', subPilar: 'movilidad', score: 70, fecha: '2026-03-22T09:00:00Z' }),
        // De otro sub-pilar: no debe colarse en la serie de movilidad
        evaluacion({ prueba: 'cmj_salto', subPilar: 'explosividad', score: 99, fecha: '2026-01-10T09:00:00Z' }),
      ],
      atletaB: [
        evaluacion({ prueba: 'sit_reach', subPilar: 'movilidad', score: 61, fecha: '2026-01-25T09:00:00Z' }),
      ],
    };

    const serie = serieGrupalPorSubPilar(evaluacionesPorAtleta, 'movilidad');

    expect(serie).toEqual([
      { mes: '2026-01', score: 51, n: 2 }, // Math.round((40 + 61) / 2) = 51, dos mediciones (A y B)
      { mes: '2026-03', score: 70, n: 1 },
    ]);
  });

  it('devuelve array vacío si el grupo no tiene mediciones de ese sub-pilar', () => {
    expect(serieGrupalPorSubPilar({}, 'movilidad')).toEqual([]);
  });
});

describe('ultimoValorPrueba', () => {
  it('devuelve el valor crudo de la medición más reciente', () => {
    const evaluaciones = [
      evaluacion({ prueba: 'Salto Vertical (CMJ)', subPilar: 'explosividad', score: 35, fecha: '2026-01-15T10:00:00Z', valor: 30 }),
      evaluacion({ prueba: 'Salto Vertical (CMJ)', subPilar: 'explosividad', score: 75, fecha: '2026-05-10T09:00:00Z', valor: 42 }),
      // Otra prueba: no debe interferir
      evaluacion({ prueba: 'Sprint 20m', subPilar: 'agilidad', score: 60, fecha: '2026-06-01T09:00:00Z', valor: 3.4 }),
    ];

    expect(ultimoValorPrueba(evaluaciones, 'Salto Vertical (CMJ)')).toBe(42);
  });

  it('promedia ambos lados de una prueba bilateral medida el mismo día', () => {
    const evaluaciones = [
      // Registro viejo unilateral: no debe mandar
      evaluacion({ prueba: 'Dorsiflexión', subPilar: 'movilidad', score: 40, fecha: '2026-01-05T09:00:00Z', valor: 9 }),
      // Registro más reciente: dos filas izq/der del mismo día
      evaluacion({ prueba: 'Dorsiflexión', subPilar: 'movilidad', score: 55, fecha: '2026-04-20T09:00:00Z', valor: 10, lado: 'izq' }),
      evaluacion({ prueba: 'Dorsiflexión', subPilar: 'movilidad', score: 60, fecha: '2026-04-20T09:05:00Z', valor: 15, lado: 'der' }),
    ];

    expect(ultimoValorPrueba(evaluaciones, 'Dorsiflexión')).toBe(12.5); // (10 + 15) / 2
  });

  it('con reevaluación unilateral el mismo día manda la última fila', () => {
    const evaluaciones = [
      evaluacion({ prueba: 'Tiro Libre', subPilar: 'tiro', score: 50, fecha: '2026-03-01T09:00:00Z', valor: 12, lado: 'unico' }),
      evaluacion({ prueba: 'Tiro Libre', subPilar: 'tiro', score: 70, fecha: '2026-03-01T17:00:00Z', valor: 16, lado: 'unico' }),
    ];

    expect(ultimoValorPrueba(evaluaciones, 'Tiro Libre')).toBe(16);
  });

  it('ignora filas sin valor_crudo y devuelve null si no hay mediciones con valor', () => {
    expect(ultimoValorPrueba([], 'Salto Vertical (CMJ)')).toBeNull();
    expect(ultimoValorPrueba(
      [evaluacion({ prueba: 'Salto Vertical (CMJ)', subPilar: 'explosividad', score: 50, fecha: '2026-01-01T00:00:00Z', valor: null })],
      'Salto Vertical (CMJ)',
    )).toBeNull();
  });
});

describe('compararPruebaGrupo', () => {
  it('incluye solo atletas con dato y calcula la media del conjunto', () => {
    const evaluacionesPorAtleta = {
      atletaA: [
        // Dos mediciones: manda la última (38)
        evaluacion({ prueba: 'Salto Vertical (CMJ)', subPilar: 'explosividad', score: 40, fecha: '2026-01-10T09:00:00Z', valor: 33 }),
        evaluacion({ prueba: 'Salto Vertical (CMJ)', subPilar: 'explosividad', score: 60, fecha: '2026-04-10T09:00:00Z', valor: 38 }),
      ],
      atletaB: [
        evaluacion({ prueba: 'Salto Vertical (CMJ)', subPilar: 'explosividad', score: 70, fecha: '2026-04-11T09:00:00Z', valor: 43 }),
      ],
      // Sin datos de ESA prueba: no aparece ni cuenta en la media
      atletaC: [
        evaluacion({ prueba: 'Sprint 20m', subPilar: 'agilidad', score: 55, fecha: '2026-04-11T09:00:00Z', valor: 3.5 }),
      ],
    };

    const resultado = compararPruebaGrupo(evaluacionesPorAtleta, 'Salto Vertical (CMJ)');

    expect(resultado.atletas).toEqual([
      { atletaId: 'atletaA', valor: 38 },
      { atletaId: 'atletaB', valor: 43 },
    ]);
    expect(resultado.media).toBe(40.5); // (38 + 43) / 2
  });

  it('sin ningún atleta con dato devuelve lista vacía y media null (nunca 0 fingido)', () => {
    expect(compararPruebaGrupo({}, 'Salto Vertical (CMJ)')).toEqual({ atletas: [], media: null });
    expect(compararPruebaGrupo({ atletaA: [] }, 'Salto Vertical (CMJ)')).toEqual({ atletas: [], media: null });
  });
});

describe('calcularDelta', () => {
  it('con datos en ambas ventanas calcula delta = después − antes', () => {
    const antes = [
      evaluacion({ prueba: 'sentadilla_rel', subPilar: 'fuerza', score: 40, fecha: '2026-01-10T09:00:00Z' }),
    ];
    const despues = [
      evaluacion({ prueba: 'sentadilla_rel', subPilar: 'fuerza', score: 55, fecha: '2026-04-10T09:00:00Z' }),
    ];

    expect(calcularDelta(antes, despues)).toEqual([
      { sub_pilar: 'fuerza', antes: 40, despues: 55, delta: 15 },
    ]);
  });

  it('con una ventana vacía devuelve antes y delta null explícitos (nunca 0 fingido)', () => {
    const despues = [
      evaluacion({ prueba: 'sit_reach', subPilar: 'movilidad', score: 62, fecha: '2026-04-10T09:00:00Z' }),
    ];

    expect(calcularDelta([], despues)).toEqual([
      { sub_pilar: 'movilidad', antes: null, despues: 62, delta: null },
    ]);
  });

  it('dentro de cada ventana solo cuenta la última evaluación de cada prueba', () => {
    const antes = [
      evaluacion({ prueba: 'tiro_libre', subPilar: 'tiro', score: 90, fecha: '2026-01-05T09:00:00Z' }),
      evaluacion({ prueba: 'tiro_libre', subPilar: 'tiro', score: 30, fecha: '2026-02-20T09:00:00Z' }), // esta manda
    ];
    const despues = [
      evaluacion({ prueba: 'tiro_libre', subPilar: 'tiro', score: 50, fecha: '2026-05-01T09:00:00Z' }),
    ];

    expect(calcularDelta(antes, despues)).toEqual([
      { sub_pilar: 'tiro', antes: 30, despues: 50, delta: 20 },
    ]);
  });

  it('sin datos en ninguna ventana devuelve array vacío', () => {
    expect(calcularDelta([], [])).toEqual([]);
  });
});
