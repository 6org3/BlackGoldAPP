import { useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Moon, Droplets, Loader2, X } from 'lucide-react';
import { guardarReadinessDiario } from '../api/readinessService';

const URINE_COLORS = [
  { value: 1, color: '#FDFBE3', label: 'Excelente' },
  { value: 2, color: '#FDF1AB', label: 'Muy Bien' },
  { value: 3, color: '#FDE47F', label: 'Bien' },
  { value: 4, color: '#FCD754', label: 'Poca Deshidratación' },
  { value: 5, color: '#EFC132', label: 'Deshidratado' },
  { value: 6, color: '#E1AA12', label: 'Muy Deshidratado' },
  { value: 7, color: '#C58200', label: 'Deshidratación Severa' },
  { value: 8, color: '#975F00', label: 'Peligro' },
];

export default function ReadinessModal({ atletaId, onClose, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [sueno, setSueno] = useState(5);
  const [fatiga, setFatiga] = useState(5);
  const [colorOrina, setColorOrina] = useState(1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await guardarReadinessDiario({
        atleta_id: atletaId,
        sueno_calidad: parseInt(sueno),
        fatiga_fisica: parseInt(fatiga),
        color_orina: parseInt(colorOrina)
      });
      if(onComplete) onComplete();
      onClose();
    } catch (err) {
      setError(err.message || 'Error al guardar el check-in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-lg bg-surface-base border border-white/10 rounded-panel p-6 md:p-8 shadow-2xl max-h-[90dvh] overflow-y-auto"
      >
        <button
          onClick={onClose}
          aria-label="Cerrar check-in"
          className="absolute top-3 right-3 text-fg-muted hover:text-white bg-white/5 hover:bg-white/10 rounded-full p-3 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-indigo-500/10 rounded-control border border-indigo-500/20">
            <Activity className="text-indigo-400" size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Check-in Diario</h2>
            <p className="text-xs text-indigo-400/80 uppercase tracking-widest font-bold">Athlete Readiness Engine</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-danger/10 border border-danger/20 rounded-control">
            <p className="text-danger-soft text-xs font-bold uppercase tracking-widest text-center">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* SUEÑO */}
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <label className="flex items-center space-x-2 text-sm font-bold text-white uppercase tracking-wider">
                <Moon size={16} className="text-info-soft" />
                <span>¿Cómo dormiste anoche?</span>
              </label>
              <span className="text-xl font-black text-info-soft">{sueno}/10</span>
            </div>
            <input 
              type="range" min="1" max="10" 
              value={sueno} onChange={(e) => setSueno(e.target.value)}
              className="w-full h-8 accent-blue-500 cursor-pointer"
            />
            <div className="flex justify-between text-2xs text-fg-muted font-bold uppercase tracking-widest">
              <span>Pésimo (1)</span>
              <span>Increíble (10)</span>
            </div>
          </div>

          {/* FATIGA */}
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <label className="flex items-center space-x-2 text-sm font-bold text-white uppercase tracking-wider">
                <Activity size={16} className="text-rose-400" />
                <span>Nivel de Fatiga Física</span>
              </label>
              <span className="text-xl font-black text-rose-400">{fatiga}/10</span>
            </div>
            <input 
              type="range" min="1" max="10" 
              value={fatiga} onChange={(e) => setFatiga(e.target.value)}
              className="w-full h-8 accent-rose-500 cursor-pointer"
            />
            <div className="flex justify-between text-2xs text-fg-muted font-bold uppercase tracking-widest">
              <span>Agotado (1)</span>
              <span>Al 100% (10)</span>
            </div>
          </div>

          {/* COLOR DE ORINA */}
          <div className="space-y-4">
            <div className="flex justify-between items-end mb-2">
              <label className="flex items-center space-x-2 text-sm font-bold text-white uppercase tracking-wider">
                <Droplets size={16} className="text-brand" />
                <span>Color de tu primera orina hoy</span>
              </label>
            </div>
            <p className="text-xs text-fg-secondary leading-relaxed mb-4">
              La Escala de Armstrong nos ayuda a medir objetivamente tu hidratación antes de entrenar. Selecciona el color que más se parezca.
            </p>
            
            <div className="grid grid-cols-4 gap-2">
              {URINE_COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColorOrina(c.value)}
                  aria-label={`Nivel ${c.value}: ${c.label}`}
                  aria-pressed={colorOrina === c.value}
                  className={`h-12 rounded-lg border-2 transition ${
                    colorOrina === c.value ? 'border-white scale-105 shadow-lg' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.color }}
                  title={c.label}
                />
              ))}
            </div>
            <div className="text-center mt-2">
              <span className="text-2xs font-bold uppercase tracking-widest text-brand">
                {URINE_COLORS.find(c => c.value === colorOrina)?.label}
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full relative group overflow-hidden bg-white/5 border border-white/10 hover:border-indigo-500/50 rounded-control p-4 transition"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative flex items-center justify-center space-x-2 text-white font-bold tracking-eyebrow uppercase text-sm">
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>Completar Check-in</span>
              )}
            </div>
          </button>
        </form>
      </motion.div>
    </div>
  );
}
