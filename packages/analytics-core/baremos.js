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
  // Protocolo = CMJ con manos en cadera (si el club salta con brazos libres, sumar ~5-8 cm).
  // Recalibrado 2026-07 con normativos de baloncesto juvenil portugués (PMC8222820),
  // profesionales españoles ACB/EBA (PMC12121892) y NBA (PMC7504515) — los cortes previos
  // de Senior exigían la media NBA (68.7cm) para "excellent".
  cmj_salto: {
    label: 'Salto Vertical (CMJ)',
    pilar: 'fisico', sub_pilar: 'explosividad', tren: 'inferior',
    unidad: 'cm', tipo: 'mas_es_mejor',
    thresholds: {
      Sub12: [22, 27, 32, 37],   // <22=poor, 22-27=below, 28-32=avg, 33-37=above, ≥38=excellent
      Sub15: [27, 31, 36, 41],
      Sub18: [32, 37, 42, 48],
      Senior: [34, 39, 44, 50],
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
  // Recalibrado 2026-07 con PMC9140541 (492 futbolistas juveniles por estratos de fuerza
  // relativa; ninguno superó 2.0×BW) — los cortes previos de Sub15 [0.7,...] exigían de
  // entrada el promedio de 16-17 años. Nota: el 1RM directo en Sub12 es cuestionable — a esa
  // edad la literatura recomienda estimar por repeticiones submáximas, no 1RM real.
  sentadilla_rel: {
    label: 'Sentadilla (× Peso Corp.)',
    pilar: 'fisico', sub_pilar: 'fuerza', tren: 'inferior',
    unidad: 'x_bw', tipo: 'mas_es_mejor',
    thresholds: {
      Sub12: [0.25, 0.39, 0.59, 0.79],
      Sub15: [0.45, 0.7, 1.0, 1.3],
      Sub18: [0.85, 1.15, 1.45, 1.75],
      Senior: [0.85, 1.15, 1.5, 1.99],
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
  // Convención: 0 cm = punta del pie (dedos). Negativo = no se alcanza la punta;
  // positivo = se sobrepasa. Recalibrado 2026-07 con EUROFIT/Tomkinson 2018 (BJSM,
  // n=2.78M, convertido de caja +15cm) — los cortes previos saltaban de norma masculina
  // (Sub12/15) a femenina (Sub18/Senior) con un escalón fisiológicamente injustificado.
  sit_reach: {
    label: 'Sit & Reach',
    pilar: 'fisico', sub_pilar: 'movilidad', tren: null,
    unidad: 'cm', tipo: 'mas_es_mejor',
    thresholds: {
      Sub12: [0, 4, 9, 13],
      Sub15: [-1, 3, 8, 12],
      Sub18: [0, 4, 9, 13],
      Senior: [-2, 2, 8, 13],
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
  // Recalibrado 2026-07 — con los cortes previos [70,79,87,94] un hombro con ER NORMAL
  // (~90°, AAOS en 90° de abducción) clasificaba above_avg; ahora la mediana cae en average.
  // Protocolo: goniometría en 90° de abducción (documentado porque medir "a lado" da ~10° menos).
  hombro_re: {
    label: 'Rot. Externa Hombro',
    pilar: 'fisico', sub_pilar: 'movilidad', tren: 'superior',
    unidad: 'grados', tipo: 'mas_es_mejor',
    inputs_requeridos: [{ id: 'izq', label: 'Izquierdo' }, { id: 'der', label: 'Derecho' }],
    thresholds: {
      Sub12: [80, 86, 92, 98],
      Sub15: [80, 86, 92, 98],
      Sub18: [80, 86, 92, 98],
      Senior: [80, 86, 92, 98],
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

  // ─── Resistencia ──────────────────────────────────────────────────
  // Estas entradas usan umbrales por capas (Género→Bucket→Nivel→[4 cortes] o
  // Género→Todas→[4]); el label es el nombre EXACTO de prod para que el backfill por
  // nombre de scripts/sync_catalogo_ejercicios.mjs las enlace. NO leer thresholds[bucket]
  // directo en estas claves — resolverUmbrales ya entiende las capas.
  //
  // FUENTE CANÓNICA (2026-07): tras la recalibración científica de julio 2026, baremos.js
  // es la fuente de verdad de course_navette (ya NO replica el catálogo de prod). El runtime
  // de evaluación (EvaluacionModal) puntúa con catalogo_ejercicios.thresholds de la BD, así
  // que para que estos cortes lleguen a producción hay que propagarlos con
  // `node scripts/sync_catalogo_ejercicios.mjs` (SIMULAR=false): sincroniza baremos.js →
  // catalogo_ejercicios por baremo_key (UPDATE de thresholds). Editar baremos.js solo NO
  // cambia el scoring en vivo.
  // Excepción: carrera_600m_vinueza y carrera_1000m_vinueza conservan TAL CUAL las tablas
  // originales del owner (batería Vinueza) — esas no se recalibraron.

  // Resistencia - Capacidad aeróbica (Course Navette / Léger 20m)
  // Recalibrado 2026-07 con Tomkinson 2017 (n=1.14M, 50 países), FUPRECOL (población
  // latinoamericana) y PACER/FitnessGram; capa Desarrollo ≈ mediana poblacional, la meseta
  // puberal femenina ahora se respeta, y "excellent" de Elite pasó de p99+ inalcanzable a
  // ~p90-p95.
  course_navette: {
    label: 'Course Navette (Léger 20m)',
    pilar: 'fisico', sub_pilar: 'resistencia', tren: null,
    unidad: 'paliers', tipo: 'mas_es_mejor',
    thresholds: {
      Femenino: {
        Sub12:  { Micro: [2, 2.5, 3, 4],     Desarrollo: [2.5, 3, 4, 4.5],   Elite: [3, 4, 4.5, 5.5] },
        Sub15:  { Micro: [2.5, 3, 4, 4.5],   Desarrollo: [3, 4, 4.5, 5.5],   Elite: [4, 4.5, 5.5, 6] },
        Sub18:  { Micro: [2.5, 3.5, 4, 5],   Desarrollo: [3.5, 4, 5, 5.5],   Elite: [4, 5, 5.5, 6.5] },
        Senior: { Micro: [3, 3.5, 4.5, 5.5], Desarrollo: [3.5, 4.5, 5.5, 6.5], Elite: [4.5, 5.5, 6.5, 7.5] },
      },
      Masculino: {
        Sub12:  { Micro: [2.5, 3, 3.5, 4.5], Desarrollo: [3, 3.5, 4.5, 5],   Elite: [3.5, 4.5, 5, 6] },
        Sub15:  { Micro: [4, 5, 6, 6.5],     Desarrollo: [5, 6, 6.5, 7.5],   Elite: [6, 6.5, 7.5, 8.5] },
        Sub18:  { Micro: [5, 6, 7, 7.5],     Desarrollo: [6, 7, 7.5, 8.5],   Elite: [7, 8, 8.5, 10] },
        Senior: { Micro: [5.5, 6.5, 7, 8],   Desarrollo: [6.5, 7, 8, 9],     Elite: [7, 8, 9, 10] },
      },
    },
  },

  // Resistencia - Carrera 600 m, batería Vinueza 9-10 años (solo Sub12, menos es mejor)
  carrera_600m_vinueza: {
    label: 'Carrera 600 m (Vinueza)',
    pilar: 'fisico', sub_pilar: 'resistencia', tren: null,
    unidad: 'segundos', tipo: 'menos_es_mejor',
    thresholds: {
      Femenino: {
        Sub12: { Micro: [165, 182, 198, 220], Desarrollo: [150, 165, 180, 200], Elite: [135, 149, 162, 180] },
      },
      Masculino: {
        Sub12: { Micro: [154, 171, 187, 209], Desarrollo: [140, 155, 170, 190], Elite: [126, 140, 153, 171] },
      },
    },
  },

  // Resistencia - Carrera 1000 m, batería Vinueza 11-12 años (solo Sub15, menos es mejor)
  carrera_1000m_vinueza: {
    label: 'Carrera 1000 m (Vinueza)',
    pilar: 'fisico', sub_pilar: 'resistencia', tren: null,
    unidad: 'segundos', tipo: 'menos_es_mejor',
    thresholds: {
      Femenino: {
        Sub15: { Micro: [292, 319, 347, 380], Desarrollo: [265, 290, 315, 345], Elite: [239, 261, 284, 311] },
      },
      Masculino: {
        Sub15: { Micro: [264, 292, 319, 352], Desarrollo: [240, 265, 290, 320], Elite: [216, 239, 261, 288] },
      },
    },
  },

  // Resistencia - Capacidad aeróbica máxima intermitente (Yo-Yo IR1)
  yoyo_ir1: {
    label: 'Yo-Yo Intermittent Recovery L1',
    pilar: 'fisico', sub_pilar: 'resistencia', tren: 'inferior',
    unidad: 'nivel', tipo: 'mas_es_mejor',
    thresholds: {
      Femenino: { Todas: [10, 12, 14, 16] },
      Masculino: { Todas: [12, 14, 16, 18] },
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

const NIVELES_DESARROLLO = ['Micro', 'Desarrollo', 'Elite'];

/**
 * Resuelve el array de 4 cortes [t1,t2,t3,t4] dentro de un `thresholds`, entendiendo
 * TODAS las convenciones que conviven en producción (inventariadas 2026-07-05 en
 * catalogo_ejercicios) más la dimensión nueva de nivel de desarrollo (fase P1.5):
 *
 *   1. { Sub15: [t1,t2,t3,t4], ... }                       ← canónica (BAREMOS estático)
 *   2. { Sub15: { Micro:[...], Desarrollo:[...], Elite:[...] } } ← NUEVA: por nivel de desarrollo
 *   3. { Masculino: {...}, Femenino: {...} }               ← capa de género (NuevaPruebaModal;
 *                                                            dimorfismo sexual, Vinueza 2002)
 *   4. { Todas: ... }                                      ← bucket comodín legacy
 *   5. { Todas: { tier_1: n, tier_2: n, tier_3: n, tier_4: n } } ← shape legacy por tiers
 *
 * Antes de este resolver, las formas 2-5 devolvían siempre noAplica (el motor exigía
 * `Array.isArray(thresholds[bucket])`), dejando muertas 10 de las 30 pruebas del
 * catálogo en producción.
 *
 * @param {object} thresholdsRaw - El JSONB thresholds de la prueba.
 * @param {{ bucket: string, nivelDesarrollo?: string|null, genero?: string|null }} ctx
 * @returns {number[]|null} Los 4 cortes, o null si no hay umbral aplicable.
 */
export function resolverUmbrales(thresholdsRaw, { bucket, nivelDesarrollo = null, genero = null } = {}) {
  if (!thresholdsRaw || typeof thresholdsRaw !== 'object' || Array.isArray(thresholdsRaw)) return null;

  // Capa opcional de género. Fallback al otro género si el del atleta no está definido:
  // preferible a noAplica (el umbral del otro sexo es una aproximación, no un vacío).
  let nodo = thresholdsRaw;
  if (nodo.Masculino || nodo.Femenino) {
    nodo = nodo[genero] || nodo.Masculino || nodo.Femenino;
    if (!nodo || typeof nodo !== 'object' || Array.isArray(nodo)) return null;
  }

  // Bucket de edad, con 'Todas' como comodín.
  let cortes = nodo[bucket] ?? nodo.Todas ?? null;
  if (!cortes) return null;

  if (!Array.isArray(cortes) && typeof cortes === 'object') {
    if (NIVELES_DESARROLLO.some(n => n in cortes)) {
      // Capa de nivel de desarrollo: nivel del atleta → fallback 'Desarrollo' → el que haya.
      cortes = cortes[nivelDesarrollo] || cortes.Desarrollo
        || cortes[NIVELES_DESARROLLO.find(n => n in cortes)];
    } else if ('tier_1' in cortes) {
      cortes = [cortes.tier_1, cortes.tier_2, cortes.tier_3, cortes.tier_4];
    }
  }

  return Array.isArray(cortes) && cortes.length >= 4 && cortes.slice(0, 4).every(Number.isFinite)
    ? cortes
    : null;
}

/**
 * Normaliza un valor crudo en una puntuación 0-100 usando los baremos científicos.
 *
 * NOTA sobre género y nivel de desarrollo: los umbrales de BAREMOS estático no están
 * segmentados por sexo ni nivel (van directo a Sub12/Sub15/Sub18/Senior), pero las
 * pruebas del catálogo en BD sí pueden estarlo (ver resolverUmbrales). El 4º parámetro
 * `perfil` alimenta esas dimensiones cuando existen; si el umbral no las define, no
 * tiene ningún efecto. (Un parámetro `genero` existió aquí antes y se retiró por no
 * tener umbrales que consultar — hoy sí los hay, creados por NuevaPruebaModal, y la
 * base científica del dimorfismo está en baremos_cientificos.md y en
 * blackgold-mcp/knowledge/fundamentos_iniciacion_vinueza.md.)
 *
 * @param {object|string} baremoObj - El objeto de configuración de la prueba (o clave string por retrocompatibilidad)
 * @param {number|number[]} valorCrudo - El valor medido
 * @param {string} categoria - La categoría del atleta (ej. 'Sub15')
 * @param {{ nivel_desarrollo?: string|null, genero?: string|null }} [perfil] - Atributos del atleta para umbrales segmentados.
 * @returns {{ puntuacion: number|null, tier: string|null, tierConfig: object|null, baremo: object, isAsymmetric: boolean, alertMsg: string|null, noAplica: boolean, mensajeNoAplica: string|null }}
 */
export function normalizarValor(baremoObj, valorCrudo, categoria, perfil = {}) {
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

  // Resolución multi-convención (canónica, por nivel, por género, 'Todas', tiers legacy)
  // — ver resolverUmbrales. perfil.nivel_desarrollo/genero solo influyen si el umbral
  // de esta prueba está segmentado por esas dimensiones.
  const thresholds = resolverUmbrales(baremo.thresholds, {
    bucket: catKey,
    nivelDesarrollo: perfil.nivel_desarrollo ?? perfil.nivelDesarrollo ?? null,
    genero: perfil.genero ?? null,
  });
  if (!thresholds) {
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
