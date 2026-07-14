import { C, TINT } from './arcade/arcadeTokens';

// ─── Constantes de UI ─────────────────────────────────────────
export const POSICIONES = ['N/A', 'Generador', 'Alero Físico', 'Ancla Fuerte', 'Escolta', 'Ala-Pívot'];
export const CATEGORIAS_FEB = ['Todas', 'Premini (Sub-9)', 'Mini (Sub-11)', 'Menores (Sub-14)', 'Prejuvenil (Sub-16)', 'Juvenil (Sub-18)', 'Mayores'];
export const NIVELES_DESARROLLO = ['Todos', 'Micro', 'Desarrollo', 'Elite', 'Por Asignar'];

// ─── Badge Config por Nivel (color/tinte Arcade: c = texto+borde, tint = fondo) ─
export const NIVEL_BADGE = {
  Micro:         { c: C.ok,    tint: TINT.ok,                icon: '🌱' },
  Desarrollo:    { c: C.gold,  tint: TINT.gold,              icon: '⚡' },
  Elite:         { c: C.ai,    tint: TINT.ai,                icon: '👑' },
  'Por Asignar': { c: C.text2, tint: TINT.neutral, icon: '❓' },
};

// ─── Orden de agrupamiento ────────────────────────────────────
export const NIVEL_ORDER = ['Elite', 'Desarrollo', 'Micro', 'Por Asignar'];
