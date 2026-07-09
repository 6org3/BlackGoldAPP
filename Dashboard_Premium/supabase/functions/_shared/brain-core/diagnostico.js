// AUTO-GENERADO desde packages/brain-core — NO EDITAR. Regenerar con: npm run functions:sync
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

// Agrega las evaluaciones de un atleta por sub-pilar.
//   atleta: { nombre, fecha_nacimiento } (fila de usuarios ya resuelta)
//   evaluaciones: filas de evaluaciones_pruebas ordenadas de más reciente
//     a más antigua (así currentTier queda con el último tier registrado).
// Devuelve { categoria, pilarStats, notasSubjetivas, debiles }:
//   - pilarStats: { [sub_pilar]: { count, sumScore, currentTier } }
//   - debiles: sub-pilares con promedio < 60 o último tier poor/below_avg
//     (los que el prompt prioriza al consultar el rack).
export function analizarPilares({ atleta, evaluaciones }) {
  const categoria = calcularCategoriaFEB(atleta.fecha_nacimiento) || "Sin categoría";

  const pilarStats = {};
  const notasSubjetivas = [];

  (evaluaciones || []).forEach(ev => {
    if (!pilarStats[ev.sub_pilar]) {
      pilarStats[ev.sub_pilar] = { count: 0, sumScore: 0, currentTier: ev.tier };
    }
    pilarStats[ev.sub_pilar].count++;
    pilarStats[ev.sub_pilar].sumScore += ev.puntuacion_normalizada || 0;
    if (ev.notas) notasSubjetivas.push(`[${ev.sub_pilar}] ${ev.notas}`);
  });

  const debiles = Object.entries(pilarStats)
    .filter(([, s]) => (s.sumScore / s.count) < 60 || ["poor", "below_avg"].includes(s.currentTier))
    .map(([sp]) => sp);

  return { categoria, pilarStats, notasSubjetivas, debiles };
}
