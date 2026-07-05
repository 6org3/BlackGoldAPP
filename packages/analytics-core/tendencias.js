// packages/analytics-core/tendencias.js
// Tendencias e histórico multi-punto: evolución de un atleta —o de un grupo—
// a través de MÚLTIPLES evaluaciones de la misma prueba en el tiempo (4, 6, 8+
// mediciones; el coach puede reevaluar en cualquier momento, no solo por trimestre).
//
// Este módulo EXTRAE y fija la lógica de agregación que hoy vive a mano en
// Dashboard_Premium/src/components/HistorialPruebas.jsx (agrupar por día y
// promediar puntuacion_normalizada), para que la UI pase a consumirla de aquí.
//
// REGLA DEL PAQUETE: módulo ES plano compartido entre web (Vite), Node y Deno.
// Imports internos con extensión .js, sin dependencias npm, sin APIs de Node,
// funciones puras (nunca mutan sus entradas).

import { RADAR_AXES } from './radar.js';
import { ultimasPorPrueba, scoreATier } from './recomendaciones.js';

// ===================================================================
// HELPERS INTERNOS
// ===================================================================

// Sub-pilares válidos: solo los ejes del radar (8 desde 2026-07-05, con resistencia).
const SUB_PILARES_RADAR = new Set(RADAR_AXES.map(a => a.key));

/** Promedio aritmético simple (asume array no vacío). */
function promedio(valores) {
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

// Claves de agrupación temporal. Se recorta el string ISO directamente
// (created_at llega como ISO string de la base) en vez de pasar por Date +
// zona horaria local: así el resultado es determinista e idéntico en web,
// Node y Deno sin importar el huso del dispositivo.
function claveDia(createdAt) {
  return String(createdAt).slice(0, 10); // 'YYYY-MM-DD'
}

function claveMes(createdAt) {
  return String(createdAt).slice(0, 7); // 'YYYY-MM'
}

/**
 * Score por sub-pilar de un atleta a partir de la ÚLTIMA evaluación de cada
 * prueba: última por prueba_tipo → promedio de puntuacion_normalizada por
 * sub_pilar (solo sub-pilares de RADAR_AXES), redondeado.
 *
 * A diferencia de getSubPilarScores (radar.js), aquí un sub-pilar sin datos
 * NO aparece en el resultado (en vez de valer 0): distinguir "sin datos" de
 * "score 0" es imprescindible para deltas y agregados de grupo honestos.
 *
 * @param {Array} evaluaciones
 * @returns {Object} { [sub_pilar]: score } solo con sub-pilares con datos
 */
function promediosSubPilarDeUltimas(evaluaciones) {
  const porSubPilar = {};
  Object.values(ultimasPorPrueba(evaluaciones)).forEach(e => {
    if (!SUB_PILARES_RADAR.has(e.sub_pilar)) return;
    if (e.puntuacion_normalizada == null) return;
    if (!porSubPilar[e.sub_pilar]) porSubPilar[e.sub_pilar] = [];
    porSubPilar[e.sub_pilar].push(e.puntuacion_normalizada);
  });

  const scores = {};
  Object.keys(porSubPilar).forEach(subPilar => {
    scores[subPilar] = Math.round(promedio(porSubPilar[subPilar]));
  });
  return scores;
}

// ===================================================================
// SERIES INDIVIDUALES (un atleta)
// ===================================================================

/**
 * Serie temporal cruda de UNA prueba concreta: cada medición es un punto,
 * ordenadas de la más antigua a la más reciente. Es la vista "microscopio"
 * (valor crudo + tier de cada reevaluación), complementaria a la vista por
 * sub-pilar de seriesPorSubPilar.
 *
 * @param {Array} evaluaciones - evaluaciones del atleta (cualquier prueba)
 * @param {string} pruebaTipo - clave de la prueba (ej. 'cmj_salto')
 * @returns {Array} [{ fecha, valor_crudo, puntuacion, tier, lado }] — vacío si no hay datos
 */
export function seriePorPrueba(evaluaciones, pruebaTipo) {
  if (!Array.isArray(evaluaciones) || evaluaciones.length === 0) return [];

  return evaluaciones
    .filter(e => e.prueba_tipo === pruebaTipo)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map(e => ({
      fecha: e.created_at, // ISO string tal cual; el formato de display es cosa de la UI
      valor_crudo: e.valor_crudo ?? null,
      puntuacion: e.puntuacion_normalizada ?? null,
      tier: e.tier ?? null,
      lado: e.lado ?? null,
    }));
}

/**
 * Series de evolución por sub-pilar: agrupa las evaluaciones por DÍA
 * ('YYYY-MM-DD' del created_at), promedia la puntuacion_normalizada del día
 * (redondeada) y ordena ascendente por fecha. Misma agregación que hacía
 * HistorialPruebas.jsx a mano, ahora fijada aquí como fuente única.
 *
 * Solo se consideran los sub-pilares de RADAR_AXES; cualquier otro
 * (p.ej. 'antropometrico') se ignora. Los 7 ejes siempre están presentes en
 * el resultado — con array vacío si no tienen datos — para que la UI pueda
 * iterar sin comprobar existencia.
 *
 * @param {Array} evaluaciones - [{ sub_pilar, puntuacion_normalizada, created_at }, ...]
 * @returns {Object} { [sub_pilar]: [{ fecha: 'YYYY-MM-DD', score }] }
 */
export function seriesPorSubPilar(evaluaciones) {
  const series = {};
  RADAR_AXES.forEach(({ key }) => { series[key] = []; });
  if (!Array.isArray(evaluaciones) || evaluaciones.length === 0) return series;

  // sub_pilar → día → scores del día
  const porSubPilarYDia = {};
  evaluaciones.forEach(e => {
    if (!SUB_PILARES_RADAR.has(e.sub_pilar)) return;
    if (e.puntuacion_normalizada == null) return;
    const dia = claveDia(e.created_at);
    if (!porSubPilarYDia[e.sub_pilar]) porSubPilarYDia[e.sub_pilar] = {};
    if (!porSubPilarYDia[e.sub_pilar][dia]) porSubPilarYDia[e.sub_pilar][dia] = [];
    porSubPilarYDia[e.sub_pilar][dia].push(e.puntuacion_normalizada);
  });

  Object.keys(porSubPilarYDia).forEach(subPilar => {
    series[subPilar] = Object.keys(porSubPilarYDia[subPilar])
      .sort() // 'YYYY-MM-DD' ordena cronológicamente en orden lexicográfico
      .map(dia => ({
        fecha: dia,
        score: Math.round(promedio(porSubPilarYDia[subPilar][dia])),
      }));
  });

  return series;
}

// ===================================================================
// AGREGADOS DE GRUPO (conjunto de atletas, para el coach)
// ===================================================================

/**
 * Debilidad agregada de un conjunto de atletas, por sub-pilar.
 *
 * Por atleta: última evaluación de cada prueba → promedio por sub_pilar
 * (solo RADAR_AXES). Por sub-pilar, sobre los atletas QUE TIENEN datos:
 *  - scorePromedio: promedio de sus scores (redondeado)
 *  - atletasDebiles: cuántos caen en tier 'poor' o 'below_avg'
 *  - totalAtletasConDatos: cuántos aportan datos (los atletas sin datos de un
 *    sub-pilar NO cuentan en el denominador — sin datos no es score 0)
 *
 * Devuelve solo sub-pilares con al menos un atleta con datos, ordenados de
 * peor a mejor scorePromedio (la debilidad del grupo primero).
 *
 * @param {Object} evaluacionesPorAtleta - { [atletaId]: evaluaciones[] }
 * @returns {Array} [{ sub_pilar, scorePromedio, atletasDebiles, totalAtletasConDatos }]
 */
export function agregarDebilidadesGrupo(evaluacionesPorAtleta) {
  // sub_pilar → scores de los atletas que sí tienen datos de ese sub-pilar
  const porSubPilar = {};
  Object.values(evaluacionesPorAtleta || {}).forEach(evaluaciones => {
    const scoresAtleta = promediosSubPilarDeUltimas(evaluaciones);
    Object.keys(scoresAtleta).forEach(subPilar => {
      if (!porSubPilar[subPilar]) porSubPilar[subPilar] = [];
      porSubPilar[subPilar].push(scoresAtleta[subPilar]);
    });
  });

  return Object.keys(porSubPilar)
    .map(subPilar => {
      const scores = porSubPilar[subPilar];
      const atletasDebiles = scores.filter(s => {
        const tier = scoreATier(s);
        return tier === 'poor' || tier === 'below_avg';
      }).length;
      return {
        sub_pilar: subPilar,
        scorePromedio: Math.round(promedio(scores)),
        atletasDebiles,
        totalAtletasConDatos: scores.length,
      };
    })
    .sort((a, b) => a.scorePromedio - b.scorePromedio);
}

/**
 * Serie temporal grupal de un sub-pilar: junta TODAS las evaluaciones de ese
 * sub_pilar de todos los atletas, agrupa por mes ('YYYY-MM' del created_at)
 * y devuelve el promedio del mes (redondeado) junto con el número de
 * mediciones que lo respaldan (n), en orden ascendente por mes.
 *
 * @param {Object} evaluacionesPorAtleta - { [atletaId]: evaluaciones[] }
 * @param {string} subPilar - clave del sub-pilar (ej. 'movilidad')
 * @returns {Array} [{ mes: 'YYYY-MM', score, n }]
 */
export function serieGrupalPorSubPilar(evaluacionesPorAtleta, subPilar) {
  const porMes = {};
  Object.values(evaluacionesPorAtleta || {}).forEach(evaluaciones => {
    (evaluaciones || []).forEach(e => {
      if (e.sub_pilar !== subPilar) return;
      if (e.puntuacion_normalizada == null) return;
      const mes = claveMes(e.created_at);
      if (!porMes[mes]) porMes[mes] = [];
      porMes[mes].push(e.puntuacion_normalizada);
    });
  });

  return Object.keys(porMes)
    .sort() // 'YYYY-MM' ordena cronológicamente en orden lexicográfico
    .map(mes => ({
      mes,
      score: Math.round(promedio(porMes[mes])),
      n: porMes[mes].length,
    }));
}

// ===================================================================
// DELTA ENTRE VENTANAS (p.ej. trimestre anterior vs. actual)
// ===================================================================

/**
 * Delta por sub-pilar entre dos ventanas de evaluación.
 *
 * Por ventana: última evaluación de cada prueba → promedio por sub_pilar
 * (solo RADAR_AXES). Un sub-pilar entra en el resultado si tiene datos en AL
 * MENOS una ventana; la ventana sin datos queda en null y el delta también
 * (estado vacío explícito — nunca un 0 fingido que aparente "sin cambio").
 *
 * @param {Array} evaluacionesAntes - evaluaciones de la ventana anterior
 * @param {Array} evaluacionesDespues - evaluaciones de la ventana posterior
 * @returns {Array} [{ sub_pilar, antes, despues, delta }] en el orden de RADAR_AXES
 */
export function calcularDelta(evaluacionesAntes, evaluacionesDespues) {
  const antes = promediosSubPilarDeUltimas(evaluacionesAntes || []);
  const despues = promediosSubPilarDeUltimas(evaluacionesDespues || []);

  return RADAR_AXES
    .map(({ key }) => key)
    .filter(subPilar => subPilar in antes || subPilar in despues)
    .map(subPilar => {
      const scoreAntes = subPilar in antes ? antes[subPilar] : null;
      const scoreDespues = subPilar in despues ? despues[subPilar] : null;
      return {
        sub_pilar: subPilar,
        antes: scoreAntes,
        despues: scoreDespues,
        delta: scoreAntes !== null && scoreDespues !== null
          ? scoreDespues - scoreAntes
          : null,
      };
    });
}
