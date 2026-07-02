import { motion, AnimatePresence } from 'framer-motion';
import VideoPlayer from './VideoPlayer';
import { CheckCircle2, Play, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { PILAR_LABELS } from '../constants/pilares';

// ──────────────────────────────────────────
// Tarjeta de misión pendiente
// ──────────────────────────────────────────
export default function MisionCard({ mision, index, expanded, onToggle, onComplete, onQuiz }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="glass-card rounded-2xl overflow-hidden border border-white/5 glow-border"
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#FFD700]/10 border border-[#FFD700]/30 flex items-center justify-center shrink-0">
            <Play size={16} className="text-[#FFD700]" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">{mision.titulo}</h4>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
              +{mision.xpRecompensa} XP
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="text-gray-400 shrink-0" /> : <ChevronDown size={18} className="text-gray-400 shrink-0" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-6 space-y-5">
              <p className="text-sm text-gray-300 leading-relaxed border-l-2 border-[#FFD700]/30 pl-4">
                {mision.descripcion}
              </p>

              <VideoPlayer url={mision.videoUrl} />

              <div className="flex items-center justify-between pt-2">
                {mision.quiz && mision.quiz.length > 0 ? (
                  <button
                    onClick={onQuiz}
                    className="flex items-center gap-2 bg-gradient-to-r from-[#FFD700] to-[#D4AF37] text-black font-black text-xs uppercase tracking-widest px-6 py-3 rounded-xl shadow-[0_0_15px_rgba(255,215,0,0.3)] hover:shadow-[0_0_25px_rgba(255,215,0,0.5)] transition-all"
                  >
                    <Sparkles size={14} />
                    <span>Iniciar Cuestionario ({mision.quiz.length} preguntas)</span>
                  </button>
                ) : (
                  <button
                    onClick={onComplete}
                    className="flex items-center gap-2 bg-gradient-to-r from-[#FFD700] to-[#D4AF37] text-black font-black text-xs uppercase tracking-widest px-6 py-3 rounded-xl shadow-[0_0_15px_rgba(255,215,0,0.3)] hover:shadow-[0_0_25px_rgba(255,215,0,0.5)] transition-all"
                  >
                    <CheckCircle2 size={14} />
                    <span>Marcar como Completada</span>
                  </button>
                )}
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest ml-3">
                  {(mision.pilar || mision.tipo) === 'youtube' ? '📺' : '📖'}{' '}
                  {PILAR_LABELS[mision.pilar || mision.tipo] || mision.pilar || mision.tipo}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
