import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { fetchSesionesAtleta, crearSesionEntrenamiento } from '../api/sesionesEntrenamientoService';
import { evaluateSessionRules } from '../lib/trainingRules';
import { ArrowLeft, Save, FlaskConical, ShieldAlert, AlertTriangle, Info, Activity, Clock, Zap, Dumbbell, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

const METAS = ['Fuerza', 'Velocidad', 'Resistencia', 'Coordinación', 'Flexibilidad', 'Recuperación Activa'];
const PAUSAS = ['Densidad Baja', 'Densidad Alta'];
const INTENSIDADES = ['Media', 'Submáxima', 'Máxima'];
const PARENTESCOS = ['Generales', 'Especiales', 'Técnicos con Carga Extra'];
const TEMPOS = ['Regular', '3-1-3 Isométrico'];

export default function AdminPlanificacion() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [atletas, setAtletas] = useState([]);
  const [selectedAtleta, setSelectedAtleta] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const formColRef = useRef(null);

  const emptySession = {
    meta_entrenamiento: 'Fuerza',
    tipo_pausa: 'Densidad Baja',
    intensidad_bpm: 'Media',
    parentesco_competencia: 'Generales',
    volumen_especifico_pct: 0,
    duracion_minutos: 60,
    tempo_hsr: 'Regular',
    volumen_series_reps: '',
    notas: '',
    eva_registro: 0,
  };
  const [form, setForm] = useState(emptySession);

  useEffect(() => {
    const load = async () => {
      const data = await fetchTodosLosAtletas(user);
      setAtletas(data);
    };
    load();
  }, [user]);

  useEffect(() => {
    if (!selectedAtleta) { setRecentSessions([]); return; }
    const loadSessions = async () => {
      const sessions = await fetchSesionesAtleta(selectedAtleta.atleta_id);
      setRecentSessions(sessions);
    };
    loadSessions();
  }, [selectedAtleta]);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // Evaluate rules reactively
  const rulesResult = useMemo(() => {
    if (!selectedAtleta) return { approved: true, alerts: [] };
    return evaluateSessionRules(form, selectedAtleta, recentSessions);
  }, [form, selectedAtleta, recentSessions]);

  const handleSelectAtleta = (atleta) => {
    setSelectedAtleta(atleta);
    setForm(emptySession);
    setSuccess('');
    setError('');
    // En móvil el formulario queda debajo de la lista completa: llevar al coach directo a él
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setTimeout(() => formColRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  };

  const atletasFiltrados = busqueda
    ? atletas.filter(a => a.nombre?.toLowerCase().includes(busqueda.toLowerCase()))
    : atletas;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAtleta || !rulesResult.approved) return;
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await crearSesionEntrenamiento({
        atleta_id: selectedAtleta.atleta_id,
        meta_entrenamiento: form.meta_entrenamiento,
        tipo_pausa: form.tipo_pausa,
        intensidad_bpm: form.intensidad_bpm,
        parentesco_competencia: form.parentesco_competencia,
        volumen_especifico_pct: parseInt(form.volumen_especifico_pct),
        duracion_minutos: parseInt(form.duracion_minutos),
        tempo_hsr: form.tempo_hsr,
        volumen_series_reps: form.volumen_series_reps,
        notas: form.notas,
        eva_registro: parseInt(form.eva_registro),
      });

      setSuccess(`Sesión de ${form.meta_entrenamiento} registrada para ${selectedAtleta.nombre}.`);
      setForm(emptySession);
      // Reload sessions
      const sessions = await fetchSesionesAtleta(selectedAtleta.atleta_id);
      setRecentSessions(sessions);
    } catch (err) {
      setError(err.message || 'Error al crear la sesión.');
    }
    setSaving(false);
  };

  const getBadgeClass = (type) => {
    switch (type) {
      case 'Iniciación': return 'border-brand/30 text-brand bg-brand/5';
      case 'Especialización': return 'border-cyan-500/30 text-cyan-400 bg-cyan-500/5';
      case 'Alto Rendimiento': return 'border-mental/30 text-mental-soft bg-mental/5';
      default: return 'border-white/20 text-gray-300 bg-white/5';
    }
  };

  const getRecoveryColor = (estado) => {
    switch (estado) {
      case 'Óptimo': return 'text-success-soft';
      case 'Agotamiento Activo': return 'text-warning-soft';
      case 'Fatiga Silenciosa': return 'text-mental-soft';
      default: return 'text-fg-secondary';
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center space-x-4 mb-10">
        <button onClick={() => navigate('/dashboard')} aria-label="Volver al dashboard"
          className="p-2 -m-2 text-fg-muted hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tight">
            Planificación <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-brand-strong">Científica</span>
          </h2>
          <p className="text-2xs text-fg-muted font-bold uppercase tracking-eyebrow mt-1">Motor de Reglas · Hollmann · Harre · Milo</p>
        </div>
      </div>

      {error && <div className="mb-6 p-4 rounded-control bg-danger/10 border border-danger/30 text-danger-soft text-sm font-bold">{error}</div>}
      {success && <div className="mb-6 p-4 rounded-control bg-success/10 border border-success/30 text-success-soft text-sm font-bold">{success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Athlete Selector */}
        <div className="lg:col-span-1 space-y-3">
          <p className="text-2xs text-fg-muted font-bold uppercase tracking-eyebrow mb-3">
            <FlaskConical size={12} className="inline mr-1" /> Seleccionar Atleta
          </p>
          <div className="flex items-center space-x-2 bg-black/40 border border-white/10 rounded-control px-3 py-2.5 mb-3">
            <Search size={13} className="text-fg-muted" />
            <input
              type="text"
              placeholder="Buscar atleta..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="bg-transparent text-sm text-white placeholder-gray-600 font-bold focus:outline-none w-full"
            />
          </div>
          {atletasFiltrados.map(atleta => (
            <button
              key={atleta.id}
              onClick={() => handleSelectAtleta(atleta)}
              className={`w-full text-left p-4 rounded-control border transition active:scale-[0.99] ${
                selectedAtleta?.id === atleta.id
                  ? 'bg-brand/5 border-brand/40 shadow-[0_0_15px_rgba(255,215,0,0.1)]'
                  : 'bg-white/[0.02] border-white/5 hover:border-white/15 hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-white">{atleta.nombre}</p>
                  <p className="text-2xs text-fg-secondary font-bold uppercase tracking-widest mt-1">
                    {atleta.posicion} · {atleta.categoria}
                  </p>
                </div>
                <div className={`text-xs font-black uppercase tracking-widest ${atleta.rango?.textColor || 'text-fg-secondary'}`}>
                  {atleta.rango?.nombre}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1 mt-2">
                <span className={`text-2xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${getBadgeClass(atleta.nivel_desarrollo)}`}>
                  {atleta.nivel_desarrollo || 'Micro'}
                </span>
                <span className="text-2xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-success/30 text-success-soft bg-success/5">
                  {atleta.perfil_mental || 'Estable'}
                </span>
                <span className={`text-2xs font-bold uppercase tracking-widest ${getRecoveryColor(atleta.estado_recuperacion)}`}>
                  {atleta.estado_recuperacion || 'Óptimo'}
                </span>
              </div>
              {atleta.restriccion_movilidad && atleta.restriccion_movilidad !== 'Ninguna' && (
                <span className="inline-block mt-1.5 text-2xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-caution/30 text-caution-soft bg-caution/5">
                  {atleta.restriccion_movilidad}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Right Column: Session Form + Rules Console */}
        <div className="lg:col-span-2 scroll-mt-4" ref={formColRef}>
          {!selectedAtleta ? (
            <div className="flex flex-col items-center justify-center h-64 text-fg-muted">
              <FlaskConical size={48} className="mb-4 opacity-20" />
              <p className="text-xs font-bold uppercase tracking-widest">Selecciona un atleta para planificar</p>
            </div>
          ) : (
            <motion.form
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleSubmit}
              className="space-y-6"
            >
              {/* Session Config */}
              <div className="glass-card rounded-panel p-6 glow-border">
                <h3 className="text-sm font-black text-white uppercase tracking-tight mb-5 flex items-center space-x-2">
                  <Dumbbell size={16} className="text-brand" />
                  <span>Configurar Sesión — {selectedAtleta.nombre}</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <SelectField label="Meta del Entrenamiento" value={form.meta_entrenamiento} options={METAS} onChange={v => handleChange('meta_entrenamiento', v)} />
                  <SelectField label="Tipo de Pausa / Densidad" value={form.tipo_pausa} options={PAUSAS} onChange={v => handleChange('tipo_pausa', v)} />
                  <SelectField label="Nivel de Esfuerzo (BPM)" value={form.intensidad_bpm} options={INTENSIDADES} onChange={v => handleChange('intensidad_bpm', v)} />
                  <SelectField label="Parentesco con Competencia" value={form.parentesco_competencia} options={PARENTESCOS} onChange={v => handleChange('parentesco_competencia', v)} />

                  {selectedAtleta.nivel_desarrollo === 'Micro' && (
                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-3xs text-fg-secondary font-bold uppercase tracking-widest">Volumen Específico (%)</label>
                        <span className={`text-xs font-black ${form.volumen_especifico_pct > 30 ? 'text-danger-soft' : 'text-brand'}`}>{form.volumen_especifico_pct}%</span>
                      </div>
                      <div className="py-2">
                        <input
                          type="range" min="0" max="100" value={form.volumen_especifico_pct}
                          onChange={e => handleChange('volumen_especifico_pct', parseInt(e.target.value))}
                          className="w-full h-2 rounded-full appearance-none cursor-pointer accent-brand bg-white/10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-brand"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-3xs text-fg-secondary font-bold uppercase tracking-widest mb-2">Duración (minutos)</label>
                    <input
                      type="number" inputMode="numeric" value={form.duracion_minutos} min="15" max="180"
                      onChange={e => handleChange('duracion_minutos', e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/50 transition-colors"
                    />
                  </div>

                  <SelectField label="Tempo HSR" value={form.tempo_hsr} options={TEMPOS} onChange={v => handleChange('tempo_hsr', v)} />

                  <div>
                    <label className="block text-3xs text-fg-secondary font-bold uppercase tracking-widest mb-2">Volumen (Series x Reps)</label>
                    <input
                      type="text" value={form.volumen_series_reps}
                      onChange={e => handleChange('volumen_series_reps', e.target.value)}
                      placeholder="Ej. 4x15"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/50 transition-colors"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-3xs text-fg-secondary font-bold uppercase tracking-widest mb-2">Notas del Coach</label>
                  <textarea
                    value={form.notas}
                    onChange={e => handleChange('notas', e.target.value)}
                    rows={2}
                    placeholder="Observaciones, ajustes individuales..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/50 transition-colors resize-none"
                  />
                </div>
              </div>

              {/* Scientific Rules Console */}
              <div className="glass-card rounded-panel p-6 glow-border">
                <h3 className="text-sm font-black text-white uppercase tracking-tight mb-4 flex items-center space-x-2">
                  <ShieldAlert size={16} className="text-brand" />
                  <span>Consola Científica</span>
                  <span className={`text-3xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                    rulesResult.approved
                      ? 'bg-success/10 border border-success/30 text-success-soft'
                      : 'bg-danger/10 border border-danger/30 text-danger-soft'
                  }`}>
                    {rulesResult.approved ? '✓ Aprobado' : '✕ Bloqueado'}
                  </span>
                </h3>

                {rulesResult.alerts.length === 0 ? (
                  <div className="flex items-center space-x-3 p-4 rounded-control bg-success/5 border border-success/20">
                    <div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
                    <p className="text-xs text-success-soft font-medium">Todos los principios de Hollmann, Harre y Milo se cumplen. Sesión segura.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rulesResult.alerts.map((alert, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`p-4 rounded-control border backdrop-blur-md ${
                          alert.type === 'block'
                            ? 'bg-red-950/40 border-danger/40'
                            : alert.type === 'warning'
                            ? 'bg-amber-950/30 border-warning/30'
                            : 'bg-cyan-950/30 border-cyan-500/30'
                        }`}
                      >
                        <div className="flex items-center space-x-2 mb-1">
                          {alert.type === 'block' && <div className="w-2 h-2 rounded-full bg-danger animate-pulse"></div>}
                          {alert.type === 'warning' && <AlertTriangle size={14} className="text-warning-soft" />}
                          {alert.type === 'info' && <Info size={14} className="text-cyan-400" />}
                          <span className={`font-black uppercase tracking-widest text-2xs ${
                            alert.type === 'block' ? 'text-danger-soft' : alert.type === 'warning' ? 'text-warning-soft' : 'text-cyan-400'
                          }`}>
                            {alert.rule}
                          </span>
                        </div>
                        <p className={`text-xs font-light leading-relaxed ${
                          alert.type === 'block' ? 'text-red-200/80' : alert.type === 'warning' ? 'text-amber-200/80' : 'text-cyan-200/80'
                        }`}>
                          {alert.message}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={saving || !rulesResult.approved}
                className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-brand to-brand-strong text-black font-black uppercase tracking-widest py-4 rounded-control shadow-[0_0_20px_rgba(255,215,0,0.3)] hover:shadow-[0_0_30px_rgba(255,215,0,0.5)] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save size={16} />
                <span>{saving ? 'Registrando en Supabase...' : 'Registrar Sesión de Entrenamiento'}</span>
              </button>

              {/* Session History */}
              {recentSessions.length > 0 && (
                <div className="mt-4">
                  <p className="text-2xs text-fg-muted font-bold uppercase tracking-eyebrow mb-3">
                    <Clock size={12} className="inline mr-1" /> Historial de Sesiones — {selectedAtleta.nombre}
                  </p>
                  <div className="space-y-2">
                    {recentSessions.map((s, i) => (
                      <motion.div
                        key={s.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="glass-card rounded-control p-4 flex items-center justify-between border border-white/5"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="w-8 h-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center">
                            {s.meta_entrenamiento === 'Fuerza' && <Dumbbell size={14} className="text-brand" />}
                            {s.meta_entrenamiento === 'Velocidad' && <Zap size={14} className="text-brand" />}
                            {!['Fuerza', 'Velocidad'].includes(s.meta_entrenamiento) && <Activity size={14} className="text-brand" />}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">{s.meta_entrenamiento}</p>
                            <p className="text-3xs text-fg-muted font-bold uppercase tracking-widest">
                              {s.fecha} · {s.intensidad_bpm} · {s.duracion_minutos} min
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className="text-3xs text-fg-muted font-bold uppercase tracking-widest">{s.tipo_pausa}</span>
                          {s.eva_registro > 0 && (
                            <span className={`text-3xs font-black px-2 py-0.5 rounded-full ${
                              s.eva_registro > 3 ? 'bg-danger/10 text-danger-soft border border-danger/30' : 'bg-success/10 text-success-soft border border-success/30'
                            }`}>
                              EVA {s.eva_registro}/10
                            </span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </motion.form>
          )}
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <div>
      <label className="block text-3xs text-fg-secondary font-bold uppercase tracking-widest mb-2">{label}</label>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/50 transition-colors appearance-none cursor-pointer"
      >
        {options.map(o => <option key={o} value={o} className="bg-surface-card">{o}</option>)}
      </select>
    </div>
  );
}
