import { Star, Check, Target, ChevronLeft } from 'lucide-react';
import { INSIGNIAS } from './ModoCanchaModalConstants';

const METRIC_LABELS = {
  esfuerzo: 'Esfuerzo Físico',
  actitud: 'Actitud',
  foco: 'Foco / Atención',
  trabajo_equipo: 'Trabajo en Eq.'
};

export default function ModoCanchaModalEvaluarAtleta({
  atletaEvaluando,
  setStep,
  successMsg,
  ratings,
  handleRatingChange,
  insigniasSeleccionadas,
  handleSubmitEvaluation,
  saving
}) {
  return (
    <div className="space-y-6 animate-in slide-in-from-right-4">
      {successMsg ? (
        <div className="flex flex-col items-center justify-center py-10 space-y-4">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center"><Check size={32} /></div>
          <p className="text-emerald-400 font-bold uppercase tracking-widest">{successMsg}</p>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-6">
            <button onClick={() => setStep(4)} className="text-xs text-gray-400 hover:text-white flex items-center">
                <ChevronLeft size={14} className="mr-1"/> Volver
            </button>
            <div className="text-right">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Evaluando a</p>
                <p className="text-xl font-black text-[#FFD700]">{atletaEvaluando.nombre}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {['esfuerzo', 'actitud', 'foco', 'trabajo_equipo'].map(metric => (
              <div key={metric} role="group" aria-label={METRIC_LABELS[metric]}
                className="flex flex-col space-y-2 bg-white/5 p-3 rounded-xl border border-white/10 items-center hover:bg-white/10 transition-colors">
                <span className="text-xs text-gray-300 font-bold uppercase tracking-widest text-center w-full">
                  {METRIC_LABELS[metric]}
                </span>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} type="button" onClick={() => handleRatingChange(metric, star)}
                      aria-label={`${star} de 5 estrellas en ${METRIC_LABELS[metric]}`}
                      aria-pressed={star <= ratings[metric]}
                      className="w-11 h-11 flex items-center justify-center transition-transform active:scale-90 hover:scale-110">
                      <Star size={28} fill={star <= ratings[metric] ? '#FFD700' : 'transparent'} color={star <= ratings[metric] ? '#FFD700' : '#4b5563'} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Insignias */}
          <div className="pt-4 border-t border-white/10">
            <p className="text-[10px] text-[#FFD700] font-bold uppercase tracking-widest mb-3 flex items-center"><Target size={12} className="mr-1" /> Insignias Automáticas (5 Estrellas)</p>
            <div className="grid grid-cols-2 gap-2">
              {INSIGNIAS.map(ins => {
                const isSelected = insigniasSeleccionadas.some(i => i.id === ins.id);
                return (
                  <div key={ins.id}
                    className={`p-2 rounded-lg border flex flex-col transition-all ${isSelected ? 'bg-[#FFD700]/10 border-[#FFD700]/50 shadow-[0_0_10px_rgba(255,215,0,0.15)] opacity-100 scale-[1.02]' : 'bg-white/5 border-white/10 opacity-40 grayscale'}`}>
                    <div className="flex items-center space-x-2 mb-1">
                      {ins.icon}
                      <span className={`text-[10px] font-bold ${isSelected ? 'text-[#FFD700]' : 'text-gray-400'}`}>{ins.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button onClick={handleSubmitEvaluation} disabled={saving} className="w-full bg-[#FFD700] hover:bg-[#D4AF37] text-black font-black uppercase tracking-widest py-4 rounded-xl shadow-[0_0_20px_rgba(255,215,0,0.2)] disabled:opacity-50 mt-4 transition-all hover:scale-[1.02]">
            {saving ? 'Guardando...' : 'Guardar Evaluación'}
          </button>
        </>
      )}
    </div>
  );
}
