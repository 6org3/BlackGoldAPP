import { ArrowRight } from 'lucide-react';
import { OBJETIVOS_CLASE } from './ModoCanchaModalConstants';

export default function ModoCanchaModalConfigPilar({ pilarObjetivo, setPilarObjetivo, setStep }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-fg-secondary font-bold uppercase tracking-widest text-center">Paso 2: Objetivo de la Sesión</p>

      <div className="flex flex-col space-y-4 max-w-md mx-auto">
        <label className="text-xs text-brand uppercase font-bold tracking-widest text-center">Pilar a Entrenar Hoy</label>
        <p className="text-fg-secondary text-xs text-center mb-2">Este pilar recibirá un bonus automático para todos los asistentes al finalizar la clase.</p>
        <div className="grid grid-cols-1 gap-2">
          {OBJETIVOS_CLASE.map(obj => (
            <button key={obj} onClick={() => setPilarObjetivo(obj)}
              className={`py-3 px-4 rounded-control text-sm font-bold uppercase tracking-wide border transition-all ${pilarObjetivo === obj ? 'bg-brand/10 border-brand text-brand' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>
              {obj}
            </button>
          ))}
        </div>
      </div>

      <button onClick={() => setStep(3)} className="w-full mt-6 bg-brand text-black font-black uppercase tracking-widest py-4 rounded-control flex items-center justify-center hover:bg-brand-hover transition-colors shadow-[0_0_15px_rgba(255,215,0,0.2)]">
        Siguiente: Pasar Lista <ArrowRight size={18} className="ml-2"/>
      </button>
    </div>
  );
}
