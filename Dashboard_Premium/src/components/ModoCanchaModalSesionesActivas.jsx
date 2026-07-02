import { Check } from 'lucide-react';
import { DURACION_CLASE } from './useModoCanchaModalClock';

export default function ModoCanchaModalSesionesActivas({
  activeSessions,
  setStep,
  calcularTiemposSession,
  formatTiempo,
  handleResumeSession
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <p className="text-[10px] text-[#FFD700] font-bold uppercase tracking-[0.3em]">
          {activeSessions.length} clase{activeSessions.length !== 1 ? 's' : ''} activa{activeSessions.length !== 1 ? 's' : ''}
        </p>
        <button onClick={() => setStep(1)}
          className="text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest transition-colors">
          + Nueva clase
        </button>
      </div>

      {activeSessions.length === 0 && (
        <div className="flex justify-center items-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FFD700]"></div>
        </div>
      )}

      {activeSessions.map(session => {
        const t = calcularTiemposSession(session);
        const pct = Math.max(0, t.restantes / DURACION_CLASE);
        const circumference = 2 * Math.PI * 28;
        return (
          <div key={session.id}
            className={`rounded-2xl border p-4 transition-all ${
              t.terminada
                ? 'bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                : t.restantes < 300
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-white/5 border-white/10'
            }`}>

            {/* Fila superior: info + mini reloj */}
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${
                    session.tipo === 'Individual' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-[#FFD700]/20 text-[#FFD700]'
                  }`}>{session.tipo}</span>
                  <span className="text-[10px] text-gray-500 truncate">{session.grupo_label}</span>
                </div>
                <p className="text-white font-bold text-sm truncate">{session.pilar_objetivo}</p>
              </div>

              {/* Mini reloj SVG */}
              <div className="relative w-16 h-16 flex-shrink-0 ml-3">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5"/>
                  <circle
                    cx="32" cy="32" r="28"
                    fill="none"
                    stroke={t.terminada ? '#10b981' : t.restantes < 300 ? '#ef4444' : '#FFD700'}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - pct)}
                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  {t.terminada ? (
                    <Check size={20} className="text-emerald-400" />
                  ) : (
                    <span className={`text-[11px] font-black tabular-nums ${t.restantes < 300 ? 'text-red-400' : 'text-white'}`}>
                      {formatTiempo(t.restantes)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Fila inferior: Inicio · Transcurrido · Finaliza */}
            <div className="flex space-x-4 mt-3 pt-3 border-t border-white/5 text-center">
              <div className="flex-1">
                <p className="text-[9px] text-gray-500 uppercase tracking-widest">Inicio</p>
                <p className="text-xs font-bold text-white">{(session.hora_inicio || '').substring(0,5)}</p>
              </div>
              <div className="flex-1">
                <p className="text-[9px] text-gray-500 uppercase tracking-widest">Transcurrido</p>
                <p className="text-xs font-bold text-white">{formatTiempo(t.transcurridos)}</p>
              </div>
              <div className="flex-1">
                <p className="text-[9px] text-gray-500 uppercase tracking-widest">Finaliza</p>
                <p className="text-xs font-bold text-white">{t.horaFin}</p>
              </div>
            </div>

            {/* Botón Evaluar */}
            <button onClick={() => handleResumeSession(session)}
              className={`w-full mt-3 py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-all ${
                t.terminada
                  ? 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10'
              }`}>
              {t.terminada ? '✓ Evaluar y Finalizar' : 'Evaluar ahora (adelantar)'}
            </button>
          </div>
        );
      })}

      {/* Nota explicativa de qué pasa al terminar */}
      <p className="text-[10px] text-gray-600 text-center pt-2">
        Al terminar la hora el botón cambia a verde. Tócalo para evaluar a los atletas y cerrar la clase.
      </p>
    </div>
  );
}
