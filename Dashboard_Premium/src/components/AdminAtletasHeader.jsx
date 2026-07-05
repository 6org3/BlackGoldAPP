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
        <button onClick={() => navigate('/dashboard')} aria-label="Volver al dashboard" className="p-2.5 -ml-2.5 rounded-lg text-gray-500 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tight">
            Gestionar <span className="text-[#FFD700]">Atletas</span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {atletasFiltrados.length} de {atletas?.length || 0} atletas
            {filtrosActivos && <span className="text-[#FFD700]"> · Filtros activos</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-3">
        {/* Toggle Vista */}
        <div className="hidden sm:flex items-center bg-white/5 rounded-xl p-1 border border-white/5">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-[#FFD700]/15 text-[#FFD700] shadow-[0_0_10px_rgba(255,215,0,0.15)]' : 'text-gray-500 hover:text-white'}`}
            title="Vista Cuadrícula"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-[#FFD700]/15 text-[#FFD700] shadow-[0_0_10px_rgba(255,215,0,0.15)]' : 'text-gray-500 hover:text-white'}`}
            title="Vista Lista"
          >
            <List size={16} />
          </button>
        </div>
        {/* Botón Nuevo */}
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(emptyForm); setShowParentForm(false); }}
          aria-label="Nuevo atleta"
          className="flex items-center space-x-2 bg-gradient-to-r from-[#FFD700] to-[#D4AF37] text-black font-black text-xs uppercase tracking-widest px-5 py-3 rounded-xl shadow-[0_0_15px_rgba(255,215,0,0.3)] hover:shadow-[0_0_25px_rgba(255,215,0,0.5)] hover:scale-[1.02] transition-all"
        >
          <UserPlus size={16} />
          <span className="hidden sm:inline">Nuevo Atleta</span>
        </button>
      </div>
    </div>
  );
}
