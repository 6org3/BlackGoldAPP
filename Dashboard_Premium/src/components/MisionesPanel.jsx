import { useState, useMemo, useCallback } from 'react';
import { completarMision } from '../api/misionesService';
import QuizModal from './QuizModal';
import LevelUpAnimation from './LevelUpAnimation';
import { Target } from 'lucide-react';
import { evaluarDeficits } from '../lib/didacticEngine';
import XPProgressBar from './MisionesPanelXPProgressBar';
import MisionCard from './MisionesPanelMisionCard';
import SesionDelDia from './MisionesPanelSesionDelDia';
import InteligenciaBlackGold from './MisionesPanelInteligenciaBlackGold';
import { EnRevision, Completadas, Rechazadas } from './MisionesPanelListasEstado';
import { useMisionesPanelXPWatch } from '../hooks/useMisionesPanelXPWatch';
import { useMisionesPanelAtletaData } from '../hooks/useMisionesPanelAtletaData';
import { useMisionesPanelMisiones } from '../hooks/useMisionesPanelMisiones';
import { useMisionesPanelSesionYObservacion, handleSaveEva as handleSaveEvaAction } from '../hooks/useMisionesPanelSesionYObservacion';

// ──────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────
export default function MisionesPanel({ atletaId }) {
  const [misiones, setMisiones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedMision, setExpandedMision] = useState(null);
  const [showQuiz, setShowQuiz] = useState(null);
  const [sesionHoy, setSesionHoy] = useState(null);
  const [evaValue, setEvaValue] = useState(0);
  const [evaSaved, setEvaSaved] = useState(false);
  const [evaAlert, setEvaAlert] = useState(false);
  const [atletaData, setAtletaData] = useState(null);
  const [observacionHoy, setObservacionHoy] = useState(null);
  const [isRpeLocked, setIsRpeLocked] = useState(false);
  const [levelUpRango, setLevelUpRango] = useState(null);

  // ── Realtime: detectar subida de XP / level-up ──
  useMisionesPanelXPWatch(atletaId, atletaData, setAtletaData, setLevelUpRango, setMisiones);

  // ── Carga datos del atleta ──────────────
  useMisionesPanelAtletaData(atletaId, setAtletaData);

  // Id de la fila en `atletas` (≠ usuario_id), resuelto una sola vez
  // por useMisionesPanelAtletaData y reutilizado por los demás hooks.
  const atletaRowId = atletaData?.id ?? null;

  const deficits = useMemo(() => (atletaData ? evaluarDeficits({
    ...atletaData,
    eva_registro: evaValue,
    sesion_hoy: sesionHoy,
    observacion_hoy: observacionHoy,
  }) : []), [atletaData, evaValue, sesionHoy, observacionHoy]);

  // ── Carga misiones ──────────────────────
  useMisionesPanelMisiones(atletaId, setMisiones, setLoading);

  // ── Carga sesión y observación del día ──
  useMisionesPanelSesionYObservacion(atletaRowId, setSesionHoy, setEvaValue, setIsRpeLocked, setObservacionHoy);

  // ── Handlers ───────────────────────────
  const handleSaveEva = async () => {
    await handleSaveEvaAction({
      sesionHoy,
      isRpeLocked,
      evaValue,
      setEvaSaved,
      setIsRpeLocked,
      setEvaAlert,
    });
  };

  const handleToggle = useCallback((misionId) => {
    setExpandedMision(prev => (prev === misionId ? null : misionId));
  }, []);

  const handleQuizPass = useCallback(async (misionId) => {
    await completarMision(atletaId, misionId);
    setMisiones(prev => prev.map(m =>
      m.id === misionId
        ? { ...m, completada: true, estado: 'pendiente_aprobacion' }
        : m
    ));
    setShowQuiz(null);
    setExpandedMision(null);
  }, [atletaId]);

  const handleShowQuiz = useCallback((mision) => setShowQuiz(mision), []);

  // ── Agrupación por estado ───────────────
  const { pendientes, enRevision, aprobadas, rechazadas } = useMemo(() => ({
    pendientes: misiones.filter(m => m.estado === 'pendiente'),
    enRevision: misiones.filter(m => m.estado === 'pendiente_aprobacion'),
    aprobadas:  misiones.filter(m => m.estado === 'aprobada'),
    rechazadas: misiones.filter(m => m.estado === 'rechazada'),
  }), [misiones]);

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
        <SesionDelDia
          sesionHoy={sesionHoy}
          observacionHoy={observacionHoy}
          evaValue={evaValue}
          setEvaValue={setEvaValue}
          isRpeLocked={isRpeLocked}
          evaSaved={evaSaved}
          evaAlert={evaAlert}
          handleSaveEva={handleSaveEva}
        />
      )}

      {/* ── Inteligencia Black Gold ──────── */}
      {deficits.length > 0 && (
        <InteligenciaBlackGold deficits={deficits} />
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
            onToggle={handleToggle}
            onComplete={handleQuizPass}
            onQuiz={handleShowQuiz}
          />
        ))}
      </div>

      {/* ── En Revisión (pendiente_aprobacion) ── */}
      {enRevision.length > 0 && (
        <EnRevision enRevision={enRevision} />
      )}

      {/* ── Completadas (aprobadas) ──────── */}
      {aprobadas.length > 0 && (
        <Completadas aprobadas={aprobadas} />
      )}

      {/* ── Rechazadas ───────────────────── */}
      {rechazadas.length > 0 && (
        <Rechazadas rechazadas={rechazadas} />
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
