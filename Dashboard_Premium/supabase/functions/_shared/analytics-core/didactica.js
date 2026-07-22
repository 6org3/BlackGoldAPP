// AUTO-GENERADO desde packages/analytics-core — NO EDITAR. Regenerar con: npm run functions:sync
// packages/analytics-core/didactica.js
// =====================================================
// Motor Didáctico — Black Gold (capa compartida)
// Detecta déficits del atleta (rendimiento + recuperación) y los mapea a misiones
// educativas vía `condicion_trigger`. Antes vivía solo en la web
// (Dashboard_Premium/src/lib/didacticEngine.js); se movió aquí para que el MCP
// (blackgold-mcp) y la Edge Function usen EL MISMO motor — un solo cerebro. El archivo
// web quedó como shim que reexporta desde este módulo.
//
// REGLAS DEL PAQUETE: ES modules planos, sin dependencias npm, sin APIs de Node.
// Funciones PURAS y deterministas.
//
// La detección de recuperación (sueño/fatiga/hidratación) se delega en readiness.js,
// fuente única de esos umbrales (antes el color de orina estaba hardcodeado aquí).

import { getSubPilarScores } from './radar.js';
import { categoriaABucketBaremo } from './baremos.js';
import { detectarAlertasRecuperacion } from './readiness.js';

// severidad de readiness.js → prioridad del déficit (misma escala de nombres).
const SEVERIDAD_A_PRIORIDAD = { critica: 'critica', alta: 'alta', media: 'media' };

/**
 * Mapea la categoría del atleta a su fase biológica de desarrollo.
 * `categoria` llega como categoría FEB (ej. "Menores (Sub-14)"), así que primero se
 * traduce con `categoriaABucketBaremo` (ver baremos.js para el porqué).
 *
 * @param {string} categoria - Categoría FEB del atleta.
 * @returns {string} PSICOMOTRIZ | TECNICA | BIOMECANICA
 */
export function getFaseBiologica(categoria) {
  const bucket = categoriaABucketBaremo(categoria) || categoria;
  switch (bucket) {
    case 'Sub12':
      return 'PSICOMOTRIZ';
    case 'Sub15':
      return 'TECNICA';
    case 'Sub18':
    case 'Senior':
    case 'Femenino':
      return 'BIOMECANICA';
    default:
      return 'TECNICA';
  }
}

/**
 * Evalúa las métricas del atleta y detecta déficits que requieren intervención
 * didáctica. Retorna condiciones ordenadas por prioridad (critica > alta > media).
 *
 * @param {Object} atleta - Atleta con {categoria, _evaluaciones, estado_recuperacion,
 *   readiness_hoy, eva_registro, observacion_hoy}.
 * @returns {Array<{condicion, metrica, valor, mensaje, prioridad}>}
 */
export function evaluarDeficits(atleta) {
  const deficits = [];
  const fase = getFaseBiologica(atleta.categoria);
  const subPilarScores = getSubPilarScores(atleta._evaluaciones || []);

  // ─── Estado de Recuperación (Prioridad Crítica) ─────────
  if (atleta.estado_recuperacion === 'Agotamiento Activo') {
    deficits.push({
      condicion: 'sobreentrenamiento_activo',
      metrica: 'estado_recuperacion',
      valor: 0,
      mensaje:
        'Sobreentrenamiento Activo detectado. Protocolo obligatorio: sueño de 10-12 horas, actividades de hobby/pasatiempo para restaurar sistema parasimpático. Suspender carga neuromuscular intensa.',
      prioridad: 'critica',
    });
  }

  if (atleta.estado_recuperacion === 'Fatiga Silenciosa') {
    deficits.push({
      condicion: 'fatiga_silenciosa',
      metrica: 'estado_recuperacion',
      valor: 0,
      mensaje:
        'Fatiga Silenciosa detectada. Reducir volumen de entrenamiento un 30-40%. Monitorear FC en reposo y calidad del sueño. Si persiste > 7 días, evaluación médica.',
      prioridad: 'critica',
    });
  }

  // ─── Readiness diario (sueño / fatiga / hidratación) ────
  // Delegado a readiness.js: centraliza umbrales y añade sueño y fatiga a la
  // deshidratación que ya se detectaba aquí. Cada alerta expone su `condicion` para
  // enlazar con el `condicion_trigger` de una misión de recuperación.
  detectarAlertasRecuperacion(atleta.readiness_hoy).forEach(alerta => {
    deficits.push({
      condicion: alerta.condicion,
      metrica: alerta.metrica,
      valor: alerta.valor,
      mensaje: alerta.mensaje,
      prioridad: SEVERIDAD_A_PRIORIDAD[alerta.severidad] || 'alta',
    });
  });

  // ─── Resiliencia Psicológica ────────────────────────────
  if ((subPilarScores.resiliencia || 0) < 70) {
    deficits.push({
      condicion: 'resiliencia_baja',
      metrica: 'resiliencia',
      valor: subPilarScores.resiliencia || 0,
      mensaje:
        `Resiliencia Psicológica en ${subPilarScores.resiliencia || 0}/100. ` +
        'Asignar misión de manejo de frustración y regulación emocional. ' +
        `Fase biológica: ${fase} — adaptar contenido al nivel madurativo.`,
      prioridad: 'critica',
    });
  }

  // ─── Eficiencia Táctica y Técnica (Básquetbol) ──────────
  if ((subPilarScores.tactica || 0) < 50) {
    deficits.push({
      condicion: 'tactica_baja',
      metrica: 'tactica',
      valor: subPilarScores.tactica || 0,
      mensaje:
        `Eficiencia Táctica en ${subPilarScores.tactica || 0}/100. ` +
        'Asignar misiones de fundamentos de baloncesto: lectura de pick & roll, spacing, mecánica de tiro, dribbling y sistemas de ayuda defensiva.',
      prioridad: 'alta',
    });
  }

  // ─── Tiro (Básquetbol) ─────────────────────────────────
  if ((subPilarScores.tiro || 0) < 50) {
    deficits.push({
      condicion: 'tiro_bajo',
      metrica: 'tiro',
      valor: subPilarScores.tiro || 0,
      mensaje:
        `Tiro en ${subPilarScores.tiro || 0}/100. ` +
        'Asignar misiones de mecánica de tiro (forma contra la pared, tiro cercano por posiciones) y volumen de repeticiones con feedback y registro de aciertos.',
      prioridad: 'media',
    });
  }

  // ─── Agilidad (Básquetbol) ─────────────────────────────
  if ((subPilarScores.agilidad || 0) < 50) {
    deficits.push({
      condicion: 'agilidad_baja',
      metrica: 'agilidad',
      valor: subPilarScores.agilidad || 0,
      mensaje:
        `Agilidad en ${subPilarScores.agilidad || 0}/100. ` +
        'Asignar misiones de cambios de dirección, juego de pies (escalera, frenado excéntrico) y trabajo de velocidad con pelota.',
      prioridad: 'media',
    });
  }

  // ─── Explosividad (Básquetbol) ─────────────────────────
  if ((subPilarScores.explosividad || 0) < 40) {
    deficits.push({
      condicion: 'explosividad_baja',
      metrica: 'explosividad',
      valor: subPilarScores.explosividad || 0,
      mensaje:
        `Explosividad en ${subPilarScores.explosividad || 0}/100. ` +
        'Asignar misiones de pliometría progresiva, potencia reactiva para el primer paso y salto vertical en baloncesto.',
      prioridad: 'alta',
    });
  }

  // ─── Resistencia (Base Aeróbica e Intermitente) ─────────
  if ((subPilarScores.resistencia || 0) < 50) {
    deficits.push({
      condicion: 'resistencia_baja',
      metrica: 'resistencia',
      valor: subPilarScores.resistencia || 0,
      mensaje:
        `Resistencia en ${subPilarScores.resistencia || 0}/100. ` +
        'Asignar misiones de base aeróbica y capacidad intermitente: juego continuo, trabajo en zona 2 y protocolos tipo Navette/Yo-Yo adaptados a la edad. ' +
        `Fase biológica: ${fase} — dosificar volumen e intensidad según el momento madurativo.`,
      prioridad: 'alta',
    });
  }

  // ─── Fuerza, Movilidad y Milo Rebuilding ────────────────
  if ((subPilarScores.movilidad || 0) < 50 || (subPilarScores.fuerza || 0) < 50) {
    const fuerza = subPilarScores.fuerza || 0;
    const movilidad = subPilarScores.movilidad || 0;
    const detalles = [];
    if (fuerza < 50) detalles.push(`Fuerza: ${fuerza}/100`);
    if (movilidad < 50) detalles.push(`Movilidad: ${movilidad}/100`);

    deficits.push({
      condicion: 'fuerza_movilidad_baja',
      metrica: fuerza < 50 ? 'fuerza' : 'movilidad',
      valor: Math.min(fuerza, movilidad),
      mensaje:
        `Déficit de Fuerza/Movilidad (${detalles.join(', ')}). ` +
        'Activar Protocolo Milo Rebuilding: combinar biomecánica, fortalecimiento isométrico (HSR), técnica estructural y movilidad funcional adaptada.',
      prioridad: 'media',
    });
  }

  // ─── Baremos Élite (IMTP, WBLT) ──────────────────────────
  const evals = atleta._evaluaciones || [];
  const evalWBLT = evals.find(e => e.prueba_tipo === 'Dorsiflexión Tobillo (WBLT)');
  if (evalWBLT && evalWBLT.valor_crudo < 10) {
    deficits.push({
      condicion: 'baja_dorsiflexion',
      metrica: 'wblt',
      valor: evalWBLT.valor_crudo,
      mensaje: `Dorsiflexión crítica de tobillo (${evalWBLT.valor_crudo}cm). Riesgo estructural en la mecánica de salto/caída.`,
      prioridad: 'alta',
    });
  }

  const evalAsimetriaIMTP = evals.find(e => e.prueba_tipo === 'Asimetría IMTP');
  if (evalAsimetriaIMTP && evalAsimetriaIMTP.valor_crudo > 10) {
    deficits.push({
      condicion: 'asimetria_imtp',
      metrica: 'imtp_asimetria',
      valor: evalAsimetriaIMTP.valor_crudo,
      mensaje: `Asimetría del ${evalAsimetriaIMTP.valor_crudo}% en la producción de fuerza isométrica (IMTP). Riesgo de sobrecarga unilateral.`,
      prioridad: 'alta',
    });
  }

  // ─── Inteligencia de Sesión (RPE y Coach Eval) ────────────────
  if (atleta.eva_registro && atleta.eva_registro >= 9) {
    deficits.push({
      condicion: 'rpe_extremo',
      metrica: 'rpe',
      valor: atleta.eva_registro,
      mensaje: `RPE Extremo (${atleta.eva_registro}/10). El esfuerzo percibido está al límite. Sugerimos enfocarse en misiones de recuperación activa, estiramiento y movilidad articular hoy.`,
      prioridad: 'critica',
    });
  }

  if (atleta.observacion_hoy && atleta.eva_registro > 0) {
    const obs = atleta.observacion_hoy;
    const coachEffort = obs.esfuerzo || 0; // Escala sobre 10
    const rpe = atleta.eva_registro;

    // Discrepancia: Atleta muy agotado vs Sesión ligera
    if (rpe >= 8 && coachEffort <= 5) {
      deficits.push({
        condicion: 'percepcion_alterada',
        metrica: 'rpe',
        valor: rpe,
        mensaje: `Discrepancia de esfuerzo: Percibes una carga muy alta (${rpe}/10) pero el coach registró intensidad moderada (${coachEffort}/10). Posible fatiga sistémica acumulada o mala recuperación. Revisa nutrición e hidratación.`,
        prioridad: 'alta',
      });
    }
    // Discrepancia: Atleta poco exigido vs Sesión intensa
    else if (rpe <= 4 && coachEffort >= 8) {
      deficits.push({
        condicion: 'sobrerrendimiento_percibido',
        metrica: 'rpe',
        valor: rpe,
        mensaje: `Asimilación de Carga Óptima: El coach registró alta intensidad (${coachEffort}/10) pero tu percepción de esfuerzo es baja (${rpe}/10). Excelente respuesta de tu sistema nervioso central.`,
        prioridad: 'media',
      });
    }
  }

  // Ordenar por prioridad: critica > alta > media
  const prioridadOrden = { critica: 0, alta: 1, media: 2 };
  deficits.sort((a, b) => prioridadOrden[a.prioridad] - prioridadOrden[b.prioridad]);

  return deficits;
}

/**
 * Empareja misiones con una lista de déficits por su `condicion_trigger`, ordenadas por
 * la prioridad (crítica > alta > media) del déficit que las activa.
 *
 * FUENTE ÚNICA del emparejamiento por condicion_trigger: la usan getAutoMissions y
 * blackgold-mcp (analyze_athlete_readiness). Antes esta lógica estaba duplicada en ambos.
 *
 * @param {Array<{condicion, prioridad}>} deficits - Salida de evaluarDeficits (o un subconjunto,
 *   p.ej. solo las condiciones de recuperación).
 * @param {Array} misionesDisponibles - Misiones con campo `condicion_trigger`.
 * @returns {Array} Misiones cuyo trigger coincide con un déficit activo, peor prioridad primero.
 */
export function emparejarMisionesPorCondicion(deficits, misionesDisponibles = []) {
  const lista = deficits || [];
  const condicionesActivas = new Set(lista.map(d => d.condicion));
  const prioridadOrden = { critica: 0, alta: 1, media: 2 };
  const deficitMap = Object.fromEntries(lista.map(d => [d.condicion, d]));

  const triggersDe = m => (m.condicion_trigger || '').split(',').map(t => t.trim()).filter(Boolean);
  const prioridadDe = m => Math.min(
    99,
    ...triggersDe(m).filter(t => deficitMap[t]).map(t => prioridadOrden[deficitMap[t].prioridad] ?? 99),
  );

  return (misionesDisponibles || [])
    .filter(m => m && m.condicion_trigger && triggersDe(m).some(t => condicionesActivas.has(t)))
    .sort((a, b) => prioridadDe(a) - prioridadDe(b));
}

/**
 * Misiones a auto-asignar según los déficits del atleta (match por condicion_trigger).
 *
 * @param {Object} atleta - Objeto del atleta.
 * @param {Array}  misionesDisponibles - Misiones del catálogo con campo `condicion_trigger`.
 * @returns {Array} Misiones filtradas que deben asignarse, ordenadas por prioridad.
 */
export function getAutoMissions(atleta, misionesDisponibles = []) {
  return emparejarMisionesPorCondicion(evaluarDeficits(atleta), misionesDisponibles);
}
