import { useMemo } from 'react';
import { getXPProgress } from '../lib/xpProgress';
import { COLORS } from '../lib/designTokens';
import XPCells from './arcade/XPCells';

export default function RangoProgreso({ xpTotal }) {
  const progress = useMemo(
    () => getXPProgress(xpTotal),
    [xpTotal]
  );

  const currentRango = progress.currentRango;
  // Identidad del rango desde la fuente única (designTokens vía NIVELES_XP)
  const barColor = currentRango?.hex || COLORS.gold[500];

  return (
    <div className="w-full max-w-[200px] select-none">
      {/* Current rank label */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-1">
          <span className="text-sm leading-none">{currentRango?.emoji}</span>
          <span
            className={`text-2xs font-black uppercase tracking-widest ${currentRango?.color || 'text-fg-secondary'}`}
          >
            {currentRango?.nombre}
          </span>
        </span>
      </div>

      {/* Progreso de rango como celdas Arcade (role=progressbar + aria) */}
      <XPCells
        pct={progress.percentage}
        cells={10}
        height={8}
        fill={`linear-gradient(90deg, ${barColor}bb, ${barColor})`}
        fillGlow={`0 0 6px ${barColor}66`}
        label={`Progreso de rango ${currentRango?.nombre || ''}`}
      />

      {/* Stats text */}
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-3xs font-bold text-fg-muted uppercase tracking-widest">
          XP:{' '}
          <span className="text-white">
            {progress.current.toLocaleString()}
            {progress.nextLevelName !== 'MAX' && (
              <span className="text-fg-muted"> / {progress.required.toLocaleString()}</span>
            )}
          </span>
        </span>
        <span className="text-3xs font-bold text-fg-muted uppercase tracking-widest">
          {progress.nextLevelName !== 'MAX' ? (
            <>
              Sig:{' '}
              <span className="text-fg-secondary">{progress.nextLevelName}</span>
            </>
          ) : (
            <span className="text-brand">MAX</span>
          )}
        </span>
      </div>
    </div>
  );
}
