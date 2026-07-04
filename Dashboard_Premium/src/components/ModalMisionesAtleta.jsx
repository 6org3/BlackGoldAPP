import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, X, Check, Search, Plus, Save, RefreshCw } from 'lucide-react';
import { supabase } from '../api/supabaseClient';
import { useAuth } from '../AuthContext';
import { asignarMisionAAtleta } from '../api/misionesService';
import { PILAR_LABELS, PILARES_OPTIONS } from '../constants/pilares';

export default function ModalMisionesAtleta({ atleta, isOpen, onClose }) {
  const { user } = useAuth();
  const [tab, setTab] = useState('catalogo'); // 'catalogo' o 'crear'
  const [misiones, setMisiones] = useState([]);
  const [misionesAsignadas, setMisionesAsignadas] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [saving, setSaving] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Form para crear nueva
  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    pilar: 'youtube',
    video_url: '',
    xp_recompensa: 50,
    categoria_objetivo: 'Todas'
  });

  useEffect(() => {
    if (isOpen) loadMisiones();
  }, [isOpen]);

  const loadMisiones = async () => {
    const targetAtletaId = atleta.atleta_id || atleta.id;
    
    // Fetch all missions
    const { data, error } = await supabase.from('misiones').select('*').order('created_at', { ascending: false });
    if (!error && data) setMisiones(data);

    // Fetch assigned missions
    const { data: asignadas, error: asignadasErr } = await supabase
      .from('progreso_misiones')
      .select('mision_id')
      .eq('atleta_id', targetAtletaId);

    if (!asignadasErr && asignadas) {
      setMisionesAsignadas(asignadas.map(a => a.mision_id));
    }
  };

  const handleAsignar = async (misionId) => {
    setSaving(true);
    try {
      await asignarMisionAAtleta(atleta.atleta_id || atleta.id, misionId);
      setMisionesAsignadas([...misionesAsignadas, misionId]);
      setSuccessMsg('¡Misión asignada!');
      setTimeout(() => { setSuccessMsg(''); }, 1500);
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setSaving(false);
  };

  const handleCrear = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // 1. Crear en BD
      const { data: newMision, error: mErr } = await supabase
        .from('misiones')
        .insert({
          titulo: form.titulo,
          descripcion: form.descripcion,
          pilar: form.pilar,
          video_url: form.video_url,
          xp_recompensa: parseInt(form.xp_recompensa),
          categoria_objetivo: form.categoria_objetivo,
          quiz: [],
          autor_id: user.id
        })
        .select()
        .single();
      
      if (mErr) throw mErr;

      // 2. Asignar al atleta
      await asignarMisionAAtleta(atleta.atleta_id || atleta.id, newMision.id);
      setMisionesAsignadas([...misionesAsignadas, newMision.id]);
      
      setSuccessMsg('¡Misión creada y asignada!');
      setTimeout(() => { setSuccessMsg(''); setTab('catalogo'); }, 1500);
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setSaving(false);
  };

  // Re-invoca el loop evaluación → misión para este atleta (D2). Idempotente:
  // el backend deduplica contra todas las asignaciones históricas + índice único,
  // así que pulsarlo N veces nunca duplica asignaciones.
  const handleRegenerar = async () => {
    setRegenerando(true);
    try {
      const { data, error } = await supabase.functions.invoke('generar-misiones-ia', {
        body: { atleta_id: atleta.atleta_id || atleta.id },
      });
      if (error) throw error;
      const nuevas = data?.asignadas?.length ?? 0;
      setSuccessMsg(nuevas > 0
        ? `${nuevas} misión(es) generada(s) según sus debilidades.`
        : 'Sin misiones nuevas (ya tiene asignada la tanda actual).');
      await loadMisiones();
      setTimeout(() => { setSuccessMsg(''); }, 2500);
    } catch (err) {
      alert('Error al regenerar misiones: ' + err.message);
    }
    setRegenerando(false);
  };

  const misionesFiltradas = misiones.filter(m => m.titulo.toLowerCase().includes(busqueda.toLowerCase()));

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          className="bg-[#09090b] border border-white/10 p-6 md:p-8 rounded-3xl w-full max-w-2xl relative shadow-2xl overflow-hidden">
          
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-black text-[#FFD700] uppercase tracking-tighter">Misiones para {atleta.nombre.split(' ')[0]}</h2>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Elige o crea una misión educativa</p>
            </div>
            <div className="flex items-center space-x-2">
              <button onClick={handleRegenerar} disabled={regenerando}
                title="Vuelve a ejecutar el motor de recomendación por debilidades (idempotente)"
                className="flex items-center space-x-2 px-3 py-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 rounded-xl transition-colors disabled:opacity-50">
                <RefreshCw size={14} className={regenerando ? 'animate-spin' : ''} />
                <span className="text-[10px] font-bold uppercase tracking-widest">{regenerando ? 'Generando…' : 'Regenerar misiones'}</span>
              </button>
              <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-white">
                <X size={20} />
              </button>
            </div>
          </div>

          {successMsg ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center">
                <Check size={32} />
              </div>
              <p className="text-emerald-400 font-bold uppercase tracking-widest">{successMsg}</p>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex space-x-2 mb-6">
                <button onClick={() => setTab('catalogo')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-all ${tab === 'catalogo' ? 'bg-[#FFD700] text-black shadow-[0_0_15px_rgba(255,215,0,0.2)]' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}>Banco de Misiones</button>
                <button onClick={() => setTab('crear')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-all ${tab === 'crear' ? 'bg-[#FFD700] text-black shadow-[0_0_15px_rgba(255,215,0,0.2)]' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}>Crear Nueva</button>
              </div>

              {tab === 'catalogo' && (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={16} />
                    <input type="text" placeholder="Buscar misión..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:outline-none focus:border-[#FFD700]/50" />
                  </div>
                  
                  <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
                    {misionesFiltradas.length === 0 ? (
                      <p className="text-center text-gray-500 py-8 text-xs font-bold uppercase tracking-widest">No hay misiones disponibles</p>
                    ) : (
                      misionesFiltradas.map(m => (
                        <div key={m.id} className="p-4 bg-white/5 border border-white/10 rounded-xl flex justify-between items-center hover:bg-white/10 transition-colors">
                          <div>
                            <h4 className="font-bold text-white text-sm">{m.titulo}</h4>
                            <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest">{PILAR_LABELS[m.pilar] || m.pilar} • {m.xp_recompensa} XP</p>
                          </div>
                          {misionesAsignadas.includes(m.id) ? (
                            <button disabled className="px-4 py-2 bg-gray-800 text-gray-500 font-bold uppercase tracking-widest text-[10px] rounded-lg cursor-not-allowed">
                              Asignada
                            </button>
                          ) : (
                            <button onClick={() => handleAsignar(m.id)} disabled={saving} className="px-4 py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-black font-bold uppercase tracking-widest text-[10px] rounded-lg transition-all">
                              {saving ? 'Asignando...' : 'Asignar'}
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {tab === 'crear' && (
                <form onSubmit={handleCrear} className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Título</label>
                    <input type="text" required value={form.titulo} onChange={e => setForm({...form, titulo: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#FFD700]/50 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Descripción</label>
                    <textarea required value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#FFD700]/50 outline-none h-24"></textarea>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">XP Recompensa</label>
                      <input type="number" required value={form.xp_recompensa} onChange={e => setForm({...form, xp_recompensa: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#FFD700]/50 outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Pilar</label>
                      <select value={form.pilar} onChange={e => setForm({...form, pilar: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#FFD700]/50 outline-none">
                        {PILARES_OPTIONS.map(({ value, label }) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button type="submit" disabled={saving} className="w-full mt-4 bg-[#FFD700] text-black font-black uppercase tracking-widest py-4 rounded-xl flex items-center justify-center hover:bg-[#D4AF37] transition-all shadow-[0_0_20px_rgba(255,215,0,0.2)]">
                    {saving ? 'Guardando...' : 'Crear y Asignar Misión'} <Save size={18} className="ml-2"/>
                  </button>
                </form>
              )}
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
