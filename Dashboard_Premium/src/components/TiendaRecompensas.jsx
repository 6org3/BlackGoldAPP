import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { getCatalogoRecompensas, RANGOS } from '../lib/baremosEngine';
import { Gift, Lock, CheckCircle2, Trophy, Sparkles, ChevronRight } from 'lucide-react';

// ───────────────────────────────────────────────────
// HELPERS
// ───────────────────────────────────────────────────

function getRangoActual(rangoId) {
  return RANGOS.find(r => r.id === rangoId) || RANGOS[0];
}

function getRangoProgress(rangoId) {
  const idx = RANGOS.findIndex(r => r.id === rangoId);
  if (idx < 0) return 0;
  return ((idx + 1) / RANGOS.length) * 100;
}

// ───────────────────────────────────────────────────
// ANIMATION VARIANTS
// ───────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

// ───────────────────────────────────────────────────
// COMPONENT
// ───────────────────────────────────────────────────

export default function TiendaRecompensas({ rangoId, atletaId }) {
  const rangoActual = useMemo(() => getRangoActual(rangoId), [rangoId]);
  const catalogo = useMemo(() => getCatalogoRecompensas(rangoId), [rangoId]);
  const progress = useMemo(() => getRangoProgress(rangoId), [rangoId]);

  const desbloqueados = catalogo.filter(r => r.desbloqueado).length;
  const total = catalogo.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="glass-card rounded-card p-4 sm:p-8 relative overflow-hidden glow-border"
    >
      {/* Ambient gold glow */}
      <div className="absolute -top-32 -left-32 w-64 h-64 rounded-full blur-[100px] pointer-events-none opacity-30 bg-brand" />
      <div className="absolute -bottom-20 -right-20 w-48 h-48 rounded-full blur-[80px] pointer-events-none opacity-20 bg-brand-strong" />

      {/* Header */}
      <div className="relative z-10 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-control bg-brand/10 border border-brand/30 flex items-center justify-center">
              <Gift size={20} className="text-brand" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-tight">Tienda de Recompensas</h2>
              <p className="text-3xs text-white/40 uppercase tracking-eyebrow font-bold mt-0.5">
                Desbloquea con tu progreso
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 bg-white/5 border border-white/10 rounded-control px-3 py-1.5">
            <Sparkles size={12} className="text-brand/60" />
            <span className="text-3xs font-black text-white/40 uppercase tracking-widest">
              {desbloqueados}/{total}
            </span>
          </div>
        </div>

        {/* Current rank banner */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="bg-white/[0.03] border border-white/[0.08] rounded-panel p-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-3xl">{rangoActual.emoji}</span>
              <div>
                <span className="text-3xs font-black text-white/30 uppercase tracking-eyebrow block mb-0.5">
                  Tu Rango Actual
                </span>
                <span className={`text-xl font-black uppercase tracking-tight ${rangoActual.color}`}>
                  {rangoActual.nombre}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Trophy size={14} className="text-brand/40" />
              <span className="text-3xs font-black text-white/30 uppercase tracking-widest">
                {rangoActual.min}–{rangoActual.max}%
              </span>
            </div>
          </div>

          {/* Rank progress bar */}
          <div className="mt-3 flex items-center space-x-3">
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                className="h-full rounded-full bg-gradient-to-r from-brand-strong to-brand"
              />
            </div>
            <div className="flex space-x-1">
              {RANGOS.map((r) => (
                <span
                  key={r.id}
                  title={r.nombre}
                  role="img"
                  aria-label={r.nombre}
                  className={`text-xs transition-opacity ${
                    r.id === rangoId ? 'opacity-100' : 'opacity-30'
                  }`}
                >
                  {r.emoji}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Rewards Grid */}
      {catalogo.length === 0 ? (
        <div className="relative z-10 flex flex-col items-center justify-center py-12 text-center">
          <Gift size={32} className="text-white/10 mb-3" />
          <p className="text-sm text-white/30 font-semibold">No hay recompensas disponibles aún</p>
          <p className="text-3xs text-white/20 uppercase tracking-widest mt-1">Sigue progresando para desbloquear</p>
        </div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          {catalogo.map((recompensa, idx) => (
            <RewardCard key={`${recompensa.rango.id}-${idx}`} recompensa={recompensa} index={idx} />
          ))}
        </motion.div>
      )}

      {/* Next unlock hint */}
      {desbloqueados < total && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="relative z-10 mt-6 flex items-center justify-center space-x-2 text-3xs text-white/25 uppercase tracking-eyebrow font-bold"
        >
          <ChevronRight size={10} className="text-brand/40" />
          <span>Sigue subiendo de rango para desbloquear más recompensas</span>
        </motion.div>
      )}
    </motion.div>
  );
}

// ───────────────────────────────────────────────────
// REWARD CARD SUB-COMPONENT
// ───────────────────────────────────────────────────

function RewardCard({ recompensa, index }) {
  const { nombre, descripcion, rango, desbloqueado } = recompensa;

  return (
    <motion.div
      variants={cardVariants}
      whileHover={desbloqueado ? { scale: 1.02, y: -2 } : {}}
      className={`
        relative rounded-panel p-5 transition-all duration-300 overflow-hidden
        ${desbloqueado
          ? 'bg-white/[0.04] border border-brand/30 shadow-[0_0_20px_rgba(255,215,0,0.08)]'
          : 'bg-white/[0.02] border border-white/[0.06] opacity-60'
        }
      `}
    >
      {/* Unlocked gold glow overlay */}
      {desbloqueado && (
        <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full blur-[50px] pointer-events-none opacity-20 bg-brand" />
      )}

      <div className="relative z-10">
        {/* Top row: Status badge */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{rango.emoji}</span>
            <span className={`text-3xs font-black uppercase tracking-eyebrow ${rango.color}`}>
              {rango.nombre}
            </span>
          </div>

          {desbloqueado ? (
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: index * 0.1 + 0.3, type: 'spring', stiffness: 200 }}
              className="w-7 h-7 rounded-full bg-success/15 border border-success/30 flex items-center justify-center"
            >
              <CheckCircle2 size={14} className="text-success-soft" />
            </motion.div>
          ) : (
            <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <Lock size={12} className="text-white/30" />
            </div>
          )}
        </div>

        {/* Reward name */}
        <h3 className={`text-sm font-black tracking-tight mb-1.5 ${desbloqueado ? 'text-white' : 'text-white/40'}`}>
          {nombre}
        </h3>

        {/* Description */}
        <p className={`text-xs leading-relaxed ${desbloqueado ? 'text-white/50' : 'text-white/20'}`}>
          {descripcion}
        </p>

        {/* Locked rank requirement */}
        {!desbloqueado && (
          <div className="mt-3 flex items-center space-x-1.5">
            <Lock size={10} className="text-white/20" />
            <span className="text-3xs font-black text-white/25 uppercase tracking-widest">
              Requiere rango {rango.nombre}
            </span>
          </div>
        )}

        {/* Unlocked status tag */}
        {desbloqueado && (
          <div className="mt-3 flex items-center space-x-1.5">
            <Sparkles size={10} className="text-brand/50" />
            <span className="text-3xs font-black text-brand/60 uppercase tracking-widest">
              Desbloqueado
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
