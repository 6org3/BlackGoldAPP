import { ArrowRight, FlaskConical } from 'lucide-react';
import { labelSubPilar } from '../../../packages/analytics-core/taxonomia.js';

// Paso 2 del Modo Cancha en modo EVALUACIÓN GRUPAL (fase P3b): el coach elige las
// PRUEBAS del catálogo de evaluación (catalogo_ejercicios) que el grupo ejecutará
// como estaciones. El orden de selección es el orden de las estaciones.
export default function ModoCanchaModalSeleccionPruebas({ pruebasCatalogo, pruebasSeleccionadasIds, setPruebasSeleccionadasIds, setStep }) {
  const toggle = (id) => {
    setPruebasSeleccionadasIds(prev => prev.includes(id)
      ? prev.filter(x => x !== id)
      : [...prev, id]);
  };

  // Agrupar por sub-pilar para escanear rápido en el celular
  const grupos = [];
  const porSub = {};
  pruebasCatalogo.forEach(p => {
    const clave = p.sub_pilar || '(sin sub-pilar)';
    if (!porSub[clave]) {
      porSub[clave] = { clave, titulo: labelSubPilar(clave), items: [] };
      grupos.push(porSub[clave]);
    }
    porSub[clave].items.push(p);
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400 font-bold uppercase tracking-widest text-center">Paso 2: Pruebas de la Evaluación</p>

      <div className="flex flex-col space-y-4 max-w-md mx-auto">
        <p className="text-gray-400 text-xs text-center">
          Elige las pruebas que se tomarán hoy. El orden en que las marques será el orden de las estaciones en cancha.
        </p>

        {grupos.map(grupo => (
          <div key={grupo.clave}>
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.25em] mb-2">{grupo.titulo}</p>
            <div className="grid grid-cols-1 gap-2">
              {grupo.items.map(p => {
                const idx = pruebasSeleccionadasIds.indexOf(p.id);
                const activa = idx !== -1;
                return (
                  <button key={p.id} onClick={() => toggle(p.id)} aria-pressed={activa}
                    className={`py-3 px-4 rounded-xl text-sm font-bold border text-left flex items-center justify-between transition-all ${activa ? 'bg-[#FFD700]/10 border-[#FFD700] text-[#FFD700]' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>
                    <span className="flex items-center min-w-0">
                      <FlaskConical size={14} className="mr-2 flex-shrink-0 opacity-60" />
                      <span className="truncate">{p.nombre}</span>
                      <span className="ml-2 text-[9px] text-gray-500 flex-shrink-0">{p.unidad}</span>
                    </span>
                    {activa && (
                      <span className="ml-2 flex-shrink-0 w-6 h-6 rounded-full bg-[#FFD700] text-black text-[10px] font-black flex items-center justify-center">
                        {idx + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {pruebasCatalogo.length === 0 && (
          <p className="text-xs text-gray-600 italic text-center">No hay pruebas en el catálogo de evaluación.</p>
        )}
      </div>

      <button onClick={() => setStep(3)} disabled={pruebasSeleccionadasIds.length === 0}
        className="w-full mt-6 bg-[#FFD700] text-black font-black uppercase tracking-widest py-4 rounded-xl flex items-center justify-center hover:bg-[#D4AF37] transition-colors shadow-[0_0_15px_rgba(255,215,0,0.2)] disabled:opacity-40 disabled:cursor-not-allowed">
        Siguiente: Pasar Lista ({pruebasSeleccionadasIds.length} prueba{pruebasSeleccionadasIds.length !== 1 ? 's' : ''}) <ArrowRight size={18} className="ml-2"/>
      </button>
    </div>
  );
}
