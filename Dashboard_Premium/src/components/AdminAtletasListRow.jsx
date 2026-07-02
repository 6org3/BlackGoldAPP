import { motion } from 'framer-motion';
import { Download, Dumbbell, Pencil, Trash2 } from 'lucide-react';
import { NIVEL_BADGE } from './AdminAtletasConstants';
import ActionButton from './AdminAtletasActionButton';

// ═══════════════════════════════════════════════════════════════
// FILA LISTA — Vista lista compacta
// ═══════════════════════════════════════════════════════════════

export default function AtletaListRow({ atleta, index, onEdit, onDelete, onExport, onAntropometria, isExporting }) {
  const nivelKey = atleta.nivel_desarrollo || 'Por Asignar';
  const badge = NIVEL_BADGE[nivelKey] || NIVEL_BADGE['Por Asignar'];

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="glass-card rounded-xl px-5 py-4 flex items-center justify-between glow-border group"
    >
      <div className="flex items-center space-x-4 flex-1 min-w-0">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border border-white/10"
          style={{ background: `linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.05))` }}>
          <span className="text-sm font-black text-[#FFD700]/80">{atleta.nombre?.charAt(0)}</span>
        </div>
        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate group-hover:text-[#FFD700] transition-colors">{atleta.nombre}</p>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest truncate">
            {atleta.posicion !== 'N/A' ? atleta.posicion : 'Sin Posición'} · {atleta.categoria || 'Sin cat.'} · {atleta.edad ? `${atleta.edad} años` : '—'}
          </p>
        </div>
        {/* Badges */}
        <div className="hidden md:flex items-center gap-2">
          <span className={`text-[9px] font-black uppercase tracking-widest ${atleta.rango?.color || 'text-gray-400'}`}>
            {atleta.rango?.nombre || 'Rookie'}
          </span>
          <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${badge.border} ${badge.bg} ${badge.color}`}>
            {badge.icon} {nivelKey}
          </span>
        </div>
      </div>
      {/* Actions */}
      <div className="flex items-center space-x-2 ml-4">
        <ActionButton onClick={onExport} title="PDF" isActive={isExporting}>
          <Download size={14} className={isExporting ? 'animate-pulse' : ''} />
        </ActionButton>
        <ActionButton onClick={onAntropometria} title="Antropometría" className="hover:text-emerald-400">
          <Dumbbell size={14} />
        </ActionButton>
        <ActionButton onClick={onEdit} title="Editar" className="hover:text-[#FFD700]">
          <Pencil size={14} />
        </ActionButton>
        <ActionButton onClick={onDelete} title="Eliminar" className="hover:text-red-500">
          <Trash2 size={14} />
        </ActionButton>
      </div>
    </motion.div>
  );
}
