// packages/analytics-core/taxonomia.js
// FUENTE ÚNICA de la taxonomía de dominio: pilares y sub-pilares.
//
// Antes cada capa declaraba su propia lista y podían divergir:
//   - radar.js (RADAR_AXES), baremos.js (pilar/sub_pilar por prueba),
//   - EvaluacionModal.jsx (OBJETIVOS), ModoCanchaModalConstants (OBJETIVOS_CLASE),
//     AdminSesiones (TIPOS).
// Este módulo las unifica. REGLAS DEL PAQUETE: ES modules planos, sin dependencias.
//
// Los 3 pilares y sus pesos coinciden con PILLAR_WEIGHTS de baremos.js. Los 7 sub-pilares
// (y su orden) coinciden EXACTAMENTE con RADAR_AXES — radar.js los deriva de aquí.

export const PILARES = [
  { key: 'fisico',  label: 'Físico-Atlético',         peso: 0.40 },
  { key: 'tecnico', label: 'Técnico-Baloncestístico', peso: 0.35 },
  { key: 'mental',  label: 'Mental-Táctico',          peso: 0.25 },
];

// Sub-pilares que forman el radar y el overall (7 ejes). El orden ES el del radar.
export const SUB_PILARES = [
  { key: 'fuerza',       label: 'Fuerza',        pilar: 'fisico'  },
  { key: 'explosividad', label: 'Explosividad',  pilar: 'fisico'  },
  { key: 'movilidad',    label: 'Movilidad',     pilar: 'fisico'  },
  { key: 'tiro',         label: 'Técnica Tiro',  pilar: 'tecnico' },
  { key: 'agilidad',     label: 'Agilidad',      pilar: 'tecnico' },
  { key: 'tactica',      label: 'Efic. Táctica', pilar: 'mental'  },
  { key: 'resiliencia',  label: 'Resiliencia',   pilar: 'mental'  },
];

// Sub-pilares de MONITOREO: se miden pero NO entran al radar ni al overall (señales de
// disponibilidad/composición, no de rendimiento — ver readiness.js y recomendaciones.js,
// que excluyen 'recuperacion' del radar a propósito).
export const SUB_PILARES_MONITOREO = [
  { key: 'recuperacion',         label: 'Carga/Sueño',          pilar: null },
  { key: 'composicion_corporal', label: 'Composición Corporal', pilar: null },
];

const PILAR_POR_KEY = Object.fromEntries(PILARES.map(p => [p.key, p]));
const SUBPILAR_POR_KEY = Object.fromEntries(
  [...SUB_PILARES, ...SUB_PILARES_MONITOREO].map(s => [s.key, s]),
);

/** Metadata del pilar por key, o null. */
export function getPilar(key) { return PILAR_POR_KEY[key] || null; }
/** Metadata del sub-pilar (radar o monitoreo) por key, o null. */
export function getSubPilar(key) { return SUBPILAR_POR_KEY[key] || null; }
/** Etiqueta legible del pilar (fallback: la propia key). */
export function labelPilar(key) { return (PILAR_POR_KEY[key] && PILAR_POR_KEY[key].label) || key; }
/** Etiqueta legible del sub-pilar (fallback: la propia key). */
export function labelSubPilar(key) { return (SUBPILAR_POR_KEY[key] && SUBPILAR_POR_KEY[key].label) || key; }
/** Sub-pilares (de rendimiento) que pertenecen a un pilar. */
export function subPilaresDePilar(pilarKey) { return SUB_PILARES.filter(s => s.pilar === pilarKey); }
