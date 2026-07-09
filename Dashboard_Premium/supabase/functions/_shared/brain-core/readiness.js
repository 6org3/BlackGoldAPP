// AUTO-GENERADO desde packages/brain-core — NO EDITAR. Regenerar con: npm run functions:sync
// ============================================================
// READINESS / RECUPERACIÓN — brain-core (Black Gold)
// ============================================================
// Análisis PURO de la tool `analyze_athlete_readiness`: score + déficits
// + misiones recomendadas como objeto ESTRUCTURADO, sobre el motor de
// recomendación COMPARTIDO de analytics-core (el mismo que la web vía el
// shim src/lib/didacticEngine.js y la Edge Function). No toca Supabase
// (los datos entran por parámetro) ni el disco: este módulo es PORTABLE
// (Node y Deno) y se sincroniza a supabase/functions/_shared para la
// Edge Function brain-gateway. El formateo del prompt para la IA (que sí
// necesita el rack, Node-only) vive en prompts.js.

import { evaluarDeficits, emparejarMisionesPorCondicion } from "../analytics-core/didactica.js";
import { calcularReadinessScore } from "../analytics-core/readiness.js";

// Condiciones de recuperación (déficits de disponibilidad/riesgo) que produce el motor
// compartido evaluarDeficits/detectarAlertasRecuperacion. Sirven de `condicion_trigger`
// para las misiones de recuperación (pilar='recuperacion').
export const RECUPERACION_TRIGGERS = [
  "deshidratado_extremo",
  "hidratacion_baja",
  "sueno_deficiente",
  "fatiga_alta",
  "sobreentrenamiento_activo",
  "fatiga_silenciosa",
  "rpe_extremo",
];
export const RECUPERACION_CONDICIONES = new Set([...RECUPERACION_TRIGGERS, "percepcion_alterada"]);

// Analiza la recuperación del atleta a partir de su último check-in.
//   readiness: fila de atleta_readiness ({ sueno_calidad, fatiga_fisica,
//     color_orina, fecha }) o null si no hay check-in.
//   estadoRecuperacion: atletas.estado_recuperacion (o null).
//   misiones: catálogo activo de misiones de recuperación (pilar='recuperacion').
// Devuelve { score, deficits, recomendadas }:
//   - score: readiness 0-100 (null sin check-in) — señal de disponibilidad,
//     NO entra al overall ni al radar.
//   - deficits: solo las condiciones de recuperación (se pasan evaluaciones
//     vacías a propósito: las debilidades de rendimiento las cubre el
//     diagnóstico de pilares).
//   - recomendadas: misiones del catálogo cuyo trigger coincide con una
//     condición activa (misma función compartida que getAutoMissions).
export function analizarReadiness({ readiness, estadoRecuperacion, misiones }) {
  const score = calcularReadinessScore(readiness);

  const atletaObj = {
    readiness_hoy: readiness || null,
    estado_recuperacion: estadoRecuperacion || null,
    _evaluaciones: [],
  };
  const deficits = evaluarDeficits(atletaObj).filter(d => RECUPERACION_CONDICIONES.has(d.condicion));

  const recomendadas = emparejarMisionesPorCondicion(deficits, misiones || []);

  return { score, deficits, recomendadas };
}
