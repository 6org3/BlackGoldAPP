import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { LogOut, Bell, FileText, CheckCircle, ShieldAlert, Sparkles, User, Calendar, CalendarDays, MessageSquare, TrendingUp, Target, ArrowRight, Brain, Check, X, HelpCircle, MapPin, Clock } from 'lucide-react';
import { fetchPadreData } from '../api/padreService';
import { fetchConvocatoriasAtleta, responderRSVP, TIPO_EVENTO_LABEL } from '../api/eventosService';
import { fetchNotasCoach } from '../api/notasCoachService';
import { fetchMisiones } from '../api/misionesService';
import { NIVELES_BAREMO } from '../lib/baremosEngine';
import { getXPProgress } from '../lib/xpProgress';
import ScoutingReportTemplate from '../components/ScoutingReportTemplate';
import { Download } from 'lucide-react';
import { evaluarDeficits } from '../lib/didacticEngine';
import { getSubPilarScores } from '../lib/radarCalc';

import EditarPerfilModal from '../components/EditarPerfilModal';

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

  const exportPDF = async () => {
    if (!reportRef.current || !hijoActual) return;
    setIsExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#09090b',
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
    if (hijoActual) {
      const loadHijoData = async () => {
        const n = await fetchNotasCoach(hijoActual.atleta_id);
        setNotas(n);
        const m = await fetchMisiones(hijoActual.id);
        setMisiones(m);
        const conv = await fetchConvocatoriasAtleta([hijoActual.atleta_id]);
        setConvocatorias(conv);
      };
      loadHijoData();
    }
  }, [hijoActual]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleRSVP = async (convocadoId, estado) => {
    // Optimista
    setConvocatorias((prev) => prev.map((c) => c.id === convocadoId ? { ...c, estado_rsvp: estado } : c));
    try {
      await responderRSVP(convocadoId, estado, user.id);
    } catch (e) {
      console.error('Error al confirmar asistencia:', e);
      alert('No se pudo registrar tu respuesta. Intenta de nuevo.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center text-[#FFD700]">
        <Sparkles className="animate-spin w-10 h-10" />
      </div>
    );
  }

  const sesionesHijo = hijoActual ? data.sesiones.filter(s => s.atleta_id === hijoActual.atleta_id) : [];

  const subPilarScores = hijoActual ? getSubPilarScores(hijoActual._evaluaciones || []) : {};

  const metricasConfig = [
    { key: 'fuerza', label: 'Fuerza' },
    { key: 'explosividad', label: 'Explosividad' },
    { key: 'movilidad', label: 'Movilidad' },
    { key: 'tiro', label: 'Técnica Tiro' },
    { key: 'agilidad', label: 'Agilidad' },
    { key: 'tactica', label: 'Efic. Táctica' },
    { key: 'resiliencia', label: 'Resiliencia' },
  ];

  const radarData = hijoActual ? [
    { subject: 'Fuerza', A: subPilarScores.fuerza || 0, fullMark: 100 },
    { subject: 'Explosividad', A: subPilarScores.explosividad || 0, fullMark: 100 },
    { subject: 'Movilidad', A: subPilarScores.movilidad || 0, fullMark: 100 },
    { subject: 'Técnica Tiro', A: subPilarScores.tiro || 0, fullMark: 100 },
    { subject: 'Agilidad', A: subPilarScores.agilidad || 0, fullMark: 100 },
    { subject: 'Efic. Táctica', A: subPilarScores.tactica || 0, fullMark: 100 },
    { subject: 'Resiliencia', A: subPilarScores.resiliencia || 0, fullMark: 100 },
  ] : [];

  // --- Journey Progression helpers ---
  const getNivelFromValue = (value) => {
    const v = Number(value) || 0;
    if (v <= 20) return NIVELES_BAREMO[0]; // Debe Mejorar
    if (v <= 40) return NIVELES_BAREMO[1]; // Regular
    if (v <= 60) return NIVELES_BAREMO[2]; // Bueno
    if (v <= 80) return NIVELES_BAREMO[3]; // Muy Bueno
    return NIVELES_BAREMO[4]; // Excelente
  };

  const deficits = hijoActual ? evaluarDeficits(hijoActual) : [];

  return (
    <div className="min-h-screen bg-[#09090b] text-white p-6 relative overflow-hidden">
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#FFD700]/5 blur-[120px] rounded-full pointer-events-none mix-blend-screen"></div>

      <header className="flex justify-between items-center mb-8 glass-card p-6 rounded-2xl relative z-10 border border-white/10 glow-border">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter text-[#FFD700] flex items-center">
            <User className="mr-2" size={24} /> Portal de Padres
          </h1>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Bienvenido, {user.nombre}</p>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => setShowEditProfile(true)} className="flex items-center space-x-2 text-xs text-gray-400 hover:text-white transition-colors uppercase font-bold tracking-widest bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg border border-white/10">
            <User size={14} /><span className="hidden sm:inline">Editar Perfil</span>
          </button>
          <button onClick={handleLogout} className="flex items-center space-x-2 text-xs text-red-400 hover:text-red-300 transition-colors uppercase font-bold tracking-widest bg-red-400/10 px-4 py-2 rounded-lg border border-red-400/20">
            <LogOut size={14} /><span className="hidden sm:inline">Desconectar</span>
          </button>
        </div>
      </header>

      {/* Modal Editar Perfil */}
      {showEditProfile && (
        <EditarPerfilModal onClose={() => setShowEditProfile(false)} onRefresh={() => window.location.reload()} />
      )}

      {/* Tabs Selector de Hijos */}
      {data.hijos.length > 1 && (
        <div className="flex space-x-2 mb-6">
          {data.hijos.map((hijo, idx) => (
            <button key={idx} onClick={() => setSelectedHijoIndex(idx)}
              className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                idx === selectedHijoIndex ? 'bg-[#FFD700] text-black shadow-[0_0_15px_rgba(255,215,0,0.3)]' : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10'
              }`}>
              {hijo.nombre}
            </button>
          ))}
        </div>
      )}

      {data.hijos.length === 0 ? (
        <div className="glass-card p-12 text-center rounded-2xl border border-white/10">
          <ShieldAlert className="mx-auto text-gray-500 mb-4 w-12 h-12" />
          <h2 className="text-lg font-bold uppercase text-gray-300">No hay atletas vinculados</h2>
          <p className="text-sm text-gray-500 mt-2">Por favor, comunícate con la administración para vincular a tu representado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
          
          {/* Columna Izquierda: Radar y Estado */}
          <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 rounded-2xl border border-white/10">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-widest mb-1 text-white">{hijoActual.nombre}</h2>
                  <p className={`text-xs font-bold uppercase tracking-widest ${hijoActual.rango?.textColor}`}>
                    Grupo: {hijoActual.rango?.nombre} {hijoActual.rango?.tier}
                  </p>
                </div>
                <button 
                  onClick={exportPDF} 
                  disabled={isExporting}
                  className="flex items-center gap-2 bg-[#FFD700] text-black text-[10px] font-bold uppercase tracking-widest px-3 py-2 rounded-lg hover:bg-yellow-400 transition-colors disabled:opacity-50"
                >
                  <Download size={14} />
                  {isExporting ? 'Generando...' : 'Exportar Scout'}
                </button>
              </div>

              {/* XP Progress Bar */}
              {(() => {
                const xpProgress = getXPProgress(hijoActual.xp_total || 0, hijoActual.rango);
                return (
                  <div className="mt-3 w-full">
                    <div className="flex justify-between items-baseline text-[10px] font-bold uppercase tracking-widest mb-1.5">
                      {hijoActual.modo_vista === 'formativo' ? (
                        <span className="text-[#FFD700]">⭐ Progreso de Nivel</span>
                      ) : (
                        <span className="text-[#FFD700]">⭐ {xpProgress.current} / {xpProgress.required} XP</span>
                      )}
                      <span className="text-gray-500 text-[9px]">para {xpProgress.nextLevelName}</span>
                    </div>
                    <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden border border-[#FFD700]/20">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${xpProgress.percentage}%` }}
                        transition={{ duration: 1.5, ease: 'easeOut' }}
                        className="h-full rounded-full bg-gradient-to-r from-[#FFD700] to-[#D4AF37] shadow-[0_0_8px_rgba(255,215,0,0.4)]"
                      />
                    </div>
                  </div>
                );
              })()}
              
              {hijoActual.modo_vista !== 'formativo' && (
                <div className="h-64 mt-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke="rgba(255,255,255,0.1)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 'bold' }} />
                      <Radar name="Habilidades" dataKey="A" stroke="#FFD700" fill="#FFD700" fillOpacity={0.3} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </motion.div>

            {/* Notas del Coach */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6 rounded-2xl border border-white/10">
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#FFD700] mb-4 flex items-center">
                <MessageSquare className="mr-2 w-4 h-4" /> Notas del Coach
              </h3>
              {notas.length === 0 ? (
                <p className="text-xs text-gray-500 font-medium">Aún no hay notas registradas para este atleta.</p>
              ) : (
                <div className="space-y-3">
                  {notas.map(n => (
                    <div key={n.id} className="bg-white/5 border border-white/10 rounded-xl p-3">
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">
                        {new Date(n.created_at).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-white leading-relaxed">{n.contenido}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Journey – Siguiente Paso */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="glass-card p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-[#FFD700]/5 to-transparent"
            >
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#FFD700] mb-5 flex items-center">
                <TrendingUp className="mr-2 w-4 h-4" /> El Camino de {hijoActual.nombre}
              </h3>

              {/* Segmented Level Bars */}
              <div className="space-y-3">
                {metricasConfig.map((m, idx) => {
                  const val = subPilarScores[m.key] || 0;
                  const nivel = getNivelFromValue(val);
                  return (
                    <motion.div
                      key={m.key}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.08 + idx * 0.04 }}
                      className="flex items-center gap-3"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 w-24 shrink-0 text-right">
                        {m.label}
                      </span>
                      <div className="flex flex-1 gap-1">
                        {NIVELES_BAREMO.map((nb) => {
                          const isFilled = nb.nivel < nivel.nivel;
                          const isCurrent = nb.nivel === nivel.nivel;
                          return (
                            <div
                              key={nb.nivel}
                              className={`h-2.5 flex-1 rounded-sm transition-all duration-500 ${
                                isFilled
                                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#FFD700]'
                                  : isCurrent
                                    ? 'bg-[#FFD700] shadow-[0_0_8px_rgba(255,215,0,0.6)] animate-pulse'
                                    : 'bg-white/5'
                              }`}
                            />
                          );
                        })}
                      </div>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-widest w-24 shrink-0 ${
                          nivel.nivel >= 4 ? 'text-[#FFD700]' : nivel.nivel >= 3 ? 'text-emerald-400' : nivel.nivel >= 2 ? 'text-amber-400' : 'text-red-400'
                        }`}
                      >
                        {nivel.nombre}
                      </span>
                    </motion.div>
                  );
                })}
              </div>

              {/* Inteligencia Black Gold */}
              {deficits.length > 0 && (
                <div className="mt-6 pt-6 border-t border-white/10">
                  <div className="flex items-center space-x-2 mb-4">
                    <Brain className="text-[#FFD700] w-5 h-5" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-[#FFD700]">Inteligencia Black Gold</h3>
                  </div>
                  <div className="space-y-3">
                    {deficits.slice(0, 3).map((deficit, idx) => (
                      <motion.div
                        key={deficit.condicion}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className={`p-4 rounded-xl border backdrop-blur-md ${
                          deficit.prioridad === 'critica' ? 'bg-red-950/40 border-red-500/40' :
                          deficit.prioridad === 'alta' ? 'bg-amber-950/40 border-amber-500/40' :
                          'bg-white/5 border-white/10'
                        }`}
                      >
                        <div className="flex items-center space-x-2 mb-2">
                          <div className={`w-2 h-2 rounded-full animate-pulse ${
                            deficit.prioridad === 'critica' ? 'bg-red-500' :
                            deficit.prioridad === 'alta' ? 'bg-amber-500' :
                            'bg-white/50'
                          }`} />
                          <span className={`text-[9px] font-black uppercase tracking-widest ${
                            deficit.prioridad === 'critica' ? 'text-red-400' :
                            deficit.prioridad === 'alta' ? 'text-amber-400' :
                            'text-white'
                          }`}>
                            {deficit.prioridad === 'critica' ? 'Prioridad Crítica' : deficit.prioridad === 'alta' ? 'Prioridad Alta' : 'Sugerencia'}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300 leading-relaxed">
                          {deficit.mensaje}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>

            {/* Pagos Pendientes Demo */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6 rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-500/5 to-transparent">
              <h3 className="text-xs font-bold uppercase tracking-widest text-red-400 mb-4 flex items-center"><ShieldAlert className="mr-2 w-4 h-4" /> Estado de Pagos</h3>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <p className="text-sm font-bold text-white">Mensualidad Junio</p>
                  <p className="text-[10px] text-red-400 uppercase tracking-widest">Vencida hace 3 días</p>
                </div>
                <span className="text-lg font-black text-white">$30.00</span>
              </div>
              <button className="w-full bg-red-500 hover:bg-red-400 text-white font-bold uppercase tracking-widest py-3 rounded-lg transition-all text-xs">
                Enviar Comprobante al WhatsApp
              </button>
            </motion.div>
          </div>

          {/* Columna Centro/Derecha: Historial y Anuncios */}
          <div className="lg:col-span-2 space-y-6">

            {/* Convocatorias a eventos */}
            {convocatorias.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-6 rounded-2xl border border-blue-500/30 bg-blue-500/5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-blue-300 mb-4 flex items-center"><CalendarDays className="mr-2 w-4 h-4" /> Convocatorias</h3>
                <div className="space-y-4">
                  {convocatorias.map((c) => {
                    const ev = c.eventos || {};
                    const fecha = ev.fecha_evento ? new Date(ev.fecha_evento) : null;
                    const opciones = [
                      { val: 'asiste', label: 'Confirmar', icon: <Check size={14} />, on: 'bg-emerald-500 text-black border-emerald-500', off: 'text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10' },
                      { val: 'duda', label: 'Tal vez', icon: <HelpCircle size={14} />, on: 'bg-amber-500 text-black border-amber-500', off: 'text-amber-400 border-amber-500/30 hover:bg-amber-500/10' },
                      { val: 'no_asiste', label: 'No puedo', icon: <X size={14} />, on: 'bg-red-500 text-white border-red-500', off: 'text-red-400 border-red-500/30 hover:bg-red-500/10' },
                    ];
                    return (
                      <div key={c.id} className="bg-black/40 p-4 rounded-xl border border-white/10">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-[#FFD700]/10 border border-[#FFD700]/30 text-[#FFD700]">
                            {TIPO_EVENTO_LABEL[ev.tipo] || ev.tipo}
                          </span>
                          {fecha && (
                            <span className="text-[9px] text-gray-400 flex items-center gap-1">
                              <Clock size={10} />{fecha.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-white">{ev.titulo}{ev.rival ? ` vs ${ev.rival}` : ''}</h4>
                        {ev.sede && <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5"><MapPin size={10} />{ev.sede}</p>}
                        {ev.descripcion && <p className="text-xs text-gray-400 mt-2">{ev.descripcion}</p>}

                        <div className="grid grid-cols-3 gap-2 mt-3">
                          {opciones.map((o) => (
                            <button key={o.val} onClick={() => handleRSVP(c.id, o.val)}
                              className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all ${
                                c.estado_rsvp === o.val ? o.on : `bg-transparent ${o.off}`
                              }`}>
                              {o.icon}{o.label}
                            </button>
                          ))}
                        </div>
                        {c.estado_rsvp !== 'pendiente' && (
                          <p className="text-[9px] text-gray-500 text-center mt-2 uppercase tracking-widest">
                            Tu respuesta: {c.estado_rsvp === 'asiste' ? 'Asiste' : c.estado_rsvp === 'duda' ? 'Tal vez' : 'No asiste'}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Anuncios Globales */}
            {data.anuncios.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-6 rounded-2xl border border-[#FFD700]/30 bg-[#FFD700]/5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#FFD700] mb-4 flex items-center"><Bell className="mr-2 w-4 h-4" /> Anuncios del Club</h3>
                <div className="space-y-4">
                  {data.anuncios.map(anuncio => (
                    <div key={anuncio.id} className="bg-black/40 p-4 rounded-xl border border-white/5">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-white">{anuncio.titulo}</h4>
                        <span className="text-[9px] text-gray-500 uppercase">{new Date(anuncio.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm text-gray-300">{anuncio.mensaje}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Misiones del Atleta */}
            {misiones.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card p-6 rounded-2xl border border-white/10">
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#FFD700] mb-4 flex items-center">
                  <Target className="mr-2 w-4 h-4" /> Misiones
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {misiones.map(mision => (
                    <div key={mision.id} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                      {mision.tipo === 'youtube' && mision.videoUrl ? (
                        <iframe
                          className="w-full aspect-video"
                          src={mision.videoUrl}
                          title={mision.titulo}
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      ) : mision.videoUrl ? (
                        <video src={mision.videoUrl} controls className="w-full aspect-video object-cover" />
                      ) : (
                        <div className="w-full aspect-video bg-white/5 flex items-center justify-center">
                          <span className="text-xs text-gray-500 uppercase tracking-widest font-bold">Sin Video</span>
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-white text-sm">{mision.titulo}</h4>
                          <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-md ${
                            mision.completada ? 'bg-emerald-500/20 text-emerald-400' : 
                            mision.estado === 'pendiente' ? 'bg-amber-500/20 text-amber-400' : 'bg-white/10 text-gray-400'
                          }`}>
                            {mision.completada ? 'Completada' : mision.estado === 'pendiente' ? 'En Revisión' : 'Pendiente'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 line-clamp-2 mb-3">{mision.descripcion}</p>
                        <p className="text-[10px] text-[#FFD700] font-bold uppercase tracking-widest">+{mision.xpRecompensa} XP</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Timeline de Entrenamientos */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-6 rounded-2xl border border-white/10">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white mb-6 flex items-center"><Calendar className="mr-2 w-4 h-4" /> Historial de Entrenamientos</h3>
              
              {sesionesHijo.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No hay registros de sesiones recientes.</p>
              ) : (
                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
                  {sesionesHijo.map((sesion, idx) => (
                    <div key={sesion.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      {/* Marker */}
                      <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#09090b] shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 ${
                        sesion.tipo === 'Individual' ? 'bg-purple-500' : 'bg-emerald-500'
                      }`}>
                        {sesion.se_logro === 'Sí' ? <CheckCircle className="w-4 h-4 text-white" /> : <FileText className="w-4 h-4 text-white" />}
                      </div>
                      
                      {/* Card */}
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] glass-card p-4 rounded-xl border border-white/5 group-hover:border-white/20 transition-all">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-md ${sesion.tipo === 'Individual' ? 'bg-purple-500/20 text-purple-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            {sesion.tipo} • {sesion.objetivo_tipo}
                          </span>
                          <time className="text-[10px] text-gray-500 font-mono">{sesion.fecha}</time>
                        </div>
                        <p className="text-sm text-white mb-2">{sesion.objetivo_descripcion}</p>
                        
                        {sesion.notas_evaluacion && (
                          <div className="mt-3 pt-3 border-t border-white/10">
                            <h5 className="text-[9px] font-bold text-[#FFD700] uppercase flex items-center mb-1"><MessageSquare size={10} className="mr-1"/> Nota del Coach ({sesion.usuarios?.nombre || 'Coach'})</h5>
                            <p className="text-xs text-gray-400 italic">{sesion.notas_evaluacion}</p>
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

      {/* Componente oculto para exportación PDF */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <ScoutingReportTemplate ref={reportRef} atleta={hijoActual} todosLosAtletas={data.hijos} />
      </div>
    </div>
  );
}
