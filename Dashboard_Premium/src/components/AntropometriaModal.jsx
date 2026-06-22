import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Ruler, Scale } from 'lucide-react';
import { supabase } from '../api/supabaseClient';

export default function AntropometriaModal({ atleta, onClose, onRefresh }) {
  const [pesoKg, setPesoKg] = useState(atleta.peso_kg || '');
  const [tallaCm, setTallaCm] = useState(atleta.talla_cm || '');
  const [tallaSentadoCm, setTallaSentadoCm] = useState(atleta.talla_sentado_cm || '');
  const [envergaduraCm, setEnvergaduraCm] = useState(atleta.envergadura_cm || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const indiceCormico = (tallaSentadoCm && tallaCm) ? ((parseFloat(tallaSentadoCm) / parseFloat(tallaCm)) * 100).toFixed(1) : null;
  const envergaduraRelativa = (envergaduraCm && tallaCm) ? (parseFloat(envergaduraCm) - parseFloat(tallaCm)).toFixed(1) : null;

  const getCormicoLabel = (ic) => {
    if (!ic) return 'N/A';
    if (ic <= 50.9) return 'Braquicórmico (Piernas largas)';
    if (ic <= 52.9) return 'Metriocórmico (Proporcionado)';
    return 'Macrocórmico (Tronco largo)';
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const { error: dbError } = await supabase
        .from('atletas')
        .update({
          peso_kg: pesoKg ? parseFloat(pesoKg) : null,
          talla_cm: tallaCm ? parseFloat(tallaCm) : null,
          talla_sentado_cm: tallaSentadoCm ? parseFloat(tallaSentadoCm) : null,
          envergadura_cm: envergaduraCm ? parseFloat(envergaduraCm) : null
        })
        .eq('id', atleta.atleta_id);

      if (dbError) throw dbError;

      // Guardar registro histórico en evaluaciones_pruebas
      const pruebas = [];
      const fechaHoy = new Date().toISOString().split('T')[0];
      
      if (pesoKg) {
        pruebas.push({
          atleta_id: atleta.atleta_id,
          prueba_tipo: 'peso_kg',
          pilar: 'fisico',
          sub_pilar: 'composicion_corporal',
          unidad: 'kg',
          valor_crudo: parseFloat(pesoKg),
          notas: `Actualización antropométrica: ${fechaHoy}`
        });
      }
      
      if (tallaCm) {
        pruebas.push({
          atleta_id: atleta.atleta_id,
          prueba_tipo: 'altura_cm',
          pilar: 'fisico',
          sub_pilar: 'composicion_corporal',
          unidad: 'cm',
          valor_crudo: parseFloat(tallaCm),
          notas: `Actualización antropométrica: ${fechaHoy}`
        });
      }

      if (pruebas.length > 0) {
        await supabase.from('evaluaciones_pruebas').insert(pruebas);
      }

      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      console.error(err);
      setError('Error al guardar datos antropométricos.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card max-w-lg w-full rounded-2xl p-6 relative"
      >
        <button onClick={onClose} className="absolute right-4 top-4 text-gray-500 hover:text-white">
          <X size={20} />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#FFD700]/20 to-[#D4AF37]/5 flex items-center justify-center border border-[#FFD700]/30">
            <Ruler className="text-[#FFD700]" size={20} />
          </div>
          <div>
            <h3 className="text-xl font-black text-white uppercase tracking-tight">Evaluación Antropométrica</h3>
            <p className="text-[10px] text-[#FFD700] uppercase font-bold tracking-widest">{atleta.nombre}</p>
          </div>
        </div>

        {error && <div className="mb-4 text-red-400 text-xs font-bold bg-red-500/10 border border-red-500/20 p-2 rounded-lg">{error}</div>}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                <Scale size={12}/> Peso (kg)
              </label>
              <input
                type="number" step="0.1" value={pesoKg} onChange={e => setPesoKg(e.target.value)}
                className="w-full bg-[#121214]/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FFD700]/50"
                placeholder="Ej: 75.5"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                <Ruler size={12}/> Talla / Altura (cm)
              </label>
              <input
                type="number" step="0.1" value={tallaCm} onChange={e => setTallaCm(e.target.value)}
                className="w-full bg-[#121214]/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FFD700]/50"
                placeholder="Ej: 185.0"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
                Talla Sentado (cm)
              </label>
              <input
                type="number" step="0.1" value={tallaSentadoCm} onChange={e => setTallaSentadoCm(e.target.value)}
                className="w-full bg-[#121214]/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FFD700]/50"
                placeholder="Ej: 90.0"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
                Brazada / Envergadura (cm)
              </label>
              <input
                type="number" step="0.1" value={envergaduraCm} onChange={e => setEnvergaduraCm(e.target.value)}
                className="w-full bg-[#121214]/80 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FFD700]/50"
                placeholder="Ej: 190.0"
              />
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-4 space-y-2">
            <h4 className="text-[10px] font-bold text-[#FFD700] uppercase tracking-widest border-b border-white/10 pb-2 mb-2">Resultados Calculados</h4>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400 font-bold">Índice Córmico:</span>
              <span className="text-white font-black">{indiceCormico || '--'} %</span>
            </div>
            {indiceCormico && (
              <div className="text-right text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                {getCormicoLabel(indiceCormico)}
              </div>
            )}
            <div className="flex justify-between items-center text-sm mt-2 border-t border-white/5 pt-2">
              <span className="text-gray-400 font-bold">Brazada Relativa:</span>
              <span className={`font-black ${envergaduraRelativa > 0 ? 'text-emerald-400' : envergaduraRelativa < 0 ? 'text-red-400' : 'text-white'}`}>
                {envergaduraRelativa ? (envergaduraRelativa > 0 ? `+${envergaduraRelativa}` : envergaduraRelativa) : '--'} cm
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full mt-6 bg-gradient-to-r from-[#FFD700] to-[#D4AF37] text-black font-black uppercase tracking-widest py-3 rounded-xl hover:shadow-[0_0_20px_rgba(255,215,0,0.4)] transition-all flex items-center justify-center gap-2"
          >
            <Save size={16} />
            <span>{saving ? 'Guardando...' : 'Guardar Evaluación'}</span>
          </button>
        </form>
      </motion.div>
    </div>
  );
}
