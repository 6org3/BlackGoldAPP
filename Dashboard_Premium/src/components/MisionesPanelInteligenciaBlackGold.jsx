import { motion } from 'framer-motion';
import { Brain } from 'lucide-react';
import { staggerDelay } from '../lib/designTokens';

// ──────────────────────────────────────────
// Inteligencia Black Gold
// ──────────────────────────────────────────
export default function InteligenciaBlackGold({ deficits }) {
  return (
    <motion.div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Brain className="text-brand w-5 h-5" />
        <h3 className="text-sm font-black uppercase tracking-widest text-brand">Inteligencia Black Gold</h3>
      </div>
      <div className="space-y-3">
        {deficits.slice(0, 3).map((deficit, idx) => (
          <motion.div
            key={deficit.condicion}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: staggerDelay(idx) }}
            className={`p-4 rounded-panel border backdrop-blur-md ${
              deficit.prioridad === 'critica' ? 'bg-red-950/40 border-danger/40' :
              deficit.prioridad === 'alta'    ? 'bg-amber-950/40 border-warning/40' :
                                                'bg-white/5 border-white/10'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full animate-pulse ${
                deficit.prioridad === 'critica' ? 'bg-danger' :
                deficit.prioridad === 'alta'    ? 'bg-warning' :
                                                  'bg-white/50'
              }`} />
              <span className={`text-xs font-black uppercase tracking-widest ${
                deficit.prioridad === 'critica' ? 'text-danger-soft' :
                deficit.prioridad === 'alta'    ? 'text-warning-soft' :
                                                  'text-fg-secondary'
              }`}>
                {deficit.prioridad === 'critica' ? 'Prioridad Crítica'
                  : deficit.prioridad === 'alta' ? 'Prioridad Alta'
                  : `Prioridad ${deficit.prioridad}`}
              </span>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{deficit.mensaje}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
