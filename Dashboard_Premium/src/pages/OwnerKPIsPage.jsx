import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { BarChart3, Crown, Loader2 } from 'lucide-react';
import { useAuth } from '../AuthContext';
import BotonVolver from '../components/arcade/BotonVolver';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { supabase } from '../api/supabaseClient';
import { getSubPilarScores } from '../lib/radarCalc';
import { COLORS, CHART } from '../lib/designTokens';
import Sidebar from '../components/Sidebar';
import CutCard from '../components/arcade/CutCard';
import HexAvatar from '../components/arcade/HexAvatar';
import MicroLabel from '../components/arcade/MicroLabel';
import KpiTile from '../components/arcade/KpiTile';
import KpiGrid from '../components/arcade/KpiGrid';
import LiveDot from '../components/arcade/LiveDot';
import { C, BORDER, GRAD, GLOW, TINT, cut, gridBackgroundDesktop, PIXEL } from '../components/arcade/arcadeTokens';

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
    <div style={{ background: C.cardAlt2, border: `1px solid ${BORDER.neutralSoft}`, clipPath: cut(7), padding: '10px 14px' }}>
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: C.text }}>{label}</p>
      <p className="text-lg font-black mt-1" style={{ color: C.gold }}>{payload[0].value}%</p>
    </div>
  );
};

export default function OwnerKPIsPage() {
  const { user } = useAuth();
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

  // Atletas con al menos una evaluación registrada — son los únicos que
  // deben contar en promedios de rendimiento (si no, un club con muchos
  // atletas sin evaluar arrastra el promedio hacia 0 sin que eso refleje
  // rendimiento real).
  const atletasEvaluados = useMemo(
    () => atletas.filter(a => (a._evaluaciones || []).length > 0),
    [atletas]
  );

  // Compute aggregate metrics
  const promedioIntegral = useMemo(() => {
    if (!atletasEvaluados.length) return 0;
    const sum = atletasEvaluados.reduce((acc, a) => acc + (a.rango?.pct || 0), 0);
    return Math.round(sum / atletasEvaluados.length);
  }, [atletasEvaluados]);

  // Metric weakness analysis — cada pilar promedia solo entre los atletas
  // que tienen al menos una evaluación de ESE sub-pilar (un atleta puede
  // tener datos de fuerza pero no de resiliencia, por ejemplo).
  const metricData = useMemo(() => {
    if (!atletas.length) return [];
    const keys = Object.keys(METRIC_LABELS);

    const perAtleta = atletas.map(a => ({
      scores: getSubPilarScores(a._evaluaciones || []),
      subPilaresConDato: new Set((a._evaluaciones || []).map(e => e.sub_pilar)),
    }));

    const averages = keys.map(key => {
      const conDato = perAtleta.filter(p => p.subPilaresConDato.has(key));
      const sum = conDato.reduce((acc, p) => acc + (p.scores[key] || 0), 0);
      const avg = conDato.length ? Math.round(sum / conDato.length) : 0;
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
    { label: 'Total Atletas', value: atletas.length, color: C.info },
    { label: 'Promedio Integral', value: `${promedioIntegral}%`, color: C.gold },
    { label: 'Asistencia Semanal', value: asistenciaPct !== null ? `${asistenciaPct}%` : '—', color: C.ok },
    { label: 'Misiones Completadas', value: misionesCompletadas !== null ? misionesCompletadas : '—', color: C.ai },
  ];

  return (
    <div className="flex h-dvh overflow-hidden" style={{ ...gridBackgroundDesktop, color: C.text }}>
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative z-0">
        <div className="relative z-10 p-6 md:p-12">
        <div className="max-w-7xl mx-auto">
          {/* Header (Panel-denso §6.4: HexAvatar de identidad + título + MicroLabel) */}
          <div className="flex items-center gap-4 mb-10">
            <BotonVolver />
            <div className="flex items-center gap-3">
              <HexAvatar size={44} background={GRAD.goldHex} color={C.ink}>
                <BarChart3 size={22} strokeWidth={2.5} />
              </HexAvatar>
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tight" style={{ color: C.text }}>
                  KPIs del <span style={{ color: C.gold }}>Club</span>
                </h2>
                <MicroLabel style={{ marginTop: 4 }}>Panel ejecutivo · Métricas agregadas</MicroLabel>
              </div>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center h-64" style={{ color: C.text3 }}>
              <Loader2 size={48} className="mb-4 opacity-20 animate-spin" />
              <MicroLabel>Cargando datos del club...</MicroLabel>
            </div>
          )}

          {!loading && (
            <>
              {/* ===== SECTION 1: Summary KPIs (grid auto-fit §6.4) ===== */}
              <KpiGrid min={190} gap={12} style={{ marginBottom: 48 }}>
                {summaryCards.map((card) => (
                  <KpiTile key={card.label} label={card.label} val={card.value} color={card.color} labelSize={9} />
                ))}
              </KpiGrid>

              {/* ===== SECTION 2: Metric Weakness Analysis ===== */}
              <CutCard cut={12} padding="20px" className="mb-12">
                <MicroLabel as="h3" style={{ marginBottom: 20 }}>Análisis de Métricas del Club</MicroLabel>
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
                  <div
                    className="mt-6 flex items-center gap-3 px-5 py-3"
                    style={{ background: TINT.danger, border: `1px solid ${BORDER.danger}`, clipPath: cut(7) }}
                  >
                    <LiveDot color={C.danger} size={8} />
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: C.danger }}>
                      Punto débil del club: {weakestMetric.name} con un promedio de {weakestMetric.promedio}%
                    </p>
                  </div>
                )}
              </CutCard>

              {/* ===== SECTION 3: Distribution by Category ===== */}
              <CutCard cut={12} padding="20px" className="mb-12">
                <MicroLabel as="h3" style={{ marginBottom: 20 }}>Distribución por Categoría</MicroLabel>
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
                              <div style={{ background: C.cardAlt2, border: `1px solid ${BORDER.neutralSoft}`, clipPath: cut(7), padding: '10px 14px' }}>
                                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: C.text }}>{payload[0].name}</p>
                                <p className="text-lg font-black mt-1" style={{ color: C.gold }}>{payload[0].value} atletas</p>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 w-full lg:w-1/2">
                    {categoryData.map((cat) => (
                      <div
                        key={cat.name}
                        className="flex items-center gap-3 min-w-0 px-4 py-3"
                        style={{ background: C.cardAlt1, border: `1px solid ${BORDER.neutral}`, clipPath: cut(7) }}
                      >
                        <span className="flex-shrink-0" style={{ width: 12, height: 12, borderRadius: '50%', background: cat.color }} />
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate" style={{ color: C.text }}>{cat.name}</p>
                          <MicroLabel style={{ marginTop: 2 }}>{cat.value} atletas</MicroLabel>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CutCard>

              {/* ===== SECTION 4: Top 5 Performers ===== */}
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <Crown size={18} style={{ color: C.gold, filter: GLOW.hexGold }} />
                  <MicroLabel as="h3">Top 5 · Máximos Rendimientos</MicroLabel>
                </div>
                <KpiGrid min={200} gap={12}>
                  {top5.map((atleta, i) => (
                    <CutCard
                      key={atleta.atleta_id}
                      cut={12}
                      padding="16px"
                      border={i === 0 ? BORDER.goldStrong : BORDER.neutral}
                      style={i === 0 ? { boxShadow: GLOW.hexGoldMid } : undefined}
                    >
                      <div className="flex items-center gap-3">
                        <span style={{ fontFamily: PIXEL, fontSize: 18, color: i === 0 ? C.gold : C.text3, width: 20, flex: 'none' }}>{i + 1}</span>
                        <HexAvatar size={36} background={i === 0 ? GRAD.goldHex : undefined} color={i === 0 ? C.ink : undefined}>
                          {atleta.nombre?.charAt(0) || '—'}
                        </HexAvatar>
                        {i === 0 && <Crown size={14} style={{ color: C.gold, marginLeft: 'auto' }} />}
                      </div>
                      <p className="mt-3 text-sm font-bold truncate" style={{ color: C.text }}>{atleta.nombre}</p>
                      <MicroLabel style={{ marginTop: 2 }}>{atleta.categoria}</MicroLabel>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <MicroLabel style={{ margin: 0 }}>{atleta.rango?.nombre}</MicroLabel>
                        <span style={{ fontFamily: PIXEL, fontSize: 16, color: i === 0 ? C.gold : C.text }}>{atleta.rango?.pct || 0}%</span>
                      </div>
                      <div className="mt-2" style={{ height: 6, background: C.cardAlt1, clipPath: cut(2), overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${atleta.rango?.pct || 0}%`, background: i === 0 ? GRAD.goldCTA : C.text2 }} />
                      </div>
                    </CutCard>
                  ))}
                </KpiGrid>
              </div>
            </>
          )}
        </div>
      </div>
      </main>
    </div>
  );
}
