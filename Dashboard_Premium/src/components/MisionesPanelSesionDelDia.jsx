import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';

// ──────────────────────────────────────────
// Sesión del Día
// ──────────────────────────────────────────
export default function SesionDelDia({
  sesionHoy,
  observacionHoy,
  evaValue,
  setEvaValue,
  isRpeLocked,
  evaSaved,
  evaAlert,
  handleSaveEva,
}) {
  return (
    <div className="mb-8">
      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mb-4">Mi Sesión del Día</p>
      <div className="glass-card rounded-2xl p-6 border border-[#FFD700]/20 shadow-[0_0_15px_rgba(255,215,0,0.05)]">
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Meta</p>
            <p className="text-sm font-bold text-white">{sesionHoy.meta_entrenamiento}</p>
          </div>
          <div>
            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Intensidad</p>
            <p className="text-sm font-bold text-white">{sesionHoy.intensidad_bpm}</p>
          </div>
          <div>
            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Pausa</p>
            <p className="text-sm font-bold text-white">{sesionHoy.tipo_pausa}</p>
          </div>
          <div>
            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Duración</p>
            <p className="text-sm font-bold text-white">{sesionHoy.duracion_minutos} min</p>
          </div>
        </div>

        {/* Evaluación del Coach */}
        {observacionHoy && (
          <div className="border-t border-white/10 pt-5 pb-2 mb-2">
            <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest mb-3 flex items-center">
              <CheckCircle2 size={12} className="mr-1" />
              Evaluación del Coach
            </p>
            <div className="bg-[#121214]/80 border border-white/5 rounded-xl p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                {[
                  { label: 'Esfuerzo', val: observacionHoy.esfuerzo },
                  { label: 'Actitud', val: observacionHoy.actitud },
                  { label: 'Foco', val: observacionHoy.foco },
                  { label: 'Trabajo Equipo', val: observacionHoy.trabajo_equipo },
                ].map(({ label, val }) => (
                  <div key={label}>
                    <p className="text-[8px] text-gray-500 font-bold uppercase tracking-widest">{label}</p>
                    <p className="text-xs font-black text-white">{val}/10</p>
                  </div>
                ))}
              </div>
              {observacionHoy.insignia && (
                <div>
                  <p className="text-[8px] text-[#FFD700] font-bold uppercase tracking-widest mb-1">Insignias Obtenidas</p>
                  <p className="text-xs font-bold text-white">{observacionHoy.insignia}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* RPE Scale */}
        <div className="border-t border-white/10 pt-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Escala RPE (Percepción de Esfuerzo)</p>
            <span className={`text-lg font-black ${evaValue <= 4 ? 'text-blue-400' : evaValue <= 8 ? 'text-yellow-400' : 'text-red-400'}`}>
              {evaValue}/10
            </span>
          </div>
          <input
            type="range" min="1" max="10" step="0.5" value={evaValue}
            onChange={e => setEvaValue(parseFloat(e.target.value))}
            disabled={isRpeLocked}
            className={`w-full h-2 rounded-full appearance-none ${isRpeLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            style={{ background: 'linear-gradient(to right, #3b82f6 0%, #fbbf24 60%, #ef4444 100%)' }}
          />
          <div className="flex justify-between mt-1">
            <span className="text-[8px] text-blue-400 font-bold">1 - Mínimo</span>
            <span className="text-[8px] text-yellow-400 font-bold">5 - Medio</span>
            <span className="text-[8px] text-red-400 font-bold">10 - Máximo</span>
          </div>
          <button
            onClick={handleSaveEva}
            disabled={isRpeLocked}
            className={`mt-4 flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest px-6 py-2.5 rounded-xl transition-all w-full ${isRpeLocked ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-white/5' : 'bg-gradient-to-r from-[#FFD700] to-[#D4AF37] text-black shadow-[0_0_15px_rgba(255,215,0,0.3)] hover:shadow-[0_0_25px_rgba(255,215,0,0.5)]'}`}
          >
            {isRpeLocked ? '✅ RPE Registrado' : evaSaved ? '✅ Guardado' : 'Guardar RPE'}
          </button>
          {evaAlert && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 bg-orange-950/50 border border-orange-500/40 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                <span className="font-black uppercase tracking-widest text-[10px] text-orange-500">Alerta de Carga Extrema</span>
              </div>
              <p className="text-xs text-orange-400 mt-1 opacity-90">
                RPE &gt;= 9 detectado. Se recomienda ajustar el descanso y realizar trabajo de recuperación activa para la siguiente sesión.
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
