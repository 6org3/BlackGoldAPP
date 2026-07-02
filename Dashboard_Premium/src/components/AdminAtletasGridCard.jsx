import { motion } from 'framer-motion';
import { Download, Dumbbell, Pencil, Trash2 } from 'lucide-react';
import { NIVEL_BADGE } from './AdminAtletasConstants';
import ActionButton from './AdminAtletasActionButton';

// ═══════════════════════════════════════════════════════════════
// TARJETA GRID — Vista cuadrícula premium
// ═══════════════════════════════════════════════════════════════

export default function AtletaGridCard({ atleta, index, onEdit, onDelete, onExport, onAntropometria, isExporting }) {
  const nivelKey = atleta.nivel_desarrollo || 'Por Asignar';
  const badge = NIVEL_BADGE[nivelKey] || NIVEL_BADGE['Por Asignar'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="group relative glass-card rounded-2xl p-5 hover:border-[#FFD700]/25 hover:shadow-[0_0_30px_rgba(255,215,0,0.08)] transition-all duration-300"
    >
      {/* Top: Avatar + Identity */}
      <div className="flex items-center space-x-3 mb-4">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${atleta.rango?.color ? '' : ''} flex items-center justify-center shrink-0 border border-white/10`}
          style={{ background: `linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.05))` }}>
          <span className="text-base font-black text-[#FFD700]/80 uppercase">{atleta.nombre?.charAt(0)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white truncate text-sm group-hover:text-[#FFD700] transition-colors">
            {atleta.nombre}
          </p>
          <p className="text-[10px] text-gray-500 truncate">
            {atleta.posicion !== 'N/A' ? atleta.posicion : 'Sin Posición'} · {atleta.categoria || 'Sin categoría'}
          </p>
        </div>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {/* Rango badge */}
        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${atleta.rango?.color || 'text-gray-400'} border-white/10 bg-white/[0.03]`}>
          {atleta.rango?.nombre || 'Rookie'} {atleta.rango?.tier || ''}
        </span>
        {/* Nivel badge */}
        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${badge.border} ${badge.bg} ${badge.color}`}>
          {badge.icon} {nivelKey}
        </span>
      </div>

      {/* Edad info */}
      <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-4">
        <span>{atleta.edad ? `${atleta.edad} años` : 'Edad —'}</span>
        {atleta.talla_cm && <span>· {atleta.talla_cm} cm</span>}
        {atleta.peso_kg && <span>· {atleta.peso_kg} kg</span>}
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <div className="flex items-center space-x-1">
          <ActionButton onClick={onExport} title="Descargar PDF" isActive={isExporting}>
            <Download size={14} className={isExporting ? 'animate-pulse' : ''} />
          </ActionButton>
          <ActionButton onClick={onAntropometria} title="Antropometría" className="hover:text-emerald-400">
            <Dumbbell size={14} />
          </ActionButton>
        </div>
        <div className="flex items-center space-x-1">
          <ActionButton onClick={onEdit} title="Editar" className="hover:text-[#FFD700]">
            <Pencil size={14} />
          </ActionButton>
          <ActionButton onClick={onDelete} title="Eliminar" className="hover:text-red-500">
            <Trash2 size={14} />
          </ActionButton>
        </div>
      </div>
    </motion.div>
  );
}
