import React, { useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { COLORS, CONFETTI_GOLD } from '../lib/designTokens';

// ─── Gold particle generator ────────────────────────────────
// Creates randomized sparkle/particle positions and animation params
// Menos partículas en pantallas pequeñas (celulares de gama media/baja)
const PARTICLE_COUNT = typeof window !== 'undefined' && window.innerWidth < 480 ? 14 : 28;
const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  id: i,
  x: Math.random() * 100,             // vw-based spread
  y: Math.random() * 100,             // vh-based spread
  size: 3 + Math.random() * 6,        // px
  delay: Math.random() * 1.2,         // stagger
  duration: 1.5 + Math.random() * 2,  // animation duration
  angle: Math.random() * 360,         // drift direction
  distance: 60 + Math.random() * 120, // how far they travel
  rotation: Math.random() * 720 - 360,
}));

// ─── Glow ring config ───────────────────────────────────────
const RINGS = [
  { size: 180, delay: 0.2, opacity: 0.25 },
  { size: 280, delay: 0.5, opacity: 0.15 },
  { size: 400, delay: 0.8, opacity: 0.08 },
];

export default function LevelUpAnimation({ rango, onComplete }) {
  const shouldReduceMotion = useReducedMotion();

  // Auto-dismiss after 4 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete?.();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  // Hex del rango desde la fuente única (NIVELES_XP ← RANGOS_UI)
  const rangoColorHex = rango?.hex || COLORS.gold[500];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
        onClick={() => onComplete?.()}
      >
        {/* ─── Dark backdrop with radial gold glow ─────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-black/90"
          style={{
            background: `radial-gradient(circle at 50% 45%, ${rangoColorHex}15, transparent 50%), rgba(0,0,0,0.92)`,
          }}
        />

        {/* ─── Expanding glow rings ────────────────────────── */}
        {!shouldReduceMotion && RINGS.map((ring, i) => (
          <motion.div
            key={`ring-${i}`}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 1.2, 1],
              opacity: [0, ring.opacity, 0],
            }}
            transition={{
              duration: 2,
              delay: ring.delay,
              ease: 'easeOut',
            }}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: ring.size,
              height: ring.size,
              border: `2px solid ${rangoColorHex}`,
              boxShadow: `0 0 40px ${rangoColorHex}33, inset 0 0 40px ${rangoColorHex}11`,
            }}
          />
        ))}

        {/* ─── Gold particles / sparkles ───────────────────── */}
        {/* Glow con radial-gradient (solo compositing) en vez de box-shadow (repaint por frame) */}
        {!shouldReduceMotion && particles.map((p) => {
          const particleColor =
            p.id % 4 === 3 ? rangoColorHex : CONFETTI_GOLD[p.id % 4];
          return (
            <motion.div
              key={`particle-${p.id}`}
              initial={{
                opacity: 0,
                scale: 0,
                x: 0,
                y: 0,
              }}
              animate={{
                opacity: [0, 1, 1, 0],
                scale: [0, 1.5, 1, 0.3],
                x: Math.cos((p.angle * Math.PI) / 180) * p.distance,
                y: Math.sin((p.angle * Math.PI) / 180) * p.distance,
                rotate: p.rotation,
              }}
              transition={{
                duration: p.duration,
                delay: 0.3 + p.delay,
                ease: 'easeOut',
              }}
              className="absolute pointer-events-none"
              style={{
                width: p.size * 2,
                height: p.size * 2,
                borderRadius: '50%',
                background: `radial-gradient(circle, ${particleColor} 0%, ${particleColor} 45%, transparent 70%)`,
                willChange: 'transform, opacity',
              }}
            />
          );
        })}

        {/* ─── Central content ──────────────────────────────── */}
        <div className="relative z-10 flex flex-col items-center text-center px-6">
          {/* Rank emoji — big scale-in with bounce */}
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { scale: 0, rotate: -20 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { scale: 1, rotate: 0 }}
            transition={shouldReduceMotion ? { duration: 0.3 } : {
              type: 'spring',
              damping: 10,
              stiffness: 200,
              delay: 0.2,
            }}
            className="text-8xl mb-2 drop-shadow-[0_0_30px_rgba(255,215,0,0.5)]"
            style={{
              filter: `drop-shadow(0 0 40px ${rangoColorHex}88)`,
            }}
          >
            {rango?.emoji || '⭐'}
          </motion.div>

          {/* Title: ¡RANGO ASCENDIDO! */}
          <motion.h1
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.8 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            transition={shouldReduceMotion ? { duration: 0.3 } : { delay: 0.6, duration: 0.6, ease: 'easeOut' }}
            className="text-3xl md:text-4xl font-black uppercase tracking-wider mb-3"
            style={{
              background: `linear-gradient(135deg, ${COLORS.gold[500]}, ${COLORS.gold[600]}, ${COLORS.gold[500]})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: 'none',
              filter: 'drop-shadow(0 0 20px rgba(255,215,0,0.4))',
            }}
          >
            ¡RANGO ASCENDIDO!
          </motion.h1>

          {/* Rank name line */}
          <motion.p
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={shouldReduceMotion ? { duration: 0.3 } : { delay: 1.0, duration: 0.5 }}
            className="text-lg text-gray-300 font-medium"
          >
            Has alcanzado{' '}
            <span
              className={`font-black text-xl ${rango?.color || 'text-brand'}`}
              style={{
                filter: `drop-shadow(0 0 10px ${rangoColorHex}66)`,
              }}
            >
              {rango?.nombre || 'Nuevo Rango'}
            </span>
          </motion.p>

          {/* Subtle sub-hint */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.8, duration: 0.6 }}
            className="text-2xs text-fg-faint uppercase tracking-widest mt-6"
          >
            Toca para continuar
          </motion.p>

          {/* Bottom glow pulse */}
          {!shouldReduceMotion && (
            <motion.div
              animate={{
                opacity: [0.3, 0.6, 0.3],
                scale: [1, 1.05, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="absolute -bottom-20 w-64 h-16 rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(ellipse, ${rangoColorHex}33, transparent)`,
              }}
            />
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
