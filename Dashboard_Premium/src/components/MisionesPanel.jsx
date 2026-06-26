import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchMisiones, completarMision } from '../api/misionesService';
import { fetchSesionesAtleta } from '../api/sesionesEntrenamientoService';
import { supabase } from '../api/supabaseClient';
import VideoPlayer from './VideoPlayer';
import QuizModal from './QuizModal';
import LevelUpAnimation from './LevelUpAnimation';
import { Target, CheckCircle2, Play, Clock, XCircle, ChevronDown, ChevronUp, Sparkles, Brain } from 'lucide-react';
import { PILAR_LABELS } from '../constants/pilares';
import { evaluarDeficits } from '../lib/didacticEngine';
import { getXPProgress } from '../lib/xpProgress';

// ──────────────────────────────────────────
// XP Progress Bar (nueva sección)
// ──────────────────────────────────────────
function XPProgressBar({ xpTotal, misionesAprobadas }) {
  const xp = getXPProgress(xpTotal || 0);
  const { currentRango, nextLevelName, percentage, current, required } = xp;
  const isMax = nextLevelName === 'MAX';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8 glass-card rounded-2xl p-5 border border-[#FFD700]/20 shadow-[0_0_20px_rgba(255,215,0,0.05)]"
    >
      {/* Rank header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{currentRango.emoji}</span>
          <div>
            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.2em]">Rango Actual</p>
            <p className={`text-lg font-black uppercase tracking-tight ${currentRango.color}`}>
              {currentRango.nombre}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.2em]">XP Total</p>
          <p className="text-2xl font-black text-white tabular-nums">{current.toLocaleString()}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
            {isMax ? 'Nivel Máximo Alcanzado' : `Hacia ${nextLevelName}`}
          </span>
          <span className="text-[9px] font-black text-[#FFD700]">{percentage}%</span>
        </div>
        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
            className="h-full rounded-full bg-gradient-to-r from-[#FFD700] to-[#D4AF37] shadow-[0_0_8px_rgba(255,215,0,0.5)]"
          />
        </div>
        {!isMax && (
          <p className="text-[9px] text-gray-600 mt-1.5 text-right font-bold">
            {(required - current).toLocaleString()} XP para el siguiente nivel
          </p>
        )}
      </div>

      {/* Missions stat */}
      {misionesAprobadas > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2">
          <CheckCircle2 size={12} className="text-emerald-500" />
          <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest">
            {misionesAprobadas} misión{misionesAprobadas !== 1 ? 'es' : ''} completada{misionesAprobadas !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </motion.div>
  );
}

// ──────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────
export default function MisionesPanel({ atletaId }) {
  const [misiones, setMisiones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedMision, setExpandedMision] = useState(null);
  const [showQuiz, setShowQuiz] = useState(null);
  const [videoWatched, setVideoWatched] = useState({});
  const [sesionHoy, setSesionHoy] = useState(null);
  const [evaValue, setEvaValue] = useState(0);
  const [evaSaved, setEvaSaved] = useState(false);
  const [evaAlert, setEvaAlert] = useState(false);
  const [atletaData, setAtletaData] = useState(null);
  const [observacionHoy, setObservacionHoy] = useState(null);
  const [isRpeLocked, setIsRpeLocked] = useState(false);
  const [levelUpRango, setLevelUpRango] = useState(null);
  const lastXPRef = useRef(null);

  // ── Realtime: detectar subida de XP / level-up ──
  useEffect(() => {
    let channel;

    const subscribe = async () => {
      const { data: atletaRow } = await supabase
        .from('atletas')
        .select('id')
        .eq('usuario_id', atletaId)
        .single();

      if (!atletaRow) return;

      channel = supabase
        .channel(`xp-watch-${atletaRow.id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'atletas',
          filter: `id=eq.${atletaRow.id}`,
        }, (payload) => {
          const newXP = payload.new?.xp_total ?? 0;
          const oldXP = lastXPRef.current ?? 0;

          if (newXP > oldXP) {
            const oldRango = getXPProgress(oldXP).currentRango;
            const newRango = getXPProgress(newXP).currentRango;

            if (newRango.id !== oldRango.id) {
              setLevelUpRango(newRango);
            }

            // Actualizar XP local + recargar misiones (pueden haber pasado a 'aprobada')
            setAtletaData(prev => prev ? { ...prev, xp_total: newXP } : prev);
            fetchMisiones(atletaId).then(setMisiones);
          }

          lastXPRef.current = newXP;
        })
        .subscribe();
    };

    subscribe();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [atletaId]);

  // Inicializar ref cuando carguen los datos
  useEffect(() => {
    if (atletaData && lastXPRef.current === null) {
      lastXPRef.current = atletaData.xp_total || 0;
    }
  }, [atletaData]);

  // ── Carga datos del atleta ──────────────
  useEffect(() => {
    const loadAtleta = async () => {
      const { data } = await supabase
        .from('atletas')
        .select('*, usuarios!atletas_usuario_id_fkey(nombre, categoria)')
        .eq('usuario_id', atletaId)
        .single();

      if (data) {
        const { data: evaluaciones } = await supabase
          .from('evaluaciones_pruebas')
          .select('*')
          .eq('atleta_id', data.id)
          .order('created_at', { ascending: false });

        const latestEvals = {};
        (evaluaciones || []).forEach(e => {
          if (!latestEvals[e.prueba_tipo]) latestEvals[e.prueba_tipo] = e;
        });

        const hoy = new Date().toISOString().split('T')[0];
        const { data: readinessData } = await supabase
          .from('atleta_readiness')
          .select('*')
          .eq('atleta_id', data.id)
          .eq('fecha', hoy)
          .maybeSingle();

        let estadoRecuperacion = data.estado_recuperacion || 'Óptimo';
        if (readinessData) {
          if (readinessData.readiness_score < 4) estadoRecuperacion = 'Agotamiento Activo';
          else if (readinessData.readiness_score < 7) estadoRecuperacion = 'Fatiga Silenciosa';
        } else if (latestEvals['Carga Subjetiva y Sueño']) {
          const rec = latestEvals['Carga Subjetiva y Sueño'].valor_crudo;
          if (rec < 4) estadoRecuperacion = 'Agotamiento Activo';
          else if (rec < 6) estadoRecuperacion = 'Fatiga Silenciosa';
        }

        setAtletaData({
          ...data,
          nombre: data.usuarios?.nombre,
          categoria: data.usuarios?.categoria,
          estado_recuperacion: estadoRecuperacion,
          readiness_hoy: readinessData,
          _evaluaciones: Object.values(latestEvals),
        });
      }
    };
    loadAtleta();
  }, [atletaId]);

  const deficits = atletaData ? evaluarDeficits({
    ...atletaData,
    eva_registro: evaValue,
    sesion_hoy: sesionHoy,
    observacion_hoy: observacionHoy,
  }) : [];

  // ── Carga misiones ──────────────────────
  useEffect(() => {
    const load = async () => {
      const data = await fetchMisiones(atletaId);
      setMisiones(data);
      setLoading(false);
    };
    load();
  }, [atletaId]);

  // ── Carga sesión y observación del día ──
  useEffect(() => {
    const loadSesion = async () => {
      const { data: ad } = await supabase
        .from('atletas')
        .select('id')
        .eq('usuario_id', atletaId)
        .single();
      if (!ad) return;

      const sesiones = await fetchSesionesAtleta(ad.id);
      const today = new Date().toISOString().split('T')[0];

      if (sesiones.length > 0) {
        const sesionDeHoy = sesiones.find(s => s.fecha && s.fecha.startsWith(today));
        if (sesionDeHoy) {
          setSesionHoy(sesionDeHoy);
          setEvaValue(sesionDeHoy.eva_registro || 0);
          if (sesionDeHoy.eva_registro > 0) setIsRpeLocked(true);
        }
      }

      const { data: observaciones } = await supabase
        .from('observaciones_cancha')
        .select('*')
        .eq('atleta_id', ad.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (observaciones?.length) {
        const obsDeHoy = observaciones.find(o => o.created_at?.startsWith(today));
        if (obsDeHoy) setObservacionHoy(obsDeHoy);
      }
    };
    loadSesion();
  }, [atletaId]);

  // ── Handlers ───────────────────────────
  const handleSaveEva = async () => {
    if (!sesionHoy || isRpeLocked) return;
    await supabase
      .from('sesiones_entrenamiento')
      .update({ eva_registro: evaValue })
      .eq('id', sesionHoy.id);
    setEvaSaved(true);
    setIsRpeLocked(true);
    if (evaValue >= 9) setEvaAlert(true);
    setTimeout(() => setEvaSaved(false), 3000);
  };

  const handleToggle = (misionId) => {
    setExpandedMision(expandedMision === misionId ? null : misionId);
  };

  const handleQuizPass = async (misionId) => {
    await completarMision(atletaId, misionId);
    setMisiones(prev => prev.map(m =>
      m.id === misionId
        ? { ...m, completada: true, estado: 'pendiente_aprobacion' }
        : m
    ));
    setShowQuiz(null);
    setExpandedMision(null);
  };

  // ── Agrupación por estado ───────────────
  const pendientes        = misiones.filter(m => m.estado === 'pendiente');
  const enRevision        = misiones.filter(m => m.estado === 'pendiente_aprobacion');
  const aprobadas         = misiones.filter(m => m.estado === 'aprobada');
  const rechazadas        = misiones.filter(m => m.estado === 'rechazada');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-[#FFD700] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="mt-10 relative z-10">

      {/* ── Barra de Progreso XP ─────────── */}
      {atletaData && (
        <XPProgressBar
          xpTotal={atletaData.xp_total}
          misionesAprobadas={aprobadas.length}
        />
      )}

      {/* ── Sesión del Día ───────────────── */}
      {sesionHoy && (
        <div className="mb-8">
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mb-4">Mi Sesión del Día</p>
          <div className="glass-card rounded-2xl p-6 border border-[#FFD700]/20 shadow-[0_0_15px_rgba(255,215,0,0.05)]">
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Meta</p>
                <p className="text-sm font-bold text-white">{sesionHoy.meta_entrenamiento}</p>
              </div>
              <div>
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Intensidad</p>
                <p className="text-sm font-bold text-white">{sesionHoy.intensidad_bpm}</p>
              </div>
              <div>
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Pausa</p>
                <p className="text-sm font-bold text-white">{sesionHoy.tipo_pausa}</p>
              </div>
              <div>
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1">Duración</p>
                <p className="text-sm font-bold text-white">{sesionHoy.duracion_minutos} min</p>
              </div>
            </div>

            {/* Evaluación del Coach */}
            {observacionHoy && (
              <div className="border-t border-white/10 pt-5 pb-2 mb-2">
                <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest mb-3 flex items-center">
                  <CheckCircle2 size={12} className="mr-1" />
                  Evaluación del Coach
                </p>
                <div className="bg-[#121214]/80 border border-white/5 rounded-xl p-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                    {[
                      { label: 'Esfuerzo', val: observacionHoy.esfuerzo },
                      { label: 'Actitud', val: observacionHoy.actitud },
                      { label: 'Foco', val: observacionHoy.foco },
                      { label: 'Trabajo Equipo', val: observacionHoy.trabajo_equipo },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <p className="text-[8px] text-gray-500 font-bold uppercase tracking-widest">{label}</p>
                        <p className="text-xs font-black text-white">{val}/10</p>
                      </div>
                    ))}
                  </div>
                  {observacionHoy.insignia && (
                    <div>
                      <p className="text-[8px] text-[#FFD700] font-bold uppercase tracking-widest mb-1">Insignias Obtenidas</p>
                      <p className="text-xs font-bold text-white">{observacionHoy.insignia}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* RPE Scale */}
            <div className="border-t border-white/10 pt-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Escala RPE (Percepción de Esfuerzo)</p>
                <span className={`text-lg font-black ${evaValue <= 4 ? 'text-blue-400' : evaValue <= 8 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {evaValue}/10
                </span>
              </div>
              <input
                type="range" min="1" max="10" step="0.5" value={evaValue}
                onChange={e => setEvaValue(parseFloat(e.target.value))}
                disabled={isRpeLocked}
                className={`w-full h-2 rounded-full appearance-none ${isRpeLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                style={{ background: 'linear-gradient(to right, #3b82f6 0%, #fbbf24 60%, #ef4444 100%)' }}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[8px] text-blue-400 font-bold">1 - Mínimo</span>
                <span className="text-[8px] text-yellow-400 font-bold">5 - Medio</span>
                <span className="text-[8px] text-red-400 font-bold">10 - Máximo</span>
              </div>
              <button
                onClick={handleSaveEva}
                disabled={isRpeLocked}
                className={`mt-4 flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest px-6 py-2.5 rounded-xl transition-all w-full ${isRpeLocked ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-white/5' : 'bg-gradient-to-r from-[#FFD700] to-[#D4AF37] text-black shadow-[0_0_15px_rgba(255,215,0,0.3)] hover:shadow-[0_0_25px_rgba(255,215,0,0.5)]'}`}
              >
                {isRpeLocked ? '✅ RPE Registrado' : evaSaved ? '✅ Guardado' : 'Guardar RPE'}
              </button>
              {evaAlert && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 bg-orange-950/50 border border-orange-500/40 rounded-xl p-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                    <span className="font-black uppercase tracking-widest text-[10px] text-orange-500">Alerta de Carga Extrema</span>
                  </div>
                  <p className="text-xs text-orange-400 mt-1 opacity-90">
                    RPE &gt;= 9 detectado. Se recomienda ajustar el descanso y realizar trabajo de recuperación activa para la siguiente sesión.
                  </p>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Inteligencia Black Gold ──────── */}
      {deficits.length > 0 && (
        <motion.div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="text-[#FFD700] w-5 h-5" />
            <h3 className="text-sm font-black uppercase tracking-widest text-[#FFD700]">Inteligencia Black Gold</h3>
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
                  deficit.prioridad === 'alta'    ? 'bg-amber-950/40 border-amber-500/40' :
                                                    'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${
                    deficit.prioridad === 'critica' ? 'bg-red-500' :
                    deficit.prioridad === 'alta'    ? 'bg-amber-500' :
                                                      'bg-white/50'
                  }`} />
                  <span className={`text-[9px] font-black uppercase tracking-widest ${
                    deficit.prioridad === 'critica' ? 'text-red-400' :
                    deficit.prioridad === 'alta'    ? 'text-amber-400' :
                                                      'text-gray-400'
                  }`}>
                    Prioridad {deficit.prioridad}
                  </span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">{deficit.mensaje}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Header Misiones ──────────────── */}
      <div className="flex items-center gap-3 mb-8">
        <Target className="text-[#FFD700]" size={22} />
        <h3 className="text-xl font-black text-white uppercase tracking-tight">Misiones Educativas</h3>
        {pendientes.length > 0 && (
          <span className="bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-full px-3 py-1 text-[10px] font-black text-[#FFD700] uppercase tracking-widest">
            {pendientes.length} Pendientes
          </span>
        )}
      </div>

      {/* ── Misiones Pendientes ──────────── */}
      {pendientes.length === 0 && enRevision.length === 0 && aprobadas.length === 0 && rechazadas.length === 0 && (
        <div className="text-center py-12 border border-white/5 rounded-2xl bg-white/[0.02]">
          <Target size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">No tienes misiones asignadas aún</p>
        </div>
      )}

      <div className="space-y-4 mb-8">
        {pendientes.map((mision, index) => (
          <MisionCard
            key={mision.id}
            mision={mision}
            index={index}
            expanded={expandedMision === mision.id}
            onToggle={() => handleToggle(mision.id)}
            onComplete={() => handleQuizPass(mision.id)}
            onQuiz={() => setShowQuiz(mision)}
          />
        ))}
      </div>

      {/* ── En Revisión (pendiente_aprobacion) ── */}
      {enRevision.length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] text-amber-500 font-bold uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <Clock size={12} className="text-amber-500" />
            En Revisión por el Coach
          </p>
          <div className="space-y-2">
            {enRevision.map(mision => (
              <div key={mision.id} className="flex items-center gap-3 p-4 rounded-xl bg-amber-950/20 border border-amber-500/20">
                <Clock size={16} className="text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{mision.titulo}</p>
                  <p className="text-[10px] text-amber-400/70 font-bold uppercase tracking-widest mt-0.5">
                    Esperando aprobación · +{mision.xpRecompensa} XP
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Completadas (aprobadas) ──────── */}
      {aprobadas.length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <CheckCircle2 size={12} className="text-emerald-500" />
            Completadas
          </p>
          <div className="space-y-2">
            {aprobadas.map(mision => (
              <div key={mision.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                <span className="text-xs text-gray-400 font-medium line-through flex-1 truncate">{mision.titulo}</span>
                <span className="text-[10px] text-emerald-500/70 font-black whitespace-nowrap">+{mision.xpRecompensa} XP</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Rechazadas ───────────────────── */}
      {rechazadas.length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] text-red-500 font-bold uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <XCircle size={12} className="text-red-500" />
            Requieren Atención
          </p>
          <div className="space-y-2">
            {rechazadas.map(mision => (
              <div key={mision.id} className="flex items-center gap-3 p-4 rounded-xl bg-red-950/20 border border-red-500/20">
                <XCircle size={16} className="text-red-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{mision.titulo}</p>
                  <p className="text-[10px] text-red-400/70 font-bold uppercase tracking-widest mt-0.5">
                    Habla con tu coach para más información
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Quiz Modal ───────────────────── */}
      {showQuiz && (
        <QuizModal
          quiz={showQuiz.quiz}
          xpRecompensa={showQuiz.xpRecompensa}
          onPass={() => handleQuizPass(showQuiz.id)}
          onClose={() => setShowQuiz(null)}
        />
      )}

      {/* ── Level Up Animation ───────────── */}
      {levelUpRango && (
        <LevelUpAnimation
          rango={levelUpRango}
          onComplete={() => setLevelUpRango(null)}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────
// Tarjeta de misión pendiente
// ──────────────────────────────────────────
function MisionCard({ mision, index, expanded, onToggle, onComplete, onQuiz }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="glass-card rounded-2xl overflow-hidden border border-white/5 glow-border"
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#FFD700]/10 border border-[#FFD700]/30 flex items-center justify-center shrink-0">
            <Play size={16} className="text-[#FFD700]" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">{mision.titulo}</h4>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
              +{mision.xpRecompensa} XP
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="text-gray-400 shrink-0" /> : <ChevronDown size={18} className="text-gray-400 shrink-0" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-6 space-y-5">
              <p className="text-sm text-gray-300 leading-relaxed border-l-2 border-[#FFD700]/30 pl-4">
                {mision.descripcion}
              </p>

              <VideoPlayer url={mision.videoUrl} />

              <div className="flex items-center justify-between pt-2">
                {mision.quiz && mision.quiz.length > 0 ? (
                  <button
                    onClick={onQuiz}
                    className="flex items-center gap-2 bg-gradient-to-r from-[#FFD700] to-[#D4AF37] text-black font-black text-xs uppercase tracking-widest px-6 py-3 rounded-xl shadow-[0_0_15px_rgba(255,215,0,0.3)] hover:shadow-[0_0_25px_rgba(255,215,0,0.5)] transition-all"
                  >
                    <Sparkles size={14} />
                    <span>Iniciar Cuestionario ({mision.quiz.length} preguntas)</span>
                  </button>
                ) : (
                  <button
                    onClick={onComplete}
                    className="flex items-center gap-2 bg-gradient-to-r from-[#FFD700] to-[#D4AF37] text-black font-black text-xs uppercase tracking-widest px-6 py-3 rounded-xl shadow-[0_0_15px_rgba(255,215,0,0.3)] hover:shadow-[0_0_25px_rgba(255,215,0,0.5)] transition-all"
                  >
                    <CheckCircle2 size={14} />
                    <span>Marcar como Completada</span>
                  </button>
                )}
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest ml-3">
                  {(mision.pilar || mision.tipo) === 'youtube' ? '📺' : '📖'}{' '}
                  {PILAR_LABELS[mision.pilar || mision.tipo] || mision.pilar || mision.tipo}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
