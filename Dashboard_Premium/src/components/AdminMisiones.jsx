import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../api/supabaseClient';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { aprobarMision, rechazarMision } from '../api/misionesService';
import { ArrowLeft, Plus, Save, X, Play, Trash2, Pencil, CheckCircle, XCircle } from 'lucide-react';
import { PILAR_LABELS, PILARES_OPTIONS } from '../constants/pilares';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function AdminMisiones() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [misiones, setMisiones] = useState([]);
  const [atletas, setAtletas] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [busquedaMision, setBusquedaMision] = useState('');

  const misionesFiltradas = misiones.filter(m => {
    if (!busquedaMision) return true;
    return m.titulo?.toLowerCase().includes(busquedaMision.toLowerCase());
  });

  const emptyForm = {
    titulo: '', descripcion: '', pilar: 'youtube', video_url: '',
    xp_recompensa: 50, categoria_objetivo: 'Sub18',
    quiz: [{ pregunta: '', opciones: ['', '', '', ''], correcta: 0 }],
    asignar_a: [],
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data } = await supabase.from('misiones').select('*').order('created_at', { ascending: false });
    setMisiones(data || []);
    const atls = await fetchTodosLosAtletas(user);
    setAtletas(atls);

    // Cargar pendientes de aprobación
    const { data: pData } = await supabase
      .from('progreso_misiones')
      .select(`
        id, 
        fecha_completada, 
        misiones (titulo, xp_recompensa), 
        atletas (id, usuarios (nombre, categoria))
      `)
      .eq('estado', 'pendiente_aprobacion')
      .order('fecha_completada', { ascending: false });
    setPendientes(pData || []);
  };

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleQuizChange = (qIndex, field, value) => {
    setForm(prev => {
      const quiz = [...prev.quiz];
      if (field === 'pregunta') {
        quiz[qIndex].pregunta = value;
      } else if (field === 'correcta') {
        quiz[qIndex].correcta = parseInt(value);
      } else if (field.startsWith('opcion_')) {
        const oIndex = parseInt(field.split('_')[1]);
        quiz[qIndex].opciones[oIndex] = value;
      }
      return { ...prev, quiz };
    });
  };

  const addQuestion = () => {
    setForm(prev => ({
      ...prev,
      quiz: [...prev.quiz, { pregunta: '', opciones: ['', '', '', ''], correcta: 0 }],
    }));
  };

  const removeQuestion = (index) => {
    setForm(prev => ({
      ...prev,
      quiz: prev.quiz.filter((_, i) => i !== index),
    }));
  };

  const toggleAtleta = (atletaId) => {
    setForm(prev => ({
      ...prev,
      asignar_a: prev.asignar_a.includes(atletaId)
        ? prev.asignar_a.filter(id => id !== atletaId)
        : [...prev.asignar_a, atletaId],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Crear misión
      const { data: newMision, error: mErr } = await supabase
        .from('misiones')
        .insert({
          titulo: form.titulo,
          descripcion: form.descripcion,
          pilar: form.pilar,
          video_url: form.video_url,
          xp_recompensa: parseInt(form.xp_recompensa),
          quiz: form.quiz.filter(q => q.pregunta.trim() !== ''),
          categoria_objetivo: form.categoria_objetivo,
          autor_id: user.id,
        })
        .select()
        .single();

      if (mErr) throw mErr;

      // Asignar a atletas seleccionados
      if (form.asignar_a.length > 0) {
        const assignments = form.asignar_a.map(atletaId => ({
          atleta_id: atletaId,
          mision_id: newMision.id,
          estado: 'pendiente',
          completada: false,
        }));

        const { error: aErr } = await supabase.from('progreso_misiones').insert(assignments);
        if (aErr) throw aErr;
      }

      setSuccess(`Misión "${form.titulo}" creada y asignada a ${form.asignar_a.length} atleta(s).`);
      setForm(emptyForm);
      setShowForm(false);
      loadData();
    } catch (err) {
      setError(err.message || 'Error al crear misión.');
    }
    setSaving(false);
  };

  const handleDelete = async (mision) => {
    if (!confirm(`¿Eliminar la misión "${mision.titulo}"?`)) return;
    await supabase.from('progreso_misiones').delete().eq('mision_id', mision.id);
    await supabase.from('misiones').delete().eq('id', mision.id);
    loadData();
  };

  const handleAprobar = async (id) => {
    try {
      await aprobarMision(id);
      setSuccess('Misión aprobada correctamente. XP otorgada.');
      loadData();
    } catch (err) {
      setError('Error al aprobar la misión: ' + err.message);
    }
  };

  const handleRechazar = async (id) => {
    try {
      await rechazarMision(id);
      setSuccess('Misión rechazada.');
      loadData();
    } catch (err) {
      setError('Error al rechazar la misión: ' + err.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/dashboard')} className="text-gray-500 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-3xl font-black uppercase tracking-tight">
            Gestionar <span className="text-[#FFD700]">Misiones</span>
          </h2>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setForm(emptyForm); }}
          className="flex items-center space-x-2 bg-gradient-to-r from-[#FFD700] to-[#D4AF37] text-black font-black text-xs uppercase tracking-widest px-5 py-3 rounded-xl shadow-[0_0_15px_rgba(255,215,0,0.3)] hover:shadow-[0_0_25px_rgba(255,215,0,0.5)] transition-all"
        >
          <Plus size={16} />
          <span>Nueva Misión</span>
        </button>
      </div>

      {error && <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-bold">{error}</div>}
      {success && <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-bold">{success}</div>}

      {/* Formulario de Misión */}
      {showForm && (
        <motion.form
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="glass-card rounded-2xl p-8 mb-10 space-y-6"
        >
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-black text-white uppercase tracking-tight">Crear Misión Educativa</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-2">Título de la Misión</label>
              <input value={form.titulo} onChange={e => handleChange('titulo', e.target.value)} required
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FFD700]/50" placeholder="Ej. Mejora tu defensa perimetral" />
            </div>
            <div className="col-span-2">
              <label className="block text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-2">Descripción</label>
              <textarea value={form.descripcion} onChange={e => handleChange('descripcion', e.target.value)} rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FFD700]/50 resize-none" placeholder="Instrucciones para el atleta..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-2">Pilar</label>
                <select value={form.pilar} onChange={e => handleChange('pilar', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FFD700]/50 appearance-none cursor-pointer">
                  {PILARES_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value} className="bg-[#121214]">{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-2">URL del Video (YouTube)</label>
                <input value={form.video_url} onChange={e => handleChange('video_url', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FFD700]/50" placeholder="https://www.youtube.com/watch?v=..." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-2">XP Recompensa</label>
                <input type="number" value={form.xp_recompensa} onChange={e => handleChange('xp_recompensa', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FFD700]/50" />
              </div>
              <div>
                <label className="block text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-2">Categoría Objetivo</label>
                <select value={form.categoria_objetivo} onChange={e => handleChange('categoria_objetivo', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FFD700]/50 appearance-none cursor-pointer">
                  {['Sub12', 'Sub15', 'Sub18', 'Femenino', 'Senior', 'Todos'].map(c => <option key={c} value={c} className="bg-[#121214]">{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Quiz Builder */}
          <div className="pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em]">Cuestionario de Verificación</p>
              <button type="button" onClick={addQuestion} className="text-[10px] text-[#FFD700] font-bold uppercase tracking-widest hover:text-white transition-colors">+ Agregar Pregunta</button>
            </div>
            {form.quiz.map((q, qi) => (
              <div key={qi} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 mb-3">
                <div className="flex justify-between items-start mb-3">
                  <label className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Pregunta {qi + 1}</label>
                  {form.quiz.length > 1 && (
                    <button type="button" onClick={() => removeQuestion(qi)} className="text-red-500/50 hover:text-red-400"><X size={14} /></button>
                  )}
                </div>
                <input value={q.pregunta} onChange={e => handleQuizChange(qi, 'pregunta', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:border-[#FFD700]/50" placeholder="¿Cuál es...?" />
                <div className="grid grid-cols-2 gap-2">
                  {q.opciones.map((op, oi) => (
                    <div key={oi} className="flex items-center space-x-2">
                      <input type="radio" name={`correct-${qi}`} checked={q.correcta === oi} onChange={() => handleQuizChange(qi, 'correcta', oi)}
                        className="accent-[#FFD700]" />
                      <input value={op} onChange={e => handleQuizChange(qi, `opcion_${oi}`, e.target.value)}
                        className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#FFD700]/50"
                        placeholder={`Opción ${String.fromCharCode(65 + oi)}`} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Asignar a Atletas */}
          <div className="pt-4 border-t border-white/10">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mb-4">Asignar a Atletas</p>
            <div className="grid grid-cols-2 gap-2">
              {atletas.map(a => (
                <button key={a.atleta_id} type="button" onClick={() => toggleAtleta(a.atleta_id)}
                  className={`flex items-center space-x-3 p-3 rounded-lg border text-left text-xs font-medium transition-all ${
                    form.asignar_a.includes(a.atleta_id)
                      ? 'bg-[#FFD700]/10 border-[#FFD700]/40 text-[#FFD700]'
                      : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                  }`}
                >
                  <span>{form.asignar_a.includes(a.atleta_id) ? '✓' : '○'}</span>
                  <span>{a.nombre} <span className="text-[9px] opacity-60">({a.categoria})</span></span>
                </button>
              ))}
            </div>
          </div>

          <button type="submit" disabled={saving}
            className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-[#FFD700] to-[#D4AF37] text-black font-black uppercase tracking-widest py-4 rounded-xl shadow-[0_0_20px_rgba(255,215,0,0.3)] disabled:opacity-50">
            <Save size={16} />
            <span>{saving ? 'Creando en Supabase...' : 'Crear Misión y Asignar'}</span>
          </button>
        </motion.form>
      )}

      {/* Panel de Aprobaciones Pendientes */}
      {pendientes.length > 0 && (
        <div className="mb-10">
          <h3 className="text-xl font-black text-white uppercase tracking-tight mb-4 flex items-center">
            <span className="w-2 h-2 rounded-full bg-[#FFD700] mr-2 animate-pulse"></span>
            Aprobaciones Pendientes
          </h3>
          <div className="space-y-3">
            {pendientes.map((p, i) => (
              <motion.div key={p.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="bg-white/5 border border-[#FFD700]/30 rounded-xl p-4 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-bold text-white">{p.misiones?.titulo}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                    Atleta: <span className="text-[#FFD700]">{p.atletas?.usuarios?.nombre}</span> ({p.atletas?.usuarios?.categoria})
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Completada el: {new Date(p.fecha_completada).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex space-x-2">
                  <button onClick={() => handleAprobar(p.id)} className="flex items-center space-x-1 px-3 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 rounded-lg transition-colors">
                    <CheckCircle size={14} />
                    <span className="text-xs font-bold uppercase">Aprobar (+{p.misiones?.xp_recompensa} XP)</span>
                  </button>
                  <button onClick={() => handleRechazar(p.id)} className="flex items-center space-x-1 px-3 py-2 bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 rounded-lg transition-colors">
                    <XCircle size={14} />
                    <span className="text-xs font-bold uppercase">Rechazar</span>
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de Misiones Existentes */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl font-black text-white uppercase tracking-tight">Banco de Misiones</h3>
      </div>
      <div className="mb-4">
        <input type="text" placeholder="Buscar misión por título..."
           value={busquedaMision} onChange={e => setBusquedaMision(e.target.value)}
           className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#FFD700]/50" />
      </div>
      <div className="space-y-3">
        {misionesFiltradas.map((mision, i) => (
          <motion.div key={mision.id}
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
            className="glass-card rounded-xl p-5 flex items-center justify-between glow-border"
          >
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 rounded-lg bg-[#FFD700]/10 border border-[#FFD700]/30 flex items-center justify-center shrink-0">
                <Play size={16} className="text-[#FFD700]" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">{mision.titulo}</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                  +{mision.xp_recompensa} XP · {PILAR_LABELS[mision.pilar] || mision.pilar} · {mision.categoria_objetivo} · {(mision.quiz || []).length} preguntas
                </p>
              </div>
            </div>
            <button onClick={() => handleDelete(mision)} className="text-gray-500 hover:text-red-500 transition-colors">
              <Trash2 size={16} />
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
