// ============================================================
// READINESS / RECUPERACIÓN — brain-core (Black Gold)
// ============================================================
// Lógica pura de la tool `analyze_athlete_readiness` del MCP, separada
// en dos capas para que cualquier consumidor (blackgold-mcp hoy, las
// Edge Functions brain-gateway mañana) pueda usarla sin transporte:
//   1. analizarReadiness() — score + déficits + misiones recomendadas
//      como objeto ESTRUCTURADO (para APIs que respondan JSON).
//   2. construirPromptReadiness() — formatea ese objeto como el texto
//      que producía la tool del MCP, byte a byte.
// Usa el motor de recomendación COMPARTIDO de analytics-core (el mismo
// que la web vía el shim src/lib/didacticEngine.js y la Edge Function);
// no toca Supabase: los datos entran por parámetro.

import { evaluarDeficits, emparejarMisionesPorCondicion } from "../analytics-core/didactica.js";
import { calcularReadinessScore } from "../analytics-core/readiness.js";
import { contextoRack } from "./rack.js";

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

// Formatea el análisis estructurado como el texto de readiness/recuperación
// (idéntico al que armaba la tool del MCP), incluidos los mensajes de
// catálogo vacío / sin recomendaciones y el contexto del rack documental.
//   athleteId: atletas.id (se muestra tal cual en el texto).
//   readiness / estadoRecuperacion / misiones: los mismos datos pasados a
//     analizarReadiness().
//   analisis: el objeto devuelto por analizarReadiness().
export function construirPromptReadiness({ athleteId, readiness, estadoRecuperacion, misiones, analisis }) {
  const { score, deficits, recomendadas } = analisis;

  let out = `=== READINESS / RECUPERACIÓN ===\n`;
  out += `Atleta: ${athleteId}\n`;
  out += readiness
    ? `Check-in (${readiness.fecha}): sueño ${readiness.sueno_calidad}/10, fatiga ${readiness.fatiga_fisica}/10, hidratación (orina) ${readiness.color_orina}/8.\n`
    : `Sin check-in diario reciente.\n`;
  out += score != null ? `Readiness score: ${score}/100 (más = mejor recuperado; NO entra al overall ni al radar).\n` : "";
  if (estadoRecuperacion) out += `Estado de recuperación: ${estadoRecuperacion}.\n`;

  out += `\n--- ALERTAS ---\n`;
  out += deficits.length
    ? deficits.map(d => `- [${d.prioridad.toUpperCase()}] ${d.mensaje}`).join("\n")
    : "Sin alertas de recuperación: disponibilidad adecuada.";

  out += `\n\n--- MISIONES DE RECUPERACIÓN RECOMENDADAS ---\n`;
  if (!misiones || misiones.length === 0) {
    out += `El catálogo NO tiene misiones de recuperación (pilar='recuperacion'). Redáctalas con justificación científica (higiene de sueño, hidratación, recuperación activa, manejo de carga) y créalas con insertar_misiones_recuperacion.`;
  } else if (recomendadas.length === 0) {
    out += `Hay misiones de recuperación en el catálogo pero ninguna aplica a las condiciones activas de hoy.`;
  } else {
    out += recomendadas.map(m => `- ${m.titulo} (${m.complejidad}, ${m.xp_recompensa ?? "?"} XP) → trigger: ${m.condicion_trigger}`).join("\n");
  }

  out += contextoRack(
    "recuperación sueño hidratación fatiga carga descanso planificación adolescente",
    { k: 2, maxChars: 1800 }
  );

  out += `\n\nINSTRUCCIÓN PARA LA IA: prioriza recuperación sobre carga cuando haya alertas críticas. Sugiere hábitos accionables por el propio atleta fundados en el CONTEXTO DEL RACK DOCUMENTAL (cita [archivo › sección]) y, si el coach lo aprueba, asigna las misiones recomendadas.`;

  return out;
}
