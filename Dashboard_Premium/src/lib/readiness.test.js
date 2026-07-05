// Tests del motor de recuperación / readiness (analytics-core/readiness.js).
// La recuperación es una señal de disponibilidad/riesgo (sueño, fatiga, hidratación),
// NO una nota de rendimiento. El score es puro y determinista; las alertas replican los
// umbrales que didacticEngine ya usaba (color_orina>=5 = crítico).
import { describe, it, expect } from 'vitest';
import {
  calcularReadinessScore,
  detectarAlertasRecuperacion,
  READINESS_UMBRALES,
} from '../../../packages/analytics-core/readiness.js';

describe('calcularReadinessScore', () => {
  it('devuelve null sin fila o sin métricas', () => {
    expect(calcularReadinessScore(null)).toBe(null);
    expect(calcularReadinessScore({})).toBe(null);
    expect(calcularReadinessScore({ sueno_calidad: 'x', fatiga_fisica: null })).toBe(null);
  });

  it('máximos → 100, mínimos → 0', () => {
    expect(calcularReadinessScore({ sueno_calidad: 10, fatiga_fisica: 10, color_orina: 1 })).toBe(100);
    expect(calcularReadinessScore({ sueno_calidad: 1, fatiga_fisica: 1, color_orina: 8 })).toBe(0);
  });

  it('pondera sueño/fatiga/hidratación (0.4/0.4/0.2)', () => {
    // sueño 100, fatiga 100, hidratación 0 → 0.4*100 + 0.4*100 + 0.2*0 = 80
    expect(calcularReadinessScore({ sueno_calidad: 10, fatiga_fisica: 10, color_orina: 8 })).toBe(80);
  });

  it('renormaliza los pesos cuando faltan métricas', () => {
    // Solo sueño perfecto → 100 (no 40).
    expect(calcularReadinessScore({ sueno_calidad: 10 })).toBe(100);
    // Solo hidratación pésima → 0.
    expect(calcularReadinessScore({ color_orina: 8 })).toBe(0);
  });
});

describe('detectarAlertasRecuperacion', () => {
  it('sin fila → []', () => {
    expect(detectarAlertasRecuperacion(null)).toEqual([]);
  });

  it('readiness óptimo → sin alertas', () => {
    expect(detectarAlertasRecuperacion({ sueno_calidad: 9, fatiga_fisica: 9, color_orina: 1 })).toEqual([]);
  });

  it('deshidratación severa → alerta crítica (misma condición que didacticEngine)', () => {
    const alertas = detectarAlertasRecuperacion({ color_orina: 6 });
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ condicion: 'deshidratado_extremo', severidad: 'critica', metrica: 'hidratacion' });
  });

  it('color 4 → alerta media, no crítica', () => {
    const alertas = detectarAlertasRecuperacion({ color_orina: 4 });
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ condicion: 'hidratacion_baja', severidad: 'media' });
  });

  it('sueño y fatiga bajos → dos alertas altas', () => {
    const alertas = detectarAlertasRecuperacion({ sueno_calidad: 2, fatiga_fisica: 3, color_orina: 1 });
    expect(alertas.map(a => a.condicion).sort()).toEqual(['fatiga_alta', 'sueno_deficiente']);
    expect(alertas.every(a => a.severidad === 'alta')).toBe(true);
  });

  it('ordena por severidad: crítica antes que alta', () => {
    const alertas = detectarAlertasRecuperacion({ sueno_calidad: 1, color_orina: 7 });
    expect(alertas[0].severidad).toBe('critica');
    expect(alertas[1].severidad).toBe('alta');
  });

  it('respeta umbrales custom', () => {
    const sinAlerta = detectarAlertasRecuperacion({ sueno_calidad: 4 }, { ...READINESS_UMBRALES, sueno_bajo: 3 });
    expect(sinAlerta).toEqual([]);
    const conAlerta = detectarAlertasRecuperacion({ sueno_calidad: 4 }, { ...READINESS_UMBRALES, sueno_bajo: 5 });
    expect(conAlerta[0].condicion).toBe('sueno_deficiente');
  });
});
