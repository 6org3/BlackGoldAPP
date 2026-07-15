import { NIVEL_BADGE } from './AdminAtletasConstants';
import AtletaGridCard from './AdminAtletasGridCard';
import AtletaListRow from './AdminAtletasListRow';
import { C, BORDER } from './arcade/arcadeTokens';

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
  onToggleMembresia,
}) {
  return (
    <div className="space-y-8">
      {loading && atletasAgrupados.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm font-bold animate-pulse" style={{ color: C.text3 }}>Buscando atletas...</p>
        </div>
      )}

      {!loading && atletasAgrupados.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">🔍</div>
          {hasFilters ? (
            <>
              <p className="text-sm font-bold" style={{ color: C.text3 }}>No se encontraron atletas con estos filtros.</p>
              {filtrosActivos && (
                <button onClick={clearFilters} className="cut-focus mt-3 inline-flex items-center min-h-11 px-1 text-xs underline transition-colors" style={{ color: C.gold }}>
                  Limpiar filtros
                </button>
              )}
            </>
          ) : (
            <p className="text-sm font-bold" style={{ color: C.text3 }}>Busca por nombre o cédula, o aplica un filtro para ver el roster.</p>
          )}
        </div>
      )}

      {atletasAgrupados.map(({ nivel, atletas: grupoAtletas }) => {
        const badge = NIVEL_BADGE[nivel] || NIVEL_BADGE['Por Asignar'];
        return (
          <div key={nivel}>
            {/* Header del grupo */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-lg">{badge.icon}</span>
              <h3 className="text-sm font-black uppercase tracking-widest" style={{ color: badge.c }}>
                {nivel}
              </h3>
              <span className="text-2xs font-bold" style={{ color: C.text4 }}>
                ({grupoAtletas.length} atleta{grupoAtletas.length !== 1 ? 's' : ''})
              </span>
              <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${BORDER.neutralSoft}, transparent)` }} />
            </div>

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
                    onToggleMembresia={onToggleMembresia}
                    isExporting={exportingAtleta?.id === atleta.id}
                  />
                ))}
              </div>
            ) : (
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
                    onToggleMembresia={onToggleMembresia}
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
