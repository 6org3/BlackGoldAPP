// Regresión lib-01: claveDia/claveMes (packages/analytics-core/tendencias.js)
// agrupaban por el día/mes UTC de created_at (timestamptz), no por el día/mes
// LOCAL del club. Una evaluación cargada a las 20:00 hora Ecuador cae después
// de medianoche UTC y el día (o mes, cerca de fin de mes) quedaba adelantado
// un día en seriesPorSubPilar/serieGrupalPorSubPilar.
//
// El corrimiento es cero en UTC, así que el bug es invisible si la suite
// corre en CI (ubuntu, UTC). Se fuerza America/Guayaquil al TOPE del spec
// para que reproduzca igual en CI y en local — mismo enfoque que
// src/lib/fechas.test.js.
const TZ_ORIGINAL = process.env.TZ;
process.env.TZ = 'America/Guayaquil';

import { describe, it, expect, afterAll } from 'vitest';
import { seriesPorSubPilar, serieGrupalPorSubPilar } from '../../../packages/analytics-core/tendencias.js';

afterAll(() => {
  process.env.TZ = TZ_ORIGINAL;
});

function evaluacion({ prueba, subPilar, score, fecha }) {
  return { prueba_tipo: prueba, sub_pilar: subPilar, puntuacion_normalizada: score, created_at: fecha };
}

describe('seriesPorSubPilar — agrupación por DÍA local, no UTC', () => {
  it('una evaluación de las 20:00 hora Ecuador cae en el día LOCAL, no en el día UTC siguiente', () => {
    // 2026-07-15 20:00 America/Guayaquil == 2026-07-16 01:00Z
    const series = seriesPorSubPilar([
      evaluacion({ prueba: 'sit_reach', subPilar: 'movilidad', score: 60, fecha: '2026-07-16T01:00:00Z' }),
    ]);
    expect(series.movilidad).toEqual([{ fecha: '2026-07-15', score: 60 }]);
  });
});

describe('serieGrupalPorSubPilar — agrupación por MES local, no UTC', () => {
  it('una evaluación nocturna de fin de mes cae en el MES local, no en el mes UTC siguiente', () => {
    // 2026-07-31 20:00 America/Guayaquil == 2026-08-01 01:00Z
    const serie = serieGrupalPorSubPilar(
      { atletaA: [evaluacion({ prueba: 'sit_reach', subPilar: 'movilidad', score: 60, fecha: '2026-08-01T01:00:00Z' })] },
      'movilidad',
    );
    expect(serie).toEqual([{ mes: '2026-07', score: 60, n: 1 }]);
  });
});
