import { CheckCircle2, Clock, XCircle } from 'lucide-react';

// ──────────────────────────────────────────
// En Revisión (pendiente_aprobacion)
// ──────────────────────────────────────────
export function EnRevision({ enRevision }) {
  return (
    <div className="mb-8">
      <p className="text-[10px] text-amber-500 font-bold uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
        <Clock size={12} className="text-amber-500" />
        En Revisión por el Coach
      </p>
      <div className="space-y-2">
        {enRevision.map(mision => (
          <div key={mision.id} className="flex items-center gap-3 p-4 rounded-xl bg-amber-950/20 border border-amber-500/20">
            <Clock size={16} className="text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{mision.titulo}</p>
              <p className="text-[10px] text-amber-400/70 font-bold uppercase tracking-widest mt-0.5">
                Esperando aprobación · +{mision.xpRecompensa} XP
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Completadas (aprobadas)
// ──────────────────────────────────────────
export function Completadas({ aprobadas }) {
  return (
    <div className="mb-8">
      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
        <CheckCircle2 size={12} className="text-emerald-500" />
        Completadas
      </p>
      <div className="space-y-2">
        {aprobadas.map(mision => (
          <div key={mision.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
            <span className="text-xs text-gray-400 font-medium line-through flex-1 truncate">{mision.titulo}</span>
            <span className="text-[10px] text-emerald-500/70 font-black whitespace-nowrap">+{mision.xpRecompensa} XP</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Rechazadas
// ──────────────────────────────────────────
export function Rechazadas({ rechazadas }) {
  return (
    <div className="mb-8">
      <p className="text-[10px] text-red-500 font-bold uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
        <XCircle size={12} className="text-red-500" />
        Requieren Atención
      </p>
      <div className="space-y-2">
        {rechazadas.map(mision => (
          <div key={mision.id} className="flex items-center gap-3 p-4 rounded-xl bg-red-950/20 border border-red-500/20">
            <XCircle size={16} className="text-red-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{mision.titulo}</p>
              <p className="text-[10px] text-red-400/70 font-bold uppercase tracking-widest mt-0.5">
                Habla con tu coach para más información
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
