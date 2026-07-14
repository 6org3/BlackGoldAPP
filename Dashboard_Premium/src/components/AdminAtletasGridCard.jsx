import { memo } from 'react';
import { motion } from 'framer-motion';
import { Download, Dumbbell, Pencil, Trash2 } from 'lucide-react';
import { NIVEL_BADGE } from './AdminAtletasConstants';
import ActionButton from './AdminAtletasActionButton';
import CutCard from './arcade/CutCard';
import HexAvatar from './arcade/HexAvatar';
import { C, BORDER, cut } from './arcade/arcadeTokens';

// ═══════════════════════════════════════════════════════════════
// TARJETA GRID — Vista cuadrícula (Arcade HUD)
// ═══════════════════════════════════════════════════════════════

function AtletaGridCard({ atleta, index, onEdit, onDelete, onExport, onAntropometria, isExporting }) {
  const nivelKey = atleta.nivel_desarrollo || 'Por Asignar';
  const badge = NIVEL_BADGE[nivelKey] || NIVEL_BADGE['Por Asignar'];

  return (
    // Entrada solo-opacity: bajo prefers-reduced-motion los transforms se congelan
    // en su valor initial (MotionConfig global) y dejarían la card desplazada.
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(index, 10) * 0.04 }}>
      <CutCard cut={12} padding="20px">
        {/* Top: Avatar + Identidad */}
        <div className="flex items-center gap-3 mb-4">
          <HexAvatar size={44}>{atleta.nombre?.charAt(0)}</HexAvatar>
          <div className="min-w-0 flex-1">
            <p className="font-bold truncate text-sm" style={{ color: C.text }}>{atleta.nombre}</p>
            <p className="text-2xs truncate" style={{ color: C.text3 }}>
              {atleta.posicion !== 'N/A' ? atleta.posicion : 'Sin Posición'} · {atleta.categoria || 'Sin categoría'}
            </p>
          </div>
        </div>

        {/* Badges: rango (color del sistema de rangos) + nivel de desarrollo */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <span
            className={`text-3xs font-black uppercase tracking-widest px-2 py-0.5 ${atleta.rango?.color || 'text-fg-secondary'}`}
            style={{ clipPath: cut(4), border: `1px solid ${BORDER.neutralSoft}`, background: C.cardAlt1 }}
          >
            {atleta.rango?.nombre || 'Rookie'}
          </span>
          <span
            className="text-3xs font-bold uppercase tracking-widest px-2 py-0.5"
            style={{ clipPath: cut(4), border: `1px solid ${badge.c}`, background: badge.tint, color: badge.c }}
          >
            {badge.icon} {nivelKey}
          </span>
        </div>

        {/* Edad / medidas */}
        <div className="flex items-center gap-2 text-2xs mb-4" style={{ color: C.text3 }}>
          <span>{atleta.edad ? `${atleta.edad} años` : 'Edad —'}</span>
          {atleta.talla_cm && <span>· {atleta.talla_cm} cm</span>}
          {atleta.peso_kg && <span>· {atleta.peso_kg} kg</span>}
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-between pt-3" style={{ borderTop: `1px solid ${BORDER.neutralFaint}` }}>
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
      </CutCard>
    </motion.div>
  );
}

export default memo(AtletaGridCard);
