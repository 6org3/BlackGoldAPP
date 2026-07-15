import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../api/supabaseClient';
import { calcularCategoriaFEB } from '../api/utilsAtletas';
import { aprobarMision, rechazarMision, aprobarAsignacion, rechazarAsignacion, setMisionActiva, actualizarMision } from '../api/misionesService';
import { ArrowLeft, Plus, Save, X, Play, Trash2, CheckCircle, XCircle, Power, ChevronDown, Pencil } from 'lucide-react';
import { PILAR_LABELS, PILARES_OPTIONS } from '../constants/pilares';
import { useAuth } from '../AuthContext';
import useVolverAlHome from '../hooks/useVolverAlHome';
import HexAvatar from './arcade/HexAvatar';
import MicroLabel from './arcade/MicroLabel';
import ModalHUD from './arcade/ModalHUD';
import LiveDot from './arcade/LiveDot';
import ActionButton from './AdminAtletasActionButton';
import { C, BORDER, GRAD, TINT, cut } from './arcade/arcadeTokens';

const PAGE_SIZE = 50;

// Campo del Formulario-HUD (§6.3): arcade-input + esquina cortada + foco dorado.
const FIELD_CLASS = 'cut-focus arcade-input w-full min-h-11 md:min-h-9 px-4 py-2.5 text-sm border border-white/10 focus:outline-none focus:border-brand/60 transition-colors';
const fieldStyle = { clipPath: cut(7), background: C.cardAlt1, color: C.text };

// Badge de metadato: tinte neutro + borde/texto del color semántico (el color
// nunca es la única señal; cada badge lleva su propia etiqueta de texto).
const badgeStyle = (color) => ({
  clipPath: cut(5),
  background: C.cardAlt1,
  border: `1px solid ${color}`,
  color,
});

// Chip de filtro del banco: activo = oro, inactivo = neutro.
const chipStyle = (on) => ({
  clipPath: cut(7),
  background: on ? TINT.gold : C.card,
  border: `1px solid ${on ? BORDER.goldStrong : BORDER.neutral}`,
  color: on ? C.gold : C.text3,
});

export default function AdminMisiones() {
  const { user } = useAuth();
  const volver = useVolverAlHome();
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
  // Diálogo HUD activo (reemplaza los confirm() nativos): null | props de ModalHUD.
  // `onConfirm` no cierra solo — cada acción cierra y luego ejecuta.
  const [dialogo, setDialogo] = useState(null);

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
  const handleDelete = (mision) => {
    setDialogo({
      tone: 'danger',
      icon: Trash2,
      eyebrow: 'Acción destructiva',
      title: 'Eliminar misión',
      message: `¿Eliminar "${mision.titulo}"? También se borra el progreso de los atletas que la tengan asignada.`,
      confirmLabel: 'Eliminar',
      onConfirm: async () => {
        setDialogo(null);
        await supabase.from('progreso_misiones').delete().eq('mision_id', mision.id);
        await supabase.from('misiones').delete().eq('id', mision.id);
        setMisiones(prev => prev.filter(m => m.id !== mision.id));
        setTotalMisiones(prev => Math.max(0, prev - 1));
        setPendientes(prev => prev.filter(p => p.mision_id !== mision.id));
      },
    });
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

  const handleRechazar = (id) => {
    setDialogo({
      tone: 'danger',
      icon: XCircle,
      eyebrow: 'El atleta no recibe XP',
      title: 'Rechazar misión completada',
      message: 'El atleta la marcó como hecha, pero no se le otorgará el XP.',
      confirmLabel: 'Rechazar',
      onConfirm: async () => {
        setDialogo(null);
        try {
          await rechazarMision(id);
          setSuccess('Misión rechazada.');
          setPendientes(prev => prev.filter(p => p.id !== id));
        } catch (err) {
          setError('Error al rechazar la misión: ' + err.message);
        }
      },
    });
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

  const handleRechazarAsignacion = (id) => {
    setDialogo({
      tone: 'danger',
      icon: XCircle,
      eyebrow: 'El atleta nunca la verá',
      title: 'Rechazar asignación propuesta',
      message: 'La propuesta se descarta: esta misión no llegará al atleta.',
      confirmLabel: 'Rechazar',
      onConfirm: async () => {
        setDialogo(null);
        try {
          await rechazarAsignacion(id);
          setSuccess('Asignación rechazada (el atleta nunca la verá).');
          setPendientes(prev => prev.filter(p => p.id !== id));
        } catch (err) {
          setError('Error al rechazar la asignación: ' + err.message);
        }
      },
    });
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

  // Origen de la propuesta: color semántico Arcade (antes cyan/mental/gray crudos).
  const ORIGEN_BADGE = {
    auto_baremo: { label: 'Por evaluación', color: C.cyan },
    ia: { label: 'IA', color: C.ai },
    coach: { label: 'Coach', color: C.text3 },
  };

  return (
    <div className="max-w-4xl mx-auto" style={{ color: C.text }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
        <div className="flex items-center space-x-4">
          <button onClick={volver} aria-label="Volver al inicio" className="p-2 -m-2 text-fg-muted hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <HexAvatar size={44} background={GRAD.goldHex} color={C.ink}>
            <Play size={20} strokeWidth={2.5} />
          </HexAvatar>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight" style={{ color: C.text }}>
              Gestionar <span style={{ color: C.gold }}>Misiones</span>
            </h2>
            <MicroLabel style={{ marginTop: 4 }}>Catálogo · Aprobaciones · Asignación</MicroLabel>
          </div>
        </div>
        <button
          onClick={() => { if (showForm) { cerrarForm(); } else { setEditandoId(null); setForm(emptyForm); setShowForm(true); } }}
          className="cut-focus flex items-center justify-center gap-2 min-h-11 px-5 text-xs font-black uppercase tracking-widest transition active:scale-[0.99]"
          style={{ clipPath: cut(8), background: GRAD.goldCTA, color: C.ink, border: 'none' }}
        >
          <Plus size={16} />
          <span>Nueva Misión</span>
        </button>
      </div>

      {error && <div role="alert" className="mb-6 p-4 text-sm font-bold" style={{ clipPath: cut(8), background: TINT.danger, border: `1px solid ${BORDER.danger}`, color: C.danger }}>{error}</div>}
      {success && <div role="status" className="mb-6 p-4 text-sm font-bold" style={{ clipPath: cut(8), background: TINT.ok, border: `1px solid ${BORDER.okStrong}`, color: C.ok }}>{success}</div>}

      {/* Formulario de Misión */}
      {showForm && (
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onSubmit={handleSubmit}
          className="p-4 sm:p-8 mb-10 space-y-6"
          style={{ clipPath: cut(12), background: C.card, border: `1px solid ${BORDER.neutral}` }}
        >
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-black text-white uppercase tracking-tight">{editandoId ? 'Editar Misión' : 'Crear Misión Educativa'}</h3>
            <button type="button" onClick={cerrarForm} aria-label="Cerrar formulario" className="p-2 -m-2 text-fg-muted hover:text-white"><X size={18} /></button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-[11px] text-fg-secondary font-bold uppercase tracking-widest mb-2">Título de la Misión</label>
              <input value={form.titulo} onChange={e => handleChange('titulo', e.target.value)} required
                className={FIELD_CLASS} style={fieldStyle} placeholder="Ej. Mejora tu defensa perimetral" />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] text-fg-secondary font-bold uppercase tracking-widest mb-2">Descripción</label>
              <textarea value={form.descripcion} onChange={e => handleChange('descripcion', e.target.value)} rows={2}
                className={`${FIELD_CLASS} resize-none`} style={fieldStyle} placeholder="Instrucciones para el atleta..." />
            </div>
            <div className="col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] text-fg-secondary font-bold uppercase tracking-widest mb-2">Pilar</label>
                <select value={form.pilar} onChange={e => handleChange('pilar', e.target.value)}
                  className={`${FIELD_CLASS} appearance-none cursor-pointer`} style={fieldStyle}>
                  {PILARES_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value} className="bg-surface-card">{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-fg-secondary font-bold uppercase tracking-widest mb-2">URL del Video (YouTube)</label>
                <input value={form.video_url} onChange={e => handleChange('video_url', e.target.value)}
                  className={FIELD_CLASS} style={fieldStyle} placeholder="https://www.youtube.com/watch?v=..." />
              </div>
            </div>
            <div className="col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] text-fg-secondary font-bold uppercase tracking-widest mb-2">XP Recompensa</label>
                <input type="number" inputMode="numeric" min="0" value={form.xp_recompensa} onChange={e => handleChange('xp_recompensa', e.target.value)}
                  className={FIELD_CLASS} style={fieldStyle} />
              </div>
              <div>
                <label className="block text-[11px] text-fg-secondary font-bold uppercase tracking-widest mb-2">Categoría Objetivo</label>
                <select value={form.categoria_objetivo} onChange={e => handleChange('categoria_objetivo', e.target.value)}
                  className={`${FIELD_CLASS} appearance-none cursor-pointer`} style={fieldStyle}>
                  {['Sub12', 'Sub15', 'Sub18', 'Femenino', 'Senior', 'Todos'].map(c => <option key={c} value={c} className="bg-surface-card">{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-fg-secondary font-bold uppercase tracking-widest mb-2">Contexto</label>
                <select value={form.contexto} onChange={e => handleChange('contexto', e.target.value)}
                  className={`${FIELD_CLASS} appearance-none cursor-pointer`} style={fieldStyle}>
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
              <div key={qi} className="p-4 mb-3" style={{ clipPath: cut(8), background: C.cardAlt1, border: `1px solid ${BORDER.neutralFaint}` }}>
                <div className="flex justify-between items-start mb-3">
                  <label className="text-[11px] text-fg-secondary font-bold uppercase tracking-widest">Pregunta {qi + 1}</label>
                  {form.quiz.length > 1 && (
                    <button type="button" onClick={() => removeQuestion(qi)} aria-label="Quitar pregunta" className="p-2 -m-2 text-danger/50 hover:text-danger-soft"><X size={14} /></button>
                  )}
                </div>
                <input value={q.pregunta} onChange={e => handleQuizChange(qi, 'pregunta', e.target.value)}
                  className={`${FIELD_CLASS} mb-3`} style={fieldStyle} placeholder="¿Cuál es...?" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {q.opciones.map((op, oi) => (
                    <div key={oi} className="flex items-center space-x-2">
                      <input type="radio" name={`correct-${qi}`} checked={q.correcta === oi} onChange={() => handleQuizChange(qi, 'correcta', oi)}
                        className="w-5 h-5 shrink-0 accent-brand" />
                      <input value={op} onChange={e => handleQuizChange(qi, `opcion_${oi}`, e.target.value)}
                        className="cut-focus arcade-input flex-1 min-h-11 md:min-h-9 px-3 text-xs border border-white/10 focus:outline-none focus:border-brand/60 transition-colors"
                        style={fieldStyle}
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
                  className="cut-focus flex items-center space-x-3 p-3 min-h-11 text-left text-xs font-medium transition-colors"
                  style={chipStyle(form.asignar_a.includes(a.atleta_id))}
                >
                  <span>{form.asignar_a.includes(a.atleta_id) ? '✓' : '○'}</span>
                  <span>{a.nombre} <span className="text-3xs opacity-60">({a.categoria})</span></span>
                </button>
              ))}
            </div>
          </div>
          )}

          <button type="submit" disabled={saving}
            className="cut-focus w-full flex items-center justify-center gap-2 min-h-11 py-3.5 font-black uppercase tracking-widest transition disabled:opacity-50 active:scale-[0.99]"
            style={{ clipPath: cut(10), background: GRAD.goldCTA, color: C.ink, border: 'none' }}>
            <Save size={16} />
            <span>{saving ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Crear Misión y Asignar'}</span>
          </button>
        </motion.form>
      )}

      {/* Cola A — Misiones completadas por el atleta, esperando aprobación de XP */}
      {completadasPorAprobar.length > 0 && (
        <div className="mb-10">
          <h3 className="text-xl font-black text-white uppercase tracking-tight mb-4 flex items-center">
            <LiveDot color={C.gold} style={{ marginRight: 8 }} />
            Completadas por Aprobar
          </h3>
          <div className="space-y-3">
            {completadasPorAprobar.map((p, i) => (
              <motion.div key={p.id}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 10) * 0.04 }}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                style={{ clipPath: cut(8), background: C.card, border: `1px solid ${BORDER.goldMid}` }}
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
                  <button onClick={() => handleAprobar(p.id)} className="cut-focus flex-1 sm:flex-initial flex items-center justify-center space-x-1 px-4 py-3 min-h-11 transition-colors" style={{ clipPath: cut(7), background: TINT.ok, border: `1px solid ${BORDER.okStrong}`, color: C.ok }}>
                    <CheckCircle size={16} />
                    <span className="text-sm font-bold uppercase">Aprobar (+{p.misiones?.xp_recompensa} XP)</span>
                  </button>
                  <button onClick={() => handleRechazar(p.id)} className="cut-focus flex-1 sm:flex-initial flex items-center justify-center space-x-1 px-4 py-3 min-h-11 transition-colors" style={{ clipPath: cut(7), background: TINT.danger, border: `1px solid ${BORDER.danger}`, color: C.danger }}>
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
            <LiveDot color={C.cyan} style={{ marginRight: 8 }} />
            Asignaciones Propuestas
          </h3>
          <div className="space-y-3">
            {asignacionesPropuestas.map((p, i) => {
              const badge = ORIGEN_BADGE[p.origen] || ORIGEN_BADGE.coach;
              return (
                <motion.div key={p.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 10) * 0.04 }}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  style={{ clipPath: cut(8), background: C.card, border: `1px solid ${BORDER.cyan}` }}
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-white">{p.misiones?.titulo}</p>
                      <span className="px-2 py-0.5 text-3xs font-black uppercase tracking-widest" style={badgeStyle(badge.color)}>{badge.label}</span>
                      {p.sub_pilar_objetivo && (
                        <span className="px-2 py-0.5 text-3xs font-black uppercase tracking-widest" style={badgeStyle(C.warn)}>
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
                    <button onClick={() => handleAprobarAsignacion(p.id)} className="cut-focus flex-1 sm:flex-initial flex items-center justify-center space-x-1 px-4 py-3 min-h-11 transition-colors" style={{ clipPath: cut(7), background: TINT.ok, border: `1px solid ${BORDER.okStrong}`, color: C.ok }}>
                      <CheckCircle size={16} />
                      <span className="text-sm font-bold uppercase">Aprobar</span>
                    </button>
                    <button onClick={() => handleRechazarAsignacion(p.id)} className="cut-focus flex-1 sm:flex-initial flex items-center justify-center space-x-1 px-4 py-3 min-h-11 transition-colors" style={{ clipPath: cut(7), background: TINT.danger, border: `1px solid ${BORDER.danger}`, color: C.danger }}>
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
              className="cut-focus inline-flex items-center min-h-11 md:min-h-9 px-3.5 text-2xs font-black uppercase tracking-widest transition-colors"
              style={chipStyle(filtroBanco === id)}>
              {label}
            </button>
          ))}
          <span className="w-px h-5 bg-white/10 mx-1" />
          {[['todos', 'Todo lugar'], ['cancha', 'Cancha'], ['casa', 'Casa']].map(([id, label]) => (
            <button key={id} onClick={() => setFiltroContexto(id)}
              className="cut-focus inline-flex items-center min-h-11 md:min-h-9 px-3.5 text-2xs font-black uppercase tracking-widest transition-colors"
              style={chipStyle(filtroContexto === id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <input type="text" placeholder="Buscar misión por título..."
           value={busquedaMision} onChange={e => setBusquedaMision(e.target.value)}
           className={FIELD_CLASS} style={fieldStyle} />
      </div>
      <div className="space-y-3">
        {misionesFiltradas.map((mision, i) => (
          <motion.div key={mision.id}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 10) * 0.03 }}
            className={`p-5 border border-white/5 glow-border ${mision.activa === false ? 'opacity-70' : ''}`}
            style={{ clipPath: cut(10), background: C.card }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-4 min-w-0">
                <HexAvatar size={40} background={TINT.gold} color={C.gold}>
                  <Play size={16} />
                </HexAvatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-white">{mision.titulo}</p>
                    {mision.activa === false && (
                      <span className="px-2 py-0.5 text-3xs font-black uppercase tracking-widest" style={badgeStyle(C.text3)}>Propuesta</span>
                    )}
                    {mision.is_ai_generated && (
                      <span className="px-2 py-0.5 text-3xs font-black uppercase tracking-widest" style={badgeStyle(C.ai)}>IA</span>
                    )}
                    {mision.complejidad && (
                      <span className="px-2 py-0.5 text-3xs font-black uppercase tracking-widest" style={badgeStyle(C.cyan)}>{mision.complejidad}</span>
                    )}
                    {mision.nivel_objetivo && (
                      <span className="px-2 py-0.5 text-3xs font-black uppercase tracking-widest" style={badgeStyle(C.warn)}>{mision.nivel_objetivo}</span>
                    )}
                    {mision.categoria_bucket && (
                      <span className="px-2 py-0.5 text-3xs font-black uppercase tracking-widest" style={badgeStyle(C.ok)}>{mision.categoria_bucket}</span>
                    )}
                    {mision.contexto && mision.contexto !== 'ambos' && (
                      <span className="px-2 py-0.5 text-3xs font-black uppercase tracking-widest" style={badgeStyle(C.gold)}>{mision.contexto === 'casa' ? 'Casa' : 'Cancha'}</span>
                    )}
                    {mision.fase_temporada && (
                      <span className="px-2 py-0.5 text-3xs font-black uppercase tracking-widest" style={badgeStyle(C.text3)}>{mision.fase_temporada}</span>
                    )}
                  </div>
                  <p className="text-2xs text-fg-secondary font-bold uppercase tracking-widest mt-1">
                    +{mision.xp_recompensa} XP · {PILAR_LABELS[mision.pilar] || mision.pilar} · {mision.categoria_objetivo || '—'} · {(mision.quiz || []).length} preguntas
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                {mision.justificacion && (
                  <ActionButton
                    onClick={() => setJustifAbierta(justifAbierta === mision.id ? null : mision.id)}
                    title="Ver justificación científica"
                    isActive={justifAbierta === mision.id}>
                    <ChevronDown size={14} className={justifAbierta === mision.id ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </ActionButton>
                )}
                <ActionButton
                  onClick={() => handleEditar(mision)}
                  title="Editar misión"
                  className="hover:text-brand">
                  <Pencil size={14} />
                </ActionButton>
                <button onClick={() => handleToggleActiva(mision)}
                  className="cut-focus flex items-center space-x-1 px-3 min-h-11 md:min-h-9 transition-colors"
                  style={mision.activa === false
                    ? { clipPath: cut(7), background: TINT.ok, border: `1px solid ${BORDER.okStrong}`, color: C.ok }
                    : { clipPath: cut(7), background: C.card, border: `1px solid ${BORDER.neutral}`, color: C.text3 }}
                  title={mision.activa === false ? 'Activar (entra al catálogo del selector)' : 'Desactivar (sale del catálogo)'}>
                  <Power size={14} />
                  <span className="text-2xs font-bold uppercase">{mision.activa === false ? 'Activar' : 'Activa'}</span>
                </button>
                <ActionButton
                  onClick={() => handleDelete(mision)}
                  title="Eliminar misión"
                  className="hover:text-danger">
                  <Trash2 size={16} />
                </ActionButton>
              </div>
            </div>
            {justifAbierta === mision.id && mision.justificacion && (
              <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${BORDER.neutral}` }}>
                <MicroLabel color={C.gold} style={{ marginBottom: 4 }}>Justificación científica</MicroLabel>
                <p className="text-xs leading-relaxed" style={{ color: C.text2 }}>{mision.justificacion}</p>
              </div>
            )}
          </motion.div>
        ))}
      </div>
      {misiones.length < totalMisiones && (
        <button onClick={() => cargarMisiones(misiones.length)} disabled={cargandoMas}
          className="cut-focus w-full mt-4 min-h-11 py-3 text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50"
          style={{ clipPath: cut(8), background: C.card, border: `1px solid ${BORDER.neutral}`, color: C.text3 }}>
          {cargandoMas ? 'Cargando...' : `Cargar más (${misiones.length} de ${totalMisiones})`}
        </button>
      )}

      {/* Diálogo HUD: reemplaza los confirm() nativos de eliminar/rechazar. */}
      <ModalHUD
        open={!!dialogo}
        variant="confirm"
        {...(dialogo || {})}
        onClose={() => setDialogo(null)}
      />
    </div>
  );
}
