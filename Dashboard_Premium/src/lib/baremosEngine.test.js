import { describe, it, expect } from 'vitest';
import {
  normalizarValor,
  resolverUmbrales,
  calcularOverall,
  getRango,
  categoriaABucketBaremo,
  BAREMOS,
  RANGOS,
} from './baremosEngine';

describe('categoriaABucketBaremo', () => {
  // Mapeo por "techo" entre las 6 categorías FEB reales (calcularCategoriaFEB) y los
  // 4 buckets de baremos. Ver el comentario junto al mapa en baremosEngine.js para el
  // porqué: antes de este mapa explícito, ninguna categoría FEB real (todas con guión)
  // coincidía por substring con las claves de BAREMOS (sin guión), y todo caía a 'Sub15'.
  it.each([
    ['Premini (Sub-9)', 'Sub12'],
    ['Mini (Sub-11)', 'Sub12'],
    ['Menores (Sub-14)', 'Sub15'],
    ['Prejuvenil (Sub-16)', 'Sub18'],
    ['Juvenil (Sub-18)', 'Sub18'],
    ['Mayores', 'Senior'],
  ])('%s → %s', (categoriaFEB, bucketEsperado) => {
    expect(categoriaABucketBaremo(categoriaFEB)).toBe(bucketEsperado);
  });

  it('devuelve null para una categoría desconocida', () => {
    expect(categoriaABucketBaremo('No Existe')).toBeNull();
  });
});

describe('normalizarValor — tiers "mas_es_mejor" (cmj_salto, Sub12: [22,27,32,37])', () => {
  it.each([
    [21, 'poor'],
    [22, 'poor'],       // en el umbral exacto cae en el tier inferior (comparación estricta >)
    [23, 'below_avg'],
    [27, 'below_avg'],
    [28, 'average'],
    [32, 'average'],
    [33, 'above_avg'],
    [37, 'above_avg'],
    [38, 'excellent'],
  ])('valor %i → tier %s', (valor, tierEsperado) => {
    const resultado = normalizarValor('cmj_salto', valor, 'Premini (Sub-9)');
    expect(resultado.tier).toBe(tierEsperado);
  });
});

describe('normalizarValor — tiers "menos_es_mejor" (lane_agility, Sub12: [13.0,13.9,14.9,16.0])', () => {
  it.each([
    [13.0, 'excellent'],
    [13.9, 'above_avg'],
    [14.9, 'average'],
    [16.0, 'below_avg'],
    [16.1, 'poor'],
  ])('valor %s → tier %s', (valor, tierEsperado) => {
    const resultado = normalizarValor('lane_agility', valor, 'Premini (Sub-9)');
    expect(resultado.tier).toBe(tierEsperado);
  });
});

describe('normalizarValor — mapeo de categoría FEB a bucket de baremos', () => {
  // Mismo valor crudo (30), distinta categoría FEB → debe usar el bucket de edad
  // correcto, no siempre el mismo. Esto es una prueba de regresión directa del bug:
  // antes de corregir el mapeo, TODAS las categorías caían al bucket 'Sub15'.
  it('un Premini (bucket Sub12) NO se evalúa con los mismos umbrales que un Menores (bucket Sub15)', () => {
    const premini = normalizarValor('cmj_salto', 30, 'Premini (Sub-9)');
    const menores = normalizarValor('cmj_salto', 30, 'Menores (Sub-14)');
    expect(premini.tier).toBe('average');    // Sub12: [22,27,32,37] → 30 > 27, no > 32
    expect(menores.tier).toBe('below_avg');  // Sub15: [27,31,36,41] → 30 > 27, no > 31
    expect(premini.tier).not.toBe(menores.tier);
  });

  it('Prejuvenil y Juvenil comparten bucket Sub18', () => {
    const prejuvenil = normalizarValor('cmj_salto', 40, 'Prejuvenil (Sub-16)');
    const juvenil = normalizarValor('cmj_salto', 40, 'Juvenil (Sub-18)');
    expect(prejuvenil.tier).toBe(juvenil.tier);
  });

  it('una categoría desconocida cae al fallback histórico Sub15', () => {
    const resultado = normalizarValor('cmj_salto', 30, 'Categoria Inventada');
    // Sub15: [27,31,36,41] → 30 > 27, no > 31 → below_avg
    expect(resultado.tier).toBe('below_avg');
  });
});

describe('normalizarValor — asimetría entre extremidades', () => {
  it('detecta asimetría significativa (>15% de diferencia)', () => {
    const resultado = normalizarValor('cadera_ri', [20, 30], 'Juvenil (Sub-18)');
    expect(resultado.isAsymmetric).toBe(true);
    expect(resultado.alertMsg).toMatch(/Asimetría/);
  });

  it('no marca asimetría dentro del umbral', () => {
    const resultado = normalizarValor('cadera_ri', [28, 30], 'Juvenil (Sub-18)');
    expect(resultado.isAsymmetric).toBe(false);
    expect(resultado.alertMsg).toBeNull();
  });

  it('promedia los valores del array para elegir el tier', () => {
    // cadera_ri Sub18: [22,29,37,44]. Promedio de [28,30] = 29 → no > 29 → below_avg
    const resultado = normalizarValor('cadera_ri', [28, 30], 'Juvenil (Sub-18)');
    expect(resultado.tier).toBe('below_avg');
  });
});

describe('normalizarValor — casos borde', () => {
  it('devuelve tier "poor" con puntuación 0 si el baremo no existe', () => {
    const resultado = normalizarValor('prueba_que_no_existe', 50, 'Juvenil (Sub-18)');
    expect(resultado.puntuacion).toBe(0);
    expect(resultado.tier).toBe('poor');
    expect(resultado.baremo).toBeNull();
  });

  it('acepta el objeto de baremo directamente (no solo la clave string)', () => {
    const resultado = normalizarValor(BAREMOS.cmj_salto, 40, 'Juvenil (Sub-18)');
    expect(resultado.baremo).toBe(BAREMOS.cmj_salto);
  });

  it('marca noAplica en vez de devolver "poor" en silencio cuando el bucket de edad no tiene baremo (press_banca_rel solo define Sub18/Senior)', () => {
    const resultado = normalizarValor('press_banca_rel', 30, 'Premini (Sub-9)');
    expect(resultado.noAplica).toBe(true);
    expect(resultado.puntuacion).toBeNull();
    expect(resultado.tier).toBeNull();
    expect(resultado.mensajeNoAplica).toMatch(/Sub12/);
  });

  it('noAplica es false para una prueba con baremo definido en la categoría', () => {
    const resultado = normalizarValor('cmj_salto', 40, 'Juvenil (Sub-18)');
    expect(resultado.noAplica).toBe(false);
    expect(resultado.tier).not.toBeNull();
  });
});

describe('calcularOverall', () => {
  it('devuelve overall 0 y rango Rookie sin evaluaciones', () => {
    const resultado = calcularOverall([]);
    expect(resultado.overall).toBe(0);
    expect(resultado.rango.id).toBe('rookie');
  });

  it('normaliza el peso cuando solo hay datos de un pilar', () => {
    // Sin datos de técnico/mental, el peso de físico (0.40) se re-normaliza a 1.
    const resultado = calcularOverall([
      { pilar: 'fisico', puntuacion_normalizada: 80 },
      { pilar: 'fisico', puntuacion_normalizada: 60 },
    ]);
    expect(resultado.overall).toBe(70); // promedio simple de físico, ya renormalizado
    expect(resultado.pilares.fisico).toBe(70);
  });

  it('pondera físico 0.40 / técnico 0.35 / mental 0.25 cuando los tres están presentes', () => {
    const resultado = calcularOverall([
      { pilar: 'fisico', puntuacion_normalizada: 80 },
      { pilar: 'tecnico', puntuacion_normalizada: 60 },
      { pilar: 'mental', puntuacion_normalizada: 40 },
    ]);
    // 80*0.40 + 60*0.35 + 40*0.25 = 32 + 21 + 10 = 63
    expect(resultado.overall).toBe(63);
  });

  it('resuelve el pilar desde BAREMOS cuando la evaluación no trae `pilar` propio', () => {
    const resultado = calcularOverall([
      { prueba_tipo: 'cmj_salto', puntuacion_normalizada: 95 },
    ]);
    expect(resultado.pilares.fisico).toBe(95);
  });
});

describe('getRango', () => {
  it.each([
    [0, 'rookie'], [39, 'rookie'],
    [40, 'prospect'], [59, 'prospect'],
    [60, 'starter'], [74, 'starter'],
    [75, 'all_star'], [89, 'all_star'],
    [90, 'legend'], [100, 'legend'],
  ])('overall %i → rango %s', (overall, rangoId) => {
    expect(getRango(overall).id).toBe(rangoId);
  });
});

describe('RANGOS — invariantes de la tabla', () => {
  it('los rangos son contiguos y cubren 0-100 sin huecos ni solapes', () => {
    const ordenados = RANGOS.slice().sort((a, b) => a.min - b.min);
    expect(ordenados[0].min).toBe(0);
    expect(ordenados[ordenados.length - 1].max).toBe(100);
    for (let i = 1; i < ordenados.length; i++) {
      expect(ordenados[i].min).toBe(ordenados[i - 1].max + 1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolverUmbrales (fase P1.5): resolución multi-convención de thresholds.
// Las formas 2-5 existen en producción (inventario catalogo_ejercicios 2026-07-05)
// y antes de este resolver devolvían siempre noAplica.
// ─────────────────────────────────────────────────────────────────────────────
describe('resolverUmbrales — convenciones de thresholds en producción', () => {
  const CANONICO = { Sub15: [10, 20, 30, 40], Sub18: [15, 25, 35, 45] };

  it('1. canónica bucket→array: devuelve los cortes del bucket', () => {
    expect(resolverUmbrales(CANONICO, { bucket: 'Sub15' })).toEqual([10, 20, 30, 40]);
  });

  it('1b. bucket sin definir → null (mismo noAplica de siempre)', () => {
    expect(resolverUmbrales(CANONICO, { bucket: 'Sub12' })).toBeNull();
  });

  it('2. NUEVA por nivel de desarrollo: indexa por el nivel del atleta', () => {
    const porNivel = { Sub15: { Micro: [5, 10, 15, 20], Desarrollo: [10, 20, 30, 40], Elite: [20, 30, 40, 50] } };
    expect(resolverUmbrales(porNivel, { bucket: 'Sub15', nivelDesarrollo: 'Elite' })).toEqual([20, 30, 40, 50]);
    expect(resolverUmbrales(porNivel, { bucket: 'Sub15', nivelDesarrollo: 'Micro' })).toEqual([5, 10, 15, 20]);
  });

  it('2b. sin nivel del atleta (o nivel no definido en el umbral) → fallback Desarrollo', () => {
    const porNivel = { Sub15: { Micro: [5, 10, 15, 20], Desarrollo: [10, 20, 30, 40] } };
    expect(resolverUmbrales(porNivel, { bucket: 'Sub15' })).toEqual([10, 20, 30, 40]);
    expect(resolverUmbrales(porNivel, { bucket: 'Sub15', nivelDesarrollo: 'Elite' })).toEqual([10, 20, 30, 40]);
  });

  it('2c. umbral por nivel sin Desarrollo → usa el primer nivel disponible', () => {
    const soloElite = { Sub15: { Elite: [20, 30, 40, 50] } };
    expect(resolverUmbrales(soloElite, { bucket: 'Sub15', nivelDesarrollo: 'Micro' })).toEqual([20, 30, 40, 50]);
  });

  it('3. capa de género (shape de NuevaPruebaModal): indexa por el género del atleta', () => {
    const porGenero = {
      Masculino: { Sub15: [20, 30, 40, 50] },
      Femenino: { Sub15: [16, 24, 32, 40] },
    };
    expect(resolverUmbrales(porGenero, { bucket: 'Sub15', genero: 'Femenino' })).toEqual([16, 24, 32, 40]);
    expect(resolverUmbrales(porGenero, { bucket: 'Sub15', genero: 'Masculino' })).toEqual([20, 30, 40, 50]);
  });

  it('3b. sin género del atleta → fallback al primer género definido (mejor aproximación que noAplica)', () => {
    const porGenero = { Masculino: { Sub15: [20, 30, 40, 50] }, Femenino: { Sub15: [16, 24, 32, 40] } };
    expect(resolverUmbrales(porGenero, { bucket: 'Sub15' })).toEqual([20, 30, 40, 50]);
  });

  it("4. bucket comodín 'Todas' (legacy): aplica a cualquier categoría", () => {
    const todas = { Todas: [1, 2, 3, 4] };
    expect(resolverUmbrales(todas, { bucket: 'Sub18' })).toEqual([1, 2, 3, 4]);
  });

  it("4b. género + 'Todas' combinados (shape real: 'Agilidad Reactiva en Y')", () => {
    const real = { Femenino: { Todas: [9, 8, 7, 6] }, Masculino: { Todas: [8, 7, 6, 5] } };
    expect(resolverUmbrales(real, { bucket: 'Sub15', genero: 'Femenino' })).toEqual([9, 8, 7, 6]);
  });

  it('5. shape legacy por tiers {tier_1..tier_4} → array de cortes', () => {
    const tiers = { Todas: { tier_1: 4, tier_2: 6, tier_3: 8, tier_4: 10 } };
    expect(resolverUmbrales(tiers, { bucket: 'Sub12' })).toEqual([4, 6, 8, 10]);
  });

  it('entradas basura → null (null, array plano, cortes no numéricos)', () => {
    expect(resolverUmbrales(null, { bucket: 'Sub15' })).toBeNull();
    expect(resolverUmbrales([1, 2, 3, 4], { bucket: 'Sub15' })).toBeNull();
    expect(resolverUmbrales({ Sub15: ['a', 'b', 'c', 'd'] }, { bucket: 'Sub15' })).toBeNull();
    expect(resolverUmbrales({ Sub15: [1, 2] }, { bucket: 'Sub15' })).toBeNull();
  });
});

describe('normalizarValor — perfil (nivel_desarrollo / genero) con umbrales segmentados', () => {
  const pruebaPorNivel = {
    label: 'Prueba por Nivel', tipo: 'mas_es_mejor', unidad: 'reps',
    thresholds: { Sub15: { Micro: [5, 10, 15, 20], Elite: [20, 30, 40, 50] } },
  };

  it('el mismo valor crudo puntúa distinto según el nivel del atleta', () => {
    const micro = normalizarValor(pruebaPorNivel, 25, 'Menores (Sub-14)', { nivel_desarrollo: 'Micro' });
    const elite = normalizarValor(pruebaPorNivel, 25, 'Menores (Sub-14)', { nivel_desarrollo: 'Elite' });
    expect(micro.tier).toBe('excellent'); // 25 > 20 (t4 de Micro)
    expect(elite.tier).toBe('below_avg'); // 20 < 25 ≤ 30 (t2 de Elite)
  });

  it('sin perfil, un umbral segmentado por género ya no revienta en noAplica (fallback)', () => {
    const pruebaGenero = {
      label: 'Prueba por Género', tipo: 'mas_es_mejor', unidad: 'cm',
      thresholds: { Masculino: { Todas: [10, 20, 30, 40] }, Femenino: { Todas: [8, 16, 24, 32] } },
    };
    const res = normalizarValor(pruebaGenero, 35, 'Juvenil (Sub-18)');
    expect(res.noAplica).toBe(false);
    expect(res.tier).toBe('above_avg'); // resuelve con Masculino [10,20,30,40]
  });

  it('la firma vieja de 3 argumentos sigue funcionando igual (retrocompatibilidad)', () => {
    const conPerfil = normalizarValor('cmj_salto', 30, 'Premini (Sub-9)', {});
    const sinPerfil = normalizarValor('cmj_salto', 30, 'Premini (Sub-9)');
    expect(sinPerfil).toEqual(conPerfil);
  });
});
