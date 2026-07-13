/* Subconjuntos de roster derivados del estado del flujo (puros). Centralizan
   la lógica que antes estaba duplicada en cada pantalla + el footer, para que
   con datos reales el filtrado por nivel sea consistente en todos lados. */
import { xpBaseSesion, xpEvaluacion } from '../../../../packages/analytics-core/xp.js';

/** Roster para pasar lista: 1v1 = seleccionados; grupal = estrictamente el nivel
    elegido (vacío si el bloque no tiene atletas; sin fallback al roster completo,
    que antes listaba a TODOS cuando el nivel no matcheaba) (#4). */
export function rosterLista(state, roster) {
  if (state.classType === '1v1') return roster.filter((a) => state.present[a.id]);
  return roster.filter((a) => a.nivel === state.level);
}

/** Presentes ('P') del roster. El present ya viene acotado por la lista/nivel en
    el flujo grupal, así que basta el present crudo — y así el cierre de una sesión
    reanudada (con nivel no restaurable) sigue mostrando a SUS presentes. */
export const presentesP = (state, roster) => roster.filter((a) => state.present[a.id] === 'P');

/** Presentes marcados como destacados. */
export const destacadosList = (state, roster) => presentesP(state, roster).filter((a) => state.destacados[a.id]);

/**
 * XP total de la clase a mostrar en cierre/fin, que DEBE coincidir con lo otorgado
 * (#7): asistencia (xpBaseSesion × presentes, misma fuente `notas` que closeClass)
 * + evaluación (Σ xpEvaluacion SOLO de las evaluaciones GUARDADAS). El XP de
 * evaluación se otorga únicamente al pulsar GUARDAR (saveSubjectiveEval), así que
 * se cuenta desde savedIds + el snapshot savedScores, no desde los scores en vivo:
 * un destacado sin guardar suma 0, y editar estrellas tras guardar no altera el total.
 * Usa el present crudo (state.present === 'P'), idéntico al set que premia closeClass.
 */
export function xpClaseTotal(state) {
  const presentIds = Object.keys(state.present || {}).filter((id) => state.present[id] === 'P');
  const base = presentIds.length * xpBaseSesion(state.closingSession?.notas || '');
  const savedScores = state.savedScores || {};
  const evalXp = presentIds
    .filter((id) => state.savedIds?.[id])
    .reduce((t, id) => t + xpEvaluacion(savedScores[id]), 0);
  const destacadoCount = presentIds.filter((id) => state.destacados[id]).length;
  return { base, evalXp, total: base + evalXp, presentCount: presentIds.length, destacadoCount };
}
