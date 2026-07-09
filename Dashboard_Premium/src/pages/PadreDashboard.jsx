import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { LogOut, Bell, FileText, CheckCircle, ShieldAlert, Sparkles, User, Calendar, CalendarDays, MessageSquare, TrendingUp, Target, Brain, Check, X, HelpCircle, MapPin, Clock } from 'lucide-react';
import { fetchPadreData } from '../api/padreService';
import { fetchConvocatoriasAtleta, responderRSVP, TIPO_EVENTO_LABEL } from '../api/eventosService';
import { fetchNotasCoach } from '../api/notasCoachService';
import { fetchMisiones } from '../api/misionesService';
import { NIVELES_BAREMO } from '../lib/baremosEngine';
import { getXPProgress } from '../lib/xpProgress';
import ScoutingReportTemplate from '../components/ScoutingReportTemplate';
import { Download, Loader2 } from 'lucide-react';
import { evaluarDeficits } from '../lib/didacticEngine';
import { getSubPilarScores } from '../lib/radarCalc';
import { COLORS, CHART, MOTION, staggerDelay } from '../lib/designTokens';

import EditarPerfilModal from '../components/EditarPerfilModal';
import EstadoCuentaPadre from '../components/EstadoCuentaPadre';
import CardDiagnosticoIA from '../components/CardDiagnosticoIA';
import CardReadinessIA from '../components/CardReadinessIA';
import BottomNav from '../components/BottomNav';
import Gauge from '../components/Gauge';
import { CopilotoProvider } from '../components/CopilotoLauncher';
import { fetchAsistenciaPct } from '../api/asistenciaService';

const NAV_ITEMS = [
  { key: 'inicio', label: 'Inicio', Icono: Sparkles },
  { key: 'eventos', label: 'Eventos', Icono: CalendarDays },
  { key: 'pagos', label: 'Pagos', Icono: FileText },
  { key: 'reporte', label: 'Reporte', Icono: Download },
];

const METRICAS_CONFIG = [
  { key: 'fuerza', label: 'Fuerza' },
  { key: 'explosividad', label: 'Explosividad' },
  { key: 'movilidad', label: 'Movilidad' },
  { key: 'tiro', label: 'Técnica Tiro' },
  { key: 'agilidad', label: 'Agilidad' },
  { key: 'tactica', label: 'Efic. Táctica' },
  { key: 'resiliencia', label: 'Resiliencia' },
];

export default function PadreDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ hijos: [], sesiones: [], anuncios: [] });
  const [selectedHijoIndex, setSelectedHijoIndex] = useState(0);
  const [notas, setNotas] = useState([]);
  const [misiones, setMisiones] = useState([]);
  const [convocatorias, setConvocatorias] = useState([]);
  const reportRef = React.useRef(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [navActivo, setNavActivo] = useState('inicio');
  const eventosRef = useRef(null);
  const pagosRef = useRef(null);

  const exportPDF = async () => {
    if (!hijoActual || isExporting) return;
    // isExporting monta el template oculto; esperar a que pinte antes de capturarlo
    setIsExporting(true);
    try {
      // html2canvas-pro (no html2canvas): el CSS del proyecto usa oklch()/
      // color-mix() (modificadores de opacidad de Tailwind v4, ej. bg-white/5)
      // que el html2canvas clásico no sabe parsear y hace fallar el export.
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ]);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!reportRef.current) throw new Error('Plantilla de reporte no disponible');
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: COLORS.surface.base,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Scouting_Report_${hijoActual.nombre.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Hubo un error al generar el PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  // BottomNav por anclas: sin rutas ni tabs reales, cada ítem hace scroll a
  // su sección (o dispara la exportación de PDF para "Reporte").
  const irANav = (key) => {
    setNavActivo(key);
    if (key === 'inicio') window.scrollTo({ top: 0, behavior: 'smooth' });
    else if (key === 'eventos') eventosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (key === 'pagos') pagosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (key === 'reporte') exportPDF();
  };

  useEffect(() => {
    if (!user || user.rol !== 'padre') {
      navigate('/login');
      return;
    }
    const load = async () => {
      const res = await fetchPadreData(user.id);
      setData(res);
      setLoading(false);
    };
    load();
  }, [user, navigate]);

  const hijoActual = data.hijos[selectedHijoIndex];

  useEffect(() => {
    if (!hijoActual) return;
    let cancelled = false;
    const loadHijoData = async () => {
      const [n, m, conv] = await Promise.all([
        fetchNotasCoach(hijoActual.atleta_id),
        fetchMisiones(hijoActual.id),
        fetchConvocatoriasAtleta([hijoActual.atleta_id]),
      ]);
      if (!cancelled) {
        setNotas(n);
        setMisiones(m);
        setConvocatorias(conv);
      }
    };
    loadHijoData();
    return () => { cancelled = true; };
  }, [hijoActual]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleRSVP = async (convocadoId, estado) => {
    // Optimista, con reversión si el guardado falla (red móvil intermitente)
    const previas = convocatorias;
    setConvocatorias((prev) => prev.map((c) => c.id === convocadoId ? { ...c, estado_rsvp: estado } : c));
    try {
      await responderRSVP(convocadoId, estado, user.id);
    } catch (e) {
      console.error('Error al confirmar asistencia:', e);
      setConvocatorias(previas);
      alert('No se pudo registrar tu respuesta. Intenta de nuevo.');
    }
  };

  const sesionesHijo = useMemo(
    () => (hijoActual ? data.sesiones.filter(s => s.atleta_id === hijoActual.atleta_id) : []),
    [data.sesiones, hijoActual]
  );

  const subPilarScores = useMemo(
    () => (hijoActual ? getSubPilarScores(hijoActual._evaluaciones || []) : {}),
    [hijoActual]
  );

  const radarData = useMemo(() => (hijoActual ? [
    { subject: 'Fuerza', A: subPilarScores.fuerza || 0, fullMark: 100 },
    { subject: 'Explosividad', A: subPilarScores.explosividad || 0, fullMark: 100 },
    { subject: 'Movilidad', A: subPilarScores.movilidad || 0, fullMark: 100 },
    { subject: 'Técnica Tiro', A: subPilarScores.tiro || 0, fullMark: 100 },
    { subject: 'Agilidad', A: subPilarScores.agilidad || 0, fullMark: 100 },
    { subject: 'Efic. Táctica', A: subPilarScores.tactica || 0, fullMark: 100 },
    { subject: 'Resiliencia', A: subPilarScores.resiliencia || 0, fullMark: 100 },
  ] : []), [hijoActual, subPilarScores]);

  const deficits = useMemo(
    () => (hijoActual ? evaluarDeficits(hijoActual) : []),
    [hijoActual]
  );

  // Mismo cálculo que la barra de XP más abajo, elevado aquí para
  // reutilizarlo también en el gauge de "nivel" (evita el mismatch de ids
  // entre el rango por overall_score de calculateRank y RANGOS_UI —
  // getXPProgress ya devuelve un currentRango con los ids/hex correctos).
  const xpProgress = useMemo(
    () => getXPProgress(hijoActual?.xp_total || 0),
    [hijoActual]
  );

  const [asistencia30d, setAsistencia30d] = useState(null);
  useEffect(() => {
    if (!hijoActual) return undefined;
    let activo = true;
    fetchAsistenciaPct([hijoActual.atleta_id], 30).then((pct) => {
      if (activo) setAsistencia30d(pct);
    });
    return () => { activo = false; };
  }, [hijoActual]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-base flex items-center justify-center text-brand">
        <Sparkles className="animate-spin w-10 h-10" />
      </div>
    );
  }

  // --- Journey Progression helpers ---
  const getNivelFromValue = (value) => {
    const v = Number(value) || 0;
    if (v <= 20) return NIVELES_BAREMO[0]; // Debe Mejorar
    if (v <= 40) return NIVELES_BAREMO[1]; // Regular
    if (v <= 60) return NIVELES_BAREMO[2]; // Bueno
    if (v <= 80) return NIVELES_BAREMO[3]; // Muy Bueno
    return NIVELES_BAREMO[4]; // Excelente
  };

  return (
    <CopilotoProvider atletaIdPorDefecto={hijoActual?.atleta_id}>
    <div className="min-h-screen bg-surface-base text-white p-4 sm:p-6 pb-24 relative overflow-hidden">
      <div className="hidden md:block absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-brand/5 blur-[120px] rounded-full pointer-events-none mix-blend-screen"></div>

      <header className="flex justify-between items-center mb-8 glass-card p-4 sm:p-6 rounded-panel relative z-10 border border-white/10 glow-border">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter text-brand flex items-center">
            <User className="mr-2" size={24} /> Portal de Padres
          </h1>
          <p className="text-xs text-fg-secondary font-bold uppercase tracking-widest mt-1">Bienvenido, {user.nombre}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowEditProfile(true)} aria-label="Editar perfil" className="flex items-center justify-center gap-2 min-h-11 min-w-11 text-xs text-fg-secondary hover:text-white transition-colors uppercase font-bold tracking-widest bg-white/5 hover:bg-white/10 px-4 py-2 rounded-control border border-white/10">
            <User size={14} /><span className="hidden sm:inline">Editar Perfil</span>
          </button>
          <button onClick={handleLogout} aria-label="Cerrar sesión" className="flex items-center justify-center gap-2 min-h-11 min-w-11 text-xs text-danger-soft hover:text-red-300 transition-colors uppercase font-bold tracking-widest bg-danger-soft/10 px-4 py-2 rounded-control border border-danger-soft/20" data-testid="btn-logout">
            <LogOut size={14} /><span>Desconectar</span>
          </button>
        </div>
      </header>

      {/* Modal Editar Perfil */}
      {showEditProfile && (
        <EditarPerfilModal onClose={() => setShowEditProfile(false)} onRefresh={() => window.location.reload()} />
      )}

      {/* Tabs Selector de Hijos */}
      {data.hijos.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {data.hijos.map((hijo, idx) => (
            <button key={hijo.atleta_id} onClick={() => setSelectedHijoIndex(idx)}
              className={`px-6 py-3 min-h-11 rounded-control text-2xs font-black uppercase tracking-eyebrow border transition ${
                idx === selectedHijoIndex ? 'bg-brand/10 text-brand border-brand/20' : 'bg-white/5 border-white/10 text-fg-muted hover:bg-white/10 hover:text-fg'
              }`}>
              {hijo.nombre}
            </button>
          ))}
        </div>
      )}

      {data.hijos.length === 0 ? (
        <div className="glass-card p-12 text-center rounded-panel border border-white/10">
          <ShieldAlert className="mx-auto text-fg-muted mb-4 w-12 h-12" />
          <h2 className="text-lg font-bold uppercase text-gray-300">No hay atletas vinculados</h2>
          <p className="text-sm text-fg-muted mt-2">Por favor, comunícate con la administración para vincular a tu representado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">

          {/* Nivel y asistencia de un vistazo (receta gauge del mockup v6) */}
          <div className="lg:col-span-3 glass-card p-4 sm:p-6 rounded-panel border border-white/10 flex items-center justify-center gap-8">
            <Gauge
              pct={xpProgress.percentage}
              valor={xpProgress.currentRango.emoji}
              label="nivel"
              color={xpProgress.currentRango.hex}
            />
            <Gauge
              pct={asistencia30d ?? 0}
              label="asistencia 30 días"
              color={COLORS.feedback.success}
            />
          </div>

          {/* Columna Izquierda: Radar y Estado */}
          <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 sm:p-6 rounded-panel border border-white/10">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-widest mb-1 text-white">{hijoActual.nombre}</h2>
                  <p className={`text-xs font-bold uppercase tracking-widest ${hijoActual.rango?.textColor}`}>
                    Grupo: {hijoActual.rango?.nombre}
                  </p>
                </div>
                <button
                  onClick={exportPDF}
                  disabled={isExporting}
                  className="flex items-center justify-center gap-2 bg-brand text-on-brand border border-brand/50 text-2xs font-black uppercase tracking-eyebrow px-4 py-2.5 min-h-11 rounded-control shadow-glow-gold hover:bg-brand-hover active:scale-[0.97] transition disabled:opacity-50"
                >
                  {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  {isExporting ? 'Generando...' : 'Exportar Scout'}
                </button>
              </div>

              {/* XP Progress Bar */}
              {(() => {
                const xpProgress = getXPProgress(hijoActual.xp_total || 0, hijoActual.rango);
                return (
                  <div className="mt-3 w-full">
                    <div className="flex justify-between items-baseline text-2xs font-bold uppercase tracking-widest mb-1.5">
                      {hijoActual.modo_vista === 'formativo' ? (
                        <span className="text-brand">⭐ Progreso de Nivel</span>
                      ) : (
                        <span className="text-brand">⭐ {xpProgress.current} / {xpProgress.required} XP</span>
                      )}
                      <span className="text-fg-muted text-3xs">para {xpProgress.nextLevelName}</span>
                    </div>
                    <div className="w-full h-2 bg-surface-sunken rounded-full overflow-hidden border border-brand/20">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${xpProgress.percentage}%` }}
                        transition={{ duration: MOTION.duration.bar, ease: MOTION.ease.premium }}
                        className="h-full rounded-full progress-bar-glow"
                      />
                    </div>
                  </div>
                );
              })()}
              
              {hijoActual.modo_vista !== 'formativo' && (
                <div className="h-64 mt-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="62%" data={radarData}>
                      <PolarGrid stroke="rgba(255,255,255,0.1)" />
                      <PolarAngleAxis
                        dataKey="subject"
                        tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 'bold' }}
                        tickFormatter={(v) => (v.length > 8 ? `${v.slice(0, 7)}…` : v)}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: CHART.tooltip.background, border: CHART.tooltip.border, borderRadius: '12px', fontSize: '12px', color: CHART.tooltip.color }}
                        cursor={{ stroke: 'rgba(255,255,255,0.2)' }}
                      />
                      <Radar name="Habilidades" dataKey="A" stroke={CHART.radar.stroke} fill={CHART.radar.stroke} fillOpacity={0.3} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </motion.div>

            {/* Notas del Coach */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-4 sm:p-6 rounded-panel border border-white/10">
              <h3 className="text-xs font-bold uppercase tracking-widest text-brand mb-4 flex items-center">
                <MessageSquare className="mr-2 w-4 h-4" /> Notas del Coach
              </h3>
              {notas.length === 0 ? (
                <p className="text-xs text-fg-muted font-medium">Aún no hay notas registradas para este atleta.</p>
              ) : (
                <div className="space-y-3">
                  {notas.map(n => (
                    <div key={n.id} className="bg-white/5 border border-white/10 rounded-panel p-3">
                      <p className="text-2xs text-fg-secondary uppercase tracking-widest mb-1">
                        {new Date(n.created_at).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-white leading-relaxed">{n.contenido}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Cards IA del cerebro (brain-gateway) — al cambiar de hijo cambia
                atletaId y los hooks refetchean por dependencia */}
            <CardDiagnosticoIA atletaId={hijoActual.atleta_id} tono="simple" />
            <CardReadinessIA atletaId={hijoActual.atleta_id} tono="simple" />

            {/* Journey – Siguiente Paso */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="glass-card p-4 sm:p-6 rounded-panel border border-white/10 bg-gradient-to-br from-brand/5 to-transparent"
            >
              <h3 className="text-xs font-bold uppercase tracking-widest text-brand mb-5 flex items-center">
                <TrendingUp className="mr-2 w-4 h-4" /> El Camino de {hijoActual.nombre}
              </h3>

              {/* Segmented Level Bars — apilado en móvil, fila en sm+ */}
              <div className="space-y-3">
                {METRICAS_CONFIG.map((m, idx) => {
                  const val = subPilarScores[m.key] || 0;
                  const nivel = getNivelFromValue(val);
                  return (
                    <motion.div
                      key={m.key}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.08 + staggerDelay(idx, 0.04) }}
                      className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3"
                    >
                      <div className="flex justify-between items-baseline gap-2 sm:contents">
                        <span className="order-1 text-xs sm:text-2xs font-bold uppercase tracking-widest text-fg-secondary sm:w-24 sm:shrink-0 text-left sm:text-right">
                          {m.label}
                        </span>
                        <span
                          className={`order-3 text-2xs sm:text-3xs font-bold uppercase tracking-widest sm:w-24 sm:shrink-0 text-right ${
                            nivel.nivel >= 4 ? 'text-brand' : nivel.nivel >= 3 ? 'text-success-soft' : nivel.nivel >= 2 ? 'text-warning-soft' : 'text-danger-soft'
                          }`}
                        >
                          {nivel.nombre}
                        </span>
                      </div>
                      <div className="order-2 flex w-full gap-1 sm:w-auto sm:flex-1">
                        {NIVELES_BAREMO.map((nb) => {
                          const isFilled = nb.nivel < nivel.nivel;
                          const isCurrent = nb.nivel === nivel.nivel;
                          return (
                            <div
                              key={nb.nivel}
                              className={`h-2.5 flex-1 rounded-sm transition duration-500 ${
                                isFilled
                                  ? 'bg-gradient-to-r from-brand-strong to-brand'
                                  : isCurrent
                                    ? 'bg-brand shadow-glow-bar animate-pulse'
                                    : 'bg-white/5'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Inteligencia Black Gold */}
              {deficits.length > 0 && (
                <div className="mt-6 pt-6 border-t border-white/10">
                  <div className="flex items-center space-x-2 mb-4">
                    <Brain className="text-brand w-5 h-5" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-brand">Inteligencia Black Gold</h3>
                  </div>
                  <div className="space-y-3">
                    {deficits.slice(0, 3).map((deficit, idx) => (
                      <motion.div
                        key={deficit.condicion}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: staggerDelay(idx) }}
                        className={`p-4 rounded-panel border backdrop-blur-md ${
                          deficit.prioridad === 'critica' ? 'bg-red-950/40 border-danger/40' :
                          deficit.prioridad === 'alta' ? 'bg-amber-950/40 border-warning/40' :
                          'bg-white/5 border-white/10'
                        }`}
                      >
                        <div className="flex items-center space-x-2 mb-2">
                          <div className={`w-2 h-2 rounded-full animate-pulse ${
                            deficit.prioridad === 'critica' ? 'bg-danger' :
                            deficit.prioridad === 'alta' ? 'bg-warning' :
                            'bg-white/50'
                          }`} />
                          <span className={`text-2xs font-black uppercase tracking-widest ${
                            deficit.prioridad === 'critica' ? 'text-danger-soft' :
                            deficit.prioridad === 'alta' ? 'text-warning-soft' :
                            'text-white'
                          }`}>
                            {deficit.prioridad === 'critica' ? 'Prioridad Crítica' : deficit.prioridad === 'alta' ? 'Prioridad Alta' : 'Sugerencia'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-200 leading-relaxed">
                          {deficit.mensaje}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>

            {/* Estado de cuenta real (v27): pagos abiertos, subir comprobante, historial */}
            <div ref={pagosRef}>
              <EstadoCuentaPadre hijo={hijoActual} user={user} />
            </div>
          </div>

          {/* Columna Centro/Derecha: Historial y Anuncios */}
          <div className="lg:col-span-2 space-y-6">

            {/* Convocatorias a eventos — el contenedor se monta siempre
                (con o sin convocatorias) para que el ancla del tab "Eventos"
                del BottomNav exista y el scroll funcione también sin eventos
                pendientes; antes, con la lista vacía, tocar el tab no hacía nada. */}
            <motion.div ref={eventosRef} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-4 sm:p-6 rounded-panel border border-info/30 bg-info/5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-info-soft mb-4 flex items-center"><CalendarDays className="mr-2 w-4 h-4" /> Convocatorias</h3>
              {convocatorias.length === 0 ? (
                <p className="text-xs text-fg-muted font-medium">No tienes convocatorias pendientes por ahora.</p>
              ) : (
                <div className="space-y-4">
                  {convocatorias.map((c) => {
                    const ev = c.eventos || {};
                    const fecha = ev.fecha_evento ? new Date(ev.fecha_evento) : null;
                    const opciones = [
                      { val: 'asiste', label: 'Confirmar', icon: <Check size={14} />, on: 'bg-success text-black border-success', off: 'text-success-soft border-success/30 hover:bg-success/10' },
                      { val: 'duda', label: 'Tal vez', icon: <HelpCircle size={14} />, on: 'bg-warning text-black border-warning', off: 'text-warning-soft border-warning/30 hover:bg-warning/10' },
                      { val: 'no_asiste', label: 'No puedo', icon: <X size={14} />, on: 'bg-danger text-white border-danger', off: 'text-danger-soft border-danger/30 hover:bg-danger/10' },
                    ];
                    return (
                      <div key={c.id} className="bg-black/40 p-4 rounded-panel border border-white/10">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-3xs font-black uppercase px-2 py-0.5 rounded-full bg-brand/10 border border-brand/30 text-brand">
                            {TIPO_EVENTO_LABEL[ev.tipo] || ev.tipo}
                          </span>
                          {fecha && (
                            <span className="text-3xs text-fg-secondary flex items-center gap-1">
                              <Clock size={10} />{fecha.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-white">{ev.titulo}{ev.rival ? ` vs ${ev.rival}` : ''}</h4>
                        {ev.sede && <p className="text-2xs text-fg-muted flex items-center gap-1 mt-0.5"><MapPin size={10} />{ev.sede}</p>}
                        {ev.descripcion && <p className="text-xs text-fg-secondary mt-2">{ev.descripcion}</p>}

                        <div className="grid grid-cols-1 min-[400px]:grid-cols-3 gap-2 mt-3">
                          {opciones.map((o) => (
                            <button key={o.val} onClick={() => handleRSVP(c.id, o.val)}
                              className={`flex items-center justify-center gap-1.5 py-3 min-h-11 rounded-control border text-xs font-black uppercase tracking-wider transition ${
                                c.estado_rsvp === o.val ? o.on : `bg-transparent ${o.off}`
                              }`}>
                              {o.icon}{o.label}
                            </button>
                          ))}
                        </div>
                        {c.estado_rsvp !== 'pendiente' && (
                          <p className="text-3xs text-fg-muted text-center mt-2 uppercase tracking-widest">
                            Tu respuesta: {c.estado_rsvp === 'asiste' ? 'Asiste' : c.estado_rsvp === 'duda' ? 'Tal vez' : 'No asiste'}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>

            {/* Anuncios Globales */}
            {data.anuncios.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-4 sm:p-6 rounded-panel border border-brand/30 bg-brand/5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-brand mb-4 flex items-center"><Bell className="mr-2 w-4 h-4" /> Anuncios del Club</h3>
                <div className="space-y-4">
                  {data.anuncios.map(anuncio => (
                    <div key={anuncio.id} className="bg-black/40 p-4 rounded-panel border border-white/5">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-white">{anuncio.titulo}</h4>
                        <span className="text-3xs text-fg-muted uppercase">{new Date(anuncio.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm text-gray-300">{anuncio.mensaje}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Misiones del Atleta */}
            {misiones.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card p-4 sm:p-6 rounded-panel border border-white/10">
                <h3 className="text-xs font-bold uppercase tracking-widest text-brand mb-4 flex items-center">
                  <Target className="mr-2 w-4 h-4" /> Misiones
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {misiones.map(mision => (
                    <div key={mision.id} className="bg-white/5 rounded-panel border border-white/10 overflow-hidden">
                      {mision.tipo === 'youtube' && mision.videoUrl ? (
                        <iframe
                          className="w-full aspect-video"
                          src={mision.videoUrl}
                          title={mision.titulo}
                          loading="lazy"
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      ) : mision.videoUrl ? (
                        <video src={mision.videoUrl} controls preload="metadata" className="w-full aspect-video object-cover" />
                      ) : (
                        <div className="w-full aspect-video bg-white/5 flex items-center justify-center">
                          <span className="text-xs text-fg-muted uppercase tracking-widest font-bold">Sin Video</span>
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-white text-sm">{mision.titulo}</h4>
                          <span className={`text-3xs font-bold uppercase tracking-widest px-2 py-1 rounded-md ${
                            mision.completada ? 'bg-success/20 text-success-soft' :
                            mision.estado === 'pendiente' ? 'bg-warning/20 text-warning-soft' : 'bg-white/10 text-fg-secondary'
                          }`}>
                            {mision.completada ? 'Completada' : mision.estado === 'pendiente' ? 'En Revisión' : 'Pendiente'}
                          </span>
                        </div>
                        <p className="text-xs text-fg-secondary line-clamp-2 mb-3">{mision.descripcion}</p>
                        <p className="text-2xs text-brand font-bold uppercase tracking-widest">+{mision.xpRecompensa} XP</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Timeline de Entrenamientos */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-4 sm:p-6 rounded-panel border border-white/10">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white mb-6 flex items-center"><Calendar className="mr-2 w-4 h-4" /> Historial de Entrenamientos</h3>

              {sesionesHijo.length === 0 ? (
                <p className="text-sm text-fg-muted text-center py-8">No hay registros de sesiones recientes.</p>
              ) : (
                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
                  {sesionesHijo.map((sesion) => (
                    <div key={sesion.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      {/* Marker */}
                      <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-surface-base shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 ${
                        sesion.tipo === 'Individual' ? 'bg-mental' : 'bg-success'
                      }`}>
                        {sesion.se_logro === 'Sí' ? <CheckCircle className="w-4 h-4 text-white" /> : <FileText className="w-4 h-4 text-white" />}
                      </div>
                      
                      {/* Card */}
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] glass-card p-4 rounded-panel border border-white/5 group-hover:border-white/20 transition">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-3xs font-bold uppercase tracking-widest px-2 py-1 rounded-md ${sesion.tipo === 'Individual' ? 'bg-mental/20 text-mental-soft' : 'bg-success/20 text-success-soft'}`}>
                            {sesion.tipo} • {sesion.objetivo_tipo}
                          </span>
                          <time className="text-2xs text-fg-muted font-mono">{sesion.fecha}</time>
                        </div>
                        <p className="text-sm text-white mb-2">{sesion.objetivo_descripcion}</p>

                        {sesion.notas_evaluacion && (
                          <div className="mt-3 pt-3 border-t border-white/10">
                            <h5 className="text-3xs font-bold text-brand uppercase flex items-center mb-1"><MessageSquare size={10} className="mr-1"/> Nota del Coach ({sesion.usuarios?.nombre || 'Coach'})</h5>
                            <p className="text-xs text-fg-secondary italic">{sesion.notas_evaluacion}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>

        </div>
      )}

      {/* Componente oculto para exportación PDF: solo se monta mientras se genera */}
      {isExporting && hijoActual && (
        <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
          <ScoutingReportTemplate ref={reportRef} atleta={hijoActual} todosLosAtletas={data.hijos} />
        </div>
      )}

      <BottomNav items={NAV_ITEMS} activo={navActivo} onSelect={irANav} />
    </div>
    </CopilotoProvider>
  );
}
