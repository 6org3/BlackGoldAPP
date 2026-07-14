// src/lib/designTokens.js
// BLACK GOLD DESIGN SYSTEM — tokens para JavaScript.
// Gemelo de src/styles/tokens.css para las capas que no leen CSS vars:
// Recharts, Framer Motion, canvas-confetti y estilos inline dinámicos.
// Si un valor cambia aquí, cambia también en tokens.css (y viceversa).
// Documentación: docs/design_system.md

export const COLORS = {
  gold: {
    100: '#FFF8DC',
    300: '#FFEB66',
    400: '#FFDF33',
    500: '#FFD700', // oro canónico
    600: '#D4AF37',
    700: '#9E7C1C',
    900: '#3D3300',
  },
  surface: {
    base:   '#09090B',
    sunken: '#0D0D0F',
    card:   '#121214',
    raised: '#18181B',
    top:    '#1F1F23',
  },
  fg: {
    primary:   '#EDEDED',
    secondary: '#9CA3AF',
    muted:     '#828997', // muted accesible (AA 4.5:1) — espejo de --color-fg-muted
    faint:     '#4B5563',
    inverse:   '#0A0A0C',
  },
  feedback: {
    success: '#10B981', successSoft: '#34D399',
    warning: '#F59E0B', warningSoft: '#FBBF24',
    caution: '#F97316', cautionSoft: '#FB923C',
    danger:  '#EF4444', dangerSoft:  '#F87171',
    info:    '#3B82F6', infoSoft:    '#60A5FA',
    mental:  '#A855F7', mentalSoft:  '#C084FC',
  },
  whatsapp: { base: '#25D366', deep: '#128C7E' },
};

// ── Gamificación ─────────────────────────────────────────────
// Fuente ÚNICA de la identidad visual de cada rango XP.
// Reemplaza los mapas duplicados de xpProgress.js (clases),
// RangoProgreso.jsx (RANGO_HEX) y LevelUpAnimation.jsx (rangoColorHex).
export const RANGOS_UI = {
  rookie:        { hex: '#9CA3AF', text: 'text-rank-rookie',     bg: 'bg-rank-rookie',     emoji: '🟤' },
  prospecto:     { hex: '#FB923C', text: 'text-rank-prospecto',  bg: 'bg-rank-prospecto',  emoji: '🟠' },
  desarrollo:    { hex: '#60A5FA', text: 'text-rank-desarrollo', bg: 'bg-rank-desarrollo', emoji: '🔵' },
  elite:         { hex: '#FFD700', text: 'text-rank-elite',      bg: 'bg-rank-elite',      emoji: '⭐' },
  leyenda_mamba: { hex: '#C084FC', text: 'text-rank-leyenda',    bg: 'bg-rank-leyenda',    emoji: '👑' },
};

/** Identidad visual de un rango con fallback dorado (élite) para ids desconocidos. */
export function getRangoUI(id) {
  return RANGOS_UI[id] ?? RANGOS_UI.elite;
}

// Baremo de rendimiento (antes getBaremoLevel, duplicado en
// AtletaCard.jsx y AthleteLayout.jsx). Ordenado de mayor a menor min.
export const BAREMO_UI = [
  { id: 'excelente', nombre: 'Excelente', min: 81, hex: '#34D399', color: 'text-tier-excelente', bg: 'bg-tier-excelente' },
  { id: 'muyBueno',  nombre: 'Muy Bueno', min: 61, hex: '#FFD700', color: 'text-tier-muybueno',  bg: 'bg-tier-muybueno' },
  { id: 'bueno',     nombre: 'Bueno',     min: 41, hex: '#22D3EE', color: 'text-tier-bueno',     bg: 'bg-tier-bueno' },
  { id: 'regular',   nombre: 'Regular',   min: 21, hex: '#FB923C', color: 'text-tier-regular',   bg: 'bg-tier-regular' },
  { id: 'sinDatos',  nombre: 'Sin datos', min: 0,  hex: '#4B5563', color: 'text-tier-sindatos',  bg: 'bg-tier-sindatos' },
];

/** Nivel de baremo para una puntuación 0–100: {id, nombre, color, bg, hex}. */
export function getBaremoUI(value) {
  return BAREMO_UI.find(t => (Number(value) || 0) >= t.min) ?? BAREMO_UI[BAREMO_UI.length - 1];
}

// Paleta oficial para canvas-confetti en celebraciones
export const CONFETTI_GOLD = ['#FFD700', '#D4AF37', '#FFF8DC', '#FFEB66'];

// Etiqueta legible del chip "✦ fuente" de las cards IA (CardDiagnosticoIA,
// CardReadinessIA, CardFocoAtleta): el gateway devuelve el nombre crudo de
// la tool del MCP (fuente.tool) — nunca mostrarlo tal cual al usuario.
export const FUENTE_IA_UI = {
  analyze_athlete_pillars: 'Diagnóstico de pilares',
  analyze_athlete_readiness: 'Análisis de readiness',
  consultar_rack: 'Base de conocimiento',
};

/** Etiqueta legible de una tool del cerebro, con fallback genérico. */
export function getFuenteIALabel(tool) {
  return FUENTE_IA_UI[tool] ?? 'Análisis IA';
}

// Tiers de tendencia grupal (antes duplicado en HistorialPruebas.jsx
// y GrupoTendencias.jsx como TIER_COLORS / TIER_BAR_COLORS).
export const TENDENCIA_TIERS = {
  poor: '#F87171',
  below_avg: '#FB923C',
  average: '#22D3EE',
  above_avg: '#FFD700',
  excellent: '#34D399',
  fallback: '#9CA3AF',
};

// ── Gráficos (Recharts) ──────────────────────────────────────
export const CHART = {
  grid:  'rgba(255,255,255,0.05)',
  axis:  '#6B7280',
  label: '#9CA3AF',
  // Orden de series: el atleta siempre en oro; comparativas en neutro.
  series: ['#FFD700', 'rgba(255,255,255,0.4)', '#60A5FA', '#C084FC'],
  radar: {
    stroke: '#FFD700',
    fill: 'rgba(255,215,0,0.15)',
    compareStroke: 'rgba(255,255,255,0.35)',
    compareFill: 'rgba(255,255,255,0.06)',
  },
  tooltip: {
    background: '#1F1F23',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    color: '#EDEDED',
  },
  // Paleta categórica de los 7 pilares (barras/comparativas por pilar).
  // Restricción CVD: agilidad↔tiro indistinguibles en visión deután — solo
  // usarla con etiqueta de pilar visible en cada marca, nunca color-solo
  // ni reordenar (ver design_system.md §4.9).
  pilares: {
    fuerza: '#F97316',
    explosividad: '#EAB308',
    movilidad: '#22C55E',
    tiro: '#3B82F6',
    agilidad: '#A855F7',
    tactica: '#EC4899',
    resiliencia: '#FFD700',
    antropometrico: '#06B6D4',
  },
  // Paleta categórica (pie/desgloses). Las categorías FEB tienen color fijo.
  categorical: {
    'Premini (Sub-9)': '#10B981',
    'Mini (Sub-11)': '#06B6D4',
    'Menores (Sub-14)': '#3B82F6',
    'Prejuvenil (Sub-16)': '#FFD700',
    'Juvenil (Sub-18)': '#A855F7',
    'Mayores': '#EC4899',
    fallback: '#6B7280',
  },
};

// ── Motion (Framer Motion) ───────────────────────────────────
// Duraciones en segundos. Curva firma: EASE.premium.
export const MOTION = {
  duration: {
    fast: 0.15,        // microinteracciones: hover, toggle
    base: 0.3,         // apertura de modales, fades de UI
    entrance: 0.6,     // entrada de tarjetas/secciones
    bar: 1.0,          // barras de progreso y XP
    celebration: 2.0,  // anillos/partículas de level-up
  },
  ease: {
    out: 'easeOut',
    premium: [0.25, 0.46, 0.45, 0.94], // = --ease-premium en CSS
  },
  spring: {
    ui:      { type: 'spring', damping: 26, stiffness: 320 }, // sheets, drags
    festive: { type: 'spring', damping: 10, stiffness: 200 }, // level-up, logros
  },
  stagger: { step: 0.08, cap: 0.6 }, // ver staggerDelay()
};

// Presets listos para <motion.*>
export const VARIANTS = {
  cardIn: {
    initial: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: MOTION.duration.entrance, ease: MOTION.ease.out },
  },
  modalIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.97 },
    transition: { duration: MOTION.duration.base, ease: MOTION.ease.out },
  },
  fadeInUp: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: MOTION.duration.base, ease: MOTION.ease.out },
  },
};

/**
 * Delay de stagger con tope: evita que el ítem 20 de una lista espere 3s
 * (bug de percepción del patrón `delay: index * 0.15` en listas largas).
 * @param {number} index — posición del ítem
 * @param {number} [step] — separación entre ítems (s)
 * @param {number} [cap] — delay máximo acumulado (s)
 */
export function staggerDelay(index, step = MOTION.stagger.step, cap = MOTION.stagger.cap) {
  return Math.min(index * step, cap);
}
