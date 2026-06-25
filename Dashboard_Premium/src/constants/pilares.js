// Etiquetas visuales para los pilares y formatos de misión
export const PILAR_LABELS = {
  fuerza:        'Fuerza',
  explosividad:  'Explosividad',
  movilidad:     'Movilidad',
  tiro:          'Tiro',
  agilidad:      'Agilidad',
  tactica:       'Táctica',
  resiliencia:   'Resiliencia',
  youtube:       'Video YouTube',
  articulo:      'Artículo',
};

// Array listo para mapear en <select> o listas
export const PILARES_OPTIONS = Object.entries(PILAR_LABELS).map(([value, label]) => ({ value, label }));
