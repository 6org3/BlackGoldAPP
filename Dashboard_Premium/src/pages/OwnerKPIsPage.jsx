import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ArrowLeft, Users, TrendingUp, Target, BarChart3, CalendarCheck, Crown, Loader2 } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { supabase } from '../api/supabaseClient';
import { getSubPilarScores } from '../lib/radarCalc';
import { COLORS, CHART, staggerDelay } from '../lib/designTokens';

const METRIC_LABELS = {
  fuerza: 'Fuerza',
  explosividad: 'Explosividad',
  movilidad: 'Movilidad',
  tiro: 'Técnica Tiro',
  agilidad: 'Agilidad',
  tactica: 'Efic. Táctica',
  resiliencia: 'Resiliencia',
};

// Claves alineadas con calcularCategoriaFEB() (src/api/utilsAtletas.js).
// Colores desde la paleta categórica del design system (CHART.categorical).
const CATEGORY_COLORS = CHART.categorical;

// Detecta viewport móvil (<sm) para adaptar los gráficos Recharts
function useEsMovil() {
  const [esMovil, setEsMovil] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = (e) => setEsMovil(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return esMovil;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-top border border-white/10 rounded-control px-4 py-3 shadow-2xl">
      <p className="text-xs font-bold text-white uppercase tracking-widest">{label}</p>
      <p className="text-lg font-black text-brand mt-1">{payload[0].value}%</p>
    </div>
  );
};

export default function OwnerKPIsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const esMovil = useEsMovil();

  const [atletas, setAtletas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [asistenciaPct, setAsistenciaPct] = useState(null);
  const [misionesCompletadas, setMisionesCompletadas] = useState(null);

  // Load all athletes
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await fetchTodosLosAtletas(user);
      setAtletas(data);
      setLoading(false);
    };
    load();
  }, [user]);

  // Load attendance for last 7 days
  useEffect(() => {
    const loadAsistencia = async () => {
      if (!atletas.length) {
        setAsistenciaPct(0);
        return;
      }
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data, error } = await supabase
        .from('asistencia')
        .select('estado')
        // a.id es el id de usuarios; asistencia.atleta_id referencia a la tabla atletas
        .in('atleta_id', atletas.map(a => a.atleta_id))
        .gte('fecha', sevenDaysAgo.toISOString().split('T')[0]);

      if (!error && data && data.length > 0) {
        const presentes = data.filter(r => r.estado === 'Presente').length;
        setAsistenciaPct(Math.round((presentes / data.length) * 100));
      } else {
        setAsistenciaPct(0);
      }
    };
    loadAsistencia();
  }, [atletas]);

  // Load completed missions count
  useEffect(() => {
    const loadMisiones = async () => {
      if (!atletas.length) {
        setMisionesCompletadas(0);
        return;
      }
      const { count, error } = await supabase
        .from('progreso_misiones')
        .select('*', { count: 'exact', head: true })
        .in('atleta_id', atletas.map(a => a.atleta_id))
        .eq('completada', true);

      if (!error) {
        setMisionesCompletadas(count || 0);
      } else {
        setMisionesCompletadas(0);
      }
    };
    loadMisiones();
  }, [atletas]);

  // Compute aggregate metrics
  const promedioIntegral = useMemo(() => {
    if (!atletas.length) return 0;
    const sum = atletas.reduce((acc, a) => acc + (a.rango?.pct || 0), 0);
    return Math.round(sum / atletas.length);
  }, [atletas]);

  // Metric weakness analysis
  const metricData = useMemo(() => {
    if (!atletas.length) return [];
    const keys = Object.keys(METRIC_LABELS);
    
    const allScores = atletas.map(a => getSubPilarScores(a._evaluaciones || []));

    const averages = keys.map(key => {
      const sum = allScores.reduce((acc, scores) => acc + (scores[key] || 0), 0);
      const avg = Math.round(sum / atletas.length);
      return { key, name: METRIC_LABELS[key], promedio: avg };
    });
    return averages;
  }, [atletas]);

  const weakestMetric = useMemo(() => {
    if (!metricData.length) return null;
    return metricData.reduce((min, m) => m.promedio < min.promedio ? m : min, metricData[0]);
  }, [metricData]);

  // Category distribution
  const categoryData = useMemo(() => {
    if (!atletas.length) return [];
    const counts = {};
    atletas.forEach(a => {
      const cat = a.categoria || 'Sin categoría';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      color: CATEGORY_COLORS[name] || CHART.categorical.fallback,
    }));
  }, [atletas]);

  // Top 5 performers
  const top5 = useMemo(() => {
    if (!atletas.length) return [];
    return [...atletas]
      .sort((a, b) => (b.rango?.pct || 0) - (a.rango?.pct || 0))
      .slice(0, 5);
  }, [atletas]);

  const summaryCards = [
    {
      label: 'Total Atletas',
      value: atletas.length,
      icon: Users,
      color: 'text-cyan-400',
      glow: 'shadow-[0_0_20px_rgba(6,182,212,0.15)]',
    },
    {
      label: 'Promedio Integral',
      value: `${promedioIntegral}%`,
      icon: TrendingUp,
      color: 'text-brand',
      glow: 'shadow-[0_0_20px_rgba(255,215,0,0.15)]',
    },
    {
      label: 'Asistencia Semanal',
      value: asistenciaPct !== null ? `${asistenciaPct}%` : '—',
      icon: CalendarCheck,
      color: 'text-success-soft',
      glow: 'shadow-[0_0_20px_rgba(52,211,153,0.15)]',
    },
    {
      label: 'Misiones Completadas',
      value: misionesCompletadas !== null ? misionesCompletadas : '—',
      icon: Target,
      color: 'text-mental-soft',
      glow: 'shadow-[0_0_20px_rgba(168,85,247,0.15)]',
    },
  ];

  return (
    <div className="min-h-screen bg-surface-base text-white relative overflow-hidden">
      {/* Ambient Glow Effects (solo desktop: composición GPU cara en gama baja) */}
      <div className="hidden md:block fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-200px] left-[-200px] w-[600px] h-[600px] bg-brand/[0.03] rounded-full blur-[150px]" />
        <div className="absolute bottom-[-200px] right-[-200px] w-[500px] h-[500px] bg-mental/[0.03] rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10 p-6 md:p-12">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center space-x-4 mb-10">
            <button onClick={() => navigate('/dashboard')} aria-label="Volver al dashboard" className="p-3 -ml-3 rounded-full text-fg-muted hover:text-white hover:bg-white/5 transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center space-x-3">
              <BarChart3 className="text-brand drop-shadow-[0_0_8px_rgba(255,215,0,0.6)]" size={28} />
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tight">
                  KPIs del{' '}
                  <span className="text-gradient-gold">
                    Club
                  </span>
                </h2>
                <p className="text-2xs text-fg-muted font-bold uppercase tracking-eyebrow mt-1">
                  Panel ejecutivo · Métricas agregadas
                </p>
              </div>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center h-64 text-fg-muted">
              <Loader2 size={48} className="mb-4 opacity-20 animate-spin" />
              <p className="text-xs font-bold uppercase tracking-widest">Cargando datos del club...</p>
            </div>
          )}

          {!loading && (
            <>
              {/* ===== SECTION 1: Summary Cards ===== */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
                {summaryCards.map((card, i) => (
                  <motion.div
                    key={card.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: staggerDelay(i) }}
                    className={`glass-card rounded-panel border border-white/10 p-6 ${card.glow}`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-2xs text-fg-muted font-bold uppercase tracking-widest pr-2">{card.label}</p>
                      <card.icon size={20} className={card.color} />
                    </div>
                    <p className={`text-4xl font-black ${card.color}`}>{card.value}</p>
                  </motion.div>
                ))}
              </div>

              {/* ===== SECTION 2: Metric Weakness Analysis ===== */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="glass-card rounded-panel border border-white/10 p-6 md:p-8 mb-12"
              >
                <h3 className="text-2xs text-fg-muted font-bold uppercase tracking-eyebrow mb-6">
                  Análisis de Métricas del Club
                </h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={metricData}
                      layout="vertical"
                      margin={esMovil ? { top: 0, right: 12, left: 0, bottom: 0 } : { top: 0, right: 30, left: 20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fill: CHART.axis, fontSize: 10 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={esMovil ? 84 : 130}
                        tick={{ fill: CHART.label, fontSize: esMovil ? 10 : 11, fontWeight: 700 }}
                        tickFormatter={esMovil ? (v) => v.replace('Efic. ', '').replace('Técnica ', '') : undefined}
                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                      />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                      <Bar dataKey="promedio" radius={[0, 8, 8, 0]}>
                        {metricData.map((entry) => (
                          <Cell
                            key={entry.key}
                            fill={weakestMetric && entry.key === weakestMetric.key ? COLORS.feedback.danger : COLORS.gold[500]}
                            fillOpacity={weakestMetric && entry.key === weakestMetric.key ? 0.8 : 0.6}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {weakestMetric && (
                  <div className="mt-6 flex items-center space-x-3 bg-danger/10 border border-danger/20 rounded-panel px-5 py-3">
                    <div className="w-2 h-2 rounded-full bg-danger animate-pulse" />
                    <p className="text-xs font-bold text-danger-soft uppercase tracking-widest">
                      Punto débil del club: {weakestMetric.name} con un promedio de {weakestMetric.promedio}%
                    </p>
                  </div>
                )}
              </motion.div>

              {/* ===== SECTION 3: Distribution by Category ===== */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="glass-card rounded-panel border border-white/10 p-6 md:p-8 mb-12"
              >
                <h3 className="text-2xs text-fg-muted font-bold uppercase tracking-eyebrow mb-6">
                  Distribución por Categoría
                </h3>
                <div className="flex flex-col lg:flex-row items-center gap-8">
                  <div className="h-72 w-full lg:w-1/2">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                        >
                          {categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div className="bg-surface-top border border-white/10 rounded-control px-4 py-3 shadow-2xl">
                                <p className="text-xs font-bold text-white uppercase tracking-widest">{payload[0].name}</p>
                                <p className="text-lg font-black text-brand mt-1">{payload[0].value} atletas</p>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 w-full lg:w-1/2">
                    {categoryData.map((cat) => (
                      <div key={cat.name} className="flex items-center space-x-3 min-w-0 bg-white/[0.02] rounded-panel px-4 py-3 border border-white/5">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{cat.name}</p>
                          <p className="text-2xs text-fg-muted font-bold">{cat.value} atletas</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* ===== SECTION 4: Top 5 Performers ===== */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
              >
                <div className="flex items-center space-x-3 mb-6">
                  <Crown size={18} className="text-brand drop-shadow-[0_0_8px_rgba(255,215,0,0.6)]" />
                  <h3 className="text-2xs text-fg-muted font-bold uppercase tracking-eyebrow">
                    Top 5 · Máximos Rendimientos
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {top5.map((atleta, i) => (
                    <motion.div
                      key={atleta.atleta_id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.6 + staggerDelay(i) }}
                      className={`glass-card rounded-panel border p-5 relative overflow-hidden ${
                        i === 0
                          ? 'border-brand/30 shadow-[0_0_25px_rgba(255,215,0,0.12)]'
                          : 'border-white/10'
                      }`}
                    >
                      {/* Rank Number */}
                      <div className={`absolute top-3 right-3 text-3xl font-black ${
                        i === 0 ? 'text-brand/20' : 'text-white/5'
                      }`}>
                        {i + 1}
                      </div>

                      {/* Crown for #1 */}
                      {i === 0 && (
                        <Crown size={14} className="text-brand mb-2 drop-shadow-[0_0_6px_rgba(255,215,0,0.5)]" />
                      )}

                      <p className="text-sm font-bold text-white truncate">{atleta.nombre}</p>
                      <p className="text-2xs text-fg-secondary font-bold uppercase tracking-widest mt-1">
                        {atleta.categoria}
                      </p>

                      {/* Rango Badge */}
                      <div className="mt-3 flex items-center justify-between">
                        <span className={`text-2xs font-black uppercase tracking-widest ${atleta.rango?.textColor || 'text-fg-secondary'}`}>
                          {atleta.rango?.nombre} {atleta.rango?.tier}
                        </span>
                        <span className={`text-lg font-black ${
                          i === 0 ? 'text-brand' : 'text-white'
                        }`}>
                          {atleta.rango?.pct || 0}%
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-3 h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${atleta.rango?.pct || 0}%` }}
                          transition={{ delay: 0.8 + staggerDelay(i, 0.1), duration: 0.8, ease: 'easeOut' }}
                          className={`h-full rounded-full ${
                            i === 0 ? 'progress-bar-glow' : 'bg-white/30'
                          }`}
                        />
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
