import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import RadarChartComp from './RadarChartComp';
import { Shield, Skull, Eye, EyeOff, ClipboardList } from 'lucide-react';
import { RANGOS } from '../lib/baremosEngine';
import { getXPProgress } from '../lib/xpProgress';
import { getBaremoUI } from '../lib/designTokens';
import { getSubPilarScores } from '../lib/radarCalc';
import { useAuth } from '../AuthContext';
import PortalPadreSeccion from './PortalPadreSeccion';
import RangoProgreso from './RangoProgreso';
import EvaluacionModal from './EvaluacionModal';
import { generateWhatsAppReport } from '../lib/whatsappReport';
import { MessageCircle, Target, Brain } from 'lucide-react';
import ModalMisionesAtleta from './ModalMisionesAtleta';
import { evaluarDeficits } from '../lib/didacticEngine';
import HistorialFisicoChart from './HistorialFisicoChart';
import ProgresoNivelModal from './ProgresoNivelModal';
export default function AtletaCard({ atleta, index, todosLosAtletas }) {
  const { user } = useAuth();
  const xpProgress = getXPProgress(atleta.xp_total || 0, atleta.rango?.tier || atleta.rango?.rango?.id || 'rookie');
  
  const [showCategoria, setShowCategoria] = useState(true);
  const [showClub, setShowClub] = useState(true);
  const [showEvalModal, setShowEvalModal] = useState(false);
  const [showMisionesModal, setShowMisionesModal] = useState(false);
  const [showNivelModal, setShowNivelModal] = useState(false);

  // Memoizados: evitan recorrer todas las evaluaciones en cada re-render
  // (toggles del radar, apertura/cierre de modales).
  const subPilarScores = useMemo(() => getSubPilarScores(atleta._evaluaciones || []), [atleta._evaluaciones]);
  const deficits = useMemo(() => evaluarDeficits(atleta), [atleta]);
  const historiales = useMemo(
    () => Object.fromEntries(
      ['fuerza', 'explosividad', 'movilidad', 'tiro', 'agilidad', 'tactica', 'resiliencia']
        .map(k => [k, getHistoricalData(atleta._evaluaciones, k)])
    ),
    [atleta._evaluaciones]
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.15, duration: 0.6, ease: "easeOut" }}
      className="glass-card rounded-none md:rounded-3xl p-6 md:p-8 relative overflow-hidden transition-all duration-500 glow-border isolate"
    >
      {/* Background ambient lighting */}
      <div className="absolute -top-32 -right-32 w-64 h-64 rounded-full blur-[100px] pointer-events-none opacity-60 bg-[#FFD700]"></div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-2 relative z-10 gap-4">
        <div className="flex items-start space-x-4">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-full bg-white/5 border border-white/20 flex items-center justify-center overflow-hidden shrink-0">
            <span className="text-2xl font-black text-white/50 uppercase">{atleta.nombre?.charAt(0)}</span>
          </div>
          
          <div>
            <h3 className="text-2xl font-black text-white tracking-tight leading-none mb-3 drop-shadow-md">{atleta.nombre}</h3>
            <div className="flex items-center space-x-2">
              <span className="bg-white/10 text-white border border-white/20 text-[9px] font-black px-3 py-1.5 rounded-md uppercase tracking-[0.2em]">
                Edad: {atleta.edad}
              </span>
              <span className="bg-white/10 text-white border border-white/20 text-[9px] font-black px-3 py-1.5 rounded-md uppercase tracking-[0.2em]">
                {atleta.posicion}
              </span>
            </div>

            {/* Profile Badges */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {atleta.nivel_desarrollo && (
                <span title="Nivel de Desarrollo para Sesiones Grupales" className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-[#FFD700]/30 text-[#FFD700] bg-[#FFD700]/5 flex items-center gap-1">
                  <span className="opacity-70">Grupo de Clase:</span> 
                  <span>{atleta.nivel_desarrollo}</span>
                </span>
              )}
              {atleta.perfil_mental && (
                <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-emerald-500/30 text-emerald-400 bg-emerald-500/5">
                  {atleta.perfil_mental}
                </span>
              )}
              {atleta.estado_recuperacion && (
                <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                  atleta.estado_recuperacion === 'Óptimo' ? 'border-blue-500/30 text-blue-400 bg-blue-500/5' :
                  atleta.estado_recuperacion === 'Fatiga Silenciosa' ? 'border-orange-500/30 text-orange-400 bg-orange-500/5' :
                  'border-red-500/30 text-red-400 bg-red-500/5'
                }`}>
                  {atleta.estado_recuperacion}
                </span>
              )}
              {atleta.prevencion_impacto && (
                <span title="Sensibilidad al Impacto" className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-orange-500/30 text-orange-400 bg-orange-500/5 flex items-center">
                  ⚠ Impacto
                </span>
              )}
            </div>

            {/* Anthropometric Data */}
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded-lg border border-blue-500/20">
                Estatura: {atleta.talla_cm ? `${atleta.talla_cm} cm` : '—'}
              </span>
              <span className="text-[10px] font-bold text-green-400 bg-green-500/10 px-2 py-1 rounded-lg border border-green-500/20">
                Peso: {atleta.peso_kg ? `${atleta.peso_kg} kg` : '—'}
              </span>
              <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-1 rounded-lg border border-purple-500/20">
                IMC: {atleta.imc || '—'}
              </span>
              <span className="text-[10px] font-bold text-[#FFD700] bg-[#FFD700]/10 px-2 py-1 rounded-lg border border-[#FFD700]/20">
                BR: {atleta.brazada_relativa || '—'}
              </span>
            </div>
          </div>
        </div>
        
        {/* Rango & Progress */}
        <div className="flex flex-col items-start md:items-end w-full md:w-auto">
          <div className="w-full sm:w-auto flex flex-col items-start md:items-end">
            <RangoProgreso xpTotal={atleta.xp_total || 0} />
            <button
              onClick={() => setShowNivelModal(true)}
              className="mt-2 py-2.5 px-2 -mx-2 min-h-[36px] text-[10px] text-[#FFD700]/80 hover:text-[#FFD700] uppercase tracking-widest font-bold flex items-center gap-1 transition-colors"
            >
              <span>Ver Guía de Progresión</span>
              <span className="w-3 h-3 rounded-full border border-current flex items-center justify-center text-[7px]">i</span>
            </button>
          </div>
          
          {user?.rol !== 'atleta' ? (
            <div className="flex flex-wrap gap-2 mt-4 w-full md:w-auto justify-start md:justify-end">
              <button
                onClick={() => setShowEvalModal(true)}
                className="flex-1 min-w-[92px] flex items-center justify-center space-x-2 px-3 py-3 min-h-[44px] bg-[#FFD700] border border-[#FFD700]/50 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-black shadow-[0_0_20px_rgba(255,215,0,0.4)] hover:bg-[#D4AF37] hover:scale-105 transition-all"
              >
                <ClipboardList size={14} />
                <span>Evaluar</span>
              </button>
              <button
                onClick={() => setShowMisionesModal(true)}
                className="flex-1 min-w-[92px] flex items-center justify-center space-x-2 px-3 py-3 min-h-[44px] bg-purple-500/20 border border-purple-500/50 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.2)] hover:bg-purple-500/30 hover:scale-105 transition-all"
              >
                <Target size={14} />
                <span>Misiones</span>
              </button>
              <button
                onClick={() => generateWhatsAppReport(atleta)}
                className="flex-1 min-w-[92px] flex items-center justify-center space-x-2 px-3 py-3 min-h-[44px] bg-[#25D366] border border-[#25D366]/50 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-[0_0_20px_rgba(37,211,102,0.4)] hover:bg-[#128C7E] hover:scale-105 transition-all"
              >
                <MessageCircle size={14} />
                <span>Reporte</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 mt-4 w-full md:w-auto justify-start md:justify-end">
              <button
                onClick={() => setShowEvalModal(true)}
                className="flex-1 min-w-[92px] flex items-center justify-center space-x-2 px-3 py-3 min-h-[44px] bg-blue-500/20 border border-blue-500/50 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:bg-blue-500/30 hover:scale-105 transition-all"
              >
                <ClipboardList size={14} />
                <span>Test Carga y Sueño</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recovery & Medical Alerts */}
      <div className="relative z-10 space-y-3 mt-4">
        {atleta.estado_recuperacion === 'Agotamiento Activo' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-4 backdrop-blur-md"
          >
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
              <span className="font-black uppercase tracking-widest text-[10px] text-amber-400">Agotamiento Activo</span>
            </div>
            <p className="mt-1 text-xs text-amber-200/80 font-light leading-relaxed">⚠️ Ritmo cardíaco elevado. Priorizar sueño 10-12h y actividades recreativas.</p>
          </motion.div>
        )}

        {atleta.estado_recuperacion === 'Fatiga Silenciosa' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-purple-950/40 border border-purple-500/40 rounded-xl p-4 backdrop-blur-md"
          >
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
              <span className="font-black uppercase tracking-widest text-[10px] text-purple-400">Fatiga Silenciosa</span>
            </div>
            <p className="mt-1 text-xs text-purple-200/80 font-light leading-relaxed">⚠️ Rendimiento disminuido sin dolor aparente. Reducir volumen de entrenamiento.</p>
          </motion.div>
        )}
      </div>

      {/* Radar Chart */}
      <div className="relative z-10 mt-6 mb-4">
        <div className="flex justify-end gap-2 mb-2">
          <button
            onClick={() => setShowCategoria(!showCategoria)}
            className={`flex items-center space-x-1 px-3 py-2.5 min-h-[40px] rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${showCategoria ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30' : 'bg-white/5 text-gray-500 border border-white/10'}`}
          >
            {showCategoria ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>Media Categoría</span>
          </button>
          <button
            onClick={() => setShowClub(!showClub)}
            className={`flex items-center space-x-1 px-3 py-2.5 min-h-[40px] rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${showClub ? 'bg-white/20 text-white border border-white/30' : 'bg-white/5 text-gray-500 border border-white/10'}`}
          >
            {showClub ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>Media Club</span>
          </button>
        </div>

        <RadarChartComp 
          atleta={atleta} 
          todosLosAtletas={todosLosAtletas} 
          showCategoria={showCategoria} 
          showClub={showClub} 
        />
      </div>

      {/* Sub-Pilar Progress Bars (1 columna en móviles angostos para que
          label + nivel + sparkline no colisionen) */}
      <div className="relative z-10 grid grid-cols-1 min-[480px]:grid-cols-2 gap-x-6 gap-y-4">
        <ProgressBar label="Fuerza" value={subPilarScores.fuerza} index={index} history={historiales.fuerza} />
        <ProgressBar label="Explosividad" value={subPilarScores.explosividad} index={index} history={historiales.explosividad} />
        <ProgressBar label="Movilidad" value={subPilarScores.movilidad} index={index} history={historiales.movilidad} />
        <ProgressBar label="Técnica Tiro" value={subPilarScores.tiro} index={index} history={historiales.tiro} />
        <ProgressBar label="Agilidad" value={subPilarScores.agilidad} index={index} history={historiales.agilidad} />
        <ProgressBar label="Efic. Táctica" value={subPilarScores.tactica} index={index} history={historiales.tactica} />
        <ProgressBar label="Resiliencia" value={subPilarScores.resiliencia} index={index} history={historiales.resiliencia} />
      </div>

      {/* Evaluaciones count */}
      {atleta._evaluaciones && atleta._evaluaciones.length > 0 && (
        <div className="mt-4 relative z-10">
          <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
            {atleta._evaluaciones.length} pruebas registradas • Overall: {atleta.overall_score || 0}/100
          </p>
        </div>
      )}

      {/* Historial Físico / IMC Chart */}
      <div className="relative z-10">
        <HistorialFisicoChart evaluaciones={atleta._evaluaciones} />
      </div>

      {/* Inteligencia Black Gold */}
      {deficits.length > 0 && (
        <div className="mt-6 pt-6 border-t border-white/10 relative z-10">
          <div className="flex items-center space-x-2 mb-4">
            <Brain className="text-[#FFD700] w-5 h-5" />
            <h3 className="text-xs font-black uppercase tracking-widest text-[#FFD700]">Inteligencia Black Gold</h3>
          </div>
          <div className="space-y-2">
            {deficits.slice(0, 2).map((deficit, idx) => (
              <div
                key={deficit.condicion}
                className={`p-3 rounded-xl border backdrop-blur-md ${
                  deficit.prioridad === 'critica' ? 'bg-red-950/40 border-red-500/40' :
                  deficit.prioridad === 'alta' ? 'bg-amber-950/40 border-amber-500/40' :
                  'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1">
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
                <p className="text-[10px] text-gray-300 leading-relaxed">
                  {deficit.mensaje}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Portal del Padre Section */}
      {user?.rol === 'padre' && (
        <PortalPadreSeccion atleta={atleta} subPilarScores={subPilarScores} />
      )}

      {/* Evaluation Modal */}
      {showEvalModal && (
        <EvaluacionModal 
          atleta={atleta} 
          isOpen={showEvalModal} 
          onClose={() => setShowEvalModal(false)} 
        />
      )}

      <ModalMisionesAtleta 
        atleta={atleta} 
        isOpen={showMisionesModal} 
        onClose={() => setShowMisionesModal(false)} 
      />

      <ProgresoNivelModal
        isOpen={showNivelModal}
        onClose={() => setShowNivelModal(false)}
        atleta={atleta}
      />
    </motion.div>
  );
}

function getHistoricalData(evaluaciones, subPilarKey) {
  if (!evaluaciones || evaluaciones.length === 0) return [];
  // Radar uses the key (e.g. 'fuerza', 'explosividad', 'tactica') which matches sub_pilar
  const evals = evaluaciones
    .filter(e => e.sub_pilar === subPilarKey)
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    .slice(-5); // Last 5
  return evals.map(e => e.puntuacion_normalizada || 0);
}

function ProgressBar({ label, value, index, isDanger, history = [] }) {
  const level = getBaremoUI(value);
  
  return (
    <div>
      <div className="flex justify-between items-end text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-2">
        <span>{label}</span>
        <div className="flex items-end gap-3">
          {/* Mini Sparkline (Last 5) */}
          {history.length > 1 && (
            <div className="flex items-end space-x-[2px] h-3 opacity-60">
              {history.map((hVal, i) => (
                <div 
                  key={i}
                  className="w-1 bg-[#FFD700] rounded-sm"
                  style={{ height: `${Math.max(10, hVal)}%` }}
                  title={`Intento ${i+1}: ${hVal}`}
                />
              ))}
            </div>
          )}
          <span className={level.color}>{value > 0 ? level.nombre : '—'}</span>
        </div>
      </div>
      <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/5 relative">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1.2, delay: index * 0.1 + 0.5, ease: "easeOut" }}
          className={`h-full rounded-full ${isDanger ? 'bg-red-500 shadow-[0_0_10px_rgba(255,0,0,0.5)]' : `${level.bg} shadow-[0_0_10px_rgba(255,215,0,0.3)]`}`}
        ></motion.div>
      </div>
    </div>
  );
}
