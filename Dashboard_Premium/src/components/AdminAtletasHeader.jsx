import { UserPlus, ArrowLeft, LayoutGrid, List } from 'lucide-react';

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
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center space-x-4">
        <button onClick={() => navigate('/dashboard')} aria-label="Volver al dashboard" className="p-2.5 -ml-2.5 rounded-lg text-fg-muted hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tight">
            Gestionar <span className="text-brand">Atletas</span>
          </h2>
          <p className="text-xs text-fg-muted mt-1">
            {atletasFiltrados.length} de {atletas?.length || 0} atletas
            {filtrosActivos && <span className="text-brand"> · Filtros activos</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-3">
        {/* Toggle Vista */}
        <div className="hidden sm:flex items-center bg-white/5 rounded-control p-1 border border-white/5">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2.5 rounded-lg transition ${viewMode === 'grid' ? 'bg-brand/15 text-brand shadow-[0_0_10px_rgba(255,215,0,0.15)]' : 'text-fg-muted hover:text-white'}`}
            title="Vista Cuadrícula"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2.5 rounded-lg transition ${viewMode === 'list' ? 'bg-brand/15 text-brand shadow-[0_0_10px_rgba(255,215,0,0.15)]' : 'text-fg-muted hover:text-white'}`}
            title="Vista Lista"
          >
            <List size={16} />
          </button>
        </div>
        {/* Botón Nuevo */}
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(emptyForm); setShowParentForm(false); }}
          aria-label="Nuevo atleta"
          className="flex items-center space-x-2 bg-gradient-to-r from-brand to-brand-strong text-black font-black text-xs uppercase tracking-widest px-5 py-3 rounded-control shadow-[0_0_15px_rgba(255,215,0,0.3)] hover:shadow-[0_0_25px_rgba(255,215,0,0.5)] hover:scale-[1.02] transition"
        >
          <UserPlus size={16} />
          <span className="hidden sm:inline">Nuevo Atleta</span>
        </button>
      </div>
    </div>
  );
}
