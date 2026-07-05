import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter } from 'lucide-react';
import { CATEGORIAS_FEB, NIVELES_DESARROLLO, POSICIONES } from './AdminAtletasConstants';
import FilterSelect from './AdminAtletasFilterSelect';

export default function AdminAtletasFiltersPanel({
  busqueda,
  setBusqueda,
  showFilters,
  setShowFilters,
  filtroCat,
  setFiltroCat,
  filtroNivel,
  setFiltroNivel,
  filtroPosicion,
  setFiltroPosicion,
  filtroGenero,
  setFiltroGenero,
  filtrosActivos,
  clearFilters,
}) {
  return (
    <div className="mb-6 space-y-3">
      {/* Barra de búsqueda + toggle filtros */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Buscar por nombre o cédula..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full bg-white/[0.03] border border-white/10 rounded-control pl-11 pr-4 py-3 text-base md:text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand/40 focus:shadow-[0_0_15px_rgba(255,215,0,0.08)] transition-all"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center space-x-2 px-4 py-3 rounded-control border text-xs font-bold uppercase tracking-widest transition-all ${
            showFilters || filtrosActivos
              ? 'bg-brand/10 border-brand/30 text-brand'
              : 'bg-white/[0.03] border-white/10 text-fg-muted hover:text-white hover:border-white/20'
          }`}
        >
          <Filter size={14} />
          <span className="hidden sm:inline">Filtros</span>
          {filtrosActivos && (
            <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
          )}
        </button>
      </div>

      {/* Panel de filtros */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="glass-card rounded-control p-5 flex flex-col gap-5">
              <FilterSelect label="Categoría FEB" value={filtroCat} options={CATEGORIAS_FEB} onChange={setFiltroCat} />
              <FilterSelect label="Nivel Desarrollo" value={filtroNivel} options={NIVELES_DESARROLLO} onChange={setFiltroNivel} />
              <FilterSelect label="Posición" value={filtroPosicion} options={['Todas', ...POSICIONES.filter(p => p !== 'N/A')]} onChange={setFiltroPosicion} />
              <FilterSelect label="Género" value={filtroGenero} options={['Todos', 'Masculino', 'Femenino']} onChange={setFiltroGenero} />
            </div>
            {filtrosActivos && (
              <button onClick={clearFilters} className="mt-2 py-2.5 px-1 text-xs text-fg-muted hover:text-brand transition-colors underline inline-block">
                Limpiar todos los filtros
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
