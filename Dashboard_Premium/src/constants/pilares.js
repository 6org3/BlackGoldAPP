// Etiquetas visuales para los pilares y formatos de misión.
// La membresía de sub-pilares deriva de la fuente única (analytics-core/taxonomia.js);
// aquí solo se acortan etiquetas para la UI y se agregan los formatos de misión
// que no son sub-pilares (youtube, articulo).
import { SUB_PILARES } from '../../../packages/analytics-core/taxonomia.js';

// Overrides de presentación: etiquetas cortas para la UI.
// El resto de keys usa la etiqueta de taxonomia.js tal cual.
const LABELS_CORTOS = {
  tiro:    'Tiro',
  tactica: 'Táctica',
};

export const PILAR_LABELS = {
  ...Object.fromEntries(SUB_PILARES.map(({ key, label }) => [key, LABELS_CORTOS[key] || label])),
  youtube:  'Video YouTube',
  articulo: 'Artículo',
};

// Array listo para mapear en <select> o listas
export const PILARES_OPTIONS = Object.entries(PILAR_LABELS).map(([value, label]) => ({ value, label }));
