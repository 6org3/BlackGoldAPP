// packages/analytics-core/metricas.js
// Métricas antropométricas y de recuperación derivadas de los datos crudos
// del atleta. Compartidas entre la web app y el MCP — no reimplementar.

/**
 * Calcula las métricas derivadas de un atleta y las asigna sobre el mismo objeto:
 * - imc: peso_kg / (talla_m)^2
 * - brazada_relativa: envergadura_cm / talla_cm (índice córmico)
 * - estado_recuperacion: readiness de hoy > test 'Carga Subjetiva y Sueño' > 'Sin datos'
 *
 * @param {Object} atleta - Objeto con peso_kg, talla_cm, envergadura_cm
 * @param {Object|null} readinessHoy - Fila de atleta_readiness del día (o null)
 * @param {Array} evaluaciones - Evaluaciones del atleta (para el fallback de recuperación)
 * @returns {Object} El mismo objeto atleta, enriquecido
 */
export function calcularMetricasDerivadas(atleta, readinessHoy = null, evaluaciones = []) {
  // IMC: peso_kg / (talla_m)^2
  if (atleta.peso_kg && atleta.talla_cm) {
    const talla_m = atleta.talla_cm / 100;
    atleta.imc = (atleta.peso_kg / (talla_m * talla_m)).toFixed(1);
  } else {
    atleta.imc = 'N/A';
  }

  // Brazada Relativa / Índice Córmico (envergadura / talla)
  if (atleta.envergadura_cm && atleta.talla_cm) {
    atleta.brazada_relativa = (atleta.envergadura_cm / atleta.talla_cm).toFixed(2);
  } else {
    atleta.brazada_relativa = 'N/A';
  }

  // Estado de recuperación dinámico: prioriza el check-in de readiness de hoy;
  // si no hay, cae al último test 'Carga Subjetiva y Sueño'.
  const recoveryEval = (evaluaciones || [])
    .filter(e => e.prueba_tipo === 'Carga Subjetiva y Sueño')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

  if (readinessHoy) {
    if (readinessHoy.readiness_score < 4) atleta.estado_recuperacion = 'Agotamiento Activo';
    else if (readinessHoy.readiness_score < 7) atleta.estado_recuperacion = 'Fatiga Silenciosa';
    else atleta.estado_recuperacion = 'Óptimo';
  } else if (recoveryEval) {
    if (recoveryEval.resultado <= 3) atleta.estado_recuperacion = 'Agotamiento Activo';
    else if (recoveryEval.resultado <= 6) atleta.estado_recuperacion = 'Fatiga Silenciosa';
    else atleta.estado_recuperacion = 'Óptimo';
  } else {
    atleta.estado_recuperacion = 'Sin datos';
  }

  return atleta;
}

/**
 * True si el atleta tiene al menos un dato antropométrico real cargado (no el
 * placeholder 'N/A' de calcularMetricasDerivadas). Se usa en las tarjetas de
 * atleta para decidir si vale la pena mostrar los 4 chips (talla/peso/IMC/BR)
 * o colapsarlos en un único aviso de "sin datos" cuando no hay nada cargado.
 * @param {Object} atleta - Objeto ya enriquecido por calcularMetricasDerivadas
 * @returns {boolean}
 */
export function tieneDatosAntropometricos(atleta) {
  return !!(
    atleta.talla_cm ||
    atleta.peso_kg ||
    (atleta.imc && atleta.imc !== 'N/A') ||
    (atleta.brazada_relativa && atleta.brazada_relativa !== 'N/A')
  );
}
