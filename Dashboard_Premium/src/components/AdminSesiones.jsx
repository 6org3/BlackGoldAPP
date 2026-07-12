import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ClipboardList, Users, User, Calendar,
  CheckCircle2, AlertCircle, XCircle, Search, Plus,
  MessageSquare, Dumbbell, Brain, Activity, Shield, Zap,
  Clock, ChevronRight, AlertTriangle
} from 'lucide-react';
import {
  fetchGrupos, fetchEjercicios,
  crearSesionControl, evaluarSesion, fetchSesionesControl,
  crearPlantilla, fetchPruebasEvaluacion, programarEvaluacionGrupal
} from '../api/sesionesService';
import { labelSubPilar } from '../../../packages/analytics-core/taxonomia.js';
import { generarMensajeSesion, generarLinkWhatsApp } from '../api/comunicacionesService';

const TIPOS = ['Técnico', 'Físico', 'Táctico', 'Evaluación', 'Recuperación'];
const TIPO_ICONS = {
  'Técnico': Brain, 'Físico': Dumbbell, 'Táctico': Shield,
  'Evaluación': Activity, 'Recuperación': Zap,
};
const TIPO_COLORS = {
  'Técnico': 'text-info-soft bg-info/10 border-info/30',
  'Físico': 'text-caution-soft bg-caution/10 border-caution/30',
  'Táctico': 'text-mental-soft bg-mental/10 border-mental/30',
  'Evaluación': 'text-brand bg-brand/10 border-brand/30',
  'Recuperación': 'text-success-soft bg-success/10 border-success/30',
};
const LOGRO_CONFIG = {
  'Sí':      { color: 'text-success-soft border-success/40 bg-success/10', icon: CheckCircle2 },
  'Parcial': { color: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',   icon: AlertCircle },
  'No':      { color: 'text-danger-soft border-danger/40 bg-danger/10',            icon: XCircle },
};

// Mapeo TIPOS (eje "qué clase de actividad") → objetivo canónico de taxonomia.js
// para las plantillas. Evaluación/Recuperación son formatos de sesión, no pilares
// (decisión #4 de la unificación) → quedan sin objetivo canónico.
const TIPO_A_OBJETIVO = {
  'Técnico':      { pilar: 'tecnico', sub_pilar: null },
  'Físico':       { pilar: 'fisico',  sub_pilar: null },
  'Táctico':      { pilar: 'mental',  sub_pilar: 'tactica' },
  'Evaluación':   { pilar: null,      sub_pilar: null },
  'Recuperación': { pilar: null,      sub_pilar: null },
};

function getTodayStr() { return new Date().toISOString().split('T')[0]; }

export default function AdminSesiones({ user, atletas = [] }) {
  const club = user?.club;
  const [modo, setModo] = useState('Grupal'); // 'Grupal' | 'Individual'
  const [grupos, setGrupos] = useState([]);
  const [ejerciciosCatalogo, setEjerciciosCatalogo] = useState([]);
  const [pruebasCatalogo, setPruebasCatalogo] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [evaluandoId, setEvaluandoId] = useState(null);
  const [evalData, setEvalData] = useState({ se_logro: 'Sí', notas: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busquedaAtleta, setBusquedaAtleta] = useState('');
  const [atletaSeleccionado, setAtletaSeleccionado] = useState(null);
  const [errorCarga, setErrorCarga] = useState(false);

  // Form state
  const [form, setForm] = useState({
    grupoId: '',
    fecha: getTodayStr(),
    objetivoTipo: 'Técnico',
    objetivoDesc: '',
    ejerciciosIds: [],
    pruebasIds: [],
    ejerciciosNotas: '',
    esPagoExtra: false,
    montoExtra: 0,
    tipoPagoExtra: 'Mensual'
  });

  const load = useCallback(async () => {
    try {
      const [g, e, p, h] = await Promise.all([
        fetchGrupos(club),
        fetchEjercicios(),
        fetchPruebasEvaluacion(),
        fetchSesionesControl({ limit: 15 }),
      ]);
      setGrupos(g);
      setEjerciciosCatalogo(e);
      setPruebasCatalogo(p);
      setHistorial(h);
      if (g.length > 0) setForm(f => ({ ...f, grupoId: g[0].id }));
      setErrorCarga(false);
    } catch (e) {
      console.error('Error cargando sesiones:', e);
      setErrorCarga(true);
    }
  }, [club]);

  useEffect(() => { load(); }, [load]);

  // Ejercicios filtrados por tipo y grupo
  const grupoActual = grupos.find(g => g.id === form.grupoId);
  const ejerciciosFiltrados = ejerciciosCatalogo.filter(e =>
    e.tipo === form.objetivoTipo &&
    (!grupoActual || e.grupos_recomendados?.includes(grupoActual.nombre) || e.grupos_recomendados?.includes('Micro'))
  );

  const toggleEjercicio = (id) => {
    setForm(f => ({
      ...f,
      ejerciciosIds: f.ejerciciosIds.includes(id)
        ? f.ejerciciosIds.filter(x => x !== id)
        : [...f.ejerciciosIds, id]
    }));
  };

  const togglePrueba = (id) => {
    setForm(f => ({
      ...f,
      pruebasIds: f.pruebasIds.includes(id)
        ? f.pruebasIds.filter(x => x !== id)
        : [...f.pruebasIds, id]
    }));
  };

  const esEvaluacion = form.objetivoTipo === 'Evaluación';

  const atletasFiltrados = atletas.filter(a =>
    busquedaAtleta && a.nombre?.toLowerCase().includes(busquedaAtleta.toLowerCase())
  );

  const handleGuardar = async () => {
    if (!form.objetivoDesc.trim()) return;
    if (esEvaluacion && form.pruebasIds.length === 0) {
      alert('Una sesión de Evaluación necesita al menos una prueba seleccionada.');
      return;
    }
    setSaving(true);
    try {
      await crearSesionControl({
        tipo: modo,
        grupo_id: modo.startsWith('Grupal') ? form.grupoId : null,
        atleta_id: modo === 'Privada 1v1' ? atletaSeleccionado?.atleta_id : null,
        coach_id: user.id,
        fecha: form.fecha,
        objetivo_tipo: form.objetivoTipo,
        objetivo_descripcion: form.objetivoDesc,
        ejercicios_ids: form.ejerciciosIds,
        ejercicios_notas: form.ejerciciosNotas,
        es_pago_extra: (modo === 'Privada 1v1' || modo === 'Grupal Individualizada') ? form.esPagoExtra : false,
        monto_extra: form.esPagoExtra ? form.montoExtra : 0,
      });

      // Evaluación (P3b): además del registro, se crea la sesión EJECUTABLE con sus
      // pruebas — el Modo Cancha la mostrará el día de la fecha para pasar lista y
      // capturar los resultados del grupo por estaciones.
      if (esEvaluacion) {
        await programarEvaluacionGrupal({
          coach_id: user.id,
          fecha: form.fecha,
          grupo_id: modo.startsWith('Grupal') ? form.grupoId : null,
          atleta_id: modo === 'Privada 1v1' ? atletaSeleccionado?.atleta_id : null,
          pruebas_ids: form.pruebasIds,
        });
      }

      setSaved(true);
      setForm(f => ({ ...f, objetivoDesc: '', ejerciciosIds: [], pruebasIds: [], ejerciciosNotas: '' }));
      const h = await fetchSesionesControl({ limit: 15 });
      setHistorial(h);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleEvaluar = async (sesionId) => {
    await evaluarSesion(sesionId, { se_logro: evalData.se_logro, notas_evaluacion: evalData.notas });
    setEvaluandoId(null);
    try {
      const h = await fetchSesionesControl({ limit: 15 });
      setHistorial(h);
    } catch (e) {
      // La evaluación ya se guardó; si el refresh del historial falla, no
      // hace falta bloquear el flujo — el próximo load() lo recupera.
      console.error('Error refrescando historial tras evaluar:', e);
    }
  };

  // Guarda el formulario actual como plantilla reutilizable (catalogo_sesiones):
  // aparece en el paso "Objetivo de la Sesión" del Modo Cancha.
  const handleGuardarPlantilla = async () => {
    const titulo = window.prompt('Nombre de la plantilla:', form.objetivoDesc.trim().slice(0, 60));
    if (!titulo || !titulo.trim()) return;
    setSaving(true);
    try {
      const objetivo = TIPO_A_OBJETIVO[form.objetivoTipo] || { pilar: null, sub_pilar: null };
      await crearPlantilla({
        titulo: titulo.trim(),
        enfoque_principal: form.objetivoTipo,
        descripcion: form.objetivoDesc.trim() || null,
        pilar: objetivo.pilar,
        sub_pilar: objetivo.sub_pilar,
        tipo_clase: modo,
        ejercicios_ids: form.ejerciciosIds,
        creado_por: user.id,
        // La RLS de catalogo_sesiones exige club_id = club del usuario para owner/coach.
        club: user.club,
      });
      alert(`Plantilla "${titulo.trim()}" guardada. Ya está disponible en el Modo Cancha.`);
    } catch (e) {
      console.error(e);
      alert('No se pudo guardar la plantilla: ' + (e.message || 'error desconocido'));
    }
    setSaving(false);
  };

  const abrirWA = (sesion) => {
    const grupoNombre = sesion.grupos_entrenamiento?.nombre || 'Individual';
    const msg = generarMensajeSesion(grupoNombre, sesion.objetivo_descripcion, sesion.se_logro || 'Pendiente', sesion.notas_evaluacion);
    window.open(generarLinkWhatsApp('', msg), '_blank');
  };

  return (
    <div className="min-h-screen bg-surface-base text-white p-6 md:p-10">
      <div className="fixed top-[-20%] left-[10%] w-[700px] h-[500px] bg-brand/4 blur-[150px] pointer-events-none rounded-full" />

      {/* Header */}
      <header className="mb-6 md:mb-8 border-b border-white/5 pb-4 md:pb-8 relative z-10">
        <div className="flex items-center space-x-3 mb-2">
          <ClipboardList className="text-brand" size={28} />
          <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tighter">
            Control de{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-brand-strong">Sesiones</span>
          </h2>
        </div>
        <p className="text-2xs text-fg-muted font-bold uppercase tracking-[0.3em] ml-11">
          Registro · Evaluación · Seguimiento
        </p>
      </header>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* PANEL IZQUIERDO: Formulario */}
        <div className="space-y-5">
          {/* Toggle Tipos de Sesión */}
          <div className="flex flex-wrap items-center bg-white/5 border border-white/10 rounded-panel p-1 w-fit gap-1">
            {['Grupal (Niveles)', 'Grupal Individualizada', 'Privada 1v1'].map(m => (
              <button
                key={m}
                onClick={() => setModo(m)}
                className={`flex items-center space-x-2 px-4 py-3 min-h-11 rounded-control text-xs font-black uppercase tracking-widest transition ${
                  modo === m
                    ? 'bg-brand text-black shadow-[0_0_15px_rgba(255,215,0,0.3)]'
                    : 'text-fg-secondary hover:text-white hover:bg-white/5'
                }`}
              >
                {m === 'Privada 1v1' ? <User size={14} /> : <Users size={14} />}
                <span>{m}</span>
              </button>
            ))}
          </div>

          {/* Selector de Grupo o Atleta */}
          {modo.startsWith('Grupal') ? (
            <div className="glass-card rounded-panel p-5 border border-white/8">
              <label className="block text-3xs text-fg-muted font-black uppercase tracking-[0.25em] mb-3">
                {modo === 'Grupal Individualizada' ? 'Grupo de Entrenamiento (Max 10)' : 'Grupo de Entrenamiento'}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {grupos.map(g => (
                  <button key={g.id} onClick={() => setForm({ ...form, grupoId: g.id })}
                    className={`p-3 border rounded-control text-xs font-bold uppercase tracking-widest truncate transition ${
                      form.grupoId === g.id ? 'border-brand bg-brand/10 text-brand' : 'border-white/10 text-fg-secondary hover:border-white/30 hover:bg-white/5'
                    }`}>
                    {g.nombre}
                  </button>
                ))}
              </div>
              
              {modo === 'Grupal Individualizada' && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <label className="flex items-center space-x-2 cursor-pointer mb-2">
                    <input type="checkbox" checked={form.esPagoExtra} onChange={e => setForm(f => ({ ...f, esPagoExtra: e.target.checked }))}
                      className="accent-brand" />
                    <span className="text-2xs font-bold text-fg-secondary uppercase tracking-widest">Suscripción / Costo Adicional</span>
                  </label>
                  {form.esPagoExtra && (
                    <div className="flex gap-2">
                      <select value={form.tipoPagoExtra} onChange={e => setForm(f => ({ ...f, tipoPagoExtra: e.target.value }))}
                        className="bg-black/40 border border-white/10 rounded-control px-3 py-2 text-base md:text-sm text-white focus:outline-none focus:border-brand/50">
                        <option value="Mensual">Mensual</option>
                        <option value="Por Sesión">Por Sesión</option>
                      </select>
                      <input type="number" inputMode="decimal" placeholder="Monto $" value={form.montoExtra}
                        onChange={e => setForm(f => ({ ...f, montoExtra: parseFloat(e.target.value) || 0 }))}
                        className="flex-1 bg-black/40 border border-white/10 rounded-control px-3 py-2 text-base md:text-sm text-white focus:outline-none focus:border-brand/50" />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="glass-card rounded-panel p-5 border border-white/8">
              <label className="block text-3xs text-fg-muted font-black uppercase tracking-[0.25em] mb-3">Jugador</label>
              <div className="flex items-center space-x-2 bg-black/40 border border-white/10 rounded-control px-3 py-2 mb-3">
                <Search size={13} className="text-fg-muted" />
                <input
                  type="text"
                  placeholder="Buscar jugador..."
                  value={busquedaAtleta}
                  onChange={e => setBusquedaAtleta(e.target.value)}
                  className="bg-transparent text-base md:text-sm text-white placeholder-gray-600 font-bold focus:outline-none w-full"
                />
              </div>
              {atletaSeleccionado && (
                <div className="flex items-center space-x-3 bg-brand/10 border border-brand/30 rounded-control px-4 py-2.5 mb-2">
                  <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center font-black text-brand text-sm">
                    {atletaSeleccionado.nombre?.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-black text-brand">{atletaSeleccionado.nombre}</p>
                    <p className="text-3xs text-fg-muted">{atletaSeleccionado.categoria}</p>
                  </div>
                  <button onClick={() => setAtletaSeleccionado(null)} aria-label="Quitar jugador"
                    className="ml-auto p-2 -m-1 text-fg-muted hover:text-white"><XCircle size={14} /></button>
                </div>
              )}
              {busquedaAtleta && !atletaSeleccionado && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {atletasFiltrados.map(a => (
                    <button key={a.id} onClick={() => { setAtletaSeleccionado(a); setBusquedaAtleta(''); }}
                      className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-white/5 text-left transition-colors">
                      <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-black text-white/50">{a.nombre?.charAt(0)}</span>
                      <div>
                        <p className="text-xs font-bold text-white">{a.nombre}</p>
                        <p className="text-3xs text-fg-muted">{a.categoria}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {/* Sesión individual: pago extra */}
              <div className="mt-3 pt-3 border-t border-white/5">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={form.esPagoExtra} onChange={e => setForm(f => ({ ...f, esPagoExtra: e.target.checked }))}
                    className="accent-brand" />
                  <span className="text-2xs font-bold text-fg-secondary uppercase tracking-widest">Sesión con costo adicional</span>
                </label>
                {form.esPagoExtra && (
                  <input type="number" inputMode="decimal" placeholder="Monto $" value={form.montoExtra}
                    onChange={e => setForm(f => ({ ...f, montoExtra: parseFloat(e.target.value) || 0 }))}
                    className="mt-2 w-full bg-black/40 border border-white/10 rounded-control px-3 py-2 text-base md:text-sm text-white focus:outline-none focus:border-brand/50" />
                )}
              </div>
            </div>
          )}

          {/* Fecha */}
          <div className="flex items-center space-x-2 bg-white/5 border border-white/10 rounded-control px-4 py-3">
            <Calendar size={14} className="text-brand" />
            <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
              className="bg-transparent text-base md:text-sm text-white font-bold focus:outline-none cursor-pointer" />
          </div>

          {/* Tipo de Objetivo */}
          <div className="glass-card rounded-panel p-5 border border-white/8">
            <label className="block text-3xs text-fg-muted font-black uppercase tracking-[0.25em] mb-3">Tipo de Objetivo</label>
            <div className="flex flex-wrap gap-2">
              {TIPOS.map(t => {
                const Icon = TIPO_ICONS[t];
                return (
                  <button key={t} onClick={() => setForm(f => ({ ...f, objetivoTipo: t, ejerciciosIds: [] }))}
                    className={`flex items-center space-x-1.5 min-h-11 md:min-h-9 px-3.5 rounded-lg border text-2xs font-black uppercase tracking-widest transition ${
                      form.objetivoTipo === t ? TIPO_COLORS[t] : 'border-white/10 text-fg-muted hover:text-white hover:bg-white/5'
                    }`}>
                    <Icon size={12} />
                    <span>{t}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selector de Pruebas (tipo Evaluación, P3b): programa la sesión ejecutable */}
          {esEvaluacion && (
            <div className="glass-card rounded-panel p-5 border border-brand/20">
              <label className="block text-3xs text-brand font-black uppercase tracking-[0.25em] mb-3">
                Pruebas de evaluación ({form.pruebasIds.length} seleccionadas)
              </label>
              <p className="text-2xs text-fg-muted mb-3">
                El día {form.fecha} esta evaluación aparecerá en el Modo Cancha para pasar lista y capturar los resultados del grupo.
              </p>
              <div className="space-y-1.5 max-h-64 md:max-h-48 overflow-y-auto overscroll-contain pr-1">
                {pruebasCatalogo.length === 0 && (
                  <p className="text-xs text-fg-faint italic">No hay pruebas en el catálogo de evaluación.</p>
                )}
                {pruebasCatalogo.map(p => {
                  const sel = form.pruebasIds.includes(p.id);
                  return (
                    <button key={p.id} onClick={() => togglePrueba(p.id)}
                      className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-control border text-left transition ${
                        sel ? 'text-brand bg-brand/10 border-brand/30 opacity-100' : 'border-white/5 hover:bg-white/5 opacity-70 hover:opacity-100'
                      }`}>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${sel ? 'bg-current border-current' : 'border-white/20'}`}>
                        {sel && <div className="w-2 h-2 rounded-full bg-surface-base" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{p.nombre}</p>
                        <p className="text-3xs text-fg-muted">{labelSubPilar(p.sub_pilar)} · {p.unidad}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selector de Ejercicios (tipos de entrenamiento) */}
          {!esEvaluacion && (
          <div className="glass-card rounded-panel p-5 border border-white/8">
            <label className="block text-3xs text-fg-muted font-black uppercase tracking-[0.25em] mb-3">
              Ejercicios ({ejerciciosFiltrados.length} disponibles)
            </label>
            <div className="space-y-1.5 max-h-64 md:max-h-48 overflow-y-auto overscroll-contain pr-1">
              {ejerciciosFiltrados.length === 0 && (
                <p className="text-xs text-fg-faint italic">No hay ejercicios para este tipo en este grupo.</p>
              )}
              {ejerciciosFiltrados.map(ej => {
                const sel = form.ejerciciosIds.includes(ej.id);
                return (
                  <button key={ej.id} onClick={() => toggleEjercicio(ej.id)}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-control border text-left transition ${
                      sel ? `${TIPO_COLORS[form.objetivoTipo]} opacity-100` : 'border-white/5 hover:bg-white/5 opacity-70 hover:opacity-100'
                    }`}>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${sel ? 'bg-current border-current' : 'border-white/20'}`}>
                      {sel && <div className="w-2 h-2 rounded-full bg-surface-base" />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">{ej.nombre}</p>
                      <p className="text-3xs text-fg-muted">{ej.descripcion?.substring(0, 60)}...</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {form.ejerciciosIds.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/5">
                <p className="text-3xs text-brand font-bold">{form.ejerciciosIds.length} ejercicio(s) seleccionado(s)</p>
                <textarea placeholder="Notas adicionales sobre los ejercicios..."
                  value={form.ejerciciosNotas} onChange={e => setForm(f => ({ ...f, ejerciciosNotas: e.target.value }))}
                  rows={2} className="mt-2 w-full bg-black/40 border border-white/10 rounded-control px-3 py-2 text-base md:text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand/50 resize-none" />
              </div>
            )}
          </div>
          )}

          {/* Objetivo (texto libre) */}
          <div>
            <label className="block text-3xs text-fg-muted font-black uppercase tracking-[0.25em] mb-2">Objetivo de la Sesión</label>
            <textarea
              placeholder="Describe el objetivo principal de hoy..."
              value={form.objetivoDesc}
              onChange={e => setForm(f => ({ ...f, objetivoDesc: e.target.value }))}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-panel px-4 py-3 text-base md:text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand/50 resize-none transition-colors"
            />
          </div>

          {/* Botón Registrar */}
          <button onClick={handleGuardar} disabled={saving || !form.objetivoDesc.trim() || (modo === 'Privada 1v1' && !atletaSeleccionado)}
            className={`w-full flex items-center justify-center space-x-2 py-4 rounded-panel font-black uppercase tracking-widest text-sm transition ${
              saved ? 'bg-success/20 border border-success/40 text-success-soft'
                    : 'bg-brand/10 border border-brand/30 text-brand hover:bg-brand/20 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}>
            {saving ? <span className="animate-pulse">Registrando...</span>
              : saved ? <><CheckCircle2 size={16} /><span>¡Sesión Registrada!</span></>
              : <><Plus size={16} /><span>Registrar Sesión</span></>}
          </button>

          {/* Guardar como plantilla (biblioteca del Modo Cancha) */}
          <button onClick={handleGuardarPlantilla} disabled={saving || !form.objetivoDesc.trim()}
            className="w-full flex items-center justify-center space-x-2 py-3 rounded-2xl font-bold uppercase tracking-widest text-xs border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            <ClipboardList size={14} />
            <span>Guardar como plantilla del Modo Cancha</span>
          </button>
        </div>

        {/* PANEL DERECHO: Historial */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-white uppercase tracking-widest">Historial Reciente</h3>
            <span className="text-3xs text-fg-muted font-bold">{historial.length} sesiones</span>
          </div>
          {errorCarga && (
            <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-panel border border-danger/40 bg-danger/10 p-4">
              <AlertTriangle size={18} className="text-danger-soft shrink-0" />
              <p className="flex-1 min-w-[180px] text-xs font-bold text-danger-soft">
                No se pudo cargar el historial. Esto no significa que esté vacío — puede ser un problema de conexión.
              </p>
              <button
                type="button"
                onClick={load}
                className="inline-flex items-center min-h-11 md:min-h-9 px-3.5 rounded-control bg-danger/20 border border-danger/50 text-danger-soft text-2xs font-black uppercase tracking-widest hover:bg-danger/30 transition"
              >
                Reintentar
              </button>
            </div>
          )}
          <div className="space-y-3">
            {!errorCarga && historial.length === 0 && (
              <div className="text-center py-16 text-fg-faint">
                <ClipboardList size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-bold">No hay sesiones registradas</p>
              </div>
            )}
            {historial.map(s => {
              const logroCfg = s.se_logro ? LOGRO_CONFIG[s.se_logro] : null;
              const LogroIcon = logroCfg?.icon;
              const tipoCfg = TIPO_COLORS[s.objetivo_tipo] || 'text-fg-secondary border-white/10';
              return (
                <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="glass-card rounded-panel p-4 border border-white/8 hover:border-white/15 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className={`text-3xs font-black px-2 py-0.5 rounded-full border uppercase tracking-widest ${tipoCfg}`}>
                        {s.tipo} • {s.objetivo_tipo}
                      </span>
                      {s.tipo?.startsWith('Grupal') && s.grupos_entrenamiento && (
                        <span className="text-3xs text-fg-muted">{s.grupos_entrenamiento.nombre}</span>
                      )}
                      {s.tipo === 'Privada 1v1' && s.atletas && (
                        <span className="text-3xs text-fg-muted">{s.atletas?.usuarios?.nombre}</span>
                      )}
                    </div>
                    <span className="text-3xs text-fg-faint font-bold">{s.fecha}</span>
                  </div>
                  <p className="text-xs text-gray-300 mb-3 leading-relaxed">{s.objetivo_descripcion}</p>

                  {/* Estado de evaluación */}
                  {s.se_logro ? (
                    <div className="flex items-center justify-between">
                      <div className={`flex items-center space-x-1.5 text-2xs font-bold px-2 py-1 rounded-lg ${logroCfg?.color}`}>
                        {LogroIcon && <LogroIcon size={12} />}
                        <span>Se logró: {s.se_logro}</span>
                      </div>
                      <button onClick={() => abrirWA(s)}
                        className="flex items-center gap-1.5 px-3 py-2.5 min-h-11 rounded-lg border border-success/30 text-xs font-bold text-success-soft hover:text-emerald-300 hover:bg-success/10 transition-colors">
                        <MessageSquare size={13} />
                        <span>WhatsApp</span>
                      </button>
                    </div>
                  ) : (
                    evaluandoId === s.id ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          {['Sí', 'Parcial', 'No'].map(v => (
                            <button key={v} onClick={() => setEvalData(e => ({ ...e, se_logro: v }))}
                              className={`flex-1 py-3 min-h-11 rounded-lg text-xs font-black uppercase border transition ${
                                evalData.se_logro === v ? LOGRO_CONFIG[v].color : 'border-white/10 text-fg-muted hover:bg-white/5'
                              }`}>{v}</button>
                          ))}
                        </div>
                        <textarea rows={2} placeholder="Notas de evaluación..."
                          value={evalData.notas} onChange={e => setEvalData(d => ({ ...d, notas: e.target.value }))}
                          className="w-full bg-black/40 border border-white/10 rounded-control px-3 py-2 text-base md:text-sm text-white placeholder-gray-600 focus:outline-none resize-none" />
                        <div className="flex gap-2">
                          <button onClick={() => handleEvaluar(s.id)}
                            className="flex-1 py-2 bg-brand/10 border border-brand/30 text-brand text-2xs font-black rounded-control uppercase tracking-widest hover:bg-brand/20">
                            Guardar
                          </button>
                          <button onClick={() => setEvaluandoId(null)}
                            className="px-3 py-2 border border-white/10 text-fg-muted text-2xs font-black rounded-control uppercase hover:text-white">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setEvaluandoId(s.id); setEvalData({ se_logro: 'Sí', notas: '' }); }}
                        className="flex items-center space-x-1.5 px-3 py-2.5 min-h-11 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-xs font-bold text-yellow-400/80 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors">
                        <Clock size={12} />
                        <span>Pendiente de evaluación → Evaluar</span>
                        <ChevronRight size={10} />
                      </button>
                    )
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
