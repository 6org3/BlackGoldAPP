// Tests de analizarPilares (packages/brain-core/diagnostico.js), consumido por
// la tool `analyze_athlete_pillars` de blackgold-mcp.
//
// Regla que fija este spec: una reevaluación vieja de la MISMA prueba
// (prueba_tipo) no debe seguir contaminando el promedio del sub-pilar. La
// definición única de "quedarse con la última evaluación de cada prueba" vive
// en ultimasPorPrueba (analytics-core/recomendaciones.js) y ya la usa
// detectarDebilidades; analizarPilares debe reusarla para no divergir (bug
// brain-01: el MCP marcaba como débil un sub-pilar que la app ya consideraba
// sano, porque sumaba TODAS las filas en vez de solo la última por prueba).
import { describe, it, expect } from 'vitest';
import { analizarPilares } from '../../../packages/brain-core/diagnostico.js';

const atleta = { nombre: 'Atleta Test', fecha_nacimiento: '2012-01-01' };

describe('analizarPilares (brain-core)', () => {
  it('deduplica a la última evaluación por prueba_tipo antes de promediar', () => {
    // sentadilla_rel reevaluada 3 veces, mejorando con el tiempo. Orden como lo
    // entrega el caller real (blackgold-mcp): created_at DESC.
    const evaluaciones = [
      { prueba_tipo: 'sentadilla_rel', sub_pilar: 'fuerza', puntuacion_normalizada: 90, tier: 'excellent', created_at: '2026-07-20T00:00:00Z' },
      { prueba_tipo: 'sentadilla_rel', sub_pilar: 'fuerza', puntuacion_normalizada: 30, tier: 'poor', created_at: '2026-04-20T00:00:00Z' },
      { prueba_tipo: 'sentadilla_rel', sub_pilar: 'fuerza', puntuacion_normalizada: 20, tier: 'poor', created_at: '2026-01-20T00:00:00Z' },
    ];

    const resultado = analizarPilares({ atleta, evaluaciones });

    expect(resultado.pilarStats.fuerza.count).toBe(1);
    expect(resultado.pilarStats.fuerza.sumScore).toBe(90);
    expect(resultado.pilarStats.fuerza.currentTier).toBe('excellent');
    expect(resultado.debiles).not.toContain('fuerza');
  });

  it('no depende del orden de entrada (dedup por created_at, no por posición)', () => {
    // Mismo caso que arriba pero con las filas en orden ASC (más antigua primero):
    // un caller futuro que no ordene DESC debe obtener el mismo resultado.
    const evaluaciones = [
      { prueba_tipo: 'sentadilla_rel', sub_pilar: 'fuerza', puntuacion_normalizada: 20, tier: 'poor', created_at: '2026-01-20T00:00:00Z' },
      { prueba_tipo: 'sentadilla_rel', sub_pilar: 'fuerza', puntuacion_normalizada: 30, tier: 'poor', created_at: '2026-04-20T00:00:00Z' },
      { prueba_tipo: 'sentadilla_rel', sub_pilar: 'fuerza', puntuacion_normalizada: 90, tier: 'excellent', created_at: '2026-07-20T00:00:00Z' },
    ];

    const resultado = analizarPilares({ atleta, evaluaciones });

    expect(resultado.pilarStats.fuerza.count).toBe(1);
    expect(resultado.pilarStats.fuerza.sumScore).toBe(90);
  });

  it('sigue promediando entre pruebas DISTINTAS del mismo sub-pilar (no colapsa de más)', () => {
    // fuerza medida por dos pruebas distintas: cada una aporta su propia última
    // evaluación, y el promedio del sub-pilar sí debe combinarlas.
    const evaluaciones = [
      { prueba_tipo: 'sentadilla_rel', sub_pilar: 'fuerza', puntuacion_normalizada: 80, tier: 'above_avg', created_at: '2026-07-20T00:00:00Z' },
      { prueba_tipo: 'press_banca', sub_pilar: 'fuerza', puntuacion_normalizada: 60, tier: 'average', created_at: '2026-07-19T00:00:00Z' },
    ];

    const resultado = analizarPilares({ atleta, evaluaciones });

    expect(resultado.pilarStats.fuerza.count).toBe(2);
    expect(resultado.pilarStats.fuerza.sumScore).toBe(140);
  });

  it('currentTier no depende del orden de entrada cuando el sub-pilar tiene varios prueba_tipo (brain-01 residual)', () => {
    // press_banca es la evaluacion MAS VIEJA (tier poor) y aparece PRIMERA en el
    // array; sentadilla_rel es la MAS RECIENTE (tier excellent) y aparece despues.
    // El comentario del fix anterior promete que analizarPilares no depende del
    // orden de entrada "en cualquier orden ... sin depender de que ordene DESC".
    // currentTier debe reflejar la evaluacion mas reciente POR FECHA, no la
    // primera del array.
    const fueraDeOrden = [
      { prueba_tipo: 'press_banca', sub_pilar: 'fuerza', puntuacion_normalizada: 20, tier: 'poor', created_at: '2026-01-01T00:00:00Z' },
      { prueba_tipo: 'sentadilla_rel', sub_pilar: 'fuerza', puntuacion_normalizada: 100, tier: 'excellent', created_at: '2026-07-20T00:00:00Z' },
    ];
    const ordenDesc = [...fueraDeOrden].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const resultadoFueraDeOrden = analizarPilares({ atleta, evaluaciones: fueraDeOrden });
    const resultadoDesc = analizarPilares({ atleta, evaluaciones: ordenDesc });

    expect(resultadoFueraDeOrden.pilarStats.fuerza.currentTier).toBe('excellent');
    expect(resultadoFueraDeOrden.debiles).not.toContain('fuerza');
    // Mismos datos, dos ordenes de entrada distintos: mismo resultado.
    expect(resultadoFueraDeOrden.pilarStats.fuerza.currentTier).toBe(resultadoDesc.pilarStats.fuerza.currentTier);
    expect(resultadoFueraDeOrden.debiles).toEqual(resultadoDesc.debiles);
  });

  it('mantiene el resto de la forma de salida (categoria, notasSubjetivas)', () => {
    const evaluaciones = [
      { prueba_tipo: 'sentadilla_rel', sub_pilar: 'fuerza', puntuacion_normalizada: 90, tier: 'excellent', created_at: '2026-07-20T00:00:00Z', notas: 'buena técnica' },
    ];

    const resultado = analizarPilares({ atleta, evaluaciones });

    expect(resultado.categoria).toBeTruthy();
    expect(resultado.notasSubjetivas).toEqual(['[fuerza] buena técnica']);
  });
});
