// ============================================================
// DIAGNÓSTICO DE PILARES — brain-core (Black Gold)
// ============================================================
// Lógica pura de la tool `analyze_athlete_pillars` del MCP, separada
// en dos capas para que cualquier consumidor (blackgold-mcp hoy, las
// Edge Functions brain-gateway mañana) pueda usarla sin transporte:
//   1. analizarPilares() — agrega las evaluaciones por sub-pilar y
//      devuelve un objeto ESTRUCTURADO (para APIs que respondan JSON).
//   2. construirPromptDiagnostico() — formatea ese objeto como el
//      prompt de diagnóstico que consume la IA (mismo texto que
//      producía la tool del MCP, byte a byte).
// Ninguna de las dos toca Supabase: los datos entran por parámetro.

import { calcularCategoriaFEB } from "../analytics-core/categoriaFEB.js";
import { contextoRack } from "./rack.js";

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

// Formatea el análisis estructurado como el prompt de diagnóstico 360°
// (idéntico al que armaba la tool del MCP). Incluye el fundamento del
// rack documental: prioriza los sub-pilares débiles; si no hay, el
// perfil completo.
//   nombre: usuarios.nombre del atleta.
//   analisis: el objeto devuelto por analizarPilares().
export function construirPromptDiagnostico({ nombre, analisis }) {
  const { categoria, pilarStats, notasSubjetivas, debiles } = analisis;

  let promptInfo = `Atleta: ${nombre} (${categoria})\n`;
  promptInfo += "--- RESULTADOS POR SUB-PILAR ---\n";
  for (const pilar in pilarStats) {
    let avg = Math.round(pilarStats[pilar].sumScore / pilarStats[pilar].count);
    promptInfo += `- ${pilar.toUpperCase()}: Promedio ${avg}/100 (Último tier: ${pilarStats[pilar].currentTier})\n`;
  }

  promptInfo += "\n--- NOTAS SUBJETIVAS (Coach/Atleta) ---\n";
  promptInfo += notasSubjetivas.length ? notasSubjetivas.join("\n") : "Sin notas.";

  promptInfo += contextoRack(
    `${(debiles.length ? debiles : Object.keys(pilarStats)).join(" ")} desarrollo baloncesto formativo ${categoria}`,
    { k: 3 }
  );

  promptInfo += "\n\nINSTRUCCIÓN PARA LA IA: Procesa esta información y da un diagnóstico de 360 grados sobre el rendimiento de este atleta. Fundamenta cada recomendación en el CONTEXTO DEL RACK DOCUMENTAL cuando aplique, citando la fuente como [archivo › sección].";

  return promptInfo;
}
