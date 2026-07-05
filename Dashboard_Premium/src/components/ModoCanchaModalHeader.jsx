import { Activity, X, ChevronLeft } from 'lucide-react';

export default function ModoCanchaModalHeader({ step, setStep, onClose }) {
  return (
    <div className="p-5 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-[#FFD700]/10 to-transparent">
      <div className="flex items-center space-x-3">
        <Activity className="text-[#FFD700]" size={24} />
        <h2 className="text-xl font-black text-white uppercase tracking-tight">Modo Cancha</h2>
        {step > 1 && step < 4 && (
          <button onClick={() => setStep(step - 1)} className="ml-4 text-xs text-gray-400 hover:text-white flex items-center py-3 px-2 -my-3 min-h-11">
            <ChevronLeft size={14} className="mr-1"/> Volver
          </button>
        )}
      </div>
      <button onClick={onClose} aria-label="Cerrar Modo Cancha" className="text-gray-400 hover:text-white bg-white/5 p-3 rounded-full transition-colors">
        <X size={20} />
      </button>
    </div>
  );
}
