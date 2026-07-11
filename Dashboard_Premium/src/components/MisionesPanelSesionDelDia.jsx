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
      <p className="text-2xs text-fg-muted font-bold uppercase tracking-eyebrow mb-4">Mi Sesión del Día</p>
      <div className="glass-card rounded-panel p-6 border border-brand/20 shadow-[0_0_15px_rgba(255,215,0,0.05)]">
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <p className="text-3xs text-fg-muted font-bold uppercase tracking-widest mb-1">Meta</p>
            <p className="text-sm font-bold text-white">{sesionHoy.meta_entrenamiento}</p>
          </div>
          <div>
            <p className="text-3xs text-fg-muted font-bold uppercase tracking-widest mb-1">Intensidad</p>
            <p className="text-sm font-bold text-white">{sesionHoy.intensidad_bpm}</p>
          </div>
          <div>
            <p className="text-3xs text-fg-muted font-bold uppercase tracking-widest mb-1">Pausa</p>
            <p className="text-sm font-bold text-white">{sesionHoy.tipo_pausa}</p>
          </div>
          <div>
            <p className="text-3xs text-fg-muted font-bold uppercase tracking-widest mb-1">Duración</p>
            <p className="text-sm font-bold text-white">{sesionHoy.duracion_minutos} min</p>
          </div>
        </div>

        {/* Evaluación del Coach */}
        {observacionHoy && (
          <div className="border-t border-white/10 pt-5 pb-2 mb-2">
            <p className="text-3xs text-success font-bold uppercase tracking-widest mb-3 flex items-center">
              <CheckCircle2 size={12} className="mr-1" />
              Evaluación del Coach
            </p>
            <div className="bg-surface-card/80 border border-white/5 rounded-panel p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                {[
                  { label: 'Esfuerzo', val: observacionHoy.esfuerzo },
                  { label: 'Actitud', val: observacionHoy.actitud },
                  { label: 'Foco', val: observacionHoy.foco },
                  { label: 'Trabajo Equipo', val: observacionHoy.trabajo_equipo },
                ].map(({ label, val }) => (
                  <div key={label}>
                    <p className="text-3xs text-fg-muted font-bold uppercase tracking-widest">{label}</p>
                    <p className="text-xs font-black text-white">{val}/10</p>
                  </div>
                ))}
              </div>
              {observacionHoy.insignia && (
                <div>
                  <p className="text-3xs text-brand font-bold uppercase tracking-widest mb-1">Insignias Obtenidas</p>
                  <p className="text-xs font-bold text-white">{observacionHoy.insignia}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* RPE Scale */}
        <div className="border-t border-white/10 pt-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-3xs text-fg-muted font-bold uppercase tracking-widest">Escala RPE (Percepción de Esfuerzo)</p>
            <span className={`text-lg font-black ${evaValue <= 4 ? 'text-info-soft' : evaValue <= 8 ? 'text-warning-soft' : 'text-danger-soft'}`}>
              {evaValue}/10
            </span>
          </div>
          {/* Track de 8px + input de 44px de alto (área táctil) y thumb dorado
              de 24px: sin las reglas de thumb, appearance-none lo deja invisible
              en Chrome Android / Safari iOS. */}
          <input
            type="range" min="1" max="10" step="0.5" value={evaValue}
            onChange={e => setEvaValue(parseFloat(e.target.value))}
            disabled={isRpeLocked}
            className={`w-full h-11 appearance-none bg-transparent ${isRpeLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
              [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--color-info)_0%,var(--color-warning-soft)_60%,var(--color-danger)_100%)]
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(255,215,0,0.6)]
              [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[linear-gradient(to_right,var(--color-info)_0%,var(--color-warning-soft)_60%,var(--color-danger)_100%)]
              [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-brand`}
          />
          <div className="flex justify-between mt-1">
            <span className="text-2xs text-info-soft font-bold">1 - Mínimo</span>
            <span className="text-2xs text-warning-soft font-bold">5 - Medio</span>
            <span className="text-2xs text-danger-soft font-bold">10 - Máximo</span>
          </div>
          <button
            onClick={handleSaveEva}
            disabled={isRpeLocked}
            className={`mt-4 flex items-center justify-center gap-2 font-black text-2xs uppercase tracking-eyebrow px-6 py-2.5 min-h-11 rounded-control transition w-full ${isRpeLocked ? 'bg-white/5 text-fg-muted cursor-not-allowed border border-white/5' : 'bg-brand border border-brand/50 text-on-brand shadow-glow-gold hover:bg-brand-hover active:scale-[0.97]'}`}
          >
            {isRpeLocked ? '✅ RPE Registrado' : evaSaved ? '✅ Guardado' : 'Guardar RPE'}
          </button>
          {evaAlert && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 bg-orange-950/50 border border-caution/40 rounded-panel p-4"
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-caution animate-pulse" />
                <span className="font-black uppercase tracking-widest text-2xs text-caution">Alerta de Carga Extrema</span>
              </div>
              <p className="text-xs text-caution-soft mt-1 opacity-90">
                RPE &gt;= 9 detectado. Se recomienda ajustar el descanso y realizar trabajo de recuperación activa para la siguiente sesión.
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
