import { Loader2 } from 'lucide-react';
import AthleteGridCard from './AthleteGridCard';

export default function AppAthleteGrid({ loading, atletasPaginados, currentHasMore, atletasFiltradosLength, onSelect, onLoadMore }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-brand">
        <Loader2 className="w-16 h-16 animate-spin mb-6 opacity-80" />
        <p className="font-bold tracking-[0.3em] uppercase text-xs animate-pulse">Sincronizando Supabase...</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-12 relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {atletasPaginados.map(atleta => (
            <AthleteGridCard key={atleta.id} atleta={atleta} onClick={() => onSelect(atleta)} />
          ))}
        </div>
        {currentHasMore && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={onLoadMore}
              className="w-full sm:w-auto px-8 py-3.5 min-h-[44px] rounded-control bg-white/5 border border-white/10 hover:bg-brand/10 hover:border-brand/30 hover:text-brand text-fg-secondary font-bold text-xs uppercase tracking-widest transition flex items-center justify-center gap-2"
            >
              Cargar Más
            </button>
          </div>
        )}
      </div>
      {atletasFiltradosLength === 0 && (
        <div className="text-center py-20 relative z-10">
          <p className="text-fg-muted font-bold uppercase tracking-widest text-xs">No hay atletas con esos filtros</p>
        </div>
      )}
    </>
  );
}
