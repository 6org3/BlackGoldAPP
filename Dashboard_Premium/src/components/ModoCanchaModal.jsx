import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Star, X, Check, Activity, Target, Flame, Zap as ZapIcon, MessageCircle, Snowflake, Users, User, ArrowRight, ClipboardList, ChevronLeft, Play } from 'lucide-react';
import { fetchTodosLosAtletas, insertarObservacion, crearSesionEntrenamiento } from '../api/sheetsService';
import { supabase } from '../api/supabaseClient';
import { useAuth } from '../AuthContext';

const INSIGNIAS = [
  { id: 'mamba', label: 'Mamba Mentality', icon: <Flame size={16} className="text-orange-500" />, desc: 'Foco y determinación', xp: 50 },
  { id: 'hustle', label: 'Motor Inagotable', icon: <ZapIcon size={16} className="text-[#FFD700]" />, desc: 'Esfuerzo al 100%', xp: 40 },
  { id: 'lider', label: 'Líder', icon: <MessageCircle size={16} className="text-blue-400" />, desc: 'Comunicación positiva', xp: 40 },
  { id: 'ice', label: 'Sangre Fría', icon: <Snowflake size={16} className="text-cyan-300" />, desc: 'Resiliencia ante el error', xp: 50 }
];

const OBJETIVOS_CLASE = [
  'Físico - Fuerza', 
  'Físico - Explosividad', 
  'Físico - Velocidad/Agilidad',
  'Físico - Resistencia',
  'Eficiencia Táctica', 
  'Resiliencia Psicológica', 
  'Liderazgo y Comunicación'
];

export default function ModoCanchaModal({ isOpen, onClose, onRefresh }) {
  const { user } = useAuth();
  
  // Pasos: 0=Menu/SesionActiva, 1=TipoClase, 2=Config, 3=Asistencia, 4=GridAtletas, 5=EvaluarAtleta
  const [step, setStep] = useState(0);
  const [tipoClase, setTipoClase] = useState(null); // 'grupal' o 'individual'
  const [nivelSeleccionado, setNivelSeleccionado] = useState(''); // 'Micro', 'Desarrollo', 'Elite'
  
  const [atletas, setAtletas] = useState([]);
  
  
  const [busquedaAtleta, setBusquedaAtleta] = useState('');
  const [atletaIndividual, setAtletaIndividual] = useState(null);
  
  const [pilarObjetivo, setPilarObjetivo] = useState('Eficiencia Táctica');

  const [asistencia, setAsistencia] = useState({}); // { id: true/false }
  const [atletaEvaluando, setAtletaEvaluando] = useState(null);

  const [ratings, setRatings] = useState({ esfuerzo: 0, actitud: 0, foco: 0, trabajo_equipo: 0 });
  
  const [insigniasSeleccionadas, setInsigniasSeleccionadas] = useState([]);
  
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Sesiones Activas (puede haber más de una)
  const [activeSessions, setActiveSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null); // La que está siendo evaluada
  const [evaluadosIds, setEvaluadosIds] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date()); // Ticker global
  const DURACION_CLASE = 60 * 60; // 1 hora en segundos

  useEffect(() => {
    if (isOpen) {
      loadData();
      checkActiveSession();
    }
  }, [isOpen]);

  // Ticker global que actualiza currentTime cada segundo
  useEffect(() => {
    if (!isOpen || step !== 0) return;
    const intervalo = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(intervalo);
  }, [isOpen, step]);

  const formatTiempo = (segundos) => {
    if (segundos === null) return '--:--';
    const m = Math.floor(Math.abs(segundos) / 60);
    const s = Math.abs(segundos) % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const calcularTiemposSession = (session) => {
    const [h, m, s] = (session.hora_inicio || '00:00:00').split(':').map(Number);
    const inicio = new Date(currentTime);
    inicio.setHours(h, m, s, 0);
    const transcurridos = Math.floor((currentTime - inicio) / 1000);
    const restantes = DURACION_CLASE - transcurridos;
    const finDate = new Date(inicio.getTime() + DURACION_CLASE * 1000);
    const horaFin = `${String(finDate.getHours()).padStart(2,'0')}:${String(finDate.getMinutes()).padStart(2,'0')}`;
    return {
      transcurridos: Math.max(0, transcurridos),
      restantes: Math.max(0, restantes),
      terminada: restantes <= 0,
      horaFin
    };
  };

  const loadData = async () => {
    const atls = await fetchTodosLosAtletas(user);
    setAtletas(atls);
  };

  const checkActiveSession = async () => {
    const { data, error } = await supabase
      .from('sesiones_programadas')
      .select('*')
      .eq('coach_id', user.id)
      .eq('estado', 'Programada')
      .ilike('notas', '[EN_CURSO]%');
    
    if (data && data.length > 0) {
      // Enriquecer cada sesión con el pilar extraído de las notas
      const sesionesEnriquecidas = data.map(s => {
        const match = s.notas?.match(/Pilar:([^|]+)/);
        const grupoMatch = s.notas?.match(/\| (.+)$/);
        return {
          ...s,
          pilar_objetivo: match ? match[1].trim() : '',
          grupo_label: grupoMatch ? grupoMatch[1].trim() : s.tipo
        };
      });
      setActiveSessions(sesionesEnriquecidas);
      setStep(0);
    } else {
      setActiveSessions([]);
      resetAll();
    }
  };

  const resetAll = () => {
    setStep(1);
    setTipoClase(null);
    setNivelSeleccionado('');
    setAtletaIndividual(null);
    setBusquedaAtleta('');
    setAsistencia({});
    setEvaluadosIds([]);
    setAtletaEvaluando(null);
    setPilarObjetivo('Eficiencia Táctica');
    resetEvalForm();
  };

  const resetEvalForm = () => {
    setRatings({ esfuerzo: 0, actitud: 0, foco: 0, trabajo_equipo: 0 });
    setInsigniasSeleccionadas([]);
    setSuccessMsg('');
  };

  const atletasFiltradosIndividual = atletas.filter(a => 
    a.nombre.toLowerCase().includes(busquedaAtleta.toLowerCase()) || 
    (a.categoria || '').toLowerCase().includes(busquedaAtleta.toLowerCase()) ||
    (a.cedula || '').toLowerCase().includes(busquedaAtleta.toLowerCase())
  ).slice(0, 5);

  const uniqueCategorias = useMemo(() => {
    const cats = new Set();
    atletas.forEach(a => {
      if (a.categoria) cats.add(a.categoria);
    });
    return Array.from(cats).sort();
  }, [atletas]);

  const uniqueEdades = useMemo(() => {
    const edades = new Set();
    atletas.forEach(a => {
      if (a.edad) edades.add(String(a.edad));
    });
    return Array.from(edades).sort((a, b) => parseInt(a) - parseInt(b));
  }, [atletas]);

  const getAtletasParaSesion = () => {
    if (tipoClase === 'privada_1v1') return atletaIndividual ? [atletaIndividual] : [];
    if (tipoClase === 'grupal_ind') {
      return atletas.filter(a => {
        const matchText = busquedaAtleta === '' || 
                          a.nombre.toLowerCase().includes(busquedaAtleta.toLowerCase()) || 
                          (a.cedula || '').toLowerCase().includes(busquedaAtleta.toLowerCase());
        const matchCat = nivelSeleccionado === '' ||
                         (a.categoria || '').toLowerCase().includes(nivelSeleccionado.toLowerCase()) ||
                         String(a.edad || '').includes(nivelSeleccionado);
        return matchText && matchCat;
      });
    }
    return atletas.filter(a => a.nivel_desarrollo === nivelSeleccionado);
  };

  const handleMarcarAsistencia = (id, presente) => {
    setAsistencia(prev => ({ ...prev, [id]: presente }));
  };

  const checkAllAsistencia = (presente) => {
    const list = getAtletasParaSesion();
    const newAsistencia = { ...asistencia };
    list.forEach(a => newAsistencia[a.atleta_id] = presente);
    setAsistencia(newAsistencia);
  };

  // =============== FLUJO DE INICIO ===============
  const handleStartSession = async () => {
    setSaving(true);
    try {
      const presentes = atletas.filter(a => asistencia[a.atleta_id] === true);
      
      if (presentes.length === 0) {
        alert("Debes marcar al menos un atleta como presente.");
        setSaving(false);
        return;
      }
      
      // 1. Crear la Sesion Programada (Global de la clase)
      const ahora = new Date();
      const horaStr = ahora.toTimeString().split(' ')[0]; // HH:MM:SS
      
      let tipoStr = 'Grupal (Niveles)';
      let tipoDB = 'Grupal';
      if (tipoClase === 'privada_1v1') {
        tipoStr = 'Privada 1v1';
        tipoDB = 'Individual';
      }
      else if (tipoClase === 'grupal_ind') {
        tipoStr = 'Grupal Individualizada';
        tipoDB = 'Grupal';
      } else if (tipoClase === 'grupal_nivel') {
        tipoStr = `Grupal (Niveles) - ${nivelSeleccionado}`;
      }

      const notasStr = `[EN_CURSO] Pilar:${pilarObjetivo} | ${tipoStr}`;

      const { data: programadaData, error: errProg } = await supabase.from('sesiones_programadas').insert({
        coach_id: user.id,
        fecha: ahora.toISOString().split('T')[0],
        hora_inicio: horaStr,
        hora_fin: horaStr,
        estado: 'Programada',
        tipo: tipoDB,
        notas: notasStr
      }).select().single();

      if (errProg) throw errProg;

      // 2. Crear las Sesiones de Entrenamiento (Historial por atleta)
      for (const a of presentes) {
        await crearSesionEntrenamiento({
          atleta_id: a.atleta_id,
          pilar_objetivo: pilarObjetivo,
          volumen_series_reps: '',
          notas: `[MODO_CANCHA: ${programadaData.id}] ${tipoStr}`,
          eva_registro: 0 // Placeholder
        });
      }
      
      // Cerramos el modal para que el coach dé la clase
      alert("Clase iniciada. Cuando termine, vuelve a abrir el Modo Cancha (se detectará la sesión activa).");
      onRefresh && onRefresh();
      onClose();
    } catch (err) {
      alert("Error al iniciar clase: " + err.message);
    }
    setSaving(false);
  };

  // =============== FLUJO FINAL (EVALUACIÓN Y XP) ===============
  const handleResumeSession = async (session) => {
    setActiveSession(session);
    setSaving(true);
    
    // Buscar los atletas que fueron registrados exactamente en esta clase usando el ID de la sesión
    const { data: sesAtletas } = await supabase
      .from('sesiones_entrenamiento')
      .select('atleta_id')
      .ilike('notas', `%[MODO_CANCHA: ${session.id}]%`);
      
    if (sesAtletas && sesAtletas.length > 0) {
      const idsPresentes = sesAtletas.map(s => s.atleta_id);
      const newAsist = {};
      idsPresentes.forEach(id => newAsist[id] = true);
      setTipoClase('resumed'); 
      setAsistencia(newAsist);
    } else {
      // Fallback por si hay sesiones antiguas sin el ID (carga todos los de hoy)
      const hoy = new Date().toISOString().split('T')[0];
      const { data: fallbackAtletas } = await supabase
        .from('sesiones_entrenamiento')
        .select('atleta_id')
        .gte('created_at', hoy + 'T00:00:00Z');
      
      if (fallbackAtletas) {
        const newAsist = {};
        fallbackAtletas.forEach(s => newAsist[s.atleta_id] = true);
        setTipoClase('resumed'); 
        setAsistencia(newAsist);
      }
    }
    
    setStep(4);
    setSaving(false);
  };

  const getAtletasResumed = () => {
    return atletas.filter(a => asistencia[a.atleta_id]);
  };

  const handleSubmitEvaluation = async () => {
    if (!atletaEvaluando) return;
    setSaving(true);
    try {
      const xpBase = (ratings.esfuerzo + ratings.actitud + ratings.foco + ratings.trabajo_equipo) * 5;
      const xpInsignias = insigniasSeleccionadas.reduce((sum, ins) => sum + ins.xp, 0);
      const xpGanada = xpBase + xpInsignias;
      const insigniasStr = insigniasSeleccionadas.length > 0 ? insigniasSeleccionadas.map(i => i.label).join(', ') : null;

      const obsData = {
        atleta_id: atletaEvaluando.atleta_id,
        coach_id: user.id,
        esfuerzo: ratings.esfuerzo * 2,
        actitud: ratings.actitud * 2,
        foco: ratings.foco * 2,
        trabajo_equipo: ratings.trabajo_equipo * 2,
        insignia: insigniasStr,
        xp_ganada: xpGanada,
        notas: "Evaluación Modo Cancha"
      };

      await insertarObservacion(obsData);

      // Subir pilar táctico o resiliencia extra por las estrellitas
      const boostResiliencia = (ratings.esfuerzo + ratings.actitud) / 2; 
      const boostTactica = (ratings.foco + ratings.trabajo_equipo) / 2; 

      const { data: currentAtleta } = await supabase.from('atletas').select('xp_total, resiliencia_psicologica, eficiencia_tactica').eq('id', atletaEvaluando.atleta_id).single();
      
      if (currentAtleta) {
        await supabase.from('atletas').update({
          xp_total: (currentAtleta.xp_total || 0) + xpGanada,
          resiliencia_psicologica: Math.min(100, (currentAtleta.resiliencia_psicologica || 0) + boostResiliencia),
          eficiencia_tactica: Math.min(100, (currentAtleta.eficiencia_tactica || 0) + boostTactica)
        }).eq('id', atletaEvaluando.atleta_id);
      }



      setSuccessMsg('Evaluación guardada exitosamente.');
      setEvaluadosIds(prev => [...prev, atletaEvaluando.atleta_id]);
      
      setTimeout(() => {
        setStep(4);
        setAtletaEvaluando(null);
        resetEvalForm();
      }, 1000);

    } catch (err) {
      alert('Error al guardar: ' + err.message);
    }
    setSaving(false);
  };

  const handleCerrarClase = async () => {
    setSaving(true);
    try {
      let baseXP = 20; // Default Micro
      if (activeSession.notas?.includes('Privada 1v1')) {
        baseXP = 50;
      } else if (activeSession.notas?.includes('Grupal Individualizada')) {
        baseXP = 35;
      } else if (activeSession.notas?.includes('Grupal (Niveles)')) {
        if (activeSession.notas.includes('Micro')) baseXP = 20;
        else if (activeSession.notas.includes('Desarrollo')) baseXP = 30;
        else if (activeSession.notas.includes('Elite')) baseXP = 40;
      }
      
      // Determine stat to boost
      let statToBoost = null;
      if (activeSession.pilar_objetivo.includes('Físico')) statToBoost = 'fisico_atletico';
      else if (activeSession.pilar_objetivo.includes('Táctica')) statToBoost = 'eficiencia_tactica';
      else if (activeSession.pilar_objetivo.includes('Resiliencia') || activeSession.pilar_objetivo.includes('Liderazgo')) statToBoost = 'resiliencia_psicologica';

      const presentes = getAtletasResumed();
      for (const a of presentes) {
        const { data: atData } = await supabase.from('atletas').select('xp_total, fisico_atletico, eficiencia_tactica, resiliencia_psicologica').eq('id', a.atleta_id).single();
        if (atData) {
          const updates = { xp_total: (atData.xp_total || 0) + baseXP };
          if (statToBoost) {
            updates[statToBoost] = Math.min(100, (atData[statToBoost] || 0) + 1.5); // Micro boost
          }
          await supabase.from('atletas').update(updates).eq('id', a.atleta_id);
        }
      }

      // 2. Cerrar la sesión (cambiar notas para que no aparezca como 'En Curso')
      const notasLimpias = (activeSession.notas || '').replace('[EN_CURSO] ', '');
      await supabase.from('sesiones_programadas').update({ estado: 'Completada', notas: notasLimpias }).eq('id', activeSession.id);
      
      alert(`Clase finalizada. ${presentes.length} atletas recibieron +${baseXP} XP y un bonus en ${activeSession.pilar_objetivo}.`);
      onClose();
    } catch (err) {
      alert("Error al finalizar clase: " + err.message);
    }
    setSaving(false);
  };

  const handleRatingChange = (metric, star) => {
    setRatings(prev => ({...prev, [metric]: star}));
    
    const getInsigniaId = (m) => {
      if (m === 'esfuerzo') return 'hustle';
      if (m === 'actitud') return 'mamba';
      if (m === 'foco') return 'ice';
      if (m === 'trabajo_equipo') return 'lider';
      return null;
    };
    const targetId = getInsigniaId(metric);
    
    if (star === 5) {
      if (targetId) {
        setInsigniasSeleccionadas(prev => {
          if (!prev.find(i => i.id === targetId)) {
            const ins = INSIGNIAS.find(i => i.id === targetId);
            return [...prev, ins];
          }
          return prev;
        });
      }
    } else {
      if (targetId) {
        setInsigniasSeleccionadas(prev => prev.filter(i => i.id !== targetId));
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
            className="w-full max-w-2xl bg-[#09090b] rounded-3xl border border-[#FFD700]/30 shadow-[0_0_50px_rgba(255,215,0,0.15)] overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-[#FFD700]/10 to-transparent">
              <div className="flex items-center space-x-3">
                <Activity className="text-[#FFD700]" size={24} />
                <h2 className="text-xl font-black text-white uppercase tracking-tight">Modo Cancha</h2>
                {step > 1 && step < 4 && (
                  <button onClick={() => setStep(step - 1)} className="ml-4 text-xs text-gray-400 hover:text-white flex items-center">
                    <ChevronLeft size={14} className="mr-1"/> Volver
                  </button>
                )}
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-white bg-white/5 p-2 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              
              {/* STEP 0: Sesiones Activas */}
              {step === 0 && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] text-[#FFD700] font-bold uppercase tracking-[0.3em]">
                      {activeSessions.length} clase{activeSessions.length !== 1 ? 's' : ''} activa{activeSessions.length !== 1 ? 's' : ''}
                    </p>
                    <button onClick={() => setStep(1)}
                      className="text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest transition-colors">
                      + Nueva clase
                    </button>
                  </div>

                  {activeSessions.length === 0 && (
                    <div className="flex justify-center items-center py-16">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FFD700]"></div>
                    </div>
                  )}

                  {activeSessions.map(session => {
                    const t = calcularTiemposSession(session);
                    const pct = Math.max(0, t.restantes / DURACION_CLASE);
                    const circumference = 2 * Math.PI * 28;
                    return (
                      <div key={session.id}
                        className={`rounded-2xl border p-4 transition-all ${
                          t.terminada
                            ? 'bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                            : t.restantes < 300
                            ? 'bg-red-500/10 border-red-500/30'
                            : 'bg-white/5 border-white/10'
                        }`}>
                        
                        {/* Fila superior: info + mini reloj */}
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${
                                session.tipo === 'Individual' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-[#FFD700]/20 text-[#FFD700]'
                              }`}>{session.tipo}</span>
                              <span className="text-[10px] text-gray-500 truncate">{session.grupo_label}</span>
                            </div>
                            <p className="text-white font-bold text-sm truncate">{session.pilar_objetivo}</p>
                          </div>

                          {/* Mini reloj SVG */}
                          <div className="relative w-16 h-16 flex-shrink-0 ml-3">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
                              <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5"/>
                              <circle
                                cx="32" cy="32" r="28"
                                fill="none"
                                stroke={t.terminada ? '#10b981' : t.restantes < 300 ? '#ef4444' : '#FFD700'}
                                strokeWidth="5"
                                strokeLinecap="round"
                                strokeDasharray={circumference}
                                strokeDashoffset={circumference * (1 - pct)}
                                style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
                              />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              {t.terminada ? (
                                <Check size={20} className="text-emerald-400" />
                              ) : (
                                <span className={`text-[11px] font-black tabular-nums ${t.restantes < 300 ? 'text-red-400' : 'text-white'}`}>
                                  {formatTiempo(t.restantes)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Fila inferior: Inicio · Transcurrido · Finaliza */}
                        <div className="flex space-x-4 mt-3 pt-3 border-t border-white/5 text-center">
                          <div className="flex-1">
                            <p className="text-[9px] text-gray-500 uppercase tracking-widest">Inicio</p>
                            <p className="text-xs font-bold text-white">{(session.hora_inicio || '').substring(0,5)}</p>
                          </div>
                          <div className="flex-1">
                            <p className="text-[9px] text-gray-500 uppercase tracking-widest">Transcurrido</p>
                            <p className="text-xs font-bold text-white">{formatTiempo(t.transcurridos)}</p>
                          </div>
                          <div className="flex-1">
                            <p className="text-[9px] text-gray-500 uppercase tracking-widest">Finaliza</p>
                            <p className="text-xs font-bold text-white">{t.horaFin}</p>
                          </div>
                        </div>

                        {/* Botón Evaluar */}
                        <button onClick={() => handleResumeSession(session)}
                          className={`w-full mt-3 py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-all ${
                            t.terminada
                              ? 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                              : 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10'
                          }`}>
                          {t.terminada ? '✓ Evaluar y Finalizar' : 'Evaluar ahora (adelantar)'}
                        </button>
                      </div>
                    );
                  })}

                  {/* Nota explicativa de qué pasa al terminar */}
                  <p className="text-[10px] text-gray-600 text-center pt-2">
                    Al terminar la hora el botón cambia a verde. Tócalo para evaluar a los atletas y cerrar la clase.
                  </p>
                </div>
              )}

              {/* STEP 1: Tipo de Sesión */}
              {step === 1 && (
                <div className="space-y-6">
                  <p className="text-sm text-gray-400 font-bold uppercase tracking-widest text-center">Paso 1: ¿Qué tipo de clase darás hoy?</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <button onClick={() => { setTipoClase('grupal_nivel'); }} 
                      className={`p-4 bg-white/5 hover:bg-white/10 border ${tipoClase === 'grupal_nivel' ? 'border-[#FFD700]' : 'border-white/10'} rounded-2xl flex flex-col items-center justify-center space-y-3 transition-colors`}>
                      <Users size={28} className="text-[#FFD700]"/>
                      <span className="font-bold text-white text-xs uppercase tracking-widest text-center">Grupal<br/>(Niveles)</span>
                    </button>
                    <button onClick={() => { setTipoClase('grupal_ind'); }} 
                      className={`p-4 bg-white/5 hover:bg-white/10 border ${tipoClase === 'grupal_ind' ? 'border-orange-400' : 'border-white/10'} rounded-2xl flex flex-col items-center justify-center space-y-3 transition-colors`}>
                      <Users size={28} className="text-orange-400"/>
                      <span className="font-bold text-white text-xs uppercase tracking-widest text-center">Grupal<br/>Individualizada</span>
                    </button>
                    <button onClick={() => { setTipoClase('privada_1v1'); }} 
                      className={`p-4 bg-white/5 hover:bg-white/10 border ${tipoClase === 'privada_1v1' ? 'border-cyan-400' : 'border-white/10'} rounded-2xl flex flex-col items-center justify-center space-y-3 transition-colors`}>
                      <User size={28} className="text-cyan-400"/>
                      <span className="font-bold text-white text-xs uppercase tracking-widest text-center">Privada<br/>1v1</span>
                    </button>
                  </div>

                  {tipoClase === 'grupal_nivel' && (
                    <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-bottom-4">
                      <p className="text-xs text-[#FFD700] font-bold uppercase tracking-widest">Selecciona el Bloque (Nivel de Desarrollo)</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {['Micro', 'Desarrollo', 'Elite'].map(lvl => (
                          <button key={lvl} onClick={() => { setNivelSeleccionado(lvl); setStep(2); }}
                            className={`py-3 bg-black/40 border ${nivelSeleccionado === lvl ? 'border-[#FFD700]' : 'border-white/10'} hover:border-[#FFD700]/50 rounded-xl text-white font-bold transition-all text-sm uppercase tracking-widest`}>
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {tipoClase === 'grupal_ind' && (
                    <div className="mt-8 flex justify-center animate-in fade-in slide-in-from-bottom-4">
                      <button onClick={() => setStep(2)}
                        className="px-8 py-3 bg-orange-500 hover:bg-orange-400 text-black font-black uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(249,115,22,0.3)]">
                        Continuar a Configuración <ArrowRight size={18} className="inline ml-2" />
                      </button>
                    </div>
                  )}

                  {tipoClase === 'privada_1v1' && (
                    <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-bottom-4">
                      <p className="text-xs text-cyan-400 font-bold uppercase tracking-widest">Buscar Atleta</p>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
                        <input type="text" placeholder="Buscar por nombre o cédula..." value={busquedaAtleta} onChange={(e) => setBusquedaAtleta(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none transition-colors" />
                      </div>
                      
                      {busquedaAtleta && (
                        <div className="space-y-2 mt-4 max-h-48 overflow-y-auto">
                          {atletasFiltradosIndividual.map(a => (
                            <button key={a.atleta_id} onClick={() => { setAtletaIndividual(a); setStep(2); }}
                              className="w-full text-left px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex justify-between items-center transition-colors">
                              <span className="font-bold text-white text-sm">{a.nombre}</span>
                              {a.categoria && <span className="text-[10px] text-gray-500 px-2 py-0.5 border border-white/10 rounded uppercase">{a.categoria}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: Session Setup (Pilares) */}
              {step === 2 && (
                <div className="space-y-6">
                  <p className="text-sm text-gray-400 font-bold uppercase tracking-widest text-center">Paso 2: Objetivo de la Sesión</p>
                  
                  <div className="flex flex-col space-y-4 max-w-md mx-auto">
                    <label className="text-xs text-[#FFD700] uppercase font-bold tracking-widest text-center">Pilar a Entrenar Hoy</label>
                    <p className="text-gray-400 text-xs text-center mb-2">Este pilar recibirá un bonus automático para todos los asistentes al finalizar la clase.</p>
                    <div className="grid grid-cols-1 gap-2">
                      {OBJETIVOS_CLASE.map(obj => (
                        <button key={obj} onClick={() => setPilarObjetivo(obj)}
                          className={`py-3 px-4 rounded-xl text-sm font-bold uppercase tracking-wide border transition-all ${pilarObjetivo === obj ? 'bg-[#FFD700]/10 border-[#FFD700] text-[#FFD700]' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>
                          {obj}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button onClick={() => setStep(3)} className="w-full mt-6 bg-[#FFD700] text-black font-black uppercase tracking-widest py-4 rounded-xl flex items-center justify-center hover:bg-[#D4AF37] transition-colors shadow-[0_0_15px_rgba(255,215,0,0.2)]">
                    Siguiente: Pasar Lista <ArrowRight size={18} className="ml-2"/>
                  </button>
                </div>
              )}

              {/* STEP 3: Asistencia */}
              {step === 3 && (
                <div className="space-y-6 flex flex-col h-full">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm text-[#FFD700] font-bold uppercase tracking-widest">Paso 3: Pasar Lista</p>
                    <div className="flex space-x-2">
                      <button onClick={() => checkAllAsistencia(true)} className="text-[10px] bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full font-bold uppercase hover:bg-emerald-500/30">Todos Presentes</button>
                    </div>
                  </div>

                  {tipoClase === 'grupal_ind' && (
                    <div className="flex space-x-2 mb-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={14} />
                        <input type="text" placeholder="Buscar nombre o cédula..." 
                               value={busquedaAtleta} onChange={(e) => setBusquedaAtleta(e.target.value)}
                               className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none" />
                      </div>
                      <select value={nivelSeleccionado} onChange={(e) => setNivelSeleccionado(e.target.value)}
                              className="w-1/3 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-orange-400 focus:outline-none">
                        <option value="">Categoría / Edad...</option>
                        {uniqueCategorias.length > 0 && (
                          <optgroup label="Categorías">
                            {uniqueCategorias.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                          </optgroup>
                        )}
                        {uniqueEdades.length > 0 && (
                          <optgroup label="Edades">
                            {uniqueEdades.map(edad => <option key={edad} value={edad}>{edad} años</option>)}
                          </optgroup>
                        )}
                      </select>
                    </div>
                  )}
                  
                  <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                    {getAtletasParaSesion().length === 0 ? (
                      <p className="text-center text-gray-500 py-10 text-xs">No hay atletas en este grupo.</p>
                    ) : (
                      getAtletasParaSesion().map(a => (
                        <div key={a.atleta_id} className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl hover:border-white/30 transition-colors">
                          <span className="font-bold text-white text-sm">{a.nombre}</span>
                          <div className="flex bg-[#09090b] rounded-lg p-1 border border-white/10">
                            <button onClick={() => handleMarcarAsistencia(a.atleta_id, true)}
                              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${asistencia[a.atleta_id] === true ? 'bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'text-gray-500 hover:text-white'}`}>P</button>
                            <button onClick={() => handleMarcarAsistencia(a.atleta_id, false)}
                              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${asistencia[a.atleta_id] === false ? 'bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.3)]' : 'text-gray-500 hover:text-white'}`}>A</button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <button onClick={handleStartSession} disabled={saving || Object.values(asistencia).filter(Boolean).length === 0} 
                    className="w-full bg-[#FFD700] text-black font-black uppercase tracking-widest py-4 rounded-xl flex items-center justify-center hover:bg-[#D4AF37] transition-colors disabled:opacity-50 mt-4 shadow-[0_0_20px_rgba(255,215,0,0.2)]">
                    {saving ? 'Registrando...' : 'Empezar Clase y Minimizar'} <ClipboardList size={18} className="ml-2"/>
                  </button>
                </div>
              )}

              {/* STEP 4: Grid de Evaluación (Cierre de sesión) */}
              {step === 4 && (
                <div className="space-y-6">
                  <p className="text-sm text-[#FFD700] font-bold uppercase tracking-widest text-center mb-2">Evaluaciones Subjetivas</p>
                  <p className="text-xs text-center text-gray-400 mb-4">Selecciona a un atleta si destacó en actitud o esfuerzo. Luego cierra la clase para otorgar XP grupal a todos.</p>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {getAtletasResumed().map(a => {
                      const yaEvaluado = evaluadosIds.includes(a.atleta_id);
                      return (
                        <button key={a.atleta_id} onClick={() => { setAtletaEvaluando(a); setStep(5); }}
                          className={`p-4 rounded-2xl border flex flex-col items-center text-center transition-all ${
                            yaEvaluado 
                            ? 'bg-emerald-500/10 border-emerald-500/30 opacity-70 hover:opacity-100' 
                            : 'bg-white/5 border-white/10 hover:border-[#FFD700]/50 hover:bg-white/10 hover:shadow-[0_0_15px_rgba(255,215,0,0.1)]'
                          }`}>
                          <div className={`w-12 h-12 rounded-full mb-3 flex items-center justify-center ${yaEvaluado ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white'}`}>
                            {yaEvaluado ? <Check size={20} /> : <User size={20} />}
                          </div>
                          <span className={`text-xs font-bold uppercase tracking-widest ${yaEvaluado ? 'text-emerald-400' : 'text-white'}`}>{a.nombre.split(' ')[0]}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="animate-in fade-in zoom-in duration-500 mt-8 pt-4 border-t border-white/10">
                      <button onClick={handleCerrarClase} disabled={saving} className="w-full bg-emerald-500 text-black font-black uppercase tracking-widest py-4 rounded-xl flex items-center justify-center hover:bg-emerald-400 transition-colors shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                      {saving ? 'Cerrando...' : 'Clase Finalizada - Repartir XP'}
                      </button>
                  </div>
                </div>
              )}

              {/* STEP 5: Evaluar Atleta Individual (Subjetivo) */}
              {step === 5 && atletaEvaluando && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                  {successMsg ? (
                    <div className="flex flex-col items-center justify-center py-10 space-y-4">
                      <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center"><Check size={32} /></div>
                      <p className="text-emerald-400 font-bold uppercase tracking-widest">{successMsg}</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center mb-6">
                        <button onClick={() => setStep(4)} className="text-xs text-gray-400 hover:text-white flex items-center">
                            <ChevronLeft size={14} className="mr-1"/> Volver
                        </button>
                        <div className="text-right">
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Evaluando a</p>
                            <p className="text-xl font-black text-[#FFD700]">{atletaEvaluando.nombre}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {['esfuerzo', 'actitud', 'foco', 'trabajo_equipo'].map(metric => (
                          <div key={metric} className="flex flex-col space-y-2 bg-white/5 p-3 rounded-xl border border-white/10 items-center hover:bg-white/10 transition-colors">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center w-full">
                              {metric === 'esfuerzo' ? 'Esfuerzo Físico' : metric === 'actitud' ? 'Actitud' : metric === 'foco' ? 'Foco / Atención' : 'Trabajo en Eq.'}
                            </span>
                            <div className="flex space-x-1">
                              {[1, 2, 3, 4, 5].map(star => (
                                <button key={star} type="button" onClick={() => handleRatingChange(metric, star)} className="transition-transform active:scale-90 hover:scale-110">
                                  <Star size={24} fill={star <= ratings[metric] ? '#FFD700' : 'transparent'} color={star <= ratings[metric] ? '#FFD700' : '#4b5563'} />
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Insignias */}
                      <div className="pt-4 border-t border-white/10">
                        <p className="text-[10px] text-[#FFD700] font-bold uppercase tracking-widest mb-3 flex items-center"><Target size={12} className="mr-1" /> Insignias Automáticas (5 Estrellas)</p>
                        <div className="grid grid-cols-2 gap-2">
                          {INSIGNIAS.map(ins => {
                            const isSelected = insigniasSeleccionadas.some(i => i.id === ins.id);
                            return (
                              <div key={ins.id}
                                className={`p-2 rounded-lg border flex flex-col transition-all ${isSelected ? 'bg-[#FFD700]/10 border-[#FFD700]/50 shadow-[0_0_10px_rgba(255,215,0,0.15)] opacity-100 scale-[1.02]' : 'bg-white/5 border-white/10 opacity-40 grayscale'}`}>
                                <div className="flex items-center space-x-2 mb-1">
                                  {ins.icon}
                                  <span className={`text-[10px] font-bold ${isSelected ? 'text-[#FFD700]' : 'text-gray-400'}`}>{ins.label}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <button onClick={handleSubmitEvaluation} disabled={saving} className="w-full bg-[#FFD700] hover:bg-[#D4AF37] text-black font-black uppercase tracking-widest py-4 rounded-xl shadow-[0_0_20px_rgba(255,215,0,0.2)] disabled:opacity-50 mt-4 transition-all hover:scale-[1.02]">
                        {saving ? 'Guardando...' : 'Guardar Evaluación'}
                      </button>
                    </>
                  )}
                </div>
              )}

            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
