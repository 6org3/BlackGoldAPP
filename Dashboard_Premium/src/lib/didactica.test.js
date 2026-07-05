// Tests del motor didáctico compartido (analytics-core/didactica.js), consumido por la
// web (shim src/lib/didacticEngine.js) y por blackgold-mcp. Enfoque: la integración con
// readiness.js (sueño/fatiga/hidratación) y el emparejamiento por condicion_trigger.
import { describe, it, expect } from 'vitest';
import {
  getFaseBiologica,
  evaluarDeficits,
  getAutoMissions,
} from '../../../packages/analytics-core/didactica.js';

// Se importa desde el shim para garantizar que la ruta de la web sigue viva.
import { evaluarDeficits as evaluarDeficitsShim } from './didacticEngine';

describe('getFaseBiologica', () => {
  it('mapea categoría FEB (con guión) a fase biológica', () => {
    expect(getFaseBiologica('Mini (Sub-11)')).toBe('PSICOMOTRIZ');
    expect(getFaseBiologica('Menores (Sub-14)')).toBe('TECNICA');
    expect(getFaseBiologica('Juvenil (Sub-18)')).toBe('BIOMECANICA');
    expect(getFaseBiologica('Mayores')).toBe('BIOMECANICA');
  });
});

describe('evaluarDeficits — integración con readiness', () => {
  it('deshidratación severa (color_orina>=5) → déficit crítico deshidratado_extremo', () => {
    const deficits = evaluarDeficits({ categoria: 'Menores (Sub-14)', readiness_hoy: { color_orina: 6 } });
    const hidr = deficits.find(d => d.condicion === 'deshidratado_extremo');
    expect(hidr).toBeTruthy();
    expect(hidr.prioridad).toBe('critica');
  });

  it('sueño y fatiga bajos → déficits nuevos (antes no existían en didacticEngine)', () => {
    const deficits = evaluarDeficits({
      categoria: 'Menores (Sub-14)',
      readiness_hoy: { sueno_calidad: 2, fatiga_fisica: 2, color_orina: 1 },
    });
    const condiciones = deficits.map(d => d.condicion);
    expect(condiciones).toContain('sueno_deficiente');
    expect(condiciones).toContain('fatiga_alta');
  });

  it('sin readiness_hoy no genera déficits de recuperación', () => {
    const deficits = evaluarDeficits({ categoria: 'Menores (Sub-14)' });
    const recup = deficits.filter(d => ['deshidratado_extremo', 'sueno_deficiente', 'fatiga_alta', 'hidratacion_baja'].includes(d.condicion));
    expect(recup).toHaveLength(0);
  });

  it('ordena por prioridad (crítica primero)', () => {
    const deficits = evaluarDeficits({ categoria: 'Menores (Sub-14)', readiness_hoy: { color_orina: 6, sueno_calidad: 2 } });
    expect(deficits[0].prioridad).toBe('critica');
  });
});

describe('getAutoMissions — emparejamiento por condicion_trigger', () => {
  const misiones = [
    { id: 'm1', condicion_trigger: 'deshidratado_extremo' },
    { id: 'm2', condicion_trigger: 'sueno_deficiente, fatiga_alta' },
    { id: 'm3', condicion_trigger: 'resiliencia_baja' },
    { id: 'm4' }, // sin trigger → nunca se auto-asigna
  ];

  it('selecciona solo las misiones cuyo trigger coincide con un déficit activo', () => {
    const atleta = { categoria: 'Menores (Sub-14)', readiness_hoy: { color_orina: 6, sueno_calidad: 2 } };
    const ids = getAutoMissions(atleta, misiones).map(m => m.id);
    expect(ids).toContain('m1'); // deshidratación
    expect(ids).toContain('m2'); // sueño
    expect(ids).not.toContain('m4'); // sin trigger
  });
});

describe('shim src/lib/didacticEngine sigue exportando la API', () => {
  it('evaluarDeficits del shim === del paquete', () => {
    expect(typeof evaluarDeficitsShim).toBe('function');
    const viaShim = evaluarDeficitsShim({ categoria: 'Mayores', readiness_hoy: { color_orina: 7 } });
    expect(viaShim.some(d => d.condicion === 'deshidratado_extremo')).toBe(true);
  });
});
