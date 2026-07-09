// ============================================================
// PROMPTS PARA LA IA — brain-core (Black Gold)
// ============================================================
// Formateadores de prompt de las tools del MCP: toman el objeto
// estructurado de analizarPilares()/analizarReadiness() y lo vuelven
// el texto que consume la IA (byte-idéntico al histórico de las tools),
// fundamentado en el rack documental.
//
// SOLO NODE: contextoRack() lee el corpus del disco (fs/path), así que
// este módulo NO se sincroniza a supabase/functions/_shared (Deno).
// Las Edge Functions consumen los módulos portables (diagnostico.js,
// readiness.js) y responden JSON estructurado, sin prompt.

import { contextoRack } from "./rack.js";

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
