// ============================================================
// DIAGNÓSTICO DE PILARES — brain-core (Black Gold)
// ============================================================
// Análisis PURO de la tool `analyze_athlete_pillars`: agrega las
// evaluaciones por sub-pilar y devuelve un objeto ESTRUCTURADO. No toca
// Supabase (los datos entran por parámetro) ni el disco: este módulo es
// PORTABLE (Node y Deno) y se sincroniza a supabase/functions/_shared
// para la Edge Function brain-gateway. El formateo del prompt para la
// IA (que sí necesita el rack, Node-only) vive en prompts.js.

import { calcularCategoriaFEB } from "../analytics-core/categoriaFEB.js";
import { ultimasPorPrueba } from "../analytics-core/recomendaciones.js";

// Timestamp numérico de una evaluación para comparar recencia. Réplica local
// (a propósito, ver nota de currentTier más abajo) del helper interno del
// mismo nombre en analytics-core/recomendaciones.js: created_at ausente o no
// parseable → -Infinity (siempre pierde ante una fecha válida).
function timestampDe(evaluacion) {
  const t = new Date(evaluacion?.created_at).getTime();
  return Number.isNaN(t) ? -Infinity : t;
}

// Agrega las evaluaciones de un atleta por sub-pilar.
//   atleta: { nombre, fecha_nacimiento } (fila de usuarios ya resuelta)
//   evaluaciones: filas de evaluaciones_pruebas, en cualquier orden (no se
//     asume orden de entrada: el promedio deduplica por prueba_tipo con
//     ultimasPorPrueba, la misma fuente única que usa detectarDebilidades en
//     analytics-core — así CUALQUIER caller queda protegido de reevaluaciones
//     viejas contaminando el promedio, sin depender de que ordene DESC. Lo
//     mismo aplica a currentTier: cuando un sub-pilar tiene más de un
//     prueba_tipo, se queda con el tier de la evaluación de created_at MÁS
//     RECIENTE entre todas ellas, no con la que aparezca primero al iterar
//     — de lo contrario esta garantía sería falsa para currentTier/debiles
//     aunque sí se cumpliera para count/sumScore).
// Devuelve { categoria, pilarStats, notasSubjetivas, debiles }:
//   - pilarStats: { [sub_pilar]: { count, sumScore, currentTier } } — count/
//     sumScore se calculan SOLO sobre la última evaluación de cada prueba_tipo.
//   - debiles: sub-pilares con promedio < 60 o último tier poor/below_avg
//     (los que el prompt prioriza al consultar el rack).
export function analizarPilares({ atleta, evaluaciones }) {
  const categoria = calcularCategoriaFEB(atleta.fecha_nacimiento) || "Sin categoría";

  const pilarStats = {};
  const tierTimestamps = {}; // [sub_pilar] -> timestampDe de la evaluación que fijó currentTier
  const notasSubjetivas = [];

  (evaluaciones || []).forEach(ev => {
    if (ev.notas) notasSubjetivas.push(`[${ev.sub_pilar}] ${ev.notas}`);
  });

  // Una reevaluación vieja de la MISMA prueba no debe seguir sumando al
  // promedio: solo la última evaluación de cada prueba_tipo entra al cálculo.
  Object.values(ultimasPorPrueba(evaluaciones)).forEach(ev => {
    if (!pilarStats[ev.sub_pilar]) {
      pilarStats[ev.sub_pilar] = { count: 0, sumScore: 0, currentTier: ev.tier };
      tierTimestamps[ev.sub_pilar] = timestampDe(ev);
    }
    pilarStats[ev.sub_pilar].count++;
    pilarStats[ev.sub_pilar].sumScore += ev.puntuacion_normalizada || 0;

    // Cuando el sub-pilar mide más de un prueba_tipo, currentTier debe ser el
    // de la evaluación más reciente por FECHA, no la primera que se procese.
    const t = timestampDe(ev);
    if (t > tierTimestamps[ev.sub_pilar]) {
      pilarStats[ev.sub_pilar].currentTier = ev.tier;
      tierTimestamps[ev.sub_pilar] = t;
    }
  });

  const debiles = Object.entries(pilarStats)
    .filter(([, s]) => (s.sumScore / s.count) < 60 || ["poor", "below_avg"].includes(s.currentTier))
    .map(([sp]) => sp);

  return { categoria, pilarStats, notasSubjetivas, debiles };
}
