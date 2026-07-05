import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Search, Save, RefreshCw } from 'lucide-react';
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

  // Catálogo acotado y buscado en el servidor: evita descargar el banco
  // completo de misiones al abrir el modal en celulares de gama baja.
  const loadCatalogo = useCallback(async () => {
    let query = supabase
      .from('misiones')
      .select('id, titulo, pilar, xp_recompensa')
      .order('created_at', { ascending: false })
      .limit(50);
    const texto = busqueda.trim();
    if (texto) query = query.ilike('titulo', `%${texto}%`);
    const { data, error } = await query;
    if (!error && data) setMisiones(data);
  }, [busqueda]);

  const loadAsignadas = useCallback(async () => {
    const targetAtletaId = atleta.atleta_id || atleta.id;
    const { data: asignadas, error } = await supabase
      .from('progreso_misiones')
      .select('mision_id')
      .eq('atleta_id', targetAtletaId);
    if (!error && asignadas) {
      setMisionesAsignadas(asignadas.map(a => a.mision_id));
    }
  }, [atleta]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(loadAsignadas, 0);
    return () => clearTimeout(t);
  }, [isOpen, loadAsignadas]);

  // Debounce de 300ms sobre la búsqueda (0ms al abrir / limpiar).
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(loadCatalogo, busqueda ? 300 : 0);
    return () => clearTimeout(t);
  }, [isOpen, busqueda, loadCatalogo]);

  // Scroll-lock del body mientras el modal está abierto (iOS scrollea el fondo).
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

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
      await Promise.all([loadCatalogo(), loadAsignadas()]);
      setTimeout(() => { setSuccessMsg(''); }, 2500);
    } catch (err) {
      alert('Error al regenerar misiones: ' + err.message);
    }
    setRegenerando(false);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          className="bg-surface-base border border-white/10 p-6 md:p-8 rounded-card w-full max-w-2xl relative shadow-modal max-h-[90dvh] overflow-y-auto">

          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
            <div className="min-w-0">
              <h2 className="text-2xl font-black text-brand uppercase tracking-tighter truncate">Misiones para {atleta.nombre.split(' ')[0]}</h2>
              <p className="text-xs text-fg-secondary font-bold uppercase tracking-widest mt-1">Elige o crea una misión educativa</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleRegenerar} disabled={regenerando}
                title="Vuelve a ejecutar el motor de recomendación por debilidades (idempotente)"
                aria-label="Regenerar misiones"
                className="flex items-center gap-2 px-3 py-2 min-h-11 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 rounded-control transition-colors disabled:opacity-50">
                <RefreshCw size={14} className={regenerando ? 'animate-spin' : ''} />
                <span className="hidden sm:inline text-2xs font-bold uppercase tracking-widest">{regenerando ? 'Generando…' : 'Regenerar misiones'}</span>
              </button>
              <button onClick={onClose} aria-label="Cerrar" className="min-h-11 min-w-11 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full transition-colors text-white">
                <X size={20} />
              </button>
            </div>
          </div>

          {successMsg ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 bg-success/20 text-success-soft rounded-full flex items-center justify-center">
                <Check size={32} />
              </div>
              <p className="text-success-soft font-bold uppercase tracking-widest">{successMsg}</p>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex space-x-2 mb-6">
                <button onClick={() => setTab('catalogo')} className={`flex-1 py-3 min-h-11 text-2xs font-black uppercase tracking-eyebrow rounded-control border transition ${tab === 'catalogo' ? 'bg-brand/10 text-brand border-brand/20' : 'bg-white/5 text-fg-muted border-transparent hover:bg-white/10 hover:text-fg'}`}>Banco de Misiones</button>
                <button onClick={() => setTab('crear')} className={`flex-1 py-3 min-h-11 text-2xs font-black uppercase tracking-eyebrow rounded-control border transition ${tab === 'crear' ? 'bg-brand/10 text-brand border-brand/20' : 'bg-white/5 text-fg-muted border-transparent hover:bg-white/10 hover:text-fg'}`}>Crear Nueva</button>
              </div>

              {tab === 'catalogo' && (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={16} />
                    <input type="text" inputMode="search" placeholder="Buscar misión..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                      className="w-full bg-surface-sunken border border-white/10 rounded-control pl-10 pr-4 py-3 text-white text-base md:text-sm focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20" />
                  </div>

                  <div className="max-h-[50dvh] overflow-y-auto space-y-2 pr-2">
                    {misiones.length === 0 ? (
                      <p className="text-center text-fg-muted py-8 text-xs font-bold uppercase tracking-widest">No hay misiones disponibles</p>
                    ) : (
                      misiones.map(m => (
                        <div key={m.id} className="p-4 bg-white/5 border border-white/10 rounded-panel flex justify-between items-center hover:bg-white/10 transition-colors">
                          <div>
                            <h4 className="font-bold text-white text-sm">{m.titulo}</h4>
                            <p className="text-2xs text-fg-secondary mt-1 uppercase tracking-widest">{PILAR_LABELS[m.pilar] || m.pilar} • {m.xp_recompensa} XP</p>
                          </div>
                          {misionesAsignadas.includes(m.id) ? (
                            <button disabled className="px-4 py-2 bg-white/5 text-fg-muted font-bold uppercase tracking-widest text-2xs rounded-control cursor-not-allowed">
                              Asignada
                            </button>
                          ) : (
                            <button onClick={() => handleAsignar(m.id)} disabled={saving} className="px-4 py-2 bg-success/20 text-success-soft hover:bg-success hover:text-black font-bold uppercase tracking-widest text-2xs rounded-control transition">
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
                <form onSubmit={handleCrear} className="space-y-4 max-h-[50dvh] overflow-y-auto pr-2">
                  <div>
                    <label className="block text-2xs font-bold text-fg-secondary uppercase tracking-widest mb-1">Título</label>
                    <input type="text" required value={form.titulo} onChange={e => setForm({...form, titulo: e.target.value})} className="w-full bg-surface-sunken border border-white/10 rounded-control px-4 py-3 text-white focus:border-brand/50 focus:ring-2 focus:ring-brand/20 outline-none" />
                  </div>
                  <div>
                    <label className="block text-2xs font-bold text-fg-secondary uppercase tracking-widest mb-1">Descripción</label>
                    <textarea required value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} className="w-full bg-surface-sunken border border-white/10 rounded-control px-4 py-3 text-white focus:border-brand/50 focus:ring-2 focus:ring-brand/20 outline-none h-24"></textarea>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-2xs font-bold text-fg-secondary uppercase tracking-widest mb-1">XP Recompensa</label>
                      <input type="number" inputMode="numeric" pattern="[0-9]*" min="0" required value={form.xp_recompensa} onChange={e => setForm({...form, xp_recompensa: e.target.value})} className="w-full bg-surface-sunken border border-white/10 rounded-control px-4 py-3 text-white focus:border-brand/50 focus:ring-2 focus:ring-brand/20 outline-none" />
                    </div>
                    <div>
                      <label className="block text-2xs font-bold text-fg-secondary uppercase tracking-widest mb-1">Pilar</label>
                      <select value={form.pilar} onChange={e => setForm({...form, pilar: e.target.value})} className="w-full bg-surface-sunken border border-white/10 rounded-control px-4 py-3 text-white focus:border-brand/50 focus:ring-2 focus:ring-brand/20 outline-none">
                        {PILARES_OPTIONS.map(({ value, label }) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button type="submit" disabled={saving} className="w-full mt-4 bg-brand text-on-brand border border-brand/50 font-black uppercase tracking-eyebrow py-4 rounded-control flex items-center justify-center hover:bg-brand-hover active:scale-[0.99] transition shadow-glow-gold">
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
