// Tests del motor didáctico compartido (analytics-core/didactica.js), consumido por la
// web (shim src/lib/didacticEngine.js) y por blackgold-mcp. Enfoque: la integración con
// readiness.js (sueño/fatiga/hidratación) y el emparejamiento por condicion_trigger.
import { describe, it, expect } from 'vitest';
import {
  getFaseBiologica,
  evaluarDeficits,
  getAutoMissions,
  emparejarMisionesPorCondicion,
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

describe('evaluarDeficits — déficits de rendimiento nuevos (resistencia/tiro/agilidad)', () => {
  // Atleta con una única evaluación puntuada del sub-pilar indicado
  // (getSubPilarScores solo necesita {sub_pilar, puntuacion_normalizada}).
  const atletaConScore = (subPilar, puntuacion) => ({
    categoria: 'Menores (Sub-14)',
    _evaluaciones: [{ sub_pilar: subPilar, puntuacion_normalizada: puntuacion }],
  });

  it('resistencia baja (<50) → déficit resistencia_baja con prioridad alta', () => {
    const deficits = evaluarDeficits(atletaConScore('resistencia', 30));
    const def = deficits.find(d => d.condicion === 'resistencia_baja');
    expect(def).toBeTruthy();
    expect(def.prioridad).toBe('alta');
    expect(def.valor).toBe(30);
  });

  it('resistencia suficiente (60) → sin déficit resistencia_baja', () => {
    const deficits = evaluarDeficits(atletaConScore('resistencia', 60));
    expect(deficits.some(d => d.condicion === 'resistencia_baja')).toBe(false);
  });

  it('tiro bajo (<50) → déficit tiro_bajo con prioridad media', () => {
    const deficits = evaluarDeficits(atletaConScore('tiro', 30));
    const def = deficits.find(d => d.condicion === 'tiro_bajo');
    expect(def).toBeTruthy();
    expect(def.prioridad).toBe('media');
  });

  it('tiro suficiente (60) → sin déficit tiro_bajo', () => {
    const deficits = evaluarDeficits(atletaConScore('tiro', 60));
    expect(deficits.some(d => d.condicion === 'tiro_bajo')).toBe(false);
  });

  it('agilidad baja (<50) → déficit agilidad_baja con prioridad media', () => {
    const deficits = evaluarDeficits(atletaConScore('agilidad', 30));
    const def = deficits.find(d => d.condicion === 'agilidad_baja');
    expect(def).toBeTruthy();
    expect(def.prioridad).toBe('media');
  });

  it('agilidad suficiente (60) → sin déficit agilidad_baja', () => {
    const deficits = evaluarDeficits(atletaConScore('agilidad', 60));
    expect(deficits.some(d => d.condicion === 'agilidad_baja')).toBe(false);
  });

  it('getAutoMissions empareja una misión con condicion_trigger resistencia_baja', () => {
    const misiones = [
      { id: 'mr', condicion_trigger: 'resistencia_baja' },
      { id: 'mx', condicion_trigger: 'condicion_inexistente' },
    ];
    const ids = getAutoMissions(atletaConScore('resistencia', 30), misiones).map(m => m.id);
    expect(ids).toContain('mr');
    expect(ids).not.toContain('mx');
  });
});

describe('emparejarMisionesPorCondicion — matcher compartido', () => {
  const misiones = [
    { id: 'm1', condicion_trigger: 'deshidratado_extremo' },
    { id: 'm2', condicion_trigger: 'sueno_deficiente, fatiga_alta' },
    { id: 'm3', condicion_trigger: 'resiliencia_baja' },
    { id: 'm4' }, // sin trigger → nunca coincide
  ];

  it('selecciona solo misiones cuyo trigger coincide con un déficit', () => {
    const deficits = [{ condicion: 'sueno_deficiente', prioridad: 'alta' }];
    const ids = emparejarMisionesPorCondicion(deficits, misiones).map(m => m.id);
    expect(ids).toEqual(['m2']);
  });

  it('ordena por prioridad del déficit (crítica antes que media)', () => {
    const deficits = [
      { condicion: 'resiliencia_baja', prioridad: 'media' },
      { condicion: 'deshidratado_extremo', prioridad: 'critica' },
    ];
    const ids = emparejarMisionesPorCondicion(deficits, misiones).map(m => m.id);
    expect(ids).toEqual(['m1', 'm3']); // m1 (critica) antes que m3 (media)
  });

  it('sin déficits o sin misiones → []', () => {
    expect(emparejarMisionesPorCondicion([], misiones)).toEqual([]);
    expect(emparejarMisionesPorCondicion([{ condicion: 'x' }], [])).toEqual([]);
    expect(emparejarMisionesPorCondicion(null, null)).toEqual([]);
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
