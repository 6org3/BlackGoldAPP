import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../api/supabaseClient';
import { calcularCategoriaFEB } from '../api/utilsAtletas';
import { aprobarMision, rechazarMision, aprobarAsignacion, rechazarAsignacion, setMisionActiva, actualizarMision } from '../api/misionesService';
import { Plus, Save, X, Play, Trash2, CheckCircle, XCircle, Power, ChevronDown, Pencil } from 'lucide-react';
import { PILAR_LABELS, PILARES_OPTIONS } from '../constants/pilares';
import { useAuth } from '../AuthContext';
import BotonVolver from './arcade/BotonVolver';

const PAGE_SIZE = 50;

export default function AdminMisiones() {
  const { user } = useAuth();
  const [misiones, setMisiones] = useState([]);
  const [totalMisiones, setTotalMisiones] = useState(0);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [atletas, setAtletas] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  // null = el form crea una misión nueva; un id = el form edita esa misión existente.
  const [editandoId, setEditandoId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [busquedaMision, setBusquedaMision] = useState('');
  const [filtroBanco, setFiltroBanco] = useState('todas'); // todas | activas | propuestas
  // Contexto de ejecución (v26): el chip 'casa'/'cancha' incluye las misiones 'ambos'
  // (comodín) — filtra "qué puede hacer el atleta ahí", no la etiqueta exacta.
  const [filtroContexto, setFiltroContexto] = useState('todos'); // todos | cancha | casa
  const [justifAbierta, setJustifAbierta] = useState(null); // id de misión con justificación expandida

  const misionesFiltradas = useMemo(() => misiones.filter(m => {
    if (busquedaMision && !m.titulo?.toLowerCase().includes(busquedaMision.toLowerCase())) return false;
    if (filtroBanco === 'activas' && m.activa === false) return false;
    if (filtroBanco === 'propuestas' && m.activa !== false) return false;
    if (filtroContexto !== 'todos' && m.contexto && m.contexto !== 'ambos' && m.contexto !== filtroContexto) return false;
    return true;
  }), [misiones, busquedaMision, filtroBanco, filtroContexto]);

  // H2 — dos colas sobre estado='pendiente_aprobacion', desambiguadas por `completada`:
  // completada=true  → el atleta la terminó, el coach aprueba el XP (flujo original).
  // completada=false → asignación PROPUESTA por el loop (auto_baremo/IA), el coach
  //                    decide si el atleta la ve (D4).
  const completadasPorAprobar = pendientes.filter(p => p.completada);
  const asignacionesPropuestas = pendientes.filter(p => !p.completada);

  const emptyForm = {
    titulo: '', descripcion: '', pilar: 'youtube', video_url: '',
    xp_recompensa: 50, categoria_objetivo: 'Sub18', contexto: 'ambos',
    quiz: [{ pregunta: '', opciones: ['', '', '', ''], correcta: 0 }],
    asignar_a: [],
  };
  const [form, setForm] = useState(emptyForm);

  // Banco paginado con búsqueda por título server-side (ilike): evita
  // re-descargar el catálogo completo a medida que crece.
  const cargarMisiones = useCallback(async (desde) => {
    if (desde > 0) setCargandoMas(true);
    // `,`, `(`, `)` y `%` tienen significado especial en los filtros de PostgREST
    const busqueda = busquedaMision.replace(/[,()%]/g, '').trim();
    let query = supabase
      .from('misiones')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(desde, desde + PAGE_SIZE - 1);
    if (busqueda) query = query.ilike('titulo', `%${busqueda}%`);
    const { data, count } = await query;
    setMisiones(prev => (desde === 0 ? (data || []) : [...prev, ...(data || [])]));
    setTotalMisiones(count || 0);
    setCargandoMas(false);
  }, [busquedaMision]);

  useEffect(() => {
    // Con búsqueda vacía es la carga inicial del banco; al tipear, debounce.
    const timer = setTimeout(() => { cargarMisiones(0); }, busquedaMision ? 300 : 0);
    return () => clearTimeout(timer);
  }, [cargarMisiones, busquedaMision]);

  const cargarAtletasYPendientes = useCallback(async () => {
    // Query ligera para el selector de atletas (solo nombre y categoría):
    // fetchTodosLosAtletas descargaba además todas las evaluaciones y el
    // readiness del club — payload innecesario en móvil.
    let atletasQuery = supabase
      .from('atletas')
      .select('id, usuarios!inner!atletas_usuario_id_fkey (nombre, categoria, categoria_feb, club, fecha_nacimiento)')
      .eq('usuarios.estado', 'activo')
      .order('id');
    if (user && user.rol !== 'superadmin' && user.club) {
      atletasQuery = atletasQuery.eq('usuarios.club', user.club);
    }
    if (user && user.rol === 'coach' && user.categoria && user.categoria !== 'Todas') {
      atletasQuery = atletasQuery.eq('usuarios.categoria_feb', user.categoria);
    }

    // Pendientes de aprobación (ambas colas: completadas por aprobar y
    // asignaciones propuestas por el loop — se separan por `completada` en render)
    const pendientesQuery = supabase
      .from('progreso_misiones')
      .select(`
        id,
        mision_id,
        completada,
        origen,
        sub_pilar_objetivo,
        fecha_completada,
        fecha_asignacion,
        misiones (titulo, xp_recompensa, nivel_objetivo, complejidad, is_ai_generated),
        atletas (id, usuarios!inner!atletas_usuario_id_fkey (nombre, categoria))
      `)
      .eq('estado', 'pendiente_aprobacion')
      .order('fecha_completada', { ascending: false, nullsFirst: false });

    const [{ data: atls }, { data: pData }] = await Promise.all([atletasQuery, pendientesQuery]);
    return { atls: atls || [], pData: pData || [] };
  }, [user]);

  useEffect(() => {
    let cancelado = false;
    cargarAtletasYPendientes().then(({ atls, pData }) => {
      if (cancelado) return;
      setAtletas(atls.filter(a => a.usuarios).map(a => ({
        atleta_id: a.id,
        nombre: a.usuarios.nombre,
        categoria: calcularCategoriaFEB(a.usuarios.fecha_nacimiento) || a.usuarios.categoria,
      })));
      setPendientes(pData);
    });
    return () => { cancelado = true; };
  }, [cargarAtletasYPendientes]);

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

  // Abre el form precargado para editar una misión existente (incluye contexto y
  // el link de YouTube, que VideoPlayer reproduce dentro de la app).
  const handleEditar = (mision) => {
    setEditandoId(mision.id);
    setForm({
      titulo: mision.titulo || '',
      descripcion: mision.descripcion || '',
      pilar: mision.pilar || 'youtube',
      video_url: mision.video_url || '',
      xp_recompensa: mision.xp_recompensa ?? 50,
      categoria_objetivo: mision.categoria_objetivo || 'Sub18',
      contexto: mision.contexto || 'ambos',
      quiz: (mision.quiz && mision.quiz.length) ? mision.quiz : [{ pregunta: '', opciones: ['', '', '', ''], correcta: 0 }],
      asignar_a: [],
    });
    setShowForm(true);
    setError('');
    setSuccess('');
  };

  const cerrarForm = () => {
    setShowForm(false);
    setEditandoId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    // Modo edición: actualiza la misión existente por id (no crea ni reasigna).
    if (editandoId) {
      try {
        await actualizarMision(editandoId, {
          titulo: form.titulo,
          descripcion: form.descripcion,
          pilar: form.pilar,
          video_url: form.video_url,
          xp_recompensa: parseInt(form.xp_recompensa),
          quiz: form.quiz.filter(q => q.pregunta.trim() !== ''),
          categoria_objetivo: form.categoria_objetivo,
          contexto: form.contexto || 'ambos',
        });
        setMisiones(prev => prev.map(m => m.id === editandoId ? {
          ...m, titulo: form.titulo, descripcion: form.descripcion, pilar: form.pilar,
          video_url: form.video_url, xp_recompensa: parseInt(form.xp_recompensa),
          quiz: form.quiz.filter(q => q.pregunta.trim() !== ''),
          categoria_objetivo: form.categoria_objetivo, contexto: form.contexto || 'ambos',
        } : m));
        setSuccess(`Misión "${form.titulo}" actualizada.`);
        cerrarForm();
      } catch (err) {
        setError(err.message || 'Error al actualizar la misión.');
      }
      setSaving(false);
      return;
    }

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
          contexto: form.contexto || 'ambos',
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
      cargarMisiones(0);
    } catch (err) {
      setError(err.message || 'Error al crear misión.');
    }
    setSaving(false);
  };

  // Tras cada acción se actualiza el estado local en vez de recargar todo
  // (loadData + banco completo): cada refetch descargaba el club entero.
  const handleDelete = async (mision) => {
    if (!confirm(`¿Eliminar la misión "${mision.titulo}"?`)) return;
    await supabase.from('progreso_misiones').delete().eq('mision_id', mision.id);
    await supabase.from('misiones').delete().eq('id', mision.id);
    setMisiones(prev => prev.filter(m => m.id !== mision.id));
    setTotalMisiones(prev => Math.max(0, prev - 1));
    setPendientes(prev => prev.filter(p => p.mision_id !== mision.id));
  };

  const handleAprobar = async (id) => {
    try {
      await aprobarMision(id);
      setSuccess('Misión aprobada correctamente. XP otorgada.');
      setPendientes(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      setError('Error al aprobar la misión: ' + err.message);
    }
  };

  const handleRechazar = async (id) => {
    if (!confirm('¿Rechazar esta misión completada? El atleta no recibirá el XP.')) return;
    try {
      await rechazarMision(id);
      setSuccess('Misión rechazada.');
      setPendientes(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      setError('Error al rechazar la misión: ' + err.message);
    }
  };

  const handleAprobarAsignacion = async (id) => {
    try {
      await aprobarAsignacion(id);
      setSuccess('Asignación aprobada. El atleta ya puede ver la misión.');
      setPendientes(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      setError('Error al aprobar la asignación: ' + err.message);
    }
  };

  const handleRechazarAsignacion = async (id) => {
    if (!confirm('¿Rechazar esta asignación propuesta? El atleta nunca la verá.')) return;
    try {
      await rechazarAsignacion(id);
      setSuccess('Asignación rechazada (el atleta nunca la verá).');
      setPendientes(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      setError('Error al rechazar la asignación: ' + err.message);
    }
  };

  const handleToggleActiva = async (mision) => {
    const nuevaActiva = mision.activa === false;
    try {
      await setMisionActiva(mision.id, nuevaActiva);
      setSuccess(nuevaActiva
        ? `Misión "${mision.titulo}" activada: entra al catálogo del selector.`
        : `Misión "${mision.titulo}" desactivada: sale del catálogo.`);
      setMisiones(prev => prev.map(m => (m.id === mision.id ? { ...m, activa: nuevaActiva } : m)));
    } catch (err) {
      setError('Error al cambiar el estado de la misión: ' + err.message);
    }
  };

  const ORIGEN_BADGE = {
    auto_baremo: { label: 'Por evaluación', cls: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
    ia: { label: 'IA', cls: 'bg-mental/10 text-mental-soft border-mental/30' },
    coach: { label: 'Coach', cls: 'bg-gray-500/10 text-fg-secondary border-gray-500/30' },
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
        <div className="flex items-center space-x-4">
          <BotonVolver />
          <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">
            Gestionar <span className="text-brand">Misiones</span>
          </h2>
        </div>
        <button
          onClick={() => { if (showForm) { cerrarForm(); } else { setEditandoId(null); setForm(emptyForm); setShowForm(true); } }}
          className="flex items-center space-x-2 bg-gradient-to-r from-brand to-brand-strong text-black font-black text-xs uppercase tracking-widest px-5 py-3 rounded-control shadow-[0_0_15px_rgba(255,215,0,0.3)] hover:shadow-[0_0_25px_rgba(255,215,0,0.5)] transition"
        >
          <Plus size={16} />
          <span>Nueva Misión</span>
        </button>
      </div>

      {error && <div className="mb-6 p-4 rounded-control bg-danger/10 border border-danger/30 text-danger-soft text-sm font-bold">{error}</div>}
      {success && <div className="mb-6 p-4 rounded-control bg-success/10 border border-success/30 text-success-soft text-sm font-bold">{success}</div>}

      {/* Formulario de Misión */}
      {showForm && (
        <motion.form
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="glass-card rounded-panel p-4 sm:p-8 mb-10 space-y-6"
        >
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-black text-white uppercase tracking-tight">{editandoId ? 'Editar Misión' : 'Crear Misión Educativa'}</h3>
            <button type="button" onClick={cerrarForm} aria-label="Cerrar formulario" className="p-2 -m-2 text-fg-muted hover:text-white"><X size={18} /></button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-[11px] text-fg-secondary font-bold uppercase tracking-widest mb-2">Título de la Misión</label>
              <input value={form.titulo} onChange={e => handleChange('titulo', e.target.value)} required
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/50" placeholder="Ej. Mejora tu defensa perimetral" />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] text-fg-secondary font-bold uppercase tracking-widest mb-2">Descripción</label>
              <textarea value={form.descripcion} onChange={e => handleChange('descripcion', e.target.value)} rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/50 resize-none" placeholder="Instrucciones para el atleta..." />
            </div>
            <div className="col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] text-fg-secondary font-bold uppercase tracking-widest mb-2">Pilar</label>
                <select value={form.pilar} onChange={e => handleChange('pilar', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/50 appearance-none cursor-pointer">
                  {PILARES_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value} className="bg-surface-card">{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-fg-secondary font-bold uppercase tracking-widest mb-2">URL del Video (YouTube)</label>
                <input value={form.video_url} onChange={e => handleChange('video_url', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/50" placeholder="https://www.youtube.com/watch?v=..." />
              </div>
            </div>
            <div className="col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] text-fg-secondary font-bold uppercase tracking-widest mb-2">XP Recompensa</label>
                <input type="number" inputMode="numeric" min="0" value={form.xp_recompensa} onChange={e => handleChange('xp_recompensa', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/50" />
              </div>
              <div>
                <label className="block text-[11px] text-fg-secondary font-bold uppercase tracking-widest mb-2">Categoría Objetivo</label>
                <select value={form.categoria_objetivo} onChange={e => handleChange('categoria_objetivo', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/50 appearance-none cursor-pointer">
                  {['Sub12', 'Sub15', 'Sub18', 'Femenino', 'Senior', 'Todos'].map(c => <option key={c} value={c} className="bg-surface-card">{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-fg-secondary font-bold uppercase tracking-widest mb-2">Contexto</label>
                <select value={form.contexto} onChange={e => handleChange('contexto', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/50 appearance-none cursor-pointer">
                  <option value="ambos" className="bg-surface-card">Ambos (cancha o casa)</option>
                  <option value="cancha" className="bg-surface-card">Cancha</option>
                  <option value="casa" className="bg-surface-card">Casa</option>
                </select>
              </div>
            </div>
          </div>

          {/* Quiz Builder */}
          <div className="pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-4">
              <p className="text-2xs text-fg-muted font-bold uppercase tracking-eyebrow">Cuestionario de Verificación</p>
              <button type="button" onClick={addQuestion} className="text-2xs text-brand font-bold uppercase tracking-widest hover:text-white transition-colors">+ Agregar Pregunta</button>
            </div>
            {form.quiz.map((q, qi) => (
              <div key={qi} className="bg-white/[0.02] border border-white/5 rounded-control p-4 mb-3">
                <div className="flex justify-between items-start mb-3">
                  <label className="text-[11px] text-fg-secondary font-bold uppercase tracking-widest">Pregunta {qi + 1}</label>
                  {form.quiz.length > 1 && (
                    <button type="button" onClick={() => removeQuestion(qi)} aria-label="Quitar pregunta" className="p-2 -m-2 text-danger/50 hover:text-danger-soft"><X size={14} /></button>
                  )}
                </div>
                <input value={q.pregunta} onChange={e => handleQuizChange(qi, 'pregunta', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:border-brand/50" placeholder="¿Cuál es...?" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {q.opciones.map((op, oi) => (
                    <div key={oi} className="flex items-center space-x-2">
                      <input type="radio" name={`correct-${qi}`} checked={q.correcta === oi} onChange={() => handleQuizChange(qi, 'correcta', oi)}
                        className="w-5 h-5 shrink-0 accent-brand" />
                      <input value={op} onChange={e => handleQuizChange(qi, `opcion_${oi}`, e.target.value)}
                        className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-brand/50"
                        placeholder={`Opción ${String.fromCharCode(65 + oi)}`} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Asignar a Atletas (solo al crear; al editar no se reasigna) */}
          {!editandoId && (
          <div className="pt-4 border-t border-white/10">
            <p className="text-2xs text-fg-muted font-bold uppercase tracking-eyebrow mb-4">Asignar a Atletas</p>
            <div className="grid grid-cols-2 gap-2">
              {atletas.map(a => (
                <button key={a.atleta_id} type="button" onClick={() => toggleAtleta(a.atleta_id)}
                  className={`flex items-center space-x-3 p-3 rounded-lg border text-left text-xs font-medium transition ${
                    form.asignar_a.includes(a.atleta_id)
                      ? 'bg-brand/10 border-brand/40 text-brand'
                      : 'bg-white/[0.02] border-white/10 text-fg-secondary hover:text-white hover:border-white/20'
                  }`}
                >
                  <span>{form.asignar_a.includes(a.atleta_id) ? '✓' : '○'}</span>
                  <span>{a.nombre} <span className="text-3xs opacity-60">({a.categoria})</span></span>
                </button>
              ))}
            </div>
          </div>
          )}

          <button type="submit" disabled={saving}
            className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-brand to-brand-strong text-black font-black uppercase tracking-widest py-4 rounded-control shadow-[0_0_20px_rgba(255,215,0,0.3)] disabled:opacity-50">
            <Save size={16} />
            <span>{saving ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Crear Misión y Asignar'}</span>
          </button>
        </motion.form>
      )}

      {/* Cola A — Misiones completadas por el atleta, esperando aprobación de XP */}
      {completadasPorAprobar.length > 0 && (
        <div className="mb-10">
          <h3 className="text-xl font-black text-white uppercase tracking-tight mb-4 flex items-center">
            <span className="w-2 h-2 rounded-full bg-brand mr-2 animate-pulse"></span>
            Completadas por Aprobar
          </h3>
          <div className="space-y-3">
            {completadasPorAprobar.map((p, i) => (
              <motion.div key={p.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.04 }}
                className="bg-white/5 border border-brand/30 rounded-control p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-bold text-white">{p.misiones?.titulo}</p>
                  <p className="text-2xs text-fg-secondary font-bold uppercase tracking-widest mt-1">
                    Atleta: <span className="text-brand">{p.atletas?.usuarios?.nombre}</span> ({p.atletas?.usuarios?.categoria})
                  </p>
                  <p className="text-2xs text-fg-muted mt-1">
                    Completada el: {p.fecha_completada ? new Date(p.fecha_completada).toLocaleDateString() : '—'}
                  </p>
                </div>
                <div className="flex gap-3 w-full sm:w-auto">
                  <button onClick={() => handleAprobar(p.id)} className="flex-1 sm:flex-initial flex items-center justify-center space-x-1 px-4 py-3 min-h-11 bg-success/10 text-success-soft border border-success/30 hover:bg-success/20 rounded-control transition-colors">
                    <CheckCircle size={16} />
                    <span className="text-sm font-bold uppercase">Aprobar (+{p.misiones?.xp_recompensa} XP)</span>
                  </button>
                  <button onClick={() => handleRechazar(p.id)} className="flex-1 sm:flex-initial flex items-center justify-center space-x-1 px-4 py-3 min-h-11 bg-danger/10 text-danger-soft border border-danger/30 hover:bg-danger/20 rounded-control transition-colors">
                    <XCircle size={16} />
                    <span className="text-sm font-bold uppercase">Rechazar</span>
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Cola B — Asignaciones propuestas por el loop (auto_baremo/IA): el coach
          decide si el atleta las ve (D4). Sin XP en juego aquí. */}
      {asignacionesPropuestas.length > 0 && (
        <div className="mb-10">
          <h3 className="text-xl font-black text-white uppercase tracking-tight mb-4 flex items-center">
            <span className="w-2 h-2 rounded-full bg-cyan-400 mr-2 animate-pulse"></span>
            Asignaciones Propuestas
          </h3>
          <div className="space-y-3">
            {asignacionesPropuestas.map((p, i) => {
              const badge = ORIGEN_BADGE[p.origen] || ORIGEN_BADGE.coach;
              return (
                <motion.div key={p.id}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.04 }}
                  className="bg-white/5 border border-cyan-500/30 rounded-control p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-white">{p.misiones?.titulo}</p>
                      <span className={`px-2 py-0.5 rounded-md text-3xs font-black uppercase tracking-widest border ${badge.cls}`}>{badge.label}</span>
                      {p.sub_pilar_objetivo && (
                        <span className="px-2 py-0.5 rounded-md text-3xs font-black uppercase tracking-widest border bg-caution/10 text-caution-soft border-caution/30">
                          Objetivo: {p.sub_pilar_objetivo}
                        </span>
                      )}
                    </div>
                    <p className="text-2xs text-fg-secondary font-bold uppercase tracking-widest mt-1">
                      Atleta: <span className="text-brand">{p.atletas?.usuarios?.nombre}</span> ({p.atletas?.usuarios?.categoria})
                    </p>
                    <p className="text-2xs text-fg-muted mt-1">
                      Propuesta el: {p.fecha_asignacion ? new Date(p.fecha_asignacion).toLocaleDateString() : '—'}
                    </p>
                  </div>
                  <div className="flex gap-3 w-full sm:w-auto">
                    <button onClick={() => handleAprobarAsignacion(p.id)} className="flex-1 sm:flex-initial flex items-center justify-center space-x-1 px-4 py-3 min-h-11 bg-success/10 text-success-soft border border-success/30 hover:bg-success/20 rounded-control transition-colors">
                      <CheckCircle size={16} />
                      <span className="text-sm font-bold uppercase">Aprobar</span>
                    </button>
                    <button onClick={() => handleRechazarAsignacion(p.id)} className="flex-1 sm:flex-initial flex items-center justify-center space-x-1 px-4 py-3 min-h-11 bg-danger/10 text-danger-soft border border-danger/30 hover:bg-danger/20 rounded-control transition-colors">
                      <XCircle size={16} />
                      <span className="text-sm font-bold uppercase">Rechazar</span>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Banco de Misiones — con curaduría del catálogo (D3): las misiones
          propuestas por el MCP/IA nacen inactivas hasta que el coach las active. */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h3 className="text-xl font-black text-white uppercase tracking-tight">Banco de Misiones</h3>
        <div className="flex flex-wrap gap-1 items-center">
          {[['todas', 'Todas'], ['activas', 'Activas'], ['propuestas', 'Propuestas']].map(([id, label]) => (
            <button key={id} onClick={() => setFiltroBanco(id)}
              className={`inline-flex items-center min-h-11 md:min-h-9 px-3.5 rounded-lg text-2xs font-black uppercase tracking-widest border transition ${
                filtroBanco === id
                  ? 'bg-brand/15 border-brand/40 text-brand'
                  : 'bg-white/[0.02] border-white/10 text-fg-muted hover:text-white'
              }`}>
              {label}
            </button>
          ))}
          <span className="w-px h-5 bg-white/10 mx-1" />
          {[['todos', 'Todo lugar'], ['cancha', 'Cancha'], ['casa', 'Casa']].map(([id, label]) => (
            <button key={id} onClick={() => setFiltroContexto(id)}
              className={`inline-flex items-center min-h-11 md:min-h-9 px-3.5 rounded-lg text-2xs font-black uppercase tracking-widest border transition ${
                filtroContexto === id
                  ? 'bg-brand/15 border-brand/40 text-brand'
                  : 'bg-white/[0.02] border-white/10 text-fg-muted hover:text-white'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <input type="text" placeholder="Buscar misión por título..."
           value={busquedaMision} onChange={e => setBusquedaMision(e.target.value)}
           className="w-full bg-black/40 border border-white/10 rounded-control px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand/50" />
      </div>
      <div className="space-y-3">
        {misionesFiltradas.map((mision, i) => (
          <motion.div key={mision.id}
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}
            className={`glass-card rounded-control p-5 glow-border ${mision.activa === false ? 'opacity-70' : ''}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-4 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-brand/10 border border-brand/30 flex items-center justify-center shrink-0">
                  <Play size={16} className="text-brand" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-white">{mision.titulo}</p>
                    {mision.activa === false && (
                      <span className="px-2 py-0.5 rounded-md text-3xs font-black uppercase tracking-widest border bg-gray-500/10 text-fg-secondary border-gray-500/30">Propuesta</span>
                    )}
                    {mision.is_ai_generated && (
                      <span className="px-2 py-0.5 rounded-md text-3xs font-black uppercase tracking-widest border bg-mental/10 text-mental-soft border-mental/30">IA</span>
                    )}
                    {mision.complejidad && (
                      <span className="px-2 py-0.5 rounded-md text-3xs font-black uppercase tracking-widest border bg-cyan-500/10 text-cyan-400 border-cyan-500/30">{mision.complejidad}</span>
                    )}
                    {mision.nivel_objetivo && (
                      <span className="px-2 py-0.5 rounded-md text-3xs font-black uppercase tracking-widest border bg-caution/10 text-caution-soft border-caution/30">{mision.nivel_objetivo}</span>
                    )}
                    {mision.categoria_bucket && (
                      <span className="px-2 py-0.5 rounded-md text-3xs font-black uppercase tracking-widest border bg-success/10 text-success-soft border-success/30">{mision.categoria_bucket}</span>
                    )}
                    {mision.contexto && mision.contexto !== 'ambos' && (
                      <span className="px-2 py-0.5 rounded-md text-3xs font-black uppercase tracking-widest border bg-brand/10 text-brand border-brand/30">{mision.contexto === 'casa' ? 'Casa' : 'Cancha'}</span>
                    )}
                    {mision.fase_temporada && (
                      <span className="px-2 py-0.5 rounded-md text-3xs font-black uppercase tracking-widest border bg-white/[0.04] text-fg-secondary border-white/15">{mision.fase_temporada}</span>
                    )}
                  </div>
                  <p className="text-2xs text-fg-secondary font-bold uppercase tracking-widest mt-1">
                    +{mision.xp_recompensa} XP · {PILAR_LABELS[mision.pilar] || mision.pilar} · {mision.categoria_objetivo || '—'} · {(mision.quiz || []).length} preguntas
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                {mision.justificacion && (
                  <button onClick={() => setJustifAbierta(justifAbierta === mision.id ? null : mision.id)}
                    aria-label="Ver justificación"
                    className={`p-2 rounded-lg border transition-colors ${justifAbierta === mision.id ? 'bg-brand/10 border-brand/40 text-brand' : 'bg-white/[0.02] border-white/10 text-fg-muted hover:text-white'}`}
                    title="Ver justificación científica">
                    <ChevronDown size={14} className={justifAbierta === mision.id ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>
                )}
                <button onClick={() => handleEditar(mision)} aria-label="Editar misión"
                  className="p-2 rounded-lg border bg-white/[0.02] border-white/10 text-fg-muted hover:text-brand transition-colors"
                  title="Editar (contexto, link de YouTube, pilar, texto…)">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleToggleActiva(mision)}
                  className={`flex items-center space-x-1 px-3 py-2 rounded-lg border transition-colors ${
                    mision.activa === false
                      ? 'bg-success/10 text-success-soft border-success/30 hover:bg-success/20'
                      : 'bg-white/[0.02] text-fg-secondary border-white/10 hover:text-white'
                  }`}
                  title={mision.activa === false ? 'Activar (entra al catálogo del selector)' : 'Desactivar (sale del catálogo)'}>
                  <Power size={14} />
                  <span className="text-2xs font-bold uppercase">{mision.activa === false ? 'Activar' : 'Activa'}</span>
                </button>
                <button onClick={() => handleDelete(mision)} aria-label="Eliminar misión" className="p-2 -m-1 text-fg-muted hover:text-danger transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            {justifAbierta === mision.id && mision.justificacion && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-3xs text-brand font-bold uppercase tracking-widest mb-1">Justificación científica</p>
                <p className="text-xs text-gray-300 leading-relaxed">{mision.justificacion}</p>
              </div>
            )}
          </motion.div>
        ))}
      </div>
      {misiones.length < totalMisiones && (
        <button onClick={() => cargarMisiones(misiones.length)} disabled={cargandoMas}
          className="w-full mt-4 py-3 min-h-11 rounded-control border border-white/10 bg-white/[0.02] text-fg-secondary hover:text-white text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50">
          {cargandoMas ? 'Cargando...' : `Cargar más (${misiones.length} de ${totalMisiones})`}
        </button>
      )}
    </div>
  );
}
