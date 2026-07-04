// AUTO-GENERADO desde packages/analytics-core — NO EDITAR. Regenerar con: npm run functions:sync
// packages/analytics-core/baremos.js
// Motor de Baremos Científicos — Normalización por Pruebas y Categoría
// Fuentes: NSCA, FitnessGram, NBA Combine, NIH/PubMed (ver baremos_cientificos.md)

// ===================================================================
// TABLAS DE BAREMOS POR PRUEBA Y CATEGORÍA
// Cada entrada define los umbrales para 5 tiers.
// Para "mas_es_mejor": [poor_max, below_max, avg_max, above_max] → ≥above_max = excellent
// Para "menos_es_mejor": [excellent_max, above_max, avg_max, below_max] → >below_max = poor
// ===================================================================

const BAREMOS = {
  // ─── PILAR 1: FÍSICO-ATLÉTICO ─────────────────────────────

  // Explosividad - Tren Inferior
  cmj_salto: {
    label: 'Salto Vertical (CMJ)',
    pilar: 'fisico', sub_pilar: 'explosividad', tren: 'inferior',
    unidad: 'cm', tipo: 'mas_es_mejor',
    thresholds: {
      Sub12: [22, 27, 32, 37],   // <22=poor, 22-27=below, 28-32=avg, 33-37=above, ≥38=excellent
      Sub15: [28, 34, 41, 49],
      Sub18: [36, 43, 51, 59],
      Senior: [40, 49, 59, 69],
    },
  },

  // Explosividad - Tren Superior (Flexiones en 30s)
  pushups_30s: {
    label: 'Flexiones en 30s',
    pilar: 'fisico', sub_pilar: 'explosividad', tren: 'superior',
    unidad: 'reps', tipo: 'mas_es_mejor',
    thresholds: {
      Sub12: [7, 11, 16, 21],
      Sub15: [12, 17, 22, 27],
      Sub18: [16, 21, 26, 31],
      Senior: [18, 23, 29, 34],
    },
  },

  // Explosividad - Tren Superior (Dominadas)
  dominadas: {
    label: 'Dominadas',
    pilar: 'fisico', sub_pilar: 'explosividad', tren: 'superior',
    unidad: 'reps', tipo: 'mas_es_mejor',
    thresholds: {
      Sub12: [0, 0, 3, 8],
      Sub15: [0, 3, 6, 12],
      Sub18: [4, 6, 9, 14],
      Senior: [4, 7, 12, 17],
    },
  },

  // Fuerza - Tren Inferior (Sentadilla relativa)
  sentadilla_rel: {
    label: 'Sentadilla (× Peso Corp.)',
    pilar: 'fisico', sub_pilar: 'fuerza', tren: 'inferior',
    unidad: 'x_bw', tipo: 'mas_es_mejor',
    thresholds: {
      Sub12: [0.25, 0.39, 0.59, 0.79],
      Sub15: [0.7, 0.99, 1.29, 1.59],
      Sub18: [1.0, 1.39, 1.69, 1.99],
      Senior: [1.0, 1.39, 1.69, 1.99],
    },
  },

  // Fuerza - Tren Superior (Push-ups max)
  pushups_max: {
    label: 'Push-ups Máx.',
    pilar: 'fisico', sub_pilar: 'fuerza', tren: 'superior',
    unidad: 'reps', tipo: 'mas_es_mejor',
    thresholds: {
      Sub12: [8, 13, 19, 29],
      Sub15: [15, 23, 29, 40],
      Sub18: [20, 29, 34, 45],
      Senior: [20, 29, 39, 55],
    },
  },

  // Fuerza - Tren Superior (Press de Banca, solo Sub18+)
  press_banca_rel: {
    label: 'Press Banca (× Peso Corp.)',
    pilar: 'fisico', sub_pilar: 'fuerza', tren: 'superior',
    unidad: 'x_bw', tipo: 'mas_es_mejor',
    thresholds: {
      Sub18: [0.6, 0.84, 1.09, 1.29],
      Senior: [0.75, 0.99, 1.19, 1.49],
    },
  },

  // Movilidad - Sit & Reach
  sit_reach: {
    label: 'Sit & Reach',
    pilar: 'fisico', sub_pilar: 'movilidad', tren: null,
    unidad: 'cm', tipo: 'mas_es_mejor',
    thresholds: {
      Sub12: [-5, -1, 3, 7],
      Sub15: [-5, -1, 4, 9],
      Sub18: [4, 6, 10, 13],
      Senior: [4, 6, 13, 16],
    },
  },

  // Movilidad - Dorsiflexión de tobillo (WBLT)
  dorsiflexion: {
    label: 'Dorsiflexión Tobillo',
    pilar: 'fisico', sub_pilar: 'movilidad', tren: 'inferior',
    unidad: 'cm', tipo: 'mas_es_mejor',
    inputs_requeridos: [{ id: 'izq', label: 'Izquierdo' }, { id: 'der', label: 'Derecho' }],
    thresholds: {
      Sub12: [6.1, 8.3, 10.9, 13.0],
      Sub15: [6.1, 8.3, 10.9, 13.0],
      Sub18: [6.1, 8.3, 10.9, 13.0],
      Senior: [6.1, 8.3, 10.9, 13.0],
    },
  },

  // Movilidad - Rotación Interna de Cadera
  cadera_ri: {
    label: 'Rot. Interna Cadera',
    pilar: 'fisico', sub_pilar: 'movilidad', tren: 'inferior',
    unidad: 'grados', tipo: 'mas_es_mejor',
    inputs_requeridos: [{ id: 'izq', label: 'Izquierdo' }, { id: 'der', label: 'Derecho' }],
    thresholds: {
      Sub12: [22, 29, 37, 44],
      Sub15: [22, 29, 37, 44],
      Sub18: [22, 29, 37, 44],
      Senior: [22, 29, 37, 44],
    },
  },

  // Movilidad - Rotación Externa de Cadera
  cadera_re: {
    label: 'Rot. Externa Cadera',
    pilar: 'fisico', sub_pilar: 'movilidad', tren: 'inferior',
    unidad: 'grados', tipo: 'mas_es_mejor',
    inputs_requeridos: [{ id: 'izq', label: 'Izquierdo' }, { id: 'der', label: 'Derecho' }],
    thresholds: {
      Sub12: [32, 39, 47, 54],
      Sub15: [32, 39, 47, 54],
      Sub18: [32, 39, 47, 54],
      Senior: [32, 39, 47, 54],
    },
  },

  // Movilidad - Rotación Externa Hombro
  hombro_re: {
    label: 'Rot. Externa Hombro',
    pilar: 'fisico', sub_pilar: 'movilidad', tren: 'superior',
    unidad: 'grados', tipo: 'mas_es_mejor',
    inputs_requeridos: [{ id: 'izq', label: 'Izquierdo' }, { id: 'der', label: 'Derecho' }],
    thresholds: {
      Sub12: [70, 79, 87, 94],
      Sub15: [70, 79, 87, 94],
      Sub18: [70, 79, 87, 94],
      Senior: [70, 79, 87, 94],
    },
  },

  // Movilidad - Rotación Interna Hombro
  hombro_ri: {
    label: 'Rot. Interna Hombro',
    pilar: 'fisico', sub_pilar: 'movilidad', tren: 'superior',
    unidad: 'grados', tipo: 'mas_es_mejor',
    inputs_requeridos: [{ id: 'izq', label: 'Izquierdo' }, { id: 'der', label: 'Derecho' }],
    thresholds: {
      Sub12: [50, 59, 67, 74],
      Sub15: [50, 59, 67, 74],
      Sub18: [50, 59, 67, 74],
      Senior: [50, 59, 67, 74],
    },
  },

  // Movilidad/Estabilidad - Pistol Single Squat
  pistol_single_squat: {
    label: 'Pistol Single Squat',
    pilar: 'fisico', sub_pilar: 'movilidad', tren: 'inferior',
    unidad: 'reps', tipo: 'mas_es_mejor',
    inputs_requeridos: [{ id: 'izq', label: 'Izquierdo' }, { id: 'der', label: 'Derecho' }],
    thresholds: {
      Sub12: [0, 2, 5, 8],
      Sub15: [2, 5, 8, 12],
      Sub18: [4, 8, 12, 16],
      Senior: [6, 10, 15, 20],
    },
  },

  // ─── PILAR 2: TÉCNICO-BALONCESTÍSTICO ─────────────────────

  // Tiro Libre
  tiro_libre: {
    label: 'Tiro Libre',
    pilar: 'tecnico', sub_pilar: 'tiro', tren: null,
    unidad: '%', tipo: 'mas_es_mejor',
    thresholds: {
      Sub12: [20, 29, 41, 54],
      Sub15: [33, 44, 57, 69],
      Sub18: [50, 59, 69, 77],
      Senior: [55, 67, 74, 81],
    },
  },

  // Tiro Media Distancia
  tiro_media: {
    label: 'Media Distancia',
    pilar: 'tecnico', sub_pilar: 'tiro', tren: null,
    unidad: '%', tipo: 'mas_es_mejor',
    thresholds: {
      Sub12: [18, 24, 34, 44],
      Sub15: [22, 31, 39, 49],
      Sub18: [28, 37, 45, 54],
      Senior: [28, 37, 45, 54],
    },
  },

  // Tiro de 3 Puntos
  tiro_3pts: {
    label: 'Tres Puntos',
    pilar: 'tecnico', sub_pilar: 'tiro', tren: null,
    unidad: '%', tipo: 'mas_es_mejor',
    thresholds: {
      Sub12: [14, 21, 29, 39],
      Sub15: [18, 25, 33, 41],
      Sub18: [22, 29, 37, 44],
      Senior: [24, 29, 35, 41],
    },
  },

  // Lane Agility Drill (menos es mejor)
  lane_agility: {
    label: 'Lane Agility',
    pilar: 'tecnico', sub_pilar: 'agilidad', tren: null,
    unidad: 'segundos', tipo: 'menos_es_mejor',
    thresholds: {
      Sub12: [13.0, 13.9, 14.9, 16.0],
      Sub15: [12.0, 12.9, 13.5, 14.5],
      Sub18: [11.0, 11.5, 12.0, 12.8],
      Senior: [10.5, 11.0, 11.5, 12.3],
    },
  },

  // Zigzag con Balón (COD en 60s, más es mejor)
  zigzag_balon: {
    label: 'Zigzag con Balón',
    pilar: 'tecnico', sub_pilar: 'agilidad', tren: null,
    unidad: 'COD/min', tipo: 'mas_es_mejor',
    thresholds: {
      Sub12: [8, 11, 16, 21],
      Sub15: [12, 16, 22, 27],
      Sub18: [16, 20, 25, 30],
      Senior: [16, 21, 27, 33],
    },
  },

  // ─── PILAR 3: MENTAL-TÁCTICO ──────────────────────────────

  // Eficiencia Táctica (Rating del Coach 0-100)
  eficiencia_tactica: {
    label: 'Eficiencia Táctica',
    pilar: 'mental', sub_pilar: 'tactica', tren: null,
    unidad: 'rating', tipo: 'mas_es_mejor',
    thresholds: {
      Sub12: [20, 35, 55, 75],
      Sub15: [20, 35, 55, 75],
      Sub18: [20, 35, 55, 75],
      Senior: [20, 35, 55, 75],
    },
  },

  // Resiliencia / Mentalidad (Rating del Coach 0-100)
  resiliencia: {
    label: 'Resiliencia',
    pilar: 'mental', sub_pilar: 'resiliencia', tren: null,
    unidad: 'rating', tipo: 'mas_es_mejor',
    thresholds: {
      Sub12: [20, 35, 55, 75],
      Sub15: [20, 35, 55, 75],
      Sub18: [20, 35, 55, 75],
      Senior: [20, 35, 55, 75],
    },
  },
};

// ===================================================================
// TIER LABELS & SCORES
// ===================================================================

const TIER_CONFIG = {
  poor:      { label: 'Debe Mejorar', score: 15, color: 'text-red-400',     bg: 'bg-red-500' },
  below_avg: { label: 'Por Debajo',   score: 35, color: 'text-orange-400',  bg: 'bg-orange-500' },
  average:   { label: 'Promedio',      score: 55, color: 'text-cyan-400',    bg: 'bg-cyan-500' },
  above_avg: { label: 'Muy Bueno',     score: 75, color: 'text-[#FFD700]',   bg: 'bg-[#FFD700]' },
  excellent: { label: 'Excelente',     score: 95, color: 'text-emerald-400', bg: 'bg-emerald-500' },
};

// ===================================================================
// RANGOS
// ===================================================================

const RANGOS = [
  { id: 'rookie',   nombre: 'Rookie',   min: 0,  max: 39,  emoji: '🟤', color: 'text-gray-400',    bg: 'bg-gray-500' },
  { id: 'prospect', nombre: 'Prospect', min: 40, max: 59,  emoji: '🟠', color: 'text-orange-400',  bg: 'bg-orange-500' },
  { id: 'starter',  nombre: 'Starter',  min: 60, max: 74,  emoji: '🔵', color: 'text-blue-400',    bg: 'bg-blue-500' },
  { id: 'all_star', nombre: 'All-Star', min: 75, max: 89,  emoji: '⭐', color: 'text-[#FFD700]',   bg: 'bg-[#FFD700]' },
  { id: 'legend',   nombre: 'Legend',   min: 90, max: 100, emoji: '👑', color: 'text-purple-400',  bg: 'bg-purple-500' },
];

const RECOMPENSAS_POR_RANGO = {
  prospect: [
    { nombre: 'Reconocimiento en Tablero', descripcion: 'Tu nombre aparece en el tablero de honor del club' },
    { nombre: 'Badge Digital Prospect', descripcion: 'Badge exclusivo para tu perfil' },
  ],
  starter: [
    { nombre: 'Botella Personalizada Black Gold', descripcion: 'Botella deportiva con tu nombre grabado' },
    { nombre: 'Sesión de Video-Análisis', descripcion: 'Revisión de tu juego con el Coach' },
  ],
  all_star: [
    { nombre: 'Camiseta de Práctica Black Gold', descripcion: 'Camiseta oficial del programa' },
    { nombre: 'Perfil Destacado en App', descripcion: 'Tu perfil se muestra como referencia para otros atletas' },
  ],
  legend: [
    { nombre: 'Entrenamiento Personalizado 1-a-1', descripcion: 'Sesión privada de 45 min con el Head Coach' },
    { nombre: 'Mención en Redes del Club', descripcion: 'Post oficial reconociendo tu excelencia' },
  ],
};

// Pesos de ponderación para el Overall
const PILLAR_WEIGHTS = {
  fisico: 0.40,
  tecnico: 0.35,
  mental: 0.25,
};

// Pesos internos del sub-pilar "tiro"
const TIRO_WEIGHTS = {
  tiro_libre: 0.30,
  tiro_media: 0.35,
  tiro_3pts: 0.35,
};

// ===================================================================
// MAPEO CATEGORÍA FEB → BUCKET DE BAREMOS
// ===================================================================
// `calcularCategoriaFEB()` (./categoriaFEB.js, en este mismo paquete) devuelve 6 categorías con
// guión ("Premini (Sub-9)", "Menores (Sub-14)", "Juvenil (Sub-18)"...), pero los
// BAREMOS de este archivo solo tienen 4 buckets de edad: Sub12, Sub15, Sub18, Senior.
// Este mapa hace explícita esa correspondencia. Antes de existir, `normalizarValor`
// buscaba `categoria.includes('Sub12'|'Sub15'|'Sub18'|'Senior')`, pero como ninguna
// categoría FEB real contiene esas subcadenas exactas (llevan guión: "Sub-9", "Sub-14"),
// la búsqueda nunca coincidía y TODOS los atletas caían al fallback fijo 'Sub15' sin
// importar su edad real.
//
// Mapeo por "techo" (ceiling): se usa el bucket de baremos más chico cuyo número sea
// mayor o igual a la edad máxima de la categoría FEB.
// PENDIENTE: validar esta correspondencia con el cuerpo técnico del club.
const CATEGORIA_FEB_A_BUCKET_BAREMO = {
  'Premini (Sub-9)': 'Sub12',
  'Mini (Sub-11)': 'Sub12',
  'Menores (Sub-14)': 'Sub15',
  'Prejuvenil (Sub-16)': 'Sub18',
  'Juvenil (Sub-18)': 'Sub18',
  'Mayores': 'Senior',
};

/**
 * Traduce una categoría FEB (calcularCategoriaFEB) al bucket de edad que usan los
 * BAREMOS (Sub12/Sub15/Sub18/Senior). Devuelve null si no hay correspondencia conocida.
 */
export function categoriaABucketBaremo(categoriaFEB) {
  return CATEGORIA_FEB_A_BUCKET_BAREMO[categoriaFEB] || null;
}

// ===================================================================
// FUNCIONES PRINCIPALES
// ===================================================================

/**
 * Normaliza un valor crudo en una puntuación 0-100 usando los baremos científicos.
 *
 * NOTA — sin diferenciación por género: los umbrales de BAREMOS no están segmentados
 * por sexo (todas las entradas van directo a Sub12/Sub15/Sub18/Senior). Un parámetro
 * `genero` existió aquí antes pero no tenía ningún umbral que consultar, así que su
 * efecto real era nulo pese a aparentar soportarlo — ver packages/analytics-core/
 * baremos_cientificos.md para la evidencia de que el género sí importa en varias
 * pruebas (p.ej. push-ups, salto vertical) y qué falta para implementarlo de verdad
 * (columna de género por atleta + umbrales propios por sexo y prueba).
 *
 * @param {object|string} baremoObj - El objeto de configuración de la prueba (o clave string por retrocompatibilidad)
 * @param {number|number[]} valorCrudo - El valor medido
 * @param {string} categoria - La categoría del atleta (ej. 'Sub15')
 * @returns {{ puntuacion: number|null, tier: string|null, tierConfig: object|null, baremo: object, isAsymmetric: boolean, alertMsg: string|null, noAplica: boolean, mensajeNoAplica: string|null }}
 */
export function normalizarValor(baremoObj, valorCrudo, categoria) {
  const baremo = typeof baremoObj === 'string' ? BAREMOS[baremoObj] : baremoObj;
  if (!baremo) {
    return {
      puntuacion: 0, tier: 'poor', tierConfig: TIER_CONFIG.poor, baremo: null,
      isAsymmetric: false, alertMsg: null, noAplica: false, mensajeNoAplica: null,
    };
  }

  let valToEval = 0;
  let isAsymmetric = false;
  let alertMsg = null;

  if (Array.isArray(valorCrudo)) {
    // Promedio
    valToEval = valorCrudo.reduce((a, b) => a + b, 0) / valorCrudo.length;
    // Asimetría
    if (valorCrudo.length === 2) {
      const diff = Math.abs(valorCrudo[0] - valorCrudo[1]);
      const max = Math.max(valorCrudo[0], valorCrudo[1]);
      if (max > 0 && (diff / max) > 0.15) {
        isAsymmetric = true;
        alertMsg = '⚠️ Asimetría significativa detectada (>15%) entre lados. Elevado riesgo de lesión.';
      }
    }
  } else {
    valToEval = parseFloat(valorCrudo);
  }

  const catKey = categoriaABucketBaremo(categoria)
    || Object.keys(baremo.thresholds).find(k => categoria.includes(k))
    || 'Sub15';

  const thresholds = baremo.thresholds[catKey];
  if (!thresholds || !Array.isArray(thresholds)) {
    // La prueba existe pero no tiene baremo definido para este bucket de edad
    // (p.ej. press_banca_rel solo define Sub18/Senior). Antes esto devolvía
    // silenciosamente tier 'poor'/puntuación 0, contaminando el promedio del
    // pilar sin ninguna señal de que la prueba no correspondía a esa edad.
    return {
      puntuacion: null, tier: null, tierConfig: null, baremo,
      isAsymmetric: false, alertMsg: null, noAplica: true,
      mensajeNoAplica: `"${baremo.label}" no tiene baremo definido para la categoría ${catKey}.`,
    };
  }

  let tier;
  const [t1, t2, t3, t4] = thresholds;

  if (baremo.tipo === 'mas_es_mejor') {
    if (valToEval > t4) tier = 'excellent';
    else if (valToEval > t3) tier = 'above_avg';
    else if (valToEval > t2) tier = 'average';
    else if (valToEval > t1) tier = 'below_avg';
    else tier = 'poor';
  } else {
    // menos_es_mejor
    if (valToEval <= t1) tier = 'excellent';
    else if (valToEval <= t2) tier = 'above_avg';
    else if (valToEval <= t3) tier = 'average';
    else if (valToEval <= t4) tier = 'below_avg';
    else tier = 'poor';
  }

  return {
    puntuacion: TIER_CONFIG[tier].score,
    tier,
    tierConfig: TIER_CONFIG[tier],
    baremo,
    isAsymmetric,
    alertMsg,
    noAplica: false,
    mensajeNoAplica: null,
  };
}

/**
 * Calcula el Overall Score de un atleta a partir de sus evaluaciones.
 * @param {Array} evaluaciones - Array de objetos {prueba_tipo, puntuacion_normalizada}
 * @returns {{ overall: number, pilares: object, rango: object }}
 */
export function calcularOverall(evaluaciones) {
  if (!evaluaciones || evaluaciones.length === 0) {
    return { overall: 0, pilares: {}, rango: RANGOS[0] };
  }

  // Agrupar por pilar
  const porPilar = { fisico: [], tecnico: [], mental: [] };
  evaluaciones.forEach(e => {
    // Si la evaluación guardó su pilar (nuevo sistema BD) o cae en BAREMOS estático
    const pilar = e.pilar || BAREMOS[e.prueba_tipo]?.pilar;
    if (pilar) {
      porPilar[pilar]?.push(e.puntuacion_normalizada || 0);
    }
  });

  // Promedio de cada pilar
  const promPilar = {};
  Object.keys(porPilar).forEach(pilar => {
    const arr = porPilar[pilar];
    promPilar[pilar] = arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  });

  // Overall ponderado
  let overall = 0;
  let totalWeight = 0;
  Object.keys(PILLAR_WEIGHTS).forEach(pilar => {
    if (porPilar[pilar].length > 0) {
      overall += promPilar[pilar] * PILLAR_WEIGHTS[pilar];
      totalWeight += PILLAR_WEIGHTS[pilar];
    }
  });

  // Normalizar si no hay datos de todos los pilares
  if (totalWeight > 0 && totalWeight < 1) {
    overall = overall / totalWeight;
  }

  overall = Math.round(overall);

  // Determinar rango
  const rango = RANGOS.slice().reverse().find(r => overall >= r.min) || RANGOS[0];

  return { overall, pilares: promPilar, rango };
}

/**
 * Determina el rango de un atleta basado en su overall score.
 * @param {number} overallScore
 * @returns {object} Rango object
 */
export function getRango(overallScore) {
  return RANGOS.slice().reverse().find(r => overallScore >= r.min) || RANGOS[0];
}

/**
 * Obtiene las recompensas que un atleta ha desbloqueado según su rango.
 */
export function getRecompensasDesbloqueadas(rangoId) {
  const rangoIndex = RANGOS.findIndex(r => r.id === rangoId);
  const desbloqueadas = [];
  RANGOS.forEach((r, i) => {
    if (i > 0 && i <= rangoIndex && RECOMPENSAS_POR_RANGO[r.id]) {
      RECOMPENSAS_POR_RANGO[r.id].forEach(rec => {
        desbloqueadas.push({ ...rec, rango: r });
      });
    }
  });
  return desbloqueadas;
}

/**
 * Obtiene todas las recompensas (desbloqueadas y bloqueadas) para mostrar en la tienda.
 */
export function getCatalogoRecompensas(rangoId) {
  const rangoIndex = RANGOS.findIndex(r => r.id === rangoId);
  const catalogo = [];
  RANGOS.forEach((r, i) => {
    if (i > 0 && RECOMPENSAS_POR_RANGO[r.id]) {
      RECOMPENSAS_POR_RANGO[r.id].forEach(rec => {
        catalogo.push({
          ...rec,
          rango: r,
          desbloqueado: i <= rangoIndex,
        });
      });
    }
  });
  return catalogo;
}

// ===================================================================
// EXPORTS PÚBLICOS
// ===================================================================

export { BAREMOS, TIER_CONFIG, RANGOS, RECOMPENSAS_POR_RANGO, PILLAR_WEIGHTS, TIRO_WEIGHTS };
