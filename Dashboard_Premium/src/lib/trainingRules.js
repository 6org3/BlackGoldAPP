// src/lib/trainingRules.js
// =====================================================
// Motor de Reglas de Entrenamiento — Black Gold
// Evalúa parámetros de sesión contra reglas científicas
// para proteger la salud del atleta y optimizar el
// rendimiento deportivo.
// =====================================================

import { getSubPilarScores } from './radarCalc';

/**
 * Calcula las horas transcurridas entre dos fechas.
 * @param {string|Date} dateA - Fecha más antigua
 * @param {string|Date} dateB - Fecha más reciente
 * @returns {number} Horas de diferencia
 */
function hoursBetween(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.abs(b - a) / (1000 * 60 * 60);
}

/**
 * Evalúa una sesión de entrenamiento contra el conjunto completo
 * de reglas científicas de Black Gold.
 *
 * @param {Object} session  - Configuración de la sesión a evaluar
 * @param {Object} atleta   - Objeto del atleta (métricas + perfil)
 * @param {Array}  recentSessions - Sesiones de los últimos 7 días
 * @returns {{ approved: boolean, alerts: Array<{type: string, rule: string, message: string}> }}
 */
export function evaluateSessionRules(session, atleta, recentSessions = []) {
  const alerts = [];
  const subPilarScores = getSubPilarScores(atleta._evaluaciones || []);

  // ─── Regla 1: Multilateralidad (Harre) ──────────────────────
  // En etapas de Iniciación, priorizar base polideportiva.
  // El volumen específico no debe superar el 30%.
  if (
    atleta.nivel_desarrollo === 'Micro' &&
    ['Especiales', 'Técnicos con Carga Extra'].includes(session.parentesco_competencia) &&
    session.volumen_especifico_pct > 30
  ) {
    alerts.push({
      type: 'block',
      rule: 'Multilateralidad (Harre)',
      message:
        'En etapa Micro de desarrollo, el volumen específico no debe superar el 30%. Priorizar base polideportiva.',
    });
  }

  // ─── Regla 2: Biomecánica Articular ─────────────────────────
  // Para posiciones con alta carga articular en rodilla,
  // priorizar 3/4 sentadilla para prevenir lesiones rotulianas.
  if (
    ['Alero Físico', 'Ala-Pívot'].includes(atleta.posicion) &&
    session.meta_entrenamiento === 'Fuerza'
  ) {
    alerts.push({
      type: 'warning',
      rule: 'Biomecánica Articular',
      message:
        'Advertencia Biomecánica: Priorizar 3/4 sentadilla (130°) para prevenir lesiones rotulianas y optimizar transferencia de potencia.',
    });
  }

  // ─── Regla 3: Supercompensación (72h) ───────────────────────
  // Verificar que no haya sesiones de intensidad máxima en las
  // últimas 72 horas para permitir la supercompensación.
  const now = session.fecha ? new Date(session.fecha) : new Date();
  const maxSessionInWindow = recentSessions.find((s) => {
    if (s.intensidad_bpm !== 'Máxima') return false;
    const hours = hoursBetween(s.fecha || s.created_at, now);
    return hours < 72;
  });

  if (maxSessionInWindow) {
    alerts.push({
      type: 'block',
      rule: 'Supercompensación',
      message:
        'Bloqueo de Supercompensación: Última sesión de intensidad máxima fue hace menos de 72h. Programar recuperación activa.',
    });
  }

  // ─── Regla 4: Densidad Óptima ──────────────────────────────
  // Fuerza/Velocidad requieren Densidad Baja (más descanso).
  // Resistencia requiere Densidad Alta (menos descanso).
  if (
    ['Fuerza', 'Velocidad'].includes(session.meta_entrenamiento) &&
    session.tipo_pausa !== 'Densidad Baja'
  ) {
    alerts.push({
      type: 'warning',
      rule: 'Densidad Óptima',
      message:
        'Fuerza y Velocidad requieren pausas de Densidad Baja (mayor descanso inter-serie) para garantizar la recuperación del sistema neuromuscular.',
    });
  }

  if (
    session.meta_entrenamiento === 'Resistencia' &&
    session.tipo_pausa === 'Densidad Baja'
  ) {
    alerts.push({
      type: 'warning',
      rule: 'Densidad Óptima',
      message:
        'Resistencia requiere Densidad Alta (pausas cortas) para mantener la demanda cardiovascular sostenida y generar adaptación metabólica.',
    });
  }

  // ─── Regla 5: Principio de Salud ───────────────────────────
  // Si las métricas base de fuerza o movilidad están por debajo
  // de 50, la intensidad máxima supone riesgo de lesión.
  if (
    ((subPilarScores.fuerza || 0) < 50 || (subPilarScores.movilidad || 0) < 50) &&
    session.intensidad_bpm === 'Máxima'
  ) {
    alerts.push({
      type: 'block',
      rule: 'Principio de Salud',
      message:
        'Métricas de fuerza/movilidad insuficientes para intensidad máxima. Riesgo de lesión.',
    });
  }

  // ─── Regla 6: Regresión Milo Rebuilding (EVA) ──────────────
  // Si el registro EVA post-sesión supera 3, activar protocolo
  // de regresión donde la biomecánica, fuerza y técnica se integran.
  if (session.eva_registro > 3) {
    alerts.push({
      type: 'block',
      rule: 'Regresión Milo Rebuilding (EVA)',
      message:
        'EVA > 3 detectado. Activar Regresión Milo Rebuilding: Integramos corrección biomecánica y técnica estructural. Aplicar Isometría sostenida (45s) a 70% 1RM en ángulo libre de dolor. Reducir carga un 20%.',
    });
  }

  // ─── Regla 7: Restricción de Movilidad ─────────────────
  // Alertas informativas sobre qué ejercicios evitar según
  // el tipo de restriccion mecánica del atleta.
  if (atleta.restriccion_movilidad && atleta.restriccion_movilidad !== 'Ninguna') {
    const restrictionMessages = {
      'Déficit Cadena Posterior':
        'Evitar: Sentadilla profunda, Peso Muerto Convencional, Crunch abdominal. Priorizar corrección técnica y fuerza en: Extensiones de cadera, Bird-Dog, sentadilla parcial.',
      'Déficit Cadena Anterior':
        'Evitar: Hiperextensiones, Press Militar de pie con arco lumbar. Priorizar biomecánica neutra en: Plancha neutra, Dead Bug, Press con respaldo.',
      'Limitación Articular (ROM)':
        'Evitar: Rangos de movimiento forzados y cargas excéntricas extremas. Priorizar isometría y estiramientos dinámicos progresivos.',
      'Intolerancia a Carga Axial':
        'Evitar: Sentadillas con barra alta, Saltos con peso adicional. Priorizar fuerza isométrica, ejercicios en máquina y trabajo unilateral.',
    };

    const msg = restrictionMessages[atleta.restriccion_movilidad];
    if (msg) {
      alerts.push({
        type: 'info',
        rule: 'Restricción de Movilidad',
        message: `${atleta.restriccion_movilidad}: ${msg}`,
      });
    }
  }

  // ─── Regla 8: Prevención de Impacto ─────────────────
  // Previene sesiones con alta carga en articulaciones para atletas sensibles.
  if (atleta.prevencion_impacto && session.meta_entrenamiento === 'Potencia Pliométrica') {
    alerts.push({
      type: 'block',
      rule: 'Prevención de Impacto',
      message:
        'Atleta con Sensibilidad al Impacto detectada. Evitar ejercicios pliométricos intensivos. Usar ejercicios de fuerza balística sin impacto.',
    });
  }

  // ─── Regla 8: Ajuste por Mentalidad ────────────────────────
  // Perfiles Competitivo/Intenso son propensos a agotamiento
  // simpático en sesiones largas.
  if (
    atleta.perfil_mental === 'Competitivo / Intenso' &&
    session.duracion_minutos > 90
  ) {
    alerts.push({
      type: 'warning',
      rule: 'Ajuste por Mentalidad',
      message:
        'Perfil Competitivo/Intenso: Sesiones largas aumentan riesgo de agotamiento simpático. Fraccionar en microciclos cortos.',
    });
  }

  // ─── Regla 9: Estado de Recuperación ───────────────────────
  // Bloquear sesiones de alta intensidad en Agotamiento Activo.
  // Advertir sobre volumen en Fatiga Silenciosa.
  if (atleta.estado_recuperacion === 'Agotamiento Activo') {
    if (['Submáxima', 'Máxima'].includes(session.intensidad_bpm)) {
      alerts.push({
        type: 'block',
        rule: 'Estado de Recuperación',
        message:
          'Atleta en Agotamiento Activo. Intensidad por encima de Media bloqueada. Solo se permiten sesiones de recuperación activa o intensidad baja.',
      });
    }
  }

  if (atleta.estado_recuperacion === 'Fatiga Silenciosa') {
    alerts.push({
      type: 'warning',
      rule: 'Estado de Recuperación',
      message:
        'Atleta en Fatiga Silenciosa. Reducir volumen total un 30-40% y priorizar calidad sobre cantidad. Monitorear signos de sobreentrenamiento.',
    });
  }

  // ─── Resultado final ──────────────────────────────────────
  const hasBlocks = alerts.some((a) => a.type === 'block');

  return {
    approved: !hasBlocks,
    alerts,
  };
}

/**
 * Genera recomendaciones de recuperación personalizadas basadas
 * en el estado actual del atleta.
 *
 * @param {Object} atleta - Objeto del atleta
 * @returns {string[]} Array de strings con recomendaciones
 */
export function getRecoveryRecommendations(atleta) {
  const recommendations = [];

  // Recomendaciones por estado de recuperación
  switch (atleta.estado_recuperacion) {
    case 'Agotamiento Activo':
      recommendations.push(
        'Protocolo de Descanso Activo: 48-72h sin carga neuromuscular intensa.',
        'Priorizar sueño de 10-12 horas y actividades de pasatiempo (hobby) para recuperación parasimpática.',
        'Hidratación aumentada: mínimo 40ml por kg de peso corporal.',
        'Sesiones permitidas: caminata, movilidad articular, yoga suave.',
      );
      break;

    case 'Fatiga Silenciosa':
      recommendations.push(
        'Reducir volumen de entrenamiento un 30-40% esta semana.',
        'Monitorear frecuencia cardíaca en reposo cada mañana.',
        'Incorporar técnicas de relajación: respiración 4-7-8 antes de dormir.',
        'Si persiste más de 7 días, realizar evaluación médica completa.',
      );
      break;

    case 'Óptimo':
      recommendations.push(
        'Estado de recuperación óptimo. El atleta puede entrenar con normalidad.',
        'Mantener rutinas de sueño, nutrición e hidratación actuales.',
      );
      break;

    default:
      break;
  }

  // Recomendaciones por intolerancia Milo
  if (atleta.intolerancia_milo && atleta.intolerancia_milo !== 'Ninguna') {
    recommendations.push(
      `Intolerancia registrada: ${atleta.intolerancia_milo}. Revisar selección de ejercicios antes de cada sesión.`,
    );

    if (atleta.intolerancia_milo === 'Intolerancia a la Flexión') {
      recommendations.push(
        'Incluir movilidad de cadera (90/90, Hip Flexor Stretch) en calentamiento.',
      );
    }

    if (atleta.intolerancia_milo === 'Intolerancia a la Extensión') {
      recommendations.push(
        'Fortalecer core anterior (Dead Bug, Plancha) para estabilizar columna neutra.',
      );
    }

    if (atleta.intolerancia_milo === 'Intolerancia a la Carga') {
      recommendations.push(
        'Priorizar progresión con isometría antes de avanzar a cargas dinámicas.',
      );
    }
  }

  // Recomendaciones por métricas bajas
  const subPilarScores = getSubPilarScores(atleta._evaluaciones || []);

  if ((subPilarScores.fuerza || 0) < 50) {
    recommendations.push(
      'Fuerza baja. Incluir protocolo HSR: 4x45s de isometría al 70% 1RM.',
    );
  }

  if ((subPilarScores.movilidad || 0) < 50) {
    recommendations.push(
      'Movilidad insuficiente. Añadir 15 min de movilidad articular post-entrenamiento.',
    );
  }

  return recommendations;
}
