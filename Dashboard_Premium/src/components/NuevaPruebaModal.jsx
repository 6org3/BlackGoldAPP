import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Target, Save, Info, AlertCircle } from 'lucide-react';
import { supabase } from '../api/supabaseClient';
import { TABLA_PRUEBAS_EVALUACION } from '../api/tablas';
import { SUB_PILARES } from '../../../packages/analytics-core/taxonomia.js';
import { useAuth } from '../AuthContext';

// Métricas del radar derivadas de la fuente única (taxonomia.js): label,
// pilar y sub_pilar por key. Antes era una lista hardcodeada que dejaba
// fuera a los sub-pilares nuevos (p. ej. resistencia).
const METRIC_MAP = Object.fromEntries(
  SUB_PILARES.map(({ key, label, pilar }) => [key, { label, pilar, sub_pilar: key }])
);

export default function NuevaPruebaModal({ isOpen, onClose, onPruebaCreated }) {
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    metricKey: 'fuerza', // Se usa para derivar pilar y sub_pilar
    tren: 'general',
    unidad: 'cm',
    tipo: 'mas_es_mejor',
    descripcion_ejecucion: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!formData.nombre) {
      setError('El nombre de la prueba es obligatorio.');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const { pilar, sub_pilar } = METRIC_MAP[formData.metricKey];

      const newPrueba = {
        nombre: formData.nombre,
        descripcion: formData.descripcion,
        descripcion_ejecucion: formData.descripcion_ejecucion,
        pilar: pilar,
        sub_pilar: sub_pilar,
        tren: formData.tren === 'general' ? null : formData.tren,
        unidad: formData.unidad,
        tipo: formData.tipo,
        invertido: formData.tipo === 'menos_es_mejor',
        inputs_requeridos: [{ id: 'unico', label: `Medida en ${formData.unidad || 'pts'}` }],
        autor_id: user.id, // ID of the coach/owner creating the test
        // Auto-generamos JSON separado por género
        thresholds: {
          Masculino: {
            "Sub12": [10, 20, 30, 40],
            "Sub15": [20, 30, 40, 50],
            "Sub18": [30, 40, 50, 60],
            "Senior": [40, 50, 60, 70]
          },
          Femenino: {
            "Sub12": [8, 16, 24, 32],
            "Sub15": [16, 24, 32, 40],
            "Sub18": [24, 32, 40, 48],
            "Senior": [32, 40, 48, 56]
          }
        }
      };

      const { error: insertError } = await supabase
        .from(TABLA_PRUEBAS_EVALUACION)
        .insert([newPrueba]);

      if (insertError) throw insertError;

      onPruebaCreated(newPrueba);
      onClose();
    } catch (err) {
      console.error(err);
      setError('Hubo un error al guardar la prueba. Verifica tu conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {/* z-[120]: debe pintarse por encima de EvaluacionModal (z-[110]), que es quien lo abre */}
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-surface-card border border-brand/20 rounded-panel w-full max-w-lg max-h-[90dvh] overflow-hidden flex flex-col shadow-2xl"
        >
          {/* Header */}
          <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/40">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 bg-brand/20 rounded-lg">
                <Target className="w-4 h-4 text-brand" />
              </div>
              <h2 className="text-sm font-black uppercase tracking-widest text-brand">Crear Nueva Prueba</h2>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="text-fg-secondary hover:text-white transition-colors p-3 -m-1.5 bg-white/5 rounded-md">
              <X size={18} />
            </button>
          </div>

          {/* Form Content */}
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            
            {error && (
              <div className="p-3 bg-red-950/50 border border-danger/50 rounded-lg flex items-center gap-2 text-xs text-danger-soft">
                <AlertCircle className="w-4 h-4" />
                <p>{error}</p>
              </div>
            )}

            <div>
              <label className="block text-2xs font-bold text-fg-secondary uppercase tracking-widest mb-1.5">Nombre de la Prueba</label>
              <input
                type="text"
                name="nombre"
                autoComplete="off"
                value={formData.nombre}
                onChange={handleChange}
                placeholder="Ej. Salto Vertical"
                className="w-full bg-black/40 border border-white/10 rounded-control px-4 py-3 text-base md:text-sm focus:border-brand/50 outline-none text-white placeholder-gray-600"
              />
            </div>

            <div>
              <label className="block text-2xs font-bold text-fg-secondary uppercase tracking-widest mb-1.5">Métrica (Radar)</label>
              <select
                name="metricKey"
                value={formData.metricKey}
                onChange={handleChange}
                className="w-full bg-black/40 border border-white/10 rounded-control px-4 py-3 text-base md:text-sm focus:border-brand/50 outline-none text-white"
              >
                {Object.entries(METRIC_MAP).map(([key, data]) => (
                  <option key={key} value={key}>{data.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-2xs font-bold text-fg-secondary uppercase tracking-widest mb-1.5">Tipo de Puntuación</label>
                <select 
                  name="tipo"
                  value={formData.tipo}
                  onChange={handleChange}
                  className="w-full bg-black/40 border border-white/10 rounded-control px-4 py-3 text-base md:text-sm focus:border-brand/50 outline-none text-white"
                >
                  <option value="mas_es_mejor">Mayor valor es mejor (ej. Fuerza)</option>
                  <option value="menos_es_mejor">Menor valor es mejor (ej. Tiempo)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-2xs font-bold text-fg-secondary uppercase tracking-widest mb-1.5">Unidad de Medida</label>
                <select 
                  name="unidad"
                  value={formData.unidad}
                  onChange={handleChange}
                  className="w-full bg-black/40 border border-white/10 rounded-control px-4 py-3 text-base md:text-sm focus:border-brand/50 outline-none text-white"
                >
                  <option value="cm">Centímetros (cm)</option>
                  <option value="reps">Repeticiones</option>
                  <option value="s">Segundos (s)</option>
                  <option value="x_bw">Multiplicador Peso Corp. (x bw)</option>
                  <option value="%">Porcentaje (%)</option>
                  <option value="puntos">Puntos (0-100)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-2xs font-bold text-fg-secondary uppercase tracking-widest mb-1.5 flex items-center">
                <Info size={12} className="mr-1 text-brand" /> Descripción de Ejecución
              </label>
              <textarea 
                name="descripcion_ejecucion"
                value={formData.descripcion_ejecucion}
                onChange={handleChange}
                placeholder="Explica detalladamente cómo debe ejecutarse esta prueba para asegurar validez científica..."
                rows={4}
                className="w-full bg-black/40 border border-white/10 rounded-control px-4 py-3 text-base md:text-sm focus:border-brand/50 outline-none text-white placeholder-gray-600 resize-none"
              />
              <p className="text-3xs text-fg-muted mt-1 uppercase tracking-widest">
                Estas instrucciones se mostrarán al coach al momento de evaluar.
              </p>
            </div>
            
          </div>

          {/* Footer actions */}
          <div className="p-4 border-t border-white/10 bg-black/60 flex justify-end gap-3">
            <button onClick={onClose} className="px-5 py-3 min-h-11 text-xs font-bold text-fg-secondary hover:text-white uppercase tracking-widest transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 min-h-11 bg-brand hover:bg-brand-hover text-on-brand text-xs font-black uppercase tracking-widest rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Save size={14} />}
              {loading ? 'Guardando...' : 'Crear Prueba'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
