import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import RadarChartComp from './RadarChartComp';
import { Eye, EyeOff, ClipboardList } from 'lucide-react';
import { getBaremoUI, MOTION, staggerDelay } from '../lib/designTokens';
import { getSubPilarScores, RADAR_AXES } from '../lib/radarCalc';
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
import { tieneDatosAntropometricos } from '../api/utilsAtletas';
import HexAvatar from './arcade/HexAvatar';
import { C, cut } from './arcade/arcadeTokens';

// Hue del avatar hexagonal por estado de readiness (la luz es información):
// rojo agotamiento, naranja fatiga silenciosa, verde óptimo, oro por defecto.
const HUE_READINESS = {
  'Agotamiento Activo': 'red',
  'Fatiga Silenciosa': 'orange',
  'Óptimo': 'green',
};

export default function AtletaCard({ atleta, index, todosLosAtletas }) {
  const { user } = useAuth();
  const conAntropometria = tieneDatosAntropometricos(atleta);
  const avatarHue = HUE_READINESS[atleta.estado_recuperacion] || 'gold';

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
      RADAR_AXES.map(({ key }) => [key, getHistoricalData(atleta._evaluaciones, key)])
    ),
    [atleta._evaluaciones]
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: staggerDelay(index), duration: MOTION.duration.entrance, ease: MOTION.ease.out }}
      style={{ clipPath: cut(14), background: C.card }}
      className="p-6 md:p-8 relative overflow-hidden transition duration-500 border border-white/5 glow-border isolate"
    >
      {/* Background ambient lighting */}
      <div className="absolute -top-32 -right-32 w-64 h-64 rounded-full blur-[100px] pointer-events-none opacity-60 bg-brand"></div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-2 relative z-10 gap-4">
        <div className="flex items-start space-x-4">
          {/* Avatar hexagonal — color por readiness */}
          <HexAvatar size={64} hue={avatarHue} initial={atleta.nombre?.charAt(0)?.toUpperCase()} />

          <div>
            <h3 className="text-2xl font-black text-white tracking-tight leading-none mb-3 drop-shadow-md">{atleta.nombre}</h3>
            <div className="flex items-center space-x-2">
              <span className="bg-white/10 text-white border border-white/20 text-3xs font-black px-3 py-1.5 rounded-md uppercase tracking-eyebrow">
                Edad: {atleta.edad}
              </span>
              <span className="bg-white/10 text-white border border-white/20 text-3xs font-black px-3 py-1.5 rounded-md uppercase tracking-eyebrow">
                {atleta.posicion}
              </span>
            </div>

            {/* Profile Badges */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {atleta.nivel_desarrollo && (
                <span title="Nivel de Desarrollo para Sesiones Grupales" className="text-3xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-brand/30 text-brand bg-brand/5 flex items-center gap-1">
                  <span className="opacity-70">Grupo de Clase:</span> 
                  <span>{atleta.nivel_desarrollo}</span>
                </span>
              )}
              {atleta.perfil_mental && (
                <span className="text-3xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-success/30 text-success-soft bg-success/5">
                  {atleta.perfil_mental}
                </span>
              )}
              {atleta.estado_recuperacion && (
                <span className={`text-3xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                  atleta.estado_recuperacion === 'Óptimo' ? 'border-info/30 text-info-soft bg-info/5' :
                  atleta.estado_recuperacion === 'Fatiga Silenciosa' ? 'border-caution/30 text-caution-soft bg-caution/5' :
                  'border-danger/30 text-danger-soft bg-danger/5'
                }`}>
                  {atleta.estado_recuperacion}
                </span>
              )}
              {atleta.prevencion_impacto && (
                <span title="Sensibilidad al Impacto" className="text-3xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-caution/30 text-caution-soft bg-caution/5 flex items-center">
                  ⚠ Impacto
                </span>
              )}
            </div>

            {/* Anthropometric Data */}
            <div className="flex flex-wrap gap-2 mt-4">
              {conAntropometria ? (
                <>
                  <span className="text-2xs font-bold text-info-soft bg-info/10 px-2 py-1 rounded-lg border border-info/20">
                    Estatura: {atleta.talla_cm ? `${atleta.talla_cm} cm` : '—'}
                  </span>
                  <span className="text-2xs font-bold text-success-soft bg-success/10 px-2 py-1 rounded-lg border border-success/20">
                    Peso: {atleta.peso_kg ? `${atleta.peso_kg} kg` : '—'}
                  </span>
                  <span className="text-2xs font-bold text-mental-soft bg-mental/10 px-2 py-1 rounded-lg border border-mental/20">
                    IMC: {atleta.imc || '—'}
                  </span>
                  <span className="text-2xs font-bold text-brand bg-brand/10 px-2 py-1 rounded-lg border border-brand/20">
                    BR: {atleta.brazada_relativa || '—'}
                  </span>
                </>
              ) : (
                <span className="text-2xs font-bold text-fg-faint bg-white/5 px-2 py-1 rounded-lg border border-white/10">
                  Sin datos antropométricos
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* Rango & Progress */}
        <div className="flex flex-col items-start md:items-end w-full md:w-auto">
          <div className="w-full sm:w-auto flex flex-col items-start md:items-end">
            <RangoProgreso xpTotal={atleta.xp_total || 0} />
            <button
              onClick={() => setShowNivelModal(true)}
              className="mt-2 py-2.5 px-2 -mx-2 min-h-[36px] text-2xs text-brand/80 hover:text-brand uppercase tracking-widest font-bold flex items-center gap-1 transition-colors"
            >
              <span>Ver Guía de Progresión</span>
              <span className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center text-3xs">i</span>
            </button>
          </div>
          
          {user?.rol !== 'atleta' ? (
            <div className="flex flex-wrap gap-2 mt-4 w-full md:w-auto justify-start md:justify-end">
              <button
                onClick={() => setShowEvalModal(true)}
                className="flex-1 min-w-[92px] flex items-center justify-center space-x-2 px-3 py-3 min-h-[44px] bg-brand border border-brand/50 rounded-control text-2xs font-black uppercase tracking-eyebrow text-on-brand shadow-glow-gold hover:bg-brand-hover hover:scale-105 active:scale-[0.97] transition"
              >
                <ClipboardList size={14} />
                <span>Evaluar</span>
              </button>
              <button
                onClick={() => setShowMisionesModal(true)}
                className="flex-1 min-w-[92px] flex items-center justify-center space-x-2 px-3 py-3 min-h-[44px] bg-mental/20 border border-mental/50 rounded-control text-2xs font-black uppercase tracking-eyebrow text-mental-soft shadow-[0_0_20px_rgba(168,85,247,0.2)] hover:bg-mental/30 hover:scale-105 active:scale-[0.97] transition"
              >
                <Target size={14} />
                <span>Misiones</span>
              </button>
              <button
                onClick={() => generateWhatsAppReport(atleta)}
                className="flex-1 min-w-[92px] flex items-center justify-center space-x-2 px-3 py-3 min-h-[44px] bg-whatsapp border border-whatsapp/50 rounded-control text-2xs font-black uppercase tracking-eyebrow text-white shadow-[0_0_20px_rgba(37,211,102,0.4)] hover:bg-whatsapp-deep hover:scale-105 active:scale-[0.97] transition"
              >
                <MessageCircle size={14} />
                <span>Reporte</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 mt-4 w-full md:w-auto justify-start md:justify-end">
              <button
                onClick={() => setShowEvalModal(true)}
                className="flex-1 min-w-[92px] flex items-center justify-center space-x-2 px-3 py-3 min-h-[44px] bg-info/20 border border-info/50 rounded-control text-2xs font-black uppercase tracking-eyebrow text-info-soft shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:bg-info/30 hover:scale-105 active:scale-[0.97] transition"
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
            className="bg-warning/10 border border-warning/40 rounded-panel p-4 backdrop-blur-md"
          >
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-warning animate-pulse"></div>
              <span className="font-black uppercase tracking-widest text-2xs text-warning-soft">Agotamiento Activo</span>
            </div>
            <p className="mt-1 text-xs text-fg-secondary font-light leading-relaxed">⚠️ Ritmo cardíaco elevado. Priorizar sueño 10-12h y actividades recreativas.</p>
          </motion.div>
        )}

        {atleta.estado_recuperacion === 'Fatiga Silenciosa' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-mental/10 border border-mental/40 rounded-panel p-4 backdrop-blur-md"
          >
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-mental animate-pulse"></div>
              <span className="font-black uppercase tracking-widest text-2xs text-mental-soft">Fatiga Silenciosa</span>
            </div>
            <p className="mt-1 text-xs text-fg-secondary font-light leading-relaxed">⚠️ Rendimiento disminuido sin dolor aparente. Reducir volumen de entrenamiento.</p>
          </motion.div>
        )}
      </div>

      {/* Radar Chart */}
      <div className="relative z-10 mt-6 mb-4">
        <div className="flex justify-end gap-2 mb-2">
          <button
            onClick={() => setShowCategoria(!showCategoria)}
            className={`flex items-center space-x-1 px-3 py-2.5 min-h-[40px] rounded-lg text-2xs font-bold uppercase tracking-widest transition-colors ${showCategoria ? 'bg-success/20 text-success border border-success/30' : 'bg-white/5 text-fg-muted border border-white/10'}`}
          >
            {showCategoria ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>Media Categoría</span>
          </button>
          <button
            onClick={() => setShowClub(!showClub)}
            className={`flex items-center space-x-1 px-3 py-2.5 min-h-[40px] rounded-lg text-2xs font-bold uppercase tracking-widest transition-colors ${showClub ? 'bg-white/20 text-white border border-white/30' : 'bg-white/5 text-fg-muted border border-white/10'}`}
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
        {RADAR_AXES.map(({ key, label }) => (
          <ProgressBar key={key} label={label} value={subPilarScores[key]} index={index} history={historiales[key]} />
        ))}
      </div>

      {/* Evaluaciones count */}
      {atleta._evaluaciones && atleta._evaluaciones.length > 0 && (
        <div className="mt-4 relative z-10">
          <p className="text-3xs text-fg-muted font-bold uppercase tracking-widest">
            {atleta._evaluaciones.length} pruebas registradas • Overall:{' '}
            <span className="font-pixel text-brand tabular-nums">{atleta.overall_score || 0}/100</span>
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
            <Brain className="text-brand w-5 h-5" />
            <h3 className="text-xs font-black uppercase tracking-widest text-brand">Inteligencia Black Gold</h3>
          </div>
          <div className="space-y-2">
            {deficits.slice(0, 2).map((deficit) => (
              <div
                key={deficit.condicion}
                className={`p-3 rounded-panel border backdrop-blur-md ${
                  deficit.prioridad === 'critica' ? 'bg-danger/10 border-danger/40' :
                  deficit.prioridad === 'alta' ? 'bg-warning/10 border-warning/40' :
                  'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${
                    deficit.prioridad === 'critica' ? 'bg-danger' :
                    deficit.prioridad === 'alta' ? 'bg-warning' :
                    'bg-white/50'
                  }`} />
                  <span className={`text-3xs font-black uppercase tracking-widest ${
                    deficit.prioridad === 'critica' ? 'text-danger-soft' :
                    deficit.prioridad === 'alta' ? 'text-warning-soft' :
                    'text-white'
                  }`}>
                    {deficit.prioridad === 'critica' ? 'Prioridad Crítica' : deficit.prioridad === 'alta' ? 'Prioridad Alta' : 'Sugerencia'}
                  </span>
                </div>
                <p className="text-2xs text-fg-secondary leading-relaxed">
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
      <div className="flex justify-between items-end text-3xs uppercase tracking-widest font-bold text-fg-secondary mb-2">
        <span>{label}</span>
        <div className="flex items-end gap-3">
          {/* Mini Sparkline (Last 5) */}
          {history.length > 1 && (
            <div className="flex items-end space-x-[2px] h-3 opacity-60">
              {history.map((hVal, i) => (
                <div 
                  key={i}
                  className="w-1 bg-brand rounded-sm"
                  style={{ height: `${Math.max(10, hVal)}%` }}
                  title={`Intento ${i+1}: ${hVal}`}
                />
              ))}
            </div>
          )}
          <span className={level.color}>{value > 0 ? level.nombre : '—'}</span>
        </div>
      </div>
      <div className="w-full h-1.5 bg-surface-sunken rounded-full overflow-hidden border border-white/5 relative">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: MOTION.duration.bar, delay: staggerDelay(index, 0.1) + 0.5, ease: MOTION.ease.premium }}
          className={`h-full rounded-full ${isDanger ? 'bg-danger shadow-[0_0_10px_rgba(255,0,0,0.5)]' : `${level.bg} shadow-[0_0_10px_rgba(255,215,0,0.3)]`}`}
        ></motion.div>
      </div>
    </div>
  );
}
