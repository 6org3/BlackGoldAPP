// src/lib/xpProgress.js
// XP Progression System

export const NIVELES_XP = [
  { id: 'rookie', nombre: 'Rookie', min: 0, emoji: '🟤', color: 'text-gray-400', bg: 'bg-gray-500' },
  { id: 'prospecto', nombre: 'Prospecto', min: 1000, emoji: '🟠', color: 'text-orange-400', bg: 'bg-orange-500' },
  { id: 'desarrollo', nombre: 'Desarrollo', min: 2500, emoji: '🔵', color: 'text-blue-400', bg: 'bg-blue-500' },
  { id: 'elite', nombre: 'Élite', min: 5000, emoji: '⭐', color: 'text-[#FFD700]', bg: 'bg-[#FFD700]' },
  { id: 'leyenda_mamba', nombre: 'Leyenda Mamba', min: 7500, emoji: '👑', color: 'text-purple-400', bg: 'bg-purple-500' },
];

/**
 * Calculates progress towards the next rank based on xp_total.
 * @param {number} xpTotal — The athlete's total XP
 * @returns {{ current: number, required: number, nextLevelName: string, percentage: number, currentRango: object }}
 */
export function getXPProgress(xpTotal) {
  const score = Number(xpTotal) || 0;
  
  const currentIdx = NIVELES_XP.slice().reverse().findIndex(r => score >= r.min);
  const actualIdx = currentIdx >= 0 ? (NIVELES_XP.length - 1 - currentIdx) : 0;
  
  const currentRango = NIVELES_XP[actualIdx];
  const isMax = actualIdx >= NIVELES_XP.length - 1;
  
  const nextRango = isMax ? currentRango : NIVELES_XP[actualIdx + 1];
  const currentMin = currentRango.min;
  const nextMin = nextRango.min;
  
  const range = nextMin - currentMin;
  const progress = score - currentMin;
  
  const percentage = isMax
    ? 100
    : range > 0
      ? Math.min(Math.round((progress / range) * 100), 100)
      : 0;

  return {
    current: score,
    required: nextMin,
    nextLevelName: isMax ? 'MAX' : nextRango.nombre,
    percentage,
    currentRango,
  };
}
