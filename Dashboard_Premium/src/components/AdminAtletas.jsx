import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../api/supabaseClient';
import { calcularEdad, calcularCategoriaFEB } from '../api/sheetsService';
import {
  UserPlus, Save, X, ArrowLeft, Pencil, Trash2, Download,
  LayoutGrid, List, Search, Filter, ChevronDown, ChevronUp,
  Shield, Eye, Dumbbell, Users, AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import ScoutingReportTemplate from './ScoutingReportTemplate';
import AntropometriaModal from './AntropometriaModal';

// ─── Constantes de UI ─────────────────────────────────────────
const POSICIONES = ['N/A', 'Generador', 'Alero Físico', 'Ancla Fuerte', 'Escolta', 'Ala-Pívot'];
const CATEGORIAS_FEB = ['Todas', 'Premini (Sub-9)', 'Mini (Sub-11)', 'Menores (Sub-14)', 'Prejuvenil (Sub-16)', 'Juvenil (Sub-18)', 'Mayores'];
const NIVELES_DESARROLLO = ['Todos', 'Micro', 'Desarrollo', 'Elite', 'Por Asignar'];

// ─── Badge Config por Nivel ───────────────────────────────────
const NIVEL_BADGE = {
  Micro: { color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', icon: '🌱' },
  Desarrollo: { color: 'text-[#FFD700]', border: 'border-[#FFD700]/30', bg: 'bg-[#FFD700]/10', icon: '⚡' },
  Elite: { color: 'text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-500/10', icon: '👑' },
  'Por Asignar': { color: 'text-gray-400', border: 'border-gray-500/30', bg: 'bg-gray-500/10', icon: '❓' },
};

// ─── Orden de agrupamiento ────────────────────────────────────
const NIVEL_ORDER = ['Elite', 'Desarrollo', 'Micro', 'Por Asignar'];

export default function AdminAtletas({ atletas, onRefresh, user }) {
  const navigate = useNavigate();

  // ─── Form State ───────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ─── Filter State ─────────────────────────────────────────
  const [busqueda, setBusqueda] = useState('');
  const [filtroCat, setFiltroCat] = useState('Todas');
  const [filtroNivel, setFiltroNivel] = useState('Todos');
  const [filtroPosicion, setFiltroPosicion] = useState('Todas');
  const [filtroGenero, setFiltroGenero] = useState('Todos');
  const [showFilters, setShowFilters] = useState(false);

  // ─── View State ───────────────────────────────────────────
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  // ─── Modals ───────────────────────────────────────────────
  const [evaluatingAntropometria, setEvaluatingAntropometria] = useState(null);
  const [exportingAtleta, setExportingAtleta] = useState(null);
  const reportRef = React.useRef(null);

  // ─── Parent sub-form ──────────────────────────────────────
  const [showParentForm, setShowParentForm] = useState(false);

  const emptyForm = {
    cedula: '', nombre: '', correo: '', fecha_nacimiento: '', posicion: 'N/A',
    categoria: '', nivel_desarrollo: '', genero: 'Masculino',
    // Parent fields (optional)
    padre_nombre: '', padre_telefono: '', padre_correo: ''
  };
  const [form, setForm] = useState(emptyForm);

  // ─── Filtrado y agrupamiento (memoizado) ──────────────────
  const atletasFiltrados = useMemo(() => {
    if (!atletas) return [];
    
    const hasFilters = busqueda !== '' || 
                       filtroCat !== 'Todas' || 
                       filtroNivel !== 'Todos' || 
                       filtroPosicion !== 'Todas' || 
                       filtroGenero !== 'Todos';

    if (!hasFilters) return []; // No renderizar todo el array inicial para mejorar fluidez

    return atletas.filter(a => {
      // Búsqueda de texto
      if (busqueda) {
        const b = busqueda.toLowerCase();
        const matchName = a.nombre?.toLowerCase().includes(b);
        const matchCedula = a.cedula?.toLowerCase().includes(b);
        if (!matchName && !matchCedula) return false;
      }
      // Filtro Categoría
      if (filtroCat !== 'Todas' && a.categoria !== filtroCat) return false;
      // Filtro Nivel
      if (filtroNivel !== 'Todos') {
        const nivelAtleta = a.nivel_desarrollo || 'Por Asignar';
        if (nivelAtleta !== filtroNivel) return false;
      }
      // Filtro Posición
      if (filtroPosicion !== 'Todas' && a.posicion !== filtroPosicion) return false;
      // Filtro Género
      if (filtroGenero !== 'Todos') {
        const generoAtleta = a.genero || 'Masculino';
        if (generoAtleta !== filtroGenero) return false;
      }
      return true;
    });
  }, [atletas, busqueda, filtroCat, filtroNivel, filtroPosicion, filtroGenero]);

  const atletasAgrupados = useMemo(() => {
    const groups = {};
    atletasFiltrados.forEach(a => {
      const key = a.nivel_desarrollo || 'Por Asignar';
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    // Ordenar grupos según NIVEL_ORDER
    const ordered = [];
    NIVEL_ORDER.forEach(nivel => {
      if (groups[nivel]) {
        ordered.push({ nivel, atletas: groups[nivel] });
      }
    });
    return ordered;
  }, [atletasFiltrados]);

  const filtrosActivos = filtroCat !== 'Todas' || filtroNivel !== 'Todos' || filtroPosicion !== 'Todas' || filtroGenero !== 'Todos';

  // ─── Handlers ─────────────────────────────────────────────
  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleEdit = async (atleta) => {
    const { data: dataUsuario } = await supabase
      .from('usuarios')
      .select('correo, fecha_nacimiento, genero')
      .eq('cedula', atleta.cedula)
      .single();
    const generoValue = dataUsuario?.genero || 'Masculino';

    setForm({
      cedula: atleta.cedula || '',
      nombre: atleta.nombre || '',
      correo: dataUsuario?.correo || '',
      fecha_nacimiento: dataUsuario?.fecha_nacimiento?.split('T')[0] || '',
      posicion: atleta.posicion || 'N/A',
      categoria: atleta.categoria || '',
      nivel_desarrollo: atleta.nivel_desarrollo || '',
      genero: generoValue,
      padre_nombre: '', padre_telefono: '', padre_correo: ''
    });
    setEditingId(atleta.atleta_id);
    setShowForm(true);
    setShowParentForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    const safeCorreo = form.correo?.trim() || null;
    const safeFecha = form.fecha_nacimiento?.trim() || null;
    const safeNivel = form.nivel_desarrollo || null;

    try {
      if (editingId) {
        // EDITAR existente
        const { error: userErr } = await supabase
          .from('usuarios')
          .update({ nombre: form.nombre, categoria: form.categoria, correo: safeCorreo, fecha_nacimiento: safeFecha, genero: form.genero })
          .eq('cedula', form.cedula);
        if (userErr) throw userErr;

        let xp_to_update = undefined;
        if (safeNivel === 'Desarrollo' || safeNivel === 'Elite') {
          const targetXP = safeNivel === 'Desarrollo' ? 1000 : 5000;
          const { data: curAtleta } = await supabase
            .from('atletas')
            .select('xp_total')
            .eq('id', editingId)
            .single();
          if (curAtleta && (curAtleta.xp_total || 0) < targetXP) {
            xp_to_update = targetXP;
          }
        }

        const atlUpdates = {
          edad: safeFecha ? calcularEdad(safeFecha) : 0,
          posicion: form.posicion,
          nivel_desarrollo: safeNivel
        };
        if (xp_to_update !== undefined) {
          atlUpdates.xp_total = xp_to_update;
        }

        const { error: atlErr } = await supabase
          .from('atletas')
          .update(atlUpdates)
          .eq('id', editingId);
        if (atlErr) throw atlErr;
        setSuccess(`\u2705 ${form.nombre} actualizado correctamente.`);
      } else {
        // CREAR nuevo
        const { data: newUser, error: userErr } = await supabase
          .from('usuarios')
          .insert({
            cedula: form.cedula,
            nombre: form.nombre,
            rol: 'atleta',
            club: 'Black Gold',
            categoria: form.categoria || null,
            correo: safeCorreo,
            fecha_nacimiento: safeFecha,
            genero: form.genero
          })
          .select()
          .single();
        if (userErr) throw userErr;

        let initialXP = 0;
        if (safeNivel === 'Desarrollo') initialXP = 1000;
        else if (safeNivel === 'Elite') initialXP = 5000;

        const { error: atlErr } = await supabase
          .from('atletas')
          .insert({
            usuario_id: newUser.id,
            edad: safeFecha ? calcularEdad(safeFecha) : 0,
            posicion: form.posicion,
            nivel_desarrollo: safeNivel,
            xp_total: initialXP
          });
        if (atlErr) throw atlErr;

        // Vincular padre si se proporcionó
        if (showParentForm && form.padre_telefono?.trim()) {
          try {
            const padreCedula = `PADRE_${form.padre_telefono.trim()}`;
            let padreId = null;

            const { data: padreExistente } = await supabase
              .from('usuarios')
              .select('id')
              .eq('cedula', padreCedula)
              .single();

            if (padreExistente) {
              padreId = padreExistente.id;
            } else {
              const { data: newPadre, error: padreErr } = await supabase
                .from('usuarios')
                .insert({
                  cedula: padreCedula,
                  nombre: form.padre_nombre || `Padre de ${form.nombre}`,
                  correo: form.padre_correo || null,
                  telefono: form.padre_telefono.trim(),
                  rol: 'padre',
                  club: 'Black Gold'
                })
                .select()
                .single();
              if (padreErr) throw padreErr;
              padreId = newPadre.id;
            }

            // Obtener atleta_id del nuevo atleta
            const { data: nuevoAtleta } = await supabase
              .from('atletas')
              .select('id')
              .eq('usuario_id', newUser.id)
              .single();

            if (padreId && nuevoAtleta) {
              await supabase
                .from('padres_atletas')
                .insert({ padre_id: padreId, atleta_id: nuevoAtleta.id });
            }
          } catch (padreError) {
            console.warn('Error vinculando padre (no crítico):', padreError);
          }
        }

        setSuccess(`✅ ${form.nombre} registrado exitosamente.`);
      }

      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      setShowParentForm(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message || 'Error al guardar.');
    }
    setSaving(false);
  };

  const handleDelete = async (atleta) => {
    if (!confirm(`¿Seguro que deseas eliminar a ${atleta.nombre}? Esta acción no se puede deshacer.`)) return;
    await supabase.from('atletas').delete().eq('id', atleta.atleta_id);
    await supabase.from('usuarios').delete().eq('id', atleta.id);
    if (onRefresh) onRefresh();
  };

  const exportPDF = async (atleta) => {
    setExportingAtleta(atleta);
    setTimeout(async () => {
      if (!reportRef.current) return;
      try {
        const canvas = await html2canvas(reportRef.current, {
          scale: 2, useCORS: true, backgroundColor: '#09090b',
        });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Scouting_Report_${atleta.nombre.replace(/\s+/g, '_')}.pdf`);
      } catch (error) {
        console.error("Error generating PDF:", error);
        alert("Hubo un error al generar el PDF.");
      } finally {
        setExportingAtleta(null);
      }
    }, 100);
  };

  const clearFilters = () => {
    setFiltroCat('Todas');
    setFiltroNivel('Todos');
    setFiltroPosicion('Todas');
    setFiltroGenero('Todos');
    setBusqueda('');
  };

  // Determinar si el atleta es menor según la fecha de nacimiento del form
  const esMenor = form.fecha_nacimiento ? calcularEdad(form.fecha_nacimiento) < 18 : false;

  return (
    <div className="max-w-7xl mx-auto">
      {/* ═══════════════════════ HEADER ═══════════════════════ */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/dashboard')} className="text-gray-500 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tight">
              Gestionar <span className="text-[#FFD700]">Atletas</span>
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {atletasFiltrados.length} de {atletas?.length || 0} atletas
              {filtrosActivos && <span className="text-[#FFD700]"> · Filtros activos</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {/* Toggle Vista */}
          <div className="hidden sm:flex items-center bg-white/5 rounded-xl p-1 border border-white/5">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-[#FFD700]/15 text-[#FFD700] shadow-[0_0_10px_rgba(255,215,0,0.15)]' : 'text-gray-500 hover:text-white'}`}
              title="Vista Cuadrícula"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-[#FFD700]/15 text-[#FFD700] shadow-[0_0_10px_rgba(255,215,0,0.15)]' : 'text-gray-500 hover:text-white'}`}
              title="Vista Lista"
            >
              <List size={16} />
            </button>
          </div>
          {/* Botón Nuevo */}
          <button
            onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(emptyForm); setShowParentForm(false); }}
            className="flex items-center space-x-2 bg-gradient-to-r from-[#FFD700] to-[#D4AF37] text-black font-black text-xs uppercase tracking-widest px-5 py-3 rounded-xl shadow-[0_0_15px_rgba(255,215,0,0.3)] hover:shadow-[0_0_25px_rgba(255,215,0,0.5)] hover:scale-[1.02] transition-all"
          >
            <UserPlus size={16} />
            <span className="hidden sm:inline">Nuevo Atleta</span>
          </button>
        </div>
      </div>

      {/* ═══════════════════════ MENSAJES ═══════════════════════ */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-bold flex items-center space-x-3"
          >
            <AlertCircle size={18} /><span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto text-red-400/60 hover:text-red-300"><X size={16} /></button>
          </motion.div>
        )}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-bold"
          >
            {success}
            <button onClick={() => setSuccess('')} className="ml-4 text-emerald-400/60 hover:text-emerald-300"><X size={16} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════ FORMULARIO ═══════════════════════ */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            onSubmit={handleSubmit}
            className="glass-card rounded-2xl p-8 mb-8 overflow-hidden"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center space-x-3">
                <span className="w-8 h-8 rounded-lg bg-[#FFD700]/15 flex items-center justify-center">
                  <UserPlus size={16} className="text-[#FFD700]" />
                </span>
                <span>{editingId ? 'Editar Atleta' : 'Registrar Nuevo Atleta'}</span>
              </h3>
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="text-gray-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Datos del atleta */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <InputField label="Cédula" value={form.cedula} onChange={v => handleChange('cedula', v)} disabled={!!editingId} placeholder="Ej. 1234567890" />
              <InputField label="Nombre Completo" value={form.nombre} onChange={v => handleChange('nombre', v)} placeholder="Ej. Juan Pérez" />
              <InputField label="Correo Electrónico" type="email" value={form.correo} onChange={v => handleChange('correo', v)} placeholder="ejemplo@correo.com" />
              <InputField
                label="Fecha de Nacimiento"
                type="date"
                value={form.fecha_nacimiento}
                onChange={v => {
                  handleChange('fecha_nacimiento', v);
                  handleChange('categoria', calcularCategoriaFEB(v));
                }}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <SelectField label="Género" value={form.genero} options={['Masculino', 'Femenino']} onChange={v => handleChange('genero', v)} />
              <SelectField label="Posición" value={form.posicion} options={POSICIONES} onChange={v => handleChange('posicion', v)} />
              <div className="flex flex-col space-y-2">
                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Categoría FEB (Auto)</label>
                <input type="text" value={form.categoria || '—'} disabled
                  className="w-full bg-[#121214]/80 border border-white/5 rounded-xl py-3 px-4 text-sm text-white/50 cursor-not-allowed" />
              </div>
              <SelectField
                label="Nivel de Desarrollo"
                value={form.nivel_desarrollo}
                options={['', 'Micro', 'Desarrollo', 'Elite']}
                optionLabels={['— Por Asignar —', 'Micro', 'Desarrollo', 'Elite']}
                onChange={v => handleChange('nivel_desarrollo', v)}
              />
            </div>

            {/* Toggle padre (solo crear y si es menor) */}
            {!editingId && esMenor && (
              <div className="mb-6 p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
                <button
                  type="button"
                  onClick={() => setShowParentForm(!showParentForm)}
                  className="flex items-center space-x-2 text-sm text-cyan-400 font-bold hover:text-cyan-300 transition-colors"
                >
                  <Users size={16} />
                  <span>{showParentForm ? 'Ocultar' : 'Agregar'} Datos del Representante</span>
                  <span className="text-[10px] text-gray-500 ml-2">(Opcional)</span>
                  {showParentForm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <AnimatePresence>
                  {showParentForm && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 overflow-hidden"
                    >
                      <InputField label="Nombre del Representante" value={form.padre_nombre} onChange={v => handleChange('padre_nombre', v)} placeholder="Ej. María Méndez" />
                      <InputField label="Teléfono Representante" value={form.padre_telefono} onChange={v => handleChange('padre_telefono', v)} placeholder="Ej. 0991234567" />
                      <InputField label="Correo Representante" type="email" value={form.padre_correo} onChange={v => handleChange('padre_correo', v)} placeholder="padre@correo.com" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <button
              type="submit" disabled={saving}
              className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-[#FFD700] to-[#D4AF37] text-black font-black uppercase tracking-widest py-4 rounded-xl shadow-[0_0_20px_rgba(255,215,0,0.3)] hover:shadow-[0_0_30px_rgba(255,215,0,0.5)] transition-all disabled:opacity-50"
            >
              <Save size={16} />
              <span>{saving ? 'Guardando en Supabase...' : editingId ? 'Actualizar Atleta' : 'Registrar Atleta'}</span>
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* ═══════════════════════ BÚSQUEDA Y FILTROS ═══════════════════════ */}
      <div className="mb-6 space-y-3">
        {/* Barra de búsqueda + toggle filtros */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar por nombre o cédula..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#FFD700]/40 focus:shadow-[0_0_15px_rgba(255,215,0,0.08)] transition-all"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center space-x-2 px-4 py-3 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all ${
              showFilters || filtrosActivos
                ? 'bg-[#FFD700]/10 border-[#FFD700]/30 text-[#FFD700]'
                : 'bg-white/[0.03] border-white/10 text-gray-500 hover:text-white hover:border-white/20'
            }`}
          >
            <Filter size={14} />
            <span className="hidden sm:inline">Filtros</span>
            {filtrosActivos && (
              <span className="w-2 h-2 rounded-full bg-[#FFD700] animate-pulse" />
            )}
          </button>
        </div>

        {/* Panel de filtros */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="glass-card rounded-xl p-5 flex flex-col gap-5">
                <FilterSelect label="Categoría FEB" value={filtroCat} options={CATEGORIAS_FEB} onChange={setFiltroCat} />
                <FilterSelect label="Nivel Desarrollo" value={filtroNivel} options={NIVELES_DESARROLLO} onChange={setFiltroNivel} />
                <FilterSelect label="Posición" value={filtroPosicion} options={['Todas', ...POSICIONES.filter(p => p !== 'N/A')]} onChange={setFiltroPosicion} />
                <FilterSelect label="Género" value={filtroGenero} options={['Todos', 'Masculino', 'Femenino']} onChange={setFiltroGenero} />
              </div>
              {filtrosActivos && (
                <button onClick={clearFilters} className="mt-2 text-xs text-gray-500 hover:text-[#FFD700] transition-colors underline">
                  Limpiar todos los filtros
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══════════════════════ LISTA DE ATLETAS AGRUPADOS ═══════════════════════ */}
      <div className="space-y-8">
        {atletasAgrupados.length === 0 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">🔍</div>
            <p className="text-gray-500 text-sm font-bold">No se encontraron atletas con estos filtros.</p>
            {filtrosActivos && (
              <button onClick={clearFilters} className="mt-3 text-xs text-[#FFD700] hover:underline">
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        {atletasAgrupados.map(({ nivel, atletas: grupoAtletas }) => {
          const badge = NIVEL_BADGE[nivel] || NIVEL_BADGE['Por Asignar'];
          return (
            <div key={nivel}>
              {/* Header del grupo */}
              <div className="flex items-center space-x-3 mb-4">
                <span className="text-lg">{badge.icon}</span>
                <h3 className={`text-sm font-black uppercase tracking-widest ${badge.color}`}>
                  {nivel}
                </h3>
                <span className="text-[10px] text-gray-600 font-bold">
                  ({grupoAtletas.length} atleta{grupoAtletas.length !== 1 ? 's' : ''})
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
              </div>

              {/* Grid View */}
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {grupoAtletas.map((atleta, i) => (
                    <AtletaGridCard
                      key={atleta.id}
                      atleta={atleta}
                      index={i}
                      onEdit={() => handleEdit(atleta)}
                      onDelete={() => handleDelete(atleta)}
                      onExport={() => exportPDF(atleta)}
                      onAntropometria={() => setEvaluatingAntropometria(atleta)}
                      isExporting={exportingAtleta?.id === atleta.id}
                    />
                  ))}
                </div>
              ) : (
                /* List View */
                <div className="space-y-2">
                  {grupoAtletas.map((atleta, i) => (
                    <AtletaListRow
                      key={atleta.id}
                      atleta={atleta}
                      index={i}
                      onEdit={() => handleEdit(atleta)}
                      onDelete={() => handleDelete(atleta)}
                      onExport={() => exportPDF(atleta)}
                      onAntropometria={() => setEvaluatingAntropometria(atleta)}
                      isExporting={exportingAtleta?.id === atleta.id}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Componente oculto para exportación PDF */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        {exportingAtleta && (
          <ScoutingReportTemplate ref={reportRef} atleta={exportingAtleta} todosLosAtletas={atletas} />
        )}
      </div>

      {/* Modal Antropometría */}
      {evaluatingAntropometria && (
        <AntropometriaModal
          atleta={evaluatingAntropometria}
          onClose={() => setEvaluatingAntropometria(null)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TARJETA GRID — Vista cuadrícula premium
// ═══════════════════════════════════════════════════════════════

function AtletaGridCard({ atleta, index, onEdit, onDelete, onExport, onAntropometria, isExporting }) {
  const nivelKey = atleta.nivel_desarrollo || 'Por Asignar';
  const badge = NIVEL_BADGE[nivelKey] || NIVEL_BADGE['Por Asignar'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="group relative glass-card rounded-2xl p-5 hover:border-[#FFD700]/25 hover:shadow-[0_0_30px_rgba(255,215,0,0.08)] transition-all duration-300"
    >
      {/* Top: Avatar + Identity */}
      <div className="flex items-center space-x-3 mb-4">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${atleta.rango?.color ? '' : ''} flex items-center justify-center shrink-0 border border-white/10`}
          style={{ background: `linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.05))` }}>
          <span className="text-base font-black text-[#FFD700]/80 uppercase">{atleta.nombre?.charAt(0)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white truncate text-sm group-hover:text-[#FFD700] transition-colors">
            {atleta.nombre}
          </p>
          <p className="text-[10px] text-gray-500 truncate">
            {atleta.posicion !== 'N/A' ? atleta.posicion : 'Sin Posición'} · {atleta.categoria || 'Sin categoría'}
          </p>
        </div>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {/* Rango badge */}
        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${atleta.rango?.color || 'text-gray-400'} border-white/10 bg-white/[0.03]`}>
          {atleta.rango?.nombre || 'Rookie'} {atleta.rango?.tier || ''}
        </span>
        {/* Nivel badge */}
        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${badge.border} ${badge.bg} ${badge.color}`}>
          {badge.icon} {nivelKey}
        </span>
      </div>

      {/* Edad info */}
      <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-4">
        <span>{atleta.edad ? `${atleta.edad} años` : 'Edad —'}</span>
        {atleta.talla_cm && <span>· {atleta.talla_cm} cm</span>}
        {atleta.peso_kg && <span>· {atleta.peso_kg} kg</span>}
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <div className="flex items-center space-x-1">
          <ActionButton onClick={onExport} title="Descargar PDF" isActive={isExporting}>
            <Download size={14} className={isExporting ? 'animate-pulse' : ''} />
          </ActionButton>
          <ActionButton onClick={onAntropometria} title="Antropometría" className="hover:text-emerald-400">
            <Dumbbell size={14} />
          </ActionButton>
        </div>
        <div className="flex items-center space-x-1">
          <ActionButton onClick={onEdit} title="Editar" className="hover:text-[#FFD700]">
            <Pencil size={14} />
          </ActionButton>
          <ActionButton onClick={onDelete} title="Eliminar" className="hover:text-red-500">
            <Trash2 size={14} />
          </ActionButton>
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FILA LISTA — Vista lista compacta
// ═══════════════════════════════════════════════════════════════

function AtletaListRow({ atleta, index, onEdit, onDelete, onExport, onAntropometria, isExporting }) {
  const nivelKey = atleta.nivel_desarrollo || 'Por Asignar';
  const badge = NIVEL_BADGE[nivelKey] || NIVEL_BADGE['Por Asignar'];

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="glass-card rounded-xl px-5 py-4 flex items-center justify-between glow-border group"
    >
      <div className="flex items-center space-x-4 flex-1 min-w-0">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border border-white/10"
          style={{ background: `linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.05))` }}>
          <span className="text-sm font-black text-[#FFD700]/80">{atleta.nombre?.charAt(0)}</span>
        </div>
        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate group-hover:text-[#FFD700] transition-colors">{atleta.nombre}</p>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest truncate">
            {atleta.posicion !== 'N/A' ? atleta.posicion : 'Sin Posición'} · {atleta.categoria || 'Sin cat.'} · {atleta.edad ? `${atleta.edad} años` : '—'}
          </p>
        </div>
        {/* Badges */}
        <div className="hidden md:flex items-center gap-2">
          <span className={`text-[9px] font-black uppercase tracking-widest ${atleta.rango?.color || 'text-gray-400'}`}>
            {atleta.rango?.nombre || 'Rookie'}
          </span>
          <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${badge.border} ${badge.bg} ${badge.color}`}>
            {badge.icon} {nivelKey}
          </span>
        </div>
      </div>
      {/* Actions */}
      <div className="flex items-center space-x-2 ml-4">
        <ActionButton onClick={onExport} title="PDF" isActive={isExporting}>
          <Download size={14} className={isExporting ? 'animate-pulse' : ''} />
        </ActionButton>
        <ActionButton onClick={onAntropometria} title="Antropometría" className="hover:text-emerald-400">
          <Dumbbell size={14} />
        </ActionButton>
        <ActionButton onClick={onEdit} title="Editar" className="hover:text-[#FFD700]">
          <Pencil size={14} />
        </ActionButton>
        <ActionButton onClick={onDelete} title="Eliminar" className="hover:text-red-500">
          <Trash2 size={14} />
        </ActionButton>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTES REUTILIZABLES
// ═══════════════════════════════════════════════════════════════

function ActionButton({ children, onClick, title, className = '', isActive }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-lg text-gray-500 hover:bg-white/5 transition-all ${isActive ? 'text-[#FFD700]' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

function InputField({ label, value, onChange, type = 'text', disabled, placeholder }) {
  return (
    <div>
      <label className="block text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-2">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        disabled={disabled} placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FFD700]/50 focus:shadow-[0_0_10px_rgba(255,215,0,0.06)] transition-all disabled:opacity-40"
      />
    </div>
  );
}

function SelectField({ label, value, options, optionLabels, onChange }) {
  return (
    <div>
      <label className="block text-[9px] text-gray-400 font-bold uppercase tracking-widest mb-2">{label}</label>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FFD700]/50 transition-colors appearance-none cursor-pointer"
      >
        {options.map((o, i) => (
          <option key={o} value={o} className="bg-[#121214]">
            {optionLabels ? optionLabels[i] : o}
          </option>
        ))}
      </select>
    </div>
  );
}

function FilterSelect({ label, value, options, optionLabels, onChange }) {
  return (
    <div className="flex flex-col space-y-2">
      <label className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => {
          const isSelected = value === o;
          return (
            <button
              key={o}
              onClick={() => onChange(o)}
              className={`px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase rounded-lg transition-all ${
                isSelected 
                  ? 'bg-[#FFD700]/20 text-[#FFD700] border border-[#FFD700]/50 shadow-[0_0_10px_rgba(255,215,0,0.2)]' 
                  : 'bg-white/[0.02] text-gray-400 border border-white/5 hover:bg-white/10 hover:text-white'
              }`}
            >
              {optionLabels ? optionLabels[i] : o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
