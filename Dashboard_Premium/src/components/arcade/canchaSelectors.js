/* Subconjuntos de roster derivados del estado del flujo (puros). Centralizan
   la lógica que antes estaba duplicada en cada pantalla + el footer, para que
   con datos reales el filtrado por nivel sea consistente en todos lados. */

/** Roster relevante para pasar lista: 1v1 = seleccionados; grupal = filtrado
    por nivel (con fallback al roster completo si el nivel no matchea — mock o
    nivel sin atletas). */
export function rosterLista(state, roster) {
  if (state.classType === '1v1') return roster.filter((a) => state.present[a.id]);
  const porNivel = roster.filter((a) => a.nivel && a.nivel === state.level);
  return porNivel.length ? porNivel : roster;
}

/** Presentes ('P') dentro del roster de la lista. */
export const presentesP = (state, roster) => rosterLista(state, roster).filter((a) => state.present[a.id] === 'P');

/** Presentes marcados como destacados. */
export const destacadosList = (state, roster) => presentesP(state, roster).filter((a) => state.destacados[a.id]);
