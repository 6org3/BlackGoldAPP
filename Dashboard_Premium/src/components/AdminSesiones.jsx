import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList, Users, User, Calendar, ChevronDown,
  CheckCircle2, AlertCircle, XCircle, Search, Plus,
  MessageSquare, Dumbbell, Brain, Activity, Shield, Zap,
  Send, Clock, ChevronRight
} from 'lucide-react';
import {
  fetchGrupos, fetchEjercicios,
  crearSesionControl, evaluarSesion, fetchSesionesControl
} from '../api/sesionesService';
import { generarMensajeSesion, generarLinkWhatsApp } from '../api/comunicacionesService';

const TIPOS = ['Técnico', 'Físico', 'Táctico', 'Evaluación', 'Recuperación'];
const TIPO_ICONS = {
  'Técnico': Brain, 'Físico': Dumbbell, 'Táctico': Shield,
  'Evaluación': Activity, 'Recuperación': Zap,
};
const TIPO_COLORS = {
  'Técnico': 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  'Físico': 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  'Táctico': 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  'Evaluación': 'text-[#FFD700] bg-[#FFD700]/10 border-[#FFD700]/30',
  'Recuperación': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
};
const LOGRO_CONFIG = {
  'Sí':      { color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10', icon: CheckCircle2 },
  'Parcial': { color: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',   icon: AlertCircle },
  'No':      { color: 'text-red-400 border-red-500/40 bg-red-500/10',            icon: XCircle },
};

function getTodayStr() { return new Date().toISOString().split('T')[0]; }

export default function AdminSesiones({ user, atletas = [] }) {
  const [modo, setModo] = useState('Grupal'); // 'Grupal' | 'Individual'
  const [grupos, setGrupos] = useState([]);
  const [ejerciciosCatalogo, setEjerciciosCatalogo] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [showForm, setShowForm] = useState(true);
  const [evaluandoId, setEvaluandoId] = useState(null);
  const [evalData, setEvalData] = useState({ se_logro: 'Sí', notas: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busquedaAtleta, setBusquedaAtleta] = useState('');
  const [atletaSeleccionado, setAtletaSeleccionado] = useState(null);

  // Form state
  const [form, setForm] = useState({
    grupoId: '',
    fecha: getTodayStr(),
    objetivoTipo: 'Técnico',
    objetivoDesc: '',
    ejerciciosIds: [],
    ejerciciosNotas: '',
    esPagoExtra: false,
    montoExtra: 0,
    tipoPagoExtra: 'Mensual'
  });

  const load = useCallback(async () => {
    const [g, e, h] = await Promise.all([
      fetchGrupos(),
      fetchEjercicios(),
      fetchSesionesControl({ limit: 15 }),
    ]);
    setGrupos(g);
    setEjerciciosCatalogo(e);
    setHistorial(h);
    if (g.length > 0) setForm(f => ({ ...f, grupoId: g[0].id }));
  }, []);

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

  const atletasFiltrados = atletas.filter(a =>
    busquedaAtleta && a.nombre?.toLowerCase().includes(busquedaAtleta.toLowerCase())
  );

  const handleGuardar = async () => {
    if (!form.objetivoDesc.trim()) return;
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
      setSaved(true);
      setForm(f => ({ ...f, objetivoDesc: '', ejerciciosIds: [], ejerciciosNotas: '' }));
      const h = await fetchSesionesControl({ limit: 15 });
      setHistorial(h);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleEvaluar = async (sesionId) => {
    await evaluarSesion(sesionId, { se_logro: evalData.se_logro, notas_evaluacion: evalData.notas });
    setEvaluandoId(null);
    const h = await fetchSesionesControl({ limit: 15 });
    setHistorial(h);
  };

  const abrirWA = (sesion) => {
    const grupoNombre = sesion.grupos_entrenamiento?.nombre || 'Individual';
    const msg = generarMensajeSesion(grupoNombre, sesion.objetivo_descripcion, sesion.se_logro || 'Pendiente', sesion.notas_evaluacion);
    window.open(generarLinkWhatsApp('', msg), '_blank');
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white p-6 md:p-10">
      <div className="fixed top-[-20%] left-[10%] w-[700px] h-[500px] bg-[#FFD700]/4 blur-[150px] pointer-events-none rounded-full" />

      {/* Header */}
      <header className="mb-6 md:mb-8 border-b border-white/5 pb-4 md:pb-8 relative z-10">
        <div className="flex items-center space-x-3 mb-2">
          <ClipboardList className="text-[#FFD700]" size={28} />
          <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tighter">
            Control de{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FFD700] to-[#D4AF37]">Sesiones</span>
          </h2>
        </div>
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] ml-11">
          Registro · Evaluación · Seguimiento
        </p>
      </header>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* PANEL IZQUIERDO: Formulario */}
        <div className="space-y-5">
          {/* Toggle Tipos de Sesión */}
          <div className="flex flex-wrap items-center bg-white/5 border border-white/10 rounded-2xl p-1 w-fit gap-1">
            {['Grupal (Niveles)', 'Grupal Individualizada', 'Privada 1v1'].map(m => (
              <button
                key={m}
                onClick={() => setModo(m)}
                className={`flex items-center space-x-2 px-4 py-3 min-h-11 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  modo === m
                    ? 'bg-[#FFD700] text-black shadow-[0_0_15px_rgba(255,215,0,0.3)]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {m === 'Privada 1v1' ? <User size={14} /> : <Users size={14} />}
                <span>{m}</span>
              </button>
            ))}
          </div>

          {/* Selector de Grupo o Atleta */}
          {modo.startsWith('Grupal') ? (
            <div className="glass-card rounded-2xl p-5 border border-white/8">
              <label className="block text-[9px] text-gray-500 font-black uppercase tracking-[0.25em] mb-3">
                {modo === 'Grupal Individualizada' ? 'Grupo de Entrenamiento (Max 10)' : 'Grupo de Entrenamiento'}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {grupos.map(g => (
                  <button key={g.id} onClick={() => setForm({ ...form, grupoId: g.id })}
                    className={`p-3 border rounded-xl text-xs font-bold uppercase tracking-widest truncate transition-all ${
                      form.grupoId === g.id ? 'border-[#FFD700] bg-[#FFD700]/10 text-[#FFD700]' : 'border-white/10 text-gray-400 hover:border-white/30 hover:bg-white/5'
                    }`}>
                    {g.nombre}
                  </button>
                ))}
              </div>
              
              {modo === 'Grupal Individualizada' && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <label className="flex items-center space-x-2 cursor-pointer mb-2">
                    <input type="checkbox" checked={form.esPagoExtra} onChange={e => setForm(f => ({ ...f, esPagoExtra: e.target.checked }))}
                      className="accent-[#FFD700]" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Suscripción / Costo Adicional</span>
                  </label>
                  {form.esPagoExtra && (
                    <div className="flex gap-2">
                      <select value={form.tipoPagoExtra} onChange={e => setForm(f => ({ ...f, tipoPagoExtra: e.target.value }))}
                        className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-base md:text-sm text-white focus:outline-none focus:border-[#FFD700]/50">
                        <option value="Mensual">Mensual</option>
                        <option value="Por Sesión">Por Sesión</option>
                      </select>
                      <input type="number" inputMode="decimal" placeholder="Monto $" value={form.montoExtra}
                        onChange={e => setForm(f => ({ ...f, montoExtra: parseFloat(e.target.value) || 0 }))}
                        className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-base md:text-sm text-white focus:outline-none focus:border-[#FFD700]/50" />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-5 border border-white/8">
              <label className="block text-[9px] text-gray-500 font-black uppercase tracking-[0.25em] mb-3">Jugador</label>
              <div className="flex items-center space-x-2 bg-black/40 border border-white/10 rounded-xl px-3 py-2 mb-3">
                <Search size={13} className="text-gray-500" />
                <input
                  type="text"
                  placeholder="Buscar jugador..."
                  value={busquedaAtleta}
                  onChange={e => setBusquedaAtleta(e.target.value)}
                  className="bg-transparent text-base md:text-sm text-white placeholder-gray-600 font-bold focus:outline-none w-full"
                />
              </div>
              {atletaSeleccionado && (
                <div className="flex items-center space-x-3 bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-xl px-4 py-2.5 mb-2">
                  <div className="w-8 h-8 rounded-full bg-[#FFD700]/20 flex items-center justify-center font-black text-[#FFD700] text-sm">
                    {atletaSeleccionado.nombre?.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-black text-[#FFD700]">{atletaSeleccionado.nombre}</p>
                    <p className="text-[9px] text-gray-500">{atletaSeleccionado.categoria}</p>
                  </div>
                  <button onClick={() => setAtletaSeleccionado(null)} aria-label="Quitar jugador"
                    className="ml-auto p-2 -m-1 text-gray-500 hover:text-white"><XCircle size={14} /></button>
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
                        <p className="text-[9px] text-gray-500">{a.categoria}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {/* Sesión individual: pago extra */}
              <div className="mt-3 pt-3 border-t border-white/5">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={form.esPagoExtra} onChange={e => setForm(f => ({ ...f, esPagoExtra: e.target.checked }))}
                    className="accent-[#FFD700]" />
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sesión con costo adicional</span>
                </label>
                {form.esPagoExtra && (
                  <input type="number" inputMode="decimal" placeholder="Monto $" value={form.montoExtra}
                    onChange={e => setForm(f => ({ ...f, montoExtra: parseFloat(e.target.value) || 0 }))}
                    className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-base md:text-sm text-white focus:outline-none focus:border-[#FFD700]/50" />
                )}
              </div>
            </div>
          )}

          {/* Fecha */}
          <div className="flex items-center space-x-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
            <Calendar size={14} className="text-[#FFD700]" />
            <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
              className="bg-transparent text-base md:text-sm text-white font-bold focus:outline-none cursor-pointer" />
          </div>

          {/* Tipo de Objetivo */}
          <div className="glass-card rounded-2xl p-5 border border-white/8">
            <label className="block text-[9px] text-gray-500 font-black uppercase tracking-[0.25em] mb-3">Tipo de Objetivo</label>
            <div className="flex flex-wrap gap-2">
              {TIPOS.map(t => {
                const Icon = TIPO_ICONS[t];
                return (
                  <button key={t} onClick={() => setForm(f => ({ ...f, objetivoTipo: t, ejerciciosIds: [] }))}
                    className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all ${
                      form.objetivoTipo === t ? TIPO_COLORS[t] : 'border-white/10 text-gray-500 hover:text-white hover:bg-white/5'
                    }`}>
                    <Icon size={12} />
                    <span>{t}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selector de Ejercicios */}
          <div className="glass-card rounded-2xl p-5 border border-white/8">
            <label className="block text-[9px] text-gray-500 font-black uppercase tracking-[0.25em] mb-3">
              Ejercicios ({ejerciciosFiltrados.length} disponibles)
            </label>
            <div className="space-y-1.5 max-h-64 md:max-h-48 overflow-y-auto overscroll-contain pr-1">
              {ejerciciosFiltrados.length === 0 && (
                <p className="text-xs text-gray-600 italic">No hay ejercicios para este tipo en este grupo.</p>
              )}
              {ejerciciosFiltrados.map(ej => {
                const sel = form.ejerciciosIds.includes(ej.id);
                return (
                  <button key={ej.id} onClick={() => toggleEjercicio(ej.id)}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                      sel ? `${TIPO_COLORS[form.objetivoTipo]} opacity-100` : 'border-white/5 hover:bg-white/5 opacity-70 hover:opacity-100'
                    }`}>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${sel ? 'bg-current border-current' : 'border-white/20'}`}>
                      {sel && <div className="w-2 h-2 rounded-full bg-[#09090b]" />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">{ej.nombre}</p>
                      <p className="text-[9px] text-gray-500">{ej.descripcion?.substring(0, 60)}...</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {form.ejerciciosIds.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/5">
                <p className="text-[9px] text-[#FFD700] font-bold">{form.ejerciciosIds.length} ejercicio(s) seleccionado(s)</p>
                <textarea placeholder="Notas adicionales sobre los ejercicios..."
                  value={form.ejerciciosNotas} onChange={e => setForm(f => ({ ...f, ejerciciosNotas: e.target.value }))}
                  rows={2} className="mt-2 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-base md:text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#FFD700]/50 resize-none" />
              </div>
            )}
          </div>

          {/* Objetivo (texto libre) */}
          <div>
            <label className="block text-[9px] text-gray-500 font-black uppercase tracking-[0.25em] mb-2">Objetivo de la Sesión</label>
            <textarea
              placeholder="Describe el objetivo principal de hoy..."
              value={form.objetivoDesc}
              onChange={e => setForm(f => ({ ...f, objetivoDesc: e.target.value }))}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-base md:text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#FFD700]/50 resize-none transition-colors"
            />
          </div>

          {/* Botón Registrar */}
          <button onClick={handleGuardar} disabled={saving || !form.objetivoDesc.trim() || (modo === 'Privada 1v1' && !atletaSeleccionado)}
            className={`w-full flex items-center justify-center space-x-2 py-4 rounded-2xl font-black uppercase tracking-widest text-sm transition-all ${
              saved ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                    : 'bg-[#FFD700]/10 border border-[#FFD700]/30 text-[#FFD700] hover:bg-[#FFD700]/20 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}>
            {saving ? <span className="animate-pulse">Registrando...</span>
              : saved ? <><CheckCircle2 size={16} /><span>¡Sesión Registrada!</span></>
              : <><Plus size={16} /><span>Registrar Sesión</span></>}
          </button>
        </div>

        {/* PANEL DERECHO: Historial */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-white uppercase tracking-widest">Historial Reciente</h3>
            <span className="text-[9px] text-gray-500 font-bold">{historial.length} sesiones</span>
          </div>
          <div className="space-y-3">
            {historial.length === 0 && (
              <div className="text-center py-16 text-gray-600">
                <ClipboardList size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-bold">No hay sesiones registradas</p>
              </div>
            )}
            {historial.map(s => {
              const logroCfg = s.se_logro ? LOGRO_CONFIG[s.se_logro] : null;
              const LogroIcon = logroCfg?.icon;
              const tipoCfg = TIPO_COLORS[s.objetivo_tipo] || 'text-gray-400 border-white/10';
              return (
                <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="glass-card rounded-2xl p-4 border border-white/8 hover:border-white/15 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-widest ${tipoCfg}`}>
                        {s.tipo} • {s.objetivo_tipo}
                      </span>
                      {s.tipo?.startsWith('Grupal') && s.grupos_entrenamiento && (
                        <span className="text-[9px] text-gray-500">{s.grupos_entrenamiento.nombre}</span>
                      )}
                      {s.tipo === 'Privada 1v1' && s.atletas && (
                        <span className="text-[9px] text-gray-500">{s.atletas?.usuarios?.nombre}</span>
                      )}
                    </div>
                    <span className="text-[9px] text-gray-600 font-bold">{s.fecha}</span>
                  </div>
                  <p className="text-xs text-gray-300 mb-3 leading-relaxed">{s.objetivo_descripcion}</p>

                  {/* Estado de evaluación */}
                  {s.se_logro ? (
                    <div className="flex items-center justify-between">
                      <div className={`flex items-center space-x-1.5 text-[10px] font-bold px-2 py-1 rounded-lg ${logroCfg?.color}`}>
                        {LogroIcon && <LogroIcon size={12} />}
                        <span>Se logró: {s.se_logro}</span>
                      </div>
                      <button onClick={() => abrirWA(s)}
                        className="flex items-center gap-1.5 px-3 py-2.5 min-h-11 rounded-lg border border-emerald-500/30 text-xs font-bold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors">
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
                              className={`flex-1 py-3 min-h-11 rounded-lg text-xs font-black uppercase border transition-all ${
                                evalData.se_logro === v ? LOGRO_CONFIG[v].color : 'border-white/10 text-gray-500 hover:bg-white/5'
                              }`}>{v}</button>
                          ))}
                        </div>
                        <textarea rows={2} placeholder="Notas de evaluación..."
                          value={evalData.notas} onChange={e => setEvalData(d => ({ ...d, notas: e.target.value }))}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-base md:text-sm text-white placeholder-gray-600 focus:outline-none resize-none" />
                        <div className="flex gap-2">
                          <button onClick={() => handleEvaluar(s.id)}
                            className="flex-1 py-2 bg-[#FFD700]/10 border border-[#FFD700]/30 text-[#FFD700] text-[10px] font-black rounded-xl uppercase tracking-widest hover:bg-[#FFD700]/20">
                            Guardar
                          </button>
                          <button onClick={() => setEvaluandoId(null)}
                            className="px-3 py-2 border border-white/10 text-gray-500 text-[10px] font-black rounded-xl uppercase hover:text-white">
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
