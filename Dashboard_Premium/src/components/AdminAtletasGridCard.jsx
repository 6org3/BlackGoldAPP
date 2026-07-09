import { memo } from 'react';
import { motion } from 'framer-motion';
import { Download, Dumbbell, Pencil, Trash2 } from 'lucide-react';
import { NIVEL_BADGE } from './AdminAtletasConstants';
import ActionButton from './AdminAtletasActionButton';

// ═══════════════════════════════════════════════════════════════
// TARJETA GRID — Vista cuadrícula premium
// ═══════════════════════════════════════════════════════════════

function AtletaGridCard({ atleta, index, onEdit, onDelete, onExport, onAntropometria, isExporting }) {
  const nivelKey = atleta.nivel_desarrollo || 'Por Asignar';
  const badge = NIVEL_BADGE[nivelKey] || NIVEL_BADGE['Por Asignar'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.04 }}
      className="group relative glass-card rounded-panel p-5 hover:border-brand/25 hover:shadow-[0_0_30px_rgba(255,215,0,0.08)] transition duration-300"
    >
      {/* Top: Avatar + Identity */}
      <div className="flex items-center space-x-3 mb-4">
        <div className={`w-11 h-11 rounded-control bg-gradient-to-br ${atleta.rango?.color ? '' : ''} flex items-center justify-center shrink-0 border border-white/10`}
          style={{ background: `linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.05))` }}>
          <span className="text-base font-black text-brand/80 uppercase">{atleta.nombre?.charAt(0)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white truncate text-sm group-hover:text-brand transition-colors">
            {atleta.nombre}
          </p>
          <p className="text-2xs text-fg-muted truncate">
            {atleta.posicion !== 'N/A' ? atleta.posicion : 'Sin Posición'} · {atleta.categoria || 'Sin categoría'}
          </p>
        </div>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {/* Rango badge */}
        <span className={`text-3xs font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${atleta.rango?.color || 'text-fg-secondary'} border-white/10 bg-white/[0.03]`}>
          {atleta.rango?.nombre || 'Rookie'}
        </span>
        {/* Nivel badge */}
        <span className={`text-3xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${badge.border} ${badge.bg} ${badge.color}`}>
          {badge.icon} {nivelKey}
        </span>
      </div>

      {/* Edad info */}
      <div className="flex items-center gap-2 text-2xs text-fg-muted mb-4">
        <span>{atleta.edad ? `${atleta.edad} años` : 'Edad —'}</span>
        {atleta.talla_cm && <span>· {atleta.talla_cm} cm</span>}
        {atleta.peso_kg && <span>· {atleta.peso_kg} kg</span>}
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <div className="flex items-center gap-1.5">
          <ActionButton onClick={() => onExport(atleta)} title="Descargar PDF" isActive={isExporting}>
            <Download size={14} className={isExporting ? 'animate-pulse' : ''} />
          </ActionButton>
          <ActionButton onClick={() => onAntropometria(atleta)} title="Antropometría" className="hover:text-success-soft">
            <Dumbbell size={14} />
          </ActionButton>
        </div>
        <div className="flex items-center gap-1.5">
          <ActionButton onClick={() => onEdit(atleta)} title="Editar" className="hover:text-brand">
            <Pencil size={14} />
          </ActionButton>
          <ActionButton onClick={() => onDelete(atleta)} title="Eliminar" className="hover:text-danger">
            <Trash2 size={14} />
          </ActionButton>
        </div>
      </div>
    </motion.div>
  );
}

export default memo(AtletaGridCard);
