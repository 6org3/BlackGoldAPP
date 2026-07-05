import { memo } from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';

// ──────────────────────────────────────────
// En Revisión (pendiente_aprobacion)
// ──────────────────────────────────────────
export const EnRevision = memo(function EnRevision({ enRevision }) {
  return (
    <div className="mb-8">
      <p className="text-xs text-warning font-bold uppercase tracking-eyebrow mb-4 flex items-center gap-2">
        <Clock size={12} className="text-warning" />
        En Revisión por el Coach
      </p>
      <div className="space-y-2">
        {enRevision.map(mision => (
          <div key={mision.id} className="flex items-center gap-3 p-4 rounded-panel bg-amber-950/20 border border-warning/20">
            <Clock size={16} className="text-warning-soft shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{mision.titulo}</p>
              <p className="text-[11px] text-warning-soft/70 font-bold uppercase tracking-widest mt-0.5">
                Esperando aprobación · +{mision.xpRecompensa} XP
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ──────────────────────────────────────────
// Completadas (aprobadas)
// ──────────────────────────────────────────
export const Completadas = memo(function Completadas({ aprobadas }) {
  return (
    <div className="mb-8">
      <p className="text-xs text-fg-muted font-bold uppercase tracking-eyebrow mb-4 flex items-center gap-2">
        <CheckCircle2 size={12} className="text-success" />
        Completadas
      </p>
      <div className="space-y-2">
        {aprobadas.map(mision => (
          <div key={mision.id} className="flex items-center gap-3 p-3 rounded-panel bg-white/[0.02] border border-white/5">
            <CheckCircle2 size={16} className="text-success shrink-0" />
            <span className="text-xs text-fg-secondary font-medium line-through flex-1 truncate">{mision.titulo}</span>
            <span className="text-[11px] text-success/70 font-black whitespace-nowrap">+{mision.xpRecompensa} XP</span>
          </div>
        ))}
      </div>
    </div>
  );
});

// ──────────────────────────────────────────
// Rechazadas
// ──────────────────────────────────────────
export const Rechazadas = memo(function Rechazadas({ rechazadas }) {
  return (
    <div className="mb-8">
      <p className="text-xs text-danger font-bold uppercase tracking-eyebrow mb-4 flex items-center gap-2">
        <XCircle size={12} className="text-danger" />
        Requieren Atención
      </p>
      <div className="space-y-2">
        {rechazadas.map(mision => (
          <div key={mision.id} className="flex items-center gap-3 p-4 rounded-panel bg-red-950/20 border border-danger/20">
            <XCircle size={16} className="text-danger-soft shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{mision.titulo}</p>
              <p className="text-[11px] text-danger-soft/70 font-bold uppercase tracking-widest mt-0.5">
                Habla con tu coach para más información
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
