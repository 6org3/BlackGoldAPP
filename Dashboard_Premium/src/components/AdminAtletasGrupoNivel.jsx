import { NIVEL_BADGE } from './AdminAtletasConstants';
import AtletaGridCard from './AdminAtletasGridCard';
import AtletaListRow from './AdminAtletasListRow';

export default function AdminAtletasGrupoNivel({
  atletasAgrupados,
  loading,
  viewMode,
  filtrosActivos,
  hasFilters,
  clearFilters,
  exportingAtleta,
  onEdit,
  onDelete,
  onExport,
  onAntropometria,
}) {
  return (
    <div className="space-y-8">
      {loading && atletasAgrupados.length === 0 && (
        <div className="text-center py-16">
          <p className="text-fg-muted text-sm font-bold animate-pulse">Buscando atletas...</p>
        </div>
      )}

      {!loading && atletasAgrupados.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">🔍</div>
          {hasFilters ? (
            <>
              <p className="text-fg-muted text-sm font-bold">No se encontraron atletas con estos filtros.</p>
              {filtrosActivos && (
                <button onClick={clearFilters} className="mt-3 text-xs text-brand hover:underline">
                  Limpiar filtros
                </button>
              )}
            </>
          ) : (
            <p className="text-fg-muted text-sm font-bold">Busca por nombre o cédula, o aplica un filtro para ver el roster.</p>
          )}
        </div>
      )}

      {atletasAgrupados.map(({ nivel, atletas: grupoAtletas }) => {
        const badge = NIVEL_BADGE[nivel] || NIVEL_BADGE['Por Asignar'];
        return (
          <div key={nivel}>
            {/* Header del grupo */}
            <div className="flex items-center space-x-3 mb-4">
              <span className="text-lg">{badge.icon}</span>
              <h3 className={`text-sm font-black uppercase tracking-widest ${badge.color}`}>
                {nivel}
              </h3>
              <span className="text-2xs text-fg-faint font-bold">
                ({grupoAtletas.length} atleta{grupoAtletas.length !== 1 ? 's' : ''})
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
            </div>

            {/* Grid View */}
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {grupoAtletas.map((atleta, i) => (
                  <AtletaGridCard
                    key={atleta.id}
                    atleta={atleta}
                    index={i}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onExport={onExport}
                    onAntropometria={onAntropometria}
                    isExporting={exportingAtleta?.id === atleta.id}
                  />
                ))}
              </div>
            ) : (
              /* List View */
              <div className="space-y-2">
                {grupoAtletas.map((atleta, i) => (
                  <AtletaListRow
                    key={atleta.id}
                    atleta={atleta}
                    index={i}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onExport={onExport}
                    onAntropometria={onAntropometria}
                    isExporting={exportingAtleta?.id === atleta.id}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
