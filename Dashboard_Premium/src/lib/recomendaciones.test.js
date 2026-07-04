// Tests del motor de recomendación de misiones (analytics-core/recomendaciones.js).
// Fase 1 del spec Loop Evaluación → Misión → XP (docs/spec_loop_misiones_baremo.md).
//
// La regla de oro que fijan estos tests: la selección es DETERMINISTA y AUDITABLE.
// Mismo input → mismo output, sin importar el orden de las filas de entrada, y el
// XP sale de datos (xp_recompensa / nivel), nunca de keywords en el título.
import { describe, it, expect } from 'vitest';
import {
  ultimasPorPrueba,
  scoreATier,
  detectarDebilidades,
  seleccionarMisiones,
  calcularXPMision,
} from '../../../packages/analytics-core/recomendaciones.js';

// ───────────────────────────────────────────────────────────────────
// Helpers de construcción de fixtures
// ───────────────────────────────────────────────────────────────────

/** Fila mínima de evaluaciones_pruebas. */
const evalRow = (prueba_tipo, sub_pilar, puntuacion_normalizada, created_at = '2026-01-15T10:00:00Z') => ({
  prueba_tipo,
  sub_pilar,
  puntuacion_normalizada,
  created_at,
});

/** Fila mínima del catálogo de misiones, con overrides. */
const mision = (id, overrides = {}) => ({
  id,
  pilar: 'movilidad',
  nivel_objetivo: null,
  categoria_bucket: null,
  complejidad: 'especifica',
  activa: true,
  created_at: '2026-01-01T00:00:00Z',
  xp_recompensa: 0,
  ...overrides,
});

// ───────────────────────────────────────────────────────────────────
// ultimasPorPrueba
// ───────────────────────────────────────────────────────────────────

describe('ultimasPorPrueba', () => {
  it('devuelve {} con entrada vacía', () => {
    expect(ultimasPorPrueba([])).toEqual({});
  });

  it('devuelve {} con entrada null', () => {
    expect(ultimasPorPrueba(null)).toEqual({});
  });

  it('con entrada desordenada gana la de created_at más reciente (no asume orden)', () => {
    // La copia ad-hoc de recalcularOverall se queda con la PRIMERA fila vista,
    // confiando en que la query venga ordenada DESC. Esta función no puede asumir
    // eso: ponemos la más nueva en el MEDIO del array para probarlo.
    const vieja = evalRow('cmj_salto', 'explosividad', 15, '2025-10-01T10:00:00Z');
    const nueva = evalRow('cmj_salto', 'explosividad', 95, '2026-04-01T10:00:00Z');
    const media = evalRow('cmj_salto', 'explosividad', 55, '2026-01-01T10:00:00Z');

    const resultado = ultimasPorPrueba([vieja, nueva, media]);
    expect(resultado.cmj_salto).toBe(nueva);
  });

  it('mantiene una entrada por cada prueba_tipo distinta', () => {
    const resultado = ultimasPorPrueba([
      evalRow('cmj_salto', 'explosividad', 55),
      evalRow('sit_reach', 'movilidad', 35),
      evalRow('tiro_libre', 'tiro', 75),
    ]);
    expect(Object.keys(resultado).sort()).toEqual(['cmj_salto', 'sit_reach', 'tiro_libre']);
  });
});

// ───────────────────────────────────────────────────────────────────
// scoreATier
// ───────────────────────────────────────────────────────────────────

describe('scoreATier', () => {
  // Los bordes son los puntos medios entre los scores canónicos de TIER_CONFIG
  // (15/35/55/75/95): cada tier cubre el intervalo centrado en su score.
  it.each([
    [0, 'poor'],
    [24, 'poor'],
    [25, 'below_avg'],
    [44, 'below_avg'],
    [45, 'average'],
    [64, 'average'],
    [65, 'above_avg'],
    [84, 'above_avg'],
    [85, 'excellent'],
    [100, 'excellent'],
  ])('score %i → tier %s', (score, tierEsperado) => {
    expect(scoreATier(score)).toBe(tierEsperado);
  });
});

// ───────────────────────────────────────────────────────────────────
// detectarDebilidades
// ───────────────────────────────────────────────────────────────────

describe('detectarDebilidades', () => {
  it('sin evaluaciones → [] (sin medición no hay debilidad, no se inventan ceros)', () => {
    expect(detectarDebilidades([])).toEqual([]);
    expect(detectarDebilidades(null)).toEqual([]);
  });

  it('todo excellent → []', () => {
    const resultado = detectarDebilidades([
      evalRow('cmj_salto', 'explosividad', 95),
      evalRow('sit_reach', 'movilidad', 95),
      evalRow('tiro_libre', 'tiro', 95),
    ]);
    expect(resultado).toEqual([]);
  });

  it('ordena de peor a mejor (score ascendente)', () => {
    const resultado = detectarDebilidades([
      evalRow('sit_reach', 'movilidad', 35),      // below_avg
      evalRow('tiro_libre', 'tiro', 15),          // poor
    ]);
    expect(resultado.map(d => d.sub_pilar)).toEqual(['tiro', 'movilidad']);
    expect(resultado[0]).toMatchObject({ sub_pilar: 'tiro', score: 15, tier: 'poor', pruebas: ['tiro_libre'] });
    expect(resultado[1]).toMatchObject({ sub_pilar: 'movilidad', score: 35, tier: 'below_avg' });
  });

  it('empate de score → desempate estable por el orden de RADAR_AXES', () => {
    // 'tiro' va ANTES en el input, pero 'fuerza' va antes en RADAR_AXES
    // (fuerza es el eje 0, tiro el 3) → con score idéntico gana fuerza.
    const resultado = detectarDebilidades([
      evalRow('tiro_libre', 'tiro', 20),
      evalRow('sentadilla_rel', 'fuerza', 20),
    ]);
    expect(resultado.map(d => d.sub_pilar)).toEqual(['fuerza', 'tiro']);
  });

  it('respeta maxDebilidades=3 quedándose con las 3 peores', () => {
    const resultado = detectarDebilidades([
      evalRow('sentadilla_rel', 'fuerza', 40),
      evalRow('cmj_salto', 'explosividad', 10),
      evalRow('sit_reach', 'movilidad', 20),
      evalRow('tiro_libre', 'tiro', 30),
      evalRow('lane_agility', 'agilidad', 35),
    ]);
    expect(resultado).toHaveLength(3);
    expect(resultado.map(d => d.sub_pilar)).toEqual(['explosividad', 'movilidad', 'tiro']);
  });

  it("ignora sub-pilares fuera de RADAR_AXES ('recuperacion', 'composicion_corporal')", () => {
    // Estos sub-pilares existen en evaluaciones_pruebas pero no en el radar ni en
    // el catálogo de misiones: jamás deben salir como debilidad.
    const resultado = detectarDebilidades([
      evalRow('hrv', 'recuperacion', 5),
      evalRow('pliegues', 'composicion_corporal', 5),
      evalRow('sit_reach', 'movilidad', 15),
    ]);
    expect(resultado.map(d => d.sub_pilar)).toEqual(['movilidad']);
  });

  it('una medición nueva buena saca al sub-pilar de la lista (solo cuenta la última por prueba)', () => {
    // El atleta era débil en explosividad, pero la reevaluación trimestral dio 95:
    // solo la fila más reciente de cmj_salto cuenta, aunque llegue desordenada.
    const resultado = detectarDebilidades([
      evalRow('cmj_salto', 'explosividad', 95, '2026-04-01T10:00:00Z'),
      evalRow('cmj_salto', 'explosividad', 15, '2025-10-01T10:00:00Z'),
    ]);
    expect(resultado).toEqual([]);
  });

  it('promedia por sub-pilar con Math.round (misma agregación que getSubPilarScores)', () => {
    // Dos pruebas de movilidad: (15 + 20) / 2 = 17.5 → Math.round → 18.
    const resultado = detectarDebilidades([
      evalRow('sit_reach', 'movilidad', 15),
      evalRow('dorsiflexion', 'movilidad', 20),
    ]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].score).toBe(18);
    expect(resultado[0].pruebas).toEqual(['dorsiflexion', 'sit_reach']); // orden alfabético estable
  });

  it('acepta tiersDebiles personalizados', () => {
    const resultado = detectarDebilidades(
      [evalRow('sit_reach', 'movilidad', 55)], // average: débil solo si se pide
      { tiersDebiles: ['poor', 'below_avg', 'average'] }
    );
    expect(resultado.map(d => d.sub_pilar)).toEqual(['movilidad']);
  });
});

// ───────────────────────────────────────────────────────────────────
// seleccionarMisiones
// ───────────────────────────────────────────────────────────────────

describe('seleccionarMisiones', () => {
  const debilidadMovilidad = { sub_pilar: 'movilidad', score: 15, tier: 'poor', pruebas: ['sit_reach'] };
  const debilidadTiro = { sub_pilar: 'tiro', score: 35, tier: 'below_avg', pruebas: ['tiro_libre'] };
  const opts = { nivel: 'Desarrollo', categoriaBucket: 'Sub15' };

  it('con cobertura completa asigna ≤porDebilidad por debilidad, mezclando 1 general + 1 específica', () => {
    const catalogo = [
      mision('m-gen-1', { complejidad: 'general' }),
      mision('m-gen-2', { complejidad: 'general' }),
      mision('m-esp-1', { complejidad: 'especifica' }),
      mision('m-esp-2', { complejidad: 'especifica' }),
    ];
    const { asignaciones, sinCobertura } = seleccionarMisiones([debilidadMovilidad], catalogo, [], opts);

    expect(asignaciones).toHaveLength(2);
    expect(asignaciones.map(a => a.complejidad).sort()).toEqual(['especifica', 'general']);
    expect(asignaciones.every(a => a.sub_pilar_objetivo === 'movilidad')).toBe(true);
    expect(sinCobertura).toEqual([]);
  });

  it('el motivo es legible e incluye sub-pilar, score y tier', () => {
    const { asignaciones } = seleccionarMisiones([debilidadMovilidad], [mision('m1')], [], opts);
    expect(asignaciones[0].motivo).toBe('Debilidad detectada en movilidad (score 15, poor)');
  });

  it('sub-pilar sin cobertura de catálogo → entrada en sinCobertura', () => {
    // El catálogo solo cubre movilidad: la debilidad de tiro queda para que el
    // orquestador (Fase 2) genere una misión nueva vía IA.
    const catalogo = [mision('m1', { complejidad: 'general' })];
    const { asignaciones, sinCobertura } = seleccionarMisiones(
      [debilidadMovilidad, debilidadTiro], catalogo, [], opts
    );
    expect(asignaciones.every(a => a.sub_pilar_objetivo === 'movilidad')).toBe(true);
    expect(sinCobertura).toEqual([{ sub_pilar: 'tiro', nivel: 'Desarrollo', categoriaBucket: 'Sub15' }]);
  });

  it('dedup: no reasigna una misión ya asignada al atleta, incluida una rechazada', () => {
    // El historial trae TODAS las asignaciones (también las rechazadas): si el coach
    // ya rechazó m1 para este atleta, volver a proponerla sería ruido.
    const catalogo = [mision('m1'), mision('m2')];
    const historial = [{ mision_id: 'm1' }]; // asignación histórica (p.ej. estado='rechazada')
    const { asignaciones } = seleccionarMisiones([debilidadMovilidad], catalogo, historial, opts);
    expect(asignaciones.map(a => a.mision_id)).toEqual(['m2']);
  });

  it('si todas las candidatas ya fueron asignadas, la debilidad va a sinCobertura', () => {
    const catalogo = [mision('m1')];
    const { asignaciones, sinCobertura } = seleccionarMisiones(
      [debilidadMovilidad], catalogo, [{ mision_id: 'm1' }], opts
    );
    expect(asignaciones).toEqual([]);
    expect(sinCobertura).toEqual([{ sub_pilar: 'movilidad', nivel: 'Desarrollo', categoriaBucket: 'Sub15' }]);
  });

  it('filtro por categoria_bucket: otro bucket NO se selecciona, null (comodín) sí', () => {
    const catalogo = [
      mision('m-sub18', { categoria_bucket: 'Sub18' }), // bucket ajeno → fuera
      mision('m-comodin', { categoria_bucket: null }),  // comodín → entra
    ];
    const { asignaciones } = seleccionarMisiones([debilidadMovilidad], catalogo, [], opts);
    expect(asignaciones.map(a => a.mision_id)).toEqual(['m-comodin']);
  });

  it('filtro por nivel: otro nivel NO se selecciona, null (comodín) sí', () => {
    const catalogo = [
      mision('m-elite', { nivel_objetivo: 'Elite' }),   // nivel ajeno → fuera
      mision('m-comodin', { nivel_objetivo: null }),    // comodín → entra
    ];
    const { asignaciones } = seleccionarMisiones([debilidadMovilidad], catalogo, [], opts);
    expect(asignaciones.map(a => a.mision_id)).toEqual(['m-comodin']);
  });

  it('excluye misiones con activa=false (catálogo propuesto por el MCP aún sin curar)', () => {
    const catalogo = [
      mision('m-inactiva', { activa: false }),
      mision('m-activa', { activa: true }),
    ];
    const { asignaciones } = seleccionarMisiones([debilidadMovilidad], catalogo, [], opts);
    expect(asignaciones.map(a => a.mision_id)).toEqual(['m-activa']);
  });

  it('prioriza match exacto > parcial > comodín total dentro de cada clase', () => {
    const catalogo = [
      mision('m-comodin', { complejidad: 'general' }),
      mision('m-parcial', { complejidad: 'general', categoria_bucket: 'Sub15' }),
      mision('m-exacta', { complejidad: 'general', categoria_bucket: 'Sub15', nivel_objetivo: 'Desarrollo' }),
    ];
    const { asignaciones } = seleccionarMisiones([debilidadMovilidad], catalogo, [], opts);
    // porDebilidad=2 y no hay específicas: completa con las generales restantes
    // en orden de especificidad → exacta primero, luego parcial.
    expect(asignaciones.map(a => a.mision_id)).toEqual(['m-exacta', 'm-parcial']);
  });

  it('si una clase de complejidad no tiene candidatas, completa con la otra hasta porDebilidad', () => {
    const catalogo = [
      mision('m-esp-1', { complejidad: 'especifica', created_at: '2026-01-01T00:00:00Z' }),
      mision('m-esp-2', { complejidad: 'especifica', created_at: '2026-02-01T00:00:00Z' }),
      mision('m-esp-3', { complejidad: 'especifica', created_at: '2026-03-01T00:00:00Z' }),
    ];
    const { asignaciones } = seleccionarMisiones([debilidadMovilidad], catalogo, [], opts);
    // Sin generales: dos específicas, las más antiguas del catálogo primero.
    expect(asignaciones.map(a => a.mision_id)).toEqual(['m-esp-1', 'm-esp-2']);
  });

  it('determinismo: mismo input dos veces → output profundamente igual, incluso con el catálogo invertido', () => {
    const catalogo = [
      mision('m-b', { complejidad: 'general' }),
      mision('m-a', { complejidad: 'general' }),
      mision('m-c', { complejidad: 'especifica' }),
      mision('m-d', { complejidad: 'especifica' }),
    ];
    const corrida1 = seleccionarMisiones([debilidadMovilidad], catalogo, [], opts);
    const corrida2 = seleccionarMisiones([debilidadMovilidad], catalogo, [], opts);
    const invertida = seleccionarMisiones([debilidadMovilidad], [...catalogo].reverse(), [], opts);

    expect(corrida2).toEqual(corrida1);
    // El orden del catálogo de entrada no importa: el desempate final por id
    // hace el resultado independiente del orden de las filas.
    expect(invertida).toEqual(corrida1);
    // Con created_at idéntico, entre m-a y m-b gana m-a (id ascendente).
    expect(corrida1.asignaciones[0].mision_id).toBe('m-a');
  });

  it("atleta sin nivel → usa 'Desarrollo' como nivel efectivo (default documentado)", () => {
    const catalogo = [
      mision('m-desarrollo', { nivel_objetivo: 'Desarrollo' }),
      mision('m-micro', { nivel_objetivo: 'Micro' }),
    ];
    const { asignaciones, sinCobertura } = seleccionarMisiones(
      [debilidadMovilidad], catalogo, [], { categoriaBucket: 'Sub15' } // sin nivel
    );
    expect(asignaciones.map(a => a.mision_id)).toEqual(['m-desarrollo']);
    // Y el nivel efectivo también queda registrado en sinCobertura cuando aplica:
    const sinCatalogo = seleccionarMisiones([debilidadTiro], [], [], { categoriaBucket: 'Sub15' });
    expect(sinCatalogo.sinCobertura).toEqual([{ sub_pilar: 'tiro', nivel: 'Desarrollo', categoriaBucket: 'Sub15' }]);
    expect(sinCobertura).toEqual([]);
  });

  it('sin debilidades → resultado vacío bien formado', () => {
    expect(seleccionarMisiones([], [mision('m1')], [], opts)).toEqual({ asignaciones: [], sinCobertura: [] });
  });
});

// ───────────────────────────────────────────────────────────────────
// calcularXPMision
// ───────────────────────────────────────────────────────────────────

describe('calcularXPMision', () => {
  it('xp_recompensa explícito (> 0) gana sobre todo lo demás', () => {
    const xp = calcularXPMision(
      { xp_recompensa: 120, nivel_objetivo: 'Micro' },
      { nivel_desarrollo: 'Elite' }
    );
    expect(xp).toBe(120);
  });

  it("ANTI-KEYWORDS: 'Reto micro élite' con xp_recompensa=80 → 80 (el título NUNCA influye)", () => {
    // Regresión directa contra la lógica vieja de aprobarMision (misionesService.js),
    // que buscaba 'micro'/'desarrollo'/'elite' en el título y habría devuelto 25.
    const xp = calcularXPMision({ titulo: 'Reto micro élite', xp_recompensa: 80 });
    expect(xp).toBe(80);
  });

  it.each([
    ['Micro', 25],
    ['Desarrollo', 50],
    ['Elite', 75],
  ])('sin xp explícito, nivel_objetivo %s → %i XP', (nivel, xpEsperado) => {
    expect(calcularXPMision({ xp_recompensa: 0, nivel_objetivo: nivel })).toBe(xpEsperado);
  });

  it.each([
    ['Micro', 25],
    ['Desarrollo', 50],
    ['Elite', 75],
  ])('sin datos de la misión, cae al nivel del atleta %s → %i XP', (nivel, xpEsperado) => {
    expect(calcularXPMision({}, { nivel_desarrollo: nivel })).toBe(xpEsperado);
  });

  it('sin ningún dato → fallback 50', () => {
    expect(calcularXPMision({})).toBe(50);
    expect(calcularXPMision({}, {})).toBe(50);
    expect(calcularXPMision(null, null)).toBe(50);
  });

  it('xp_recompensa inválido (0, negativo o no numérico) no bloquea la cascada', () => {
    expect(calcularXPMision({ xp_recompensa: 0, nivel_objetivo: 'Elite' })).toBe(75);
    expect(calcularXPMision({ xp_recompensa: -10, nivel_objetivo: 'Micro' })).toBe(25);
    expect(calcularXPMision({ xp_recompensa: 'abc', nivel_objetivo: 'Micro' })).toBe(25);
  });

  it('devuelve siempre un entero (redondea xp_recompensa decimal)', () => {
    expect(calcularXPMision({ xp_recompensa: 33.4 })).toBe(33);
    expect(calcularXPMision({ xp_recompensa: 33.6 })).toBe(34);
  });
});
