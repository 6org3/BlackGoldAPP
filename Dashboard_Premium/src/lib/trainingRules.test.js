import { describe, expect, it } from 'vitest';
import { getRecoveryRecommendations } from './trainingRules';

describe('getRecoveryRecommendations', () => {
  it('uses the canonical mobility restriction after the v15 taxonomy migration', () => {
    const recommendations = getRecoveryRecommendations({
      restriccion_movilidad: 'Intolerancia a Carga Axial',
      _evaluaciones: [],
    });

    expect(recommendations).toContain(
      'Restricción registrada: Intolerancia a Carga Axial. Revisar selección de ejercicios antes de cada sesión.',
    );
    expect(recommendations.some((item) => item.includes('progresión con isometría'))).toBe(true);
  });
});
