import { memo } from 'react';
import { motion } from 'framer-motion';
import { Download, Dumbbell, Pencil, Trash2, UserMinus, UserCheck } from 'lucide-react';
import { NIVEL_BADGE } from './AdminAtletasConstants';
import { esBaja, etiquetaBaja } from './adminAtletasMembresia';
import ActionButton from './AdminAtletasActionButton';
import CutCard from './arcade/CutCard';
import HexAvatar from './arcade/HexAvatar';
import { C, TINT, cut } from './arcade/arcadeTokens';

// ═══════════════════════════════════════════════════════════════
// FILA LISTA — Vista lista compacta (Arcade HUD)
// ═══════════════════════════════════════════════════════════════

// Ver nota de `onDelete`/`onToggleMembresia` en AdminAtletasGridCard.
function AtletaListRow({ atleta, index, onEdit, onDelete, onExport, onAntropometria, onToggleMembresia, isExporting }) {
  const nivelKey = atleta.nivel_desarrollo || 'Por Asignar';
  const badge = NIVEL_BADGE[nivelKey] || NIVEL_BADGE['Por Asignar'];
  const deBaja = esBaja(atleta);

  return (
    // Entrada solo-opacity (reduced-motion): ver nota en AdminAtletasGridCard.
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(index, 10) * 0.03 }}>
      <CutCard cut={10} padding="14px 20px" style={deBaja ? { opacity: 0.72 } : undefined}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <HexAvatar size={40}>{atleta.nombre?.charAt(0)}</HexAvatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate" style={{ color: C.text }}>{atleta.nombre}</p>
              <p className="text-2xs font-bold uppercase tracking-widest truncate" style={{ color: C.text3 }}>
                {atleta.posicion !== 'N/A' ? atleta.posicion : 'Sin Posición'} · {atleta.categoria || 'Sin cat.'} · {atleta.edad ? `${atleta.edad} años` : '—'}
              </p>
            </div>
            {/* El estado de baja va fuera del bloque `hidden md:flex`: en móvil
                es la única señal textual (rango y nivel sí pueden esperar). */}
            {deBaja && (
              <span
                className="flex-none text-3xs font-black uppercase tracking-widest px-2 py-0.5"
                style={{ clipPath: cut(4), border: `1px solid ${C.danger}`, background: TINT.danger, color: C.danger }}
              >
                {etiquetaBaja(atleta)}
              </span>
            )}
            <div className="hidden md:flex items-center gap-2">
              <span className={`text-3xs font-black uppercase tracking-widest ${atleta.rango?.color || 'text-fg-secondary'}`}>
                {atleta.rango?.nombre || 'Rookie'}
              </span>
              <span
                className="text-3xs font-bold uppercase tracking-widest px-2 py-0.5"
                style={{ clipPath: cut(4), border: `1px solid ${badge.c}`, background: badge.tint, color: badge.c }}
              >
                {badge.icon} {nivelKey}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <ActionButton onClick={() => onExport(atleta)} title="PDF" isActive={isExporting}>
              <Download size={14} className={isExporting ? 'animate-pulse' : ''} />
            </ActionButton>
            <ActionButton onClick={() => onAntropometria(atleta)} title="Antropometría" className="hover:text-success-soft">
              <Dumbbell size={14} />
            </ActionButton>
            <ActionButton onClick={() => onEdit(atleta)} title="Editar" className="hover:text-brand">
              <Pencil size={14} />
            </ActionButton>
            {onToggleMembresia && (
              <ActionButton
                onClick={() => onToggleMembresia(atleta)}
                title={deBaja ? `Reactivar a ${atleta.nombre}` : `Dar de baja a ${atleta.nombre}`}
                className={deBaja ? 'hover:text-success-soft' : 'hover:text-warning-soft'}
              >
                {deBaja ? <UserCheck size={14} /> : <UserMinus size={14} />}
              </ActionButton>
            )}
            {onDelete && (
              <ActionButton onClick={() => onDelete(atleta)} title="Eliminar" className="hover:text-danger">
                <Trash2 size={14} />
              </ActionButton>
            )}
          </div>
        </div>
      </CutCard>
    </motion.div>
  );
}

export default memo(AtletaListRow);
