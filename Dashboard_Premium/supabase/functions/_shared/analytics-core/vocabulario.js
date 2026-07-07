// AUTO-GENERADO desde packages/analytics-core — NO EDITAR. Regenerar con: npm run functions:sync
// packages/analytics-core/vocabulario.js
// Vocabulario semántico ES/EN por sub-pilar, para recuperación léxica (rack BM25
// del MCP) y cualquier capa que necesite cruzar el vocabulario de la app (keys de
// taxonomia.js) con el de las fuentes (parte en inglés: baremos, NSCA, LTAD).
//
// REGLA: cada key de VOCABULARIO_SUBPILARES DEBE existir en SUB_PILARES o
// SUB_PILARES_MONITOREO de taxonomia.js (fuente única). validarVocabulario()
// devuelve las keys huérfanas; el selftest del rack (npm run rack) falla si hay.
//
// Los términos van normalizados a minúsculas SIN acentos (así los indexa el rack).
// Sinónimos genéricos no taxonómicos (velocidad, deteccion, prueba, baremo, nino)
// viven en blackgold-mcp/src/rack.js como SINONIMOS_GENERALES: son vocabulario de
// recuperación, no de dominio.

import { SUB_PILARES, SUB_PILARES_MONITOREO } from './taxonomia.js';

export const VOCABULARIO_SUBPILARES = {
  fuerza:               ['strength', 'squat', 'sentadilla', 'press', 'core', 'autocarga'],
  explosividad:         ['explosiveness', 'salto', 'cmj', 'jump', 'pliometria', 'potencia'],
  resistencia:          ['endurance', 'aerobica', 'aerobico', 'cardio', 'vo2', 'navette', 'yoyo', 'fartlek'],
  movilidad:            ['flexibility', 'flexibilidad', 'mobility', 'estiramiento', 'rango', 'dorsiflexion'],
  tiro:                 ['shooting', 'lanzamiento', 'free', 'throw', 'triple', 'mecanica', 'canasta'],
  agilidad:             ['agility', 'lane', 'cambio', 'direccion', 'footwork', 'desplazamiento'],
  tactica:              ['tactical', 'juego', 'lectura', 'decision', 'spacing', 'pick', 'transicion'],
  resiliencia:          ['mental', 'mentalidad', 'resilience', 'psicologia', 'presion', 'mamba', 'autodialogo'],
  recuperacion:         ['sueno', 'hidratacion', 'fatiga', 'descanso', 'recovery', 'carga', 'rpe', 'sobreentrenamiento'],
  composicion_corporal: ['antropometria', 'imc', 'peso', 'talla', 'masa', 'grasa', 'pliegues'],
};

const KEYS_TAXONOMIA = new Set(
  [...SUB_PILARES, ...SUB_PILARES_MONITOREO].map(s => s.key),
);

/** Keys de VOCABULARIO_SUBPILARES que NO existen en la taxonomía (debe ser []). */
export function validarVocabulario() {
  return Object.keys(VOCABULARIO_SUBPILARES).filter(k => !KEYS_TAXONOMIA.has(k));
}

/** true si la key es un sub-pilar válido (radar o monitoreo) según taxonomia.js. */
export function esSubPilarValido(key) {
  return KEYS_TAXONOMIA.has(key);
}
