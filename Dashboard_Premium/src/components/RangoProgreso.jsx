import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { getXPProgress } from '../lib/xpProgress';
import { COLORS } from '../lib/designTokens';

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

      {/* Progress bar */}
      <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden border border-white/5 relative">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress.percentage}%` }}
          transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${barColor}88, ${barColor})`,
            boxShadow: `0 0 8px ${barColor}66`,
          }}
        />
      </div>

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
