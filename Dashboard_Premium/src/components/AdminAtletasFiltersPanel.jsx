import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter } from 'lucide-react';
import { CATEGORIAS_FEB, NIVELES_DESARROLLO, POSICIONES, ESTADOS_MEMBRESIA, ESTADOS_MEMBRESIA_LABELS } from './AdminAtletasConstants';
import FilterSelect from './AdminAtletasFilterSelect';
import FilterRangoEdad from './AdminAtletasFilterRangoEdad';
import CutCard from './arcade/CutCard';
import { C, BORDER, TINT, cut } from './arcade/arcadeTokens';

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
  filtroMembresia,
  setFiltroMembresia,
  filtroEdadMin,
  setFiltroEdadMin,
  filtroEdadMax,
  setFiltroEdadMax,
  filtrosActivos,
  clearFilters,
}) {
  const filtrosOn = showFilters || filtrosActivos;
  return (
    <div className="mb-6 space-y-3">
      {/* Barra de búsqueda + toggle filtros */}
      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2 px-3" style={{ clipPath: cut(7), background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}` }}>
          <Search size={16} style={{ color: C.text3 }} />
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Buscar por nombre o cédula..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="cut-focus arcade-input w-full bg-transparent min-h-11 text-base md:text-sm font-bold focus:outline-none"
            style={{ color: C.text }}
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
          aria-label={filtrosActivos ? 'Filtros (activos)' : 'Filtros'}
          className="cut-focus flex items-center gap-2 min-h-11 px-4 text-xs font-bold uppercase tracking-widest transition-colors"
          style={{
            clipPath: cut(7),
            background: filtrosOn ? TINT.gold : 'transparent',
            border: `1px solid ${filtrosOn ? BORDER.goldStrong : BORDER.neutralSoft}`,
            color: filtrosOn ? C.gold : C.text3,
          }}
        >
          <Filter size={14} />
          <span className="hidden sm:inline">Filtros</span>
          {filtrosActivos && <span aria-hidden="true" className="animate-pulse" style={{ width: 8, height: 8, borderRadius: 9999, background: C.gold }} />}
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
            <CutCard cut={10} padding="20px">
              <div className="flex flex-col gap-5">
                <FilterSelect label="Categoría FEB" value={filtroCat} options={CATEGORIAS_FEB} onChange={setFiltroCat} />
                <FilterRangoEdad
                  edadMin={filtroEdadMin}
                  edadMax={filtroEdadMax}
                  onChangeMin={setFiltroEdadMin}
                  onChangeMax={setFiltroEdadMax}
                />
                <FilterSelect label="Nivel Desarrollo" value={filtroNivel} options={NIVELES_DESARROLLO} onChange={setFiltroNivel} />
                <FilterSelect label="Posición" value={filtroPosicion} options={['Todas', ...POSICIONES.filter(p => p !== 'N/A')]} onChange={setFiltroPosicion} />
                <FilterSelect label="Género" value={filtroGenero} options={['Todos', 'Masculino', 'Femenino']} onChange={setFiltroGenero} />
                <FilterSelect label="Membresía" value={filtroMembresia} options={ESTADOS_MEMBRESIA} optionLabels={ESTADOS_MEMBRESIA_LABELS} onChange={setFiltroMembresia} />
              </div>
            </CutCard>
            {filtrosActivos && (
              <button onClick={clearFilters} className="cut-focus mt-2 inline-flex items-center min-h-11 px-1 text-xs underline transition-colors" style={{ color: C.text3 }}>
                Limpiar todos los filtros
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
