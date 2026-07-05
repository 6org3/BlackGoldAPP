// packages/analytics-core/radar.js
// Builds 3-layer radar data from evaluation-based metrics
// Uses normalized scores from evaluaciones_pruebas

import { SUB_PILARES } from './taxonomia.js';

// Los ejes del radar SON los 7 sub-pilares de rendimiento. Fuente única: taxonomia.js
// (antes esta lista estaba duplicada aquí y podía divergir del resto de la app).
const RADAR_AXES = SUB_PILARES;

/**
 * Extrae las puntuaciones promedio por sub-pilar de un atleta
 * a partir de su array de evaluaciones.
 * @param {Array} evaluaciones - [{sub_pilar, puntuacion_normalizada}, ...]
 * @returns {Object} {fuerza: 65, explosividad: 72, ...}
 */
export function getSubPilarScores(evaluaciones) {
  if (!evaluaciones || evaluaciones.length === 0) {
    return RADAR_AXES.reduce((acc, axis) => ({ ...acc, [axis.key]: 0 }), {});
  }

  const grouped = {};
  evaluaciones.forEach(e => {
    const key = e.sub_pilar;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e.puntuacion_normalizada || 0);
  });

  const scores = {};
  RADAR_AXES.forEach(axis => {
    const vals = grouped[axis.key] || [];
    scores[axis.key] = vals.length > 0
      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      : 0;
  });

  return scores;
}

/**
 * Builds the 3-layer radar data array for Recharts.
 * @param {Object} atletaScores - {fuerza: 65, explosividad: 72, ...}
 * @param {Array} todosScores - Array of score objects for all athletes [{fuerza: 60, ...}, ...]
 * @param {Array} categoriaScores - Array of score objects for same-category athletes
 * @returns {Array} [{subject: 'Fuerza', Atleta: 65, Categoria: 55, Club: 50, fullMark: 100}, ...]
 */
export function build3LayerRadarData(atletaScores, categoriaScores, clubScores) {
  return RADAR_AXES.map(({ key, label }) => ({
    subject: label,
    Atleta: atletaScores[key] || 0,
    Categoria: averageFromScoresArray(categoriaScores, key),
    Club: averageFromScoresArray(clubScores, key),
    fullMark: 100,
  }));
}



function averageFromScoresArray(scoresArray, key) {
  if (!scoresArray || scoresArray.length === 0) return 0;
  const vals = scoresArray.map(s => s[key] || 0);
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export { RADAR_AXES };
