import { UserPlus, ArrowLeft, LayoutGrid, List } from 'lucide-react';
import HexAvatar from './arcade/HexAvatar';
import MicroLabel from './arcade/MicroLabel';
import { C, BORDER, GRAD, TINT, cut } from './arcade/arcadeTokens';

export default function AdminAtletasHeader({
  navigate,
  atletasFiltrados,
  atletas,
  filtrosActivos,
  viewMode,
  setViewMode,
  showForm,
  setShowForm,
  setEditingId,
  setForm,
  emptyForm,
  setShowParentForm,
}) {
  return (
    <div className="flex items-center justify-between mb-8 gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={() => navigate('/dashboard')} aria-label="Volver al dashboard"
          className="cut-focus p-2.5 -ml-2.5 min-h-11 min-w-11 flex items-center justify-center transition-colors"
          style={{ color: C.text3, clipPath: cut(5) }}>
          <ArrowLeft size={20} />
        </button>
        <HexAvatar size={44} background={GRAD.goldHex} color={C.ink}>
          <UserPlus size={20} strokeWidth={2.5} />
        </HexAvatar>
        <div className="min-w-0">
          <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight" style={{ color: C.text }}>
            Gestionar <span style={{ color: C.gold }}>Atletas</span>
          </h2>
          <MicroLabel style={{ marginTop: 3 }}>
            {atletasFiltrados.length} de {atletas?.length || 0} atletas
            {filtrosActivos && <span style={{ color: C.gold }}> · Filtros activos</span>}
          </MicroLabel>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {/* Toggle Vista */}
        <div className="hidden sm:flex items-center gap-1 p-1" style={{ clipPath: cut(7), background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}` }}>
          {[['grid', LayoutGrid, 'Vista Cuadrícula'], ['list', List, 'Vista Lista']].map(([mode, Icon, title]) => {
            const activo = viewMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={title}
                aria-label={title}
                aria-pressed={activo}
                className="cut-focus p-2.5 min-h-11 min-w-11 flex items-center justify-center transition-colors"
                style={{ clipPath: cut(5), background: activo ? TINT.gold : 'transparent', color: activo ? C.gold : C.text3 }}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>
        {/* Botón Nuevo */}
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(emptyForm); setShowParentForm(false); }}
          aria-label="Nuevo atleta"
          className="cut-focus flex items-center gap-2 min-h-11 px-5 font-black text-xs uppercase tracking-widest transition"
          style={{ clipPath: cut(8), background: GRAD.goldCTA, border: 'none', color: C.ink }}
        >
          <UserPlus size={16} />
          <span className="hidden sm:inline">Nuevo Atleta</span>
        </button>
      </div>
    </div>
  );
}
