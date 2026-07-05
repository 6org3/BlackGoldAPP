// Tests de la taxonomía compartida (analytics-core/taxonomia.js): fuente única de
// pilares y sub-pilares. La invariante clave: RADAR_AXES deriva de SUB_PILARES.
import { describe, it, expect } from 'vitest';
import {
  PILARES,
  SUB_PILARES,
  SUB_PILARES_MONITOREO,
  getPilar,
  getSubPilar,
  labelPilar,
  labelSubPilar,
  subPilaresDePilar,
} from '../../../packages/analytics-core/taxonomia.js';
import { RADAR_AXES } from '../../../packages/analytics-core/radar.js';

describe('taxonomía — invariantes', () => {
  it('RADAR_AXES es exactamente SUB_PILARES (única fuente)', () => {
    expect(RADAR_AXES).toBe(SUB_PILARES);
    expect(RADAR_AXES).toHaveLength(7);
  });

  it('cada sub-pilar de rendimiento pertenece a un pilar existente', () => {
    const keysPilar = new Set(PILARES.map(p => p.key));
    for (const sp of SUB_PILARES) {
      expect(keysPilar.has(sp.pilar)).toBe(true);
    }
  });

  it('keys de sub-pilar (rendimiento + monitoreo) son únicas', () => {
    const keys = [...SUB_PILARES, ...SUB_PILARES_MONITOREO].map(s => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('los pesos de los pilares suman 1', () => {
    const suma = PILARES.reduce((a, p) => a + p.peso, 0);
    expect(suma).toBeCloseTo(1, 5);
  });

  it('recuperacion es monitoreo, NO entra al radar', () => {
    expect(SUB_PILARES.find(s => s.key === 'recuperacion')).toBeUndefined();
    expect(SUB_PILARES_MONITOREO.find(s => s.key === 'recuperacion')).toBeTruthy();
  });
});

describe('taxonomía — helpers', () => {
  it('getPilar / getSubPilar devuelven metadata o null', () => {
    expect(getPilar('fisico').label).toBe('Físico-Atlético');
    expect(getPilar('nope')).toBe(null);
    expect(getSubPilar('tiro').pilar).toBe('tecnico');
    expect(getSubPilar('recuperacion').label).toBe('Carga/Sueño');
    expect(getSubPilar('nope')).toBe(null);
  });

  it('labelPilar / labelSubPilar con fallback a la key', () => {
    expect(labelPilar('mental')).toBe('Mental-Táctico');
    expect(labelPilar('desconocido')).toBe('desconocido');
    expect(labelSubPilar('agilidad')).toBe('Agilidad');
    expect(labelSubPilar('desconocido')).toBe('desconocido');
  });

  it('subPilaresDePilar filtra por pilar', () => {
    expect(subPilaresDePilar('fisico').map(s => s.key)).toEqual(['fuerza', 'explosividad', 'movilidad']);
    expect(subPilaresDePilar('mental').map(s => s.key)).toEqual(['tactica', 'resiliencia']);
  });
});
