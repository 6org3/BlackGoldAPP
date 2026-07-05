import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { getXPProgress } from '../lib/xpProgress';

// ──────────────────────────────────────────
// XP Progress Bar (nueva sección)
// ──────────────────────────────────────────
export default function XPProgressBar({ xpTotal, misionesAprobadas }) {
  const xp = getXPProgress(xpTotal || 0);
  const { currentRango, nextLevelName, percentage, current, required } = xp;
  const isMax = nextLevelName === 'MAX';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8 glass-card rounded-panel p-5 border border-brand/20 shadow-[0_0_20px_rgba(255,215,0,0.05)]"
    >
      {/* Rank header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{currentRango.emoji}</span>
          <div>
            <p className="text-3xs text-fg-muted font-bold uppercase tracking-eyebrow">Rango Actual</p>
            <p className={`text-lg font-black uppercase tracking-tight ${currentRango.color}`}>
              {currentRango.nombre}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xs text-fg-muted font-bold uppercase tracking-eyebrow">XP Total</p>
          <p className="text-2xl font-black text-white tabular-nums">{current.toLocaleString()}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[11px] text-fg-muted font-bold uppercase tracking-widest">
            {isMax ? 'Nivel Máximo Alcanzado' : `Hacia ${nextLevelName}`}
          </span>
          <span className="text-[11px] font-black text-brand">{percentage}%</span>
        </div>
        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
            className="h-full rounded-full progress-bar-glow"
          />
        </div>
        {!isMax && (
          <p className="text-[11px] text-fg-muted mt-1.5 text-right font-bold">
            {(required - current).toLocaleString()} XP para el siguiente nivel
          </p>
        )}
      </div>

      {/* Missions stat */}
      {misionesAprobadas > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2">
          <CheckCircle2 size={12} className="text-success" />
          <span className="text-3xs text-success-soft font-bold uppercase tracking-widest">
            {misionesAprobadas} misión{misionesAprobadas !== 1 ? 'es' : ''} completada{misionesAprobadas !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </motion.div>
  );
}
