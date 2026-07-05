import { ArrowRight } from 'lucide-react';
import { labelPilar, labelSubPilar } from '../../../packages/analytics-core/taxonomia.js';
import { OBJETIVOS_CLASE } from './ModoCanchaModalConstants';

// Paso 2 del Modo Cancha (fase P3): el coach elige una PLANTILLA de la biblioteca
// (catalogo_sesiones) en vez de un pilar abstracto. Cada plantilla trae su objetivo
// canónico pilar/sub_pilar (taxonomia.js), que la sesión guarda en la columna real
// sesiones_programadas.pilar_objetivo. Si la biblioteca no carga (sin red / RLS),
// se degradan los OBJETIVOS_CLASE clásicos a pseudo-plantillas sin objetivo canónico.
export default function ModoCanchaModalConfigPilar({ plantillas, plantillaSeleccionada, setPlantillaSeleccionada, setStep }) {
  const opciones = (plantillas && plantillas.length > 0)
    ? plantillas
    : OBJETIVOS_CLASE.map(titulo => ({ id: `fallback-${titulo}`, titulo, pilar: null, sub_pilar: null }));

  // Agrupar por pilar (las sin pilar canónico van al final bajo "Otros objetivos")
  const grupos = [];
  const porPilar = {};
  opciones.forEach(p => {
    const clave = p.pilar || '_otros';
    if (!porPilar[clave]) {
      porPilar[clave] = { clave, titulo: p.pilar ? labelPilar(p.pilar) : 'Otros objetivos', items: [] };
      grupos.push(porPilar[clave]);
    }
    porPilar[clave].items.push(p);
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-fg-secondary font-bold uppercase tracking-widest text-center">Paso 2: Objetivo de la Sesión</p>

      <div className="flex flex-col space-y-4 max-w-md mx-auto">
        <label className="text-xs text-brand uppercase font-bold tracking-widest text-center">Plantilla a Entrenar Hoy</label>
        <p className="text-fg-secondary text-xs text-center mb-2">La plantilla define el objetivo de la clase; los asistentes reciben XP al finalizarla.</p>

        {grupos.map(grupo => (
          <div key={grupo.clave}>
            <p className="text-2xs text-fg-muted font-black uppercase tracking-[0.25em] mb-2">{grupo.titulo}</p>
            <div className="grid grid-cols-1 gap-2">
              {grupo.items.map(p => {
                const activa = plantillaSeleccionada?.id === p.id;
                return (
                  <button key={p.id} onClick={() => setPlantillaSeleccionada(p)} aria-pressed={activa}
                    className={`py-3 px-4 rounded-control text-sm font-bold uppercase tracking-wide border text-left transition ${activa ? 'bg-brand/10 border-brand text-brand' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>
                    <span className="block">{p.titulo}</span>
                    {p.sub_pilar && (
                      <span className="block text-3xs font-bold normal-case tracking-normal text-fg-muted mt-0.5">
                        Sub-pilar: {labelSubPilar(p.sub_pilar)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => setStep(3)} disabled={!plantillaSeleccionada}
        className="w-full mt-6 bg-brand text-black font-black uppercase tracking-widest py-4 rounded-control flex items-center justify-center hover:bg-brand-hover transition-colors shadow-[0_0_15px_rgba(255,215,0,0.2)] disabled:opacity-40 disabled:cursor-not-allowed">
        Siguiente: Pasar Lista <ArrowRight size={18} className="ml-2"/>
      </button>
    </div>
  );
}
