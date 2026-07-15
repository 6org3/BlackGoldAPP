import { C, TINT } from './arcade/arcadeTokens';

// ─── Constantes de UI ─────────────────────────────────────────
export const POSICIONES = ['N/A', 'Generador', 'Alero Físico', 'Ancla Fuerte', 'Escolta', 'Ala-Pívot'];
export const CATEGORIAS_FEB = ['Todas', 'Premini (Sub-9)', 'Mini (Sub-11)', 'Menores (Sub-14)', 'Prejuvenil (Sub-16)', 'Juvenil (Sub-18)', 'Mayores'];
export const NIVELES_DESARROLLO = ['Todos', 'Micro', 'Desarrollo', 'Elite', 'Por Asignar'];

// Membresía deportiva (atletas.estado_membresia, v31). Los valores son los de
// la BD; las etiquetas, el idioma del club. 'inactivo' no se ofrece como filtro:
// hoy nada lo escribe (el ciclo real es activo ⇄ baja).
export const ESTADOS_MEMBRESIA = ['Todos', 'activo', 'baja'];
export const ESTADOS_MEMBRESIA_LABELS = ['Todos', 'Activos', 'De baja'];

// ─── Badge Config por Nivel (color/tinte Arcade: c = texto+borde, tint = fondo) ─
export const NIVEL_BADGE = {
  Micro:         { c: C.ok,    tint: TINT.ok,                icon: '🌱' },
  Desarrollo:    { c: C.gold,  tint: TINT.gold,              icon: '⚡' },
  Elite:         { c: C.ai,    tint: TINT.ai,                icon: '👑' },
  'Por Asignar': { c: C.text2, tint: TINT.neutral, icon: '❓' },
};

// ─── Orden de agrupamiento ────────────────────────────────────
export const NIVEL_ORDER = ['Elite', 'Desarrollo', 'Micro', 'Por Asignar'];
