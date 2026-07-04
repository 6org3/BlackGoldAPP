import { X } from 'lucide-react';
import MicroCard from './MicroCard';
import AtletaCard from './AtletaCard';
import HistorialPruebas from './HistorialPruebas';

export default function AppAthleteProfileModal({ selectedAtleta, atletas, onClose }) {
  if (!selectedAtleta) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start md:items-center justify-center p-4 pt-16 md:pt-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <button
        onClick={onClose}
        className="fixed top-4 right-4 z-[110] flex items-center space-x-2 text-white bg-black/50 hover:bg-black/80 p-2 pr-4 rounded-full border border-white/10 backdrop-blur-md transition-all shadow-[0_0_15px_rgba(0,0,0,0.5)]"
      >
        <div className="bg-red-500/20 text-red-400 rounded-full p-1"><X size={16} /></div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-red-100">Cerrar</span>
      </button>
      <div className="relative w-full max-w-xl my-8 mt-16 md:mt-8 space-y-6">
        {['Premini (Sub-9)', 'Mini (Sub-11)'].includes(selectedAtleta.categoria)
          ? <MicroCard atleta={selectedAtleta} />
          : <AtletaCard atleta={selectedAtleta} index={0} todosLosAtletas={atletas} />
        }
        {/* Histórico multi-punto (vista coach): mismas series que ve el atleta
            en su layout, con drill-down por prueba concreta. */}
        <div className="bg-[#09090b]/90 border border-white/10 rounded-3xl p-5">
          <h3 className="text-xs font-black uppercase tracking-widest text-[#FFD700] mb-4">
            Evolución de evaluaciones
          </h3>
          <HistorialPruebas atletaId={selectedAtleta.atleta_id || selectedAtleta.id} />
        </div>
      </div>
    </div>
  );
}
