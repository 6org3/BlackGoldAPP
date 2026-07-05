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
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Buscar por nombre o cédula..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-11 pr-4 py-3 text-base md:text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#FFD700]/40 focus:shadow-[0_0_15px_rgba(255,215,0,0.08)] transition-all"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center space-x-2 px-4 py-3 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all ${
            showFilters || filtrosActivos
              ? 'bg-[#FFD700]/10 border-[#FFD700]/30 text-[#FFD700]'
              : 'bg-white/[0.03] border-white/10 text-gray-500 hover:text-white hover:border-white/20'
          }`}
        >
          <Filter size={14} />
          <span className="hidden sm:inline">Filtros</span>
          {filtrosActivos && (
            <span className="w-2 h-2 rounded-full bg-[#FFD700] animate-pulse" />
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
            <div className="glass-card rounded-xl p-5 flex flex-col gap-5">
              <FilterSelect label="Categoría FEB" value={filtroCat} options={CATEGORIAS_FEB} onChange={setFiltroCat} />
              <FilterSelect label="Nivel Desarrollo" value={filtroNivel} options={NIVELES_DESARROLLO} onChange={setFiltroNivel} />
              <FilterSelect label="Posición" value={filtroPosicion} options={['Todas', ...POSICIONES.filter(p => p !== 'N/A')]} onChange={setFiltroPosicion} />
              <FilterSelect label="Género" value={filtroGenero} options={['Todos', 'Masculino', 'Femenino']} onChange={setFiltroGenero} />
            </div>
            {filtrosActivos && (
              <button onClick={clearFilters} className="mt-2 py-2.5 px-1 text-xs text-gray-500 hover:text-[#FFD700] transition-colors underline inline-block">
                Limpiar todos los filtros
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
