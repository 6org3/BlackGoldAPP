// ─── Constantes de UI ─────────────────────────────────────────
export const POSICIONES = ['N/A', 'Generador', 'Alero Físico', 'Ancla Fuerte', 'Escolta', 'Ala-Pívot'];
export const CATEGORIAS_FEB = ['Todas', 'Premini (Sub-9)', 'Mini (Sub-11)', 'Menores (Sub-14)', 'Prejuvenil (Sub-16)', 'Juvenil (Sub-18)', 'Mayores'];
export const NIVELES_DESARROLLO = ['Todos', 'Micro', 'Desarrollo', 'Elite', 'Por Asignar'];

// ─── Badge Config por Nivel ───────────────────────────────────
export const NIVEL_BADGE = {
  Micro: { color: 'text-success-soft', border: 'border-success/30', bg: 'bg-success/10', icon: '🌱' },
  Desarrollo: { color: 'text-brand', border: 'border-brand/30', bg: 'bg-brand/10', icon: '⚡' },
  Elite: { color: 'text-mental-soft', border: 'border-mental/30', bg: 'bg-mental/10', icon: '👑' },
  'Por Asignar': { color: 'text-fg-secondary', border: 'border-gray-500/30', bg: 'bg-gray-500/10', icon: '❓' },
};

// ─── Orden de agrupamiento ────────────────────────────────────
export const NIVEL_ORDER = ['Elite', 'Desarrollo', 'Micro', 'Por Asignar'];
