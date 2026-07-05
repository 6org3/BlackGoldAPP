// src/lib/xpProgress.js
// XP Progression System

import { RANGOS_UI } from './designTokens';

// Umbrales de XP (dominio) + identidad visual desde la fuente única
// del design system (color/bg/hex/emoji — ver RANGOS_UI en designTokens.js).
const UMBRALES = [
  { id: 'rookie', nombre: 'Rookie', min: 0 },
  { id: 'prospecto', nombre: 'Prospecto', min: 1000 },
  { id: 'desarrollo', nombre: 'Desarrollo', min: 2500 },
  { id: 'elite', nombre: 'Élite', min: 5000 },
  { id: 'leyenda_mamba', nombre: 'Leyenda Mamba', min: 7500 },
];

export const NIVELES_XP = UMBRALES.map(nivel => {
  const ui = RANGOS_UI[nivel.id];
  return { ...nivel, emoji: ui.emoji, color: ui.text, bg: ui.bg, hex: ui.hex };
});

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
