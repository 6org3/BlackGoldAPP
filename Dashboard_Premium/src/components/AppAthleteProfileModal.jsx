import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import MicroCard from './MicroCard';
import AtletaCard from './AtletaCard';
import HistorialPruebas from './HistorialPruebas';

export default function AppAthleteProfileModal({ selectedAtleta, atletas, onClose }) {
  const closeBtnRef = useRef(null);

  // Scroll-lock del body: sin esto, en iOS/Android el scroll del modal se
  // encadena al grid de atrás y el coach pierde su posición al cerrar.
  useEffect(() => {
    if (!selectedAtleta) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [selectedAtleta]);

  // Semántica de diálogo: foco inicial en Cerrar y cierre con Escape.
  useEffect(() => {
    if (!selectedAtleta) return undefined;
    closeBtnRef.current?.focus();
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedAtleta, onClose]);

  if (!selectedAtleta) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Perfil de ${selectedAtleta.nombre}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[100] flex items-start md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto overscroll-contain"
    >
      <button
        ref={closeBtnRef}
        onClick={onClose}
        className="fixed top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-[110] flex items-center space-x-2 text-white bg-black/50 hover:bg-black/80 p-3 pr-4 rounded-full border border-white/10 backdrop-blur-md transition shadow-[0_0_15px_rgba(0,0,0,0.5)]"
      >
        <div className="bg-danger/20 text-danger-soft rounded-full p-1"><X size={16} /></div>
        <span className="text-2xs font-bold uppercase tracking-widest text-red-100">Cerrar</span>
      </button>
      {/* Full-screen en <md: contenido a ancho completo (radar arriba a todo
          el ancho); en desktop conserva el layout centrado con margen. */}
      <div className="relative w-full max-w-none md:max-w-xl pt-16 md:pt-0 my-0 md:my-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-0 space-y-6">
        {['Premini (Sub-9)', 'Mini (Sub-11)'].includes(selectedAtleta.categoria)
          ? <MicroCard atleta={selectedAtleta} />
          : <AtletaCard atleta={selectedAtleta} index={0} todosLosAtletas={atletas} />
        }
        {/* Histórico multi-punto (vista coach): mismas series que ve el atleta
            en su layout, con drill-down por prueba concreta. */}
        <div className="bg-surface-base/90 border border-white/10 border-x-0 md:border-x rounded-none md:rounded-card p-5">
          <h3 className="text-xs font-black uppercase tracking-widest text-brand mb-4">
            Evolución de evaluaciones
          </h3>
          <HistorialPruebas atletaId={selectedAtleta.atleta_id || selectedAtleta.id} />
        </div>
      </div>
    </div>
  );
}
