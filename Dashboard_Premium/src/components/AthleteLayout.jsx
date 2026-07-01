import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, Target, Calendar, BarChart2, TrendingUp,
  LogOut, User, Shield, Eye, EyeOff
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import RangoProgreso from './RangoProgreso';
import MisionesPanel from './MisionesPanel';
import RadarChartComp from './RadarChartComp';
import EventosAtleta from './EventosAtleta';
import HistorialPruebas from './HistorialPruebas';
import EditarPerfilModal from './EditarPerfilModal';
import { evaluarDeficits } from '../lib/didacticEngine';
import { getSubPilarScores } from '../lib/radarCalc';
import { Brain } from 'lucide-react';

const TABS = [
  { id: 'inicio',   label: 'Inicio',   icon: Home },
  { id: 'misiones', label: 'Misiones', icon: Target },
  { id: 'eventos',  label: 'Eventos',  icon: Calendar },
  { id: 'kpis',     label: 'KPIs',     icon: BarChart2 },
  { id: 'historial',label: 'Historial',icon: TrendingUp },
];

export default function AthleteLayout({ atleta, todosLosAtletas }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('inicio');
  const [showEditProfile, setShowEditProfile] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  if (!atleta) return null;

  return (
    <div className="flex h-screen bg-[#09090b] text-white overflow-hidden">
      {/* ── SIDEBAR ────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col bg-[#0d0d0f] border-r border-white/5 overflow-y-auto">
        {/* Brand */}
        <div className="px-5 pt-6 pb-4 border-b border-white/5">
          <div className="flex items-center space-x-2 mb-1">
            <div className="w-1.5 h-5 bg-[#FFD700] rounded-full shadow-[0_0_8px_rgba(255,215,0,0.5)]" />
            <span className="text-sm font-black tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
              Black Gold
            </span>
          </div>
          <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest flex items-center">
            <Shield size={9} className="mr-1 text-[#FFD700]" />
            Panel de Rendimiento
          </p>
        </div>

        {/* Profile Card */}
        <div className="px-5 py-5 border-b border-white/5">
          {/* Avatar */}
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-white/5 border border-white/20 flex items-center justify-center shrink-0">
              <span className="text-xl font-black text-white/60 uppercase">
                {atleta.nombre?.charAt(0)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-black text-sm leading-tight text-white truncate">{atleta.nombre}</p>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest truncate">
                {atleta.posicion || '—'}
              </p>
            </div>
          </div>

          {/* Category & age badges */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {atleta.categoria && (
              <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-[#FFD700]/30 text-[#FFD700] bg-[#FFD700]/5">
                {atleta.categoria}
              </span>
            )}
            {atleta.edad && (
              <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-white/20 text-gray-400 bg-white/5">
                {atleta.edad} años
              </span>
            )}
            {atleta.nivel_desarrollo && (
              <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-emerald-500/30 text-emerald-400 bg-emerald-500/5">
                {atleta.nivel_desarrollo}
              </span>
            )}
          </div>

          {/* XP / Rango */}
          <RangoProgreso xpTotal={atleta.xp_total || 0} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 ${
                  active
                    ? 'bg-[#FFD700]/10 border border-[#FFD700]/20 text-[#FFD700]'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon size={16} className={active ? 'text-[#FFD700]' : 'text-gray-600'} />
                <span className="text-[11px] font-black uppercase tracking-widest">{label}</span>
                {active && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#FFD700] shadow-[0_0_6px_rgba(255,215,0,0.6)]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="px-3 py-4 border-t border-white/5 space-y-1">
          <button
            onClick={() => setShowEditProfile(true)}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all border border-transparent text-left"
          >
            <User size={16} className="text-gray-600" />
            <span className="text-[11px] font-black uppercase tracking-widest">Editar Perfil</span>
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-500/5 transition-all border border-transparent text-left"
            data-testid="btn-logout"
          >
            <LogOut size={16} className="text-gray-600" />
            <span className="text-[11px] font-black uppercase tracking-widest">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ───────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 w-[600px] h-[400px] bg-[#FFD700]/4 blur-[150px] pointer-events-none rounded-full mix-blend-screen" />

        {/* Tab header */}
        <div className="sticky top-0 z-10 bg-[#09090b]/80 backdrop-blur-xl border-b border-white/5 px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {(() => {
              const tab = TABS.find(t => t.id === activeTab);
              const Icon = tab?.icon;
              return (
                <>
                  <Icon size={18} className="text-[#FFD700]" />
                  <h2 className="text-lg font-black uppercase tracking-tight text-white">{tab?.label}</h2>
                </>
              );
            })()}
          </div>
          <div className="flex items-center space-x-2 text-[9px] text-gray-500 font-bold uppercase tracking-widest">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
            <span>{user.nombre}</span>
          </div>
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="p-6 md:p-8"
          >
            {activeTab === 'inicio' && (
              <TabInicio atleta={atleta} todosLosAtletas={todosLosAtletas} />
            )}
            {activeTab === 'misiones' && (
              <MisionesPanel atletaId={user.id} />
            )}
            {activeTab === 'eventos' && (
              <EventosAtleta atletaId={user.atleta_id} />
            )}
            {activeTab === 'kpis' && (
              <TabKPIs atleta={atleta} todosLosAtletas={todosLosAtletas} />
            )}
            {activeTab === 'historial' && (
              <HistorialPruebas atletaId={user.atleta_id} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Modals */}
      {showEditProfile && (
        <EditarPerfilModal
          onClose={() => setShowEditProfile(false)}
          onRefresh={() => window.location.reload()}
        />
      )}
    </div>
  );
}

/* ── TAB: INICIO ─────────────────────────────────────────────── */
function TabInicio({ atleta, todosLosAtletas }) {
  const [showCategoria, setShowCategoria] = useState(true);
  const [showClub, setShowClub] = useState(true);
  const deficits = evaluarDeficits(atleta);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Measurements */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Estatura" value={atleta.talla_cm ? `${atleta.talla_cm} cm` : '—'} color="blue" />
        <StatCard label="Peso" value={atleta.peso_kg ? `${atleta.peso_kg} kg` : '—'} color="green" />
        <StatCard label="IMC" value={atleta.imc || '—'} color="purple" />
        <StatCard label="Brazada Rel." value={atleta.brazada_relativa || '—'} color="yellow" />
      </div>

      {/* Recovery alerts */}
      {atleta.estado_recuperacion && atleta.estado_recuperacion !== 'Óptimo' && (
        <div className={`p-4 rounded-xl border backdrop-blur-md ${
          atleta.estado_recuperacion === 'Agotamiento Activo'
            ? 'bg-amber-950/40 border-amber-500/40'
            : 'bg-purple-950/40 border-purple-500/40'
        }`}>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full animate-pulse ${
              atleta.estado_recuperacion === 'Agotamiento Activo' ? 'bg-amber-500' : 'bg-purple-500'
            }`} />
            <span className={`text-[9px] font-black uppercase tracking-widest ${
              atleta.estado_recuperacion === 'Agotamiento Activo' ? 'text-amber-400' : 'text-purple-400'
            }`}>{atleta.estado_recuperacion}</span>
          </div>
          <p className="mt-1 text-xs text-gray-300 leading-relaxed">
            {atleta.estado_recuperacion === 'Agotamiento Activo'
              ? '⚠️ Ritmo cardíaco elevado. Priorizar sueño 10-12h y actividades recreativas.'
              : '⚠️ Rendimiento disminuido sin dolor aparente. Reducir volumen de entrenamiento.'}
          </p>
        </div>
      )}

      {/* Radar */}
      <div className="bg-[#0d0d0f] border border-white/5 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Radar de Pilares</h3>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowCategoria(!showCategoria)}
              className={`flex items-center space-x-1 px-2 py-1 rounded text-[8px] font-bold uppercase tracking-widest transition-colors ${
                showCategoria
                  ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30'
                  : 'bg-white/5 text-gray-500 border border-white/10'
              }`}
            >
              {showCategoria ? <Eye size={9} /> : <EyeOff size={9} />}
              <span>Categoría</span>
            </button>
            <button
              onClick={() => setShowClub(!showClub)}
              className={`flex items-center space-x-1 px-2 py-1 rounded text-[8px] font-bold uppercase tracking-widest transition-colors ${
                showClub
                  ? 'bg-white/20 text-white border border-white/30'
                  : 'bg-white/5 text-gray-500 border border-white/10'
              }`}
            >
              {showClub ? <Eye size={9} /> : <EyeOff size={9} />}
              <span>Club</span>
            </button>
          </div>
        </div>
        <RadarChartComp
          atleta={atleta}
          todosLosAtletas={todosLosAtletas}
          showCategoria={showCategoria}
          showClub={showClub}
        />
      </div>

      {/* Inteligencia Black Gold */}
      {deficits.length > 0 && (
        <div className="bg-[#0d0d0f] border border-white/5 rounded-2xl p-5">
          <div className="flex items-center space-x-2 mb-4">
            <Brain className="text-[#FFD700] w-5 h-5" />
            <h3 className="text-xs font-black uppercase tracking-widest text-[#FFD700]">
              Inteligencia Black Gold
            </h3>
          </div>
          <div className="space-y-2">
            {deficits.slice(0, 3).map((deficit) => (
              <div
                key={deficit.condicion}
                className={`p-3 rounded-xl border ${
                  deficit.prioridad === 'critica'
                    ? 'bg-red-950/40 border-red-500/40'
                    : deficit.prioridad === 'alta'
                    ? 'bg-amber-950/40 border-amber-500/40'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    deficit.prioridad === 'critica' ? 'bg-red-500'
                    : deficit.prioridad === 'alta' ? 'bg-amber-500'
                    : 'bg-white/50'
                  }`} />
                  <span className={`text-[9px] font-black uppercase tracking-widest ${
                    deficit.prioridad === 'critica' ? 'text-red-400'
                    : deficit.prioridad === 'alta' ? 'text-amber-400'
                    : 'text-white'
                  }`}>
                    {deficit.prioridad === 'critica' ? 'Prioridad Crítica'
                      : deficit.prioridad === 'alta' ? 'Prioridad Alta'
                      : 'Sugerencia'}
                  </span>
                </div>
                <p className="text-[10px] text-gray-300 leading-relaxed">{deficit.mensaje}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Badges */}
      {(atleta.perfil_mental || atleta.prevencion_impacto) && (
        <div className="flex flex-wrap gap-2">
          {atleta.perfil_mental && (
            <span className="text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-emerald-500/30 text-emerald-400 bg-emerald-500/5">
              Perfil: {atleta.perfil_mental}
            </span>
          )}
          {atleta.prevencion_impacto && (
            <span className="text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-orange-500/30 text-orange-400 bg-orange-500/5">
              ⚠ Sensibilidad al Impacto
            </span>
          )}
          {atleta.estado_recuperacion && (
            <span className={`text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border ${
              atleta.estado_recuperacion === 'Óptimo'
                ? 'border-blue-500/30 text-blue-400 bg-blue-500/5'
                : 'border-gray-700 text-gray-500 bg-white/5'
            }`}>
              {atleta.estado_recuperacion}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── TAB: KPIs ───────────────────────────────────────────────── */
function TabKPIs({ atleta, todosLosAtletas }) {
  const subPilarScores = getSubPilarScores(atleta._evaluaciones || []);
  const [showCategoria, setShowCategoria] = useState(true);
  const [showClub, setShowClub] = useState(true);

  const PILARES = [
    { key: 'fuerza',       label: 'Fuerza',       color: '#f97316' },
    { key: 'explosividad', label: 'Explosividad',  color: '#eab308' },
    { key: 'movilidad',    label: 'Movilidad',     color: '#22c55e' },
    { key: 'tiro',         label: 'Técnica Tiro',  color: '#3b82f6' },
    { key: 'agilidad',     label: 'Agilidad',      color: '#a855f7' },
    { key: 'tactica',      label: 'Efic. Táctica', color: '#ec4899' },
    { key: 'resiliencia',  label: 'Resiliencia',   color: '#FFD700' },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Overall score */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Overall" value={`${atleta.overall_score || 0}/100`} color="yellow" large />
        <StatCard label="Total XP" value={(atleta.xp_total || 0).toLocaleString()} color="purple" large />
        <StatCard label="Evaluaciones" value={atleta._evaluaciones?.length || 0} color="blue" large />
      </div>

      {/* Radar con toggles */}
      <div className="bg-[#0d0d0f] border border-white/5 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Comparativa de Pilares</h3>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowCategoria(!showCategoria)}
              className={`flex items-center space-x-1 px-2 py-1 rounded text-[8px] font-bold uppercase tracking-widest transition-colors ${
                showCategoria
                  ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30'
                  : 'bg-white/5 text-gray-500 border border-white/10'
              }`}
            >
              {showCategoria ? <Eye size={9} /> : <EyeOff size={9} />}
              <span>Categoría</span>
            </button>
            <button
              onClick={() => setShowClub(!showClub)}
              className={`flex items-center space-x-1 px-2 py-1 rounded text-[8px] font-bold uppercase tracking-widest transition-colors ${
                showClub
                  ? 'bg-white/20 text-white border border-white/30'
                  : 'bg-white/5 text-gray-500 border border-white/10'
              }`}
            >
              {showClub ? <Eye size={9} /> : <EyeOff size={9} />}
              <span>Club</span>
            </button>
          </div>
        </div>
        <RadarChartComp
          atleta={atleta}
          todosLosAtletas={todosLosAtletas}
          showCategoria={showCategoria}
          showClub={showClub}
        />
      </div>

      {/* Pillar bars */}
      <div className="bg-[#0d0d0f] border border-white/5 rounded-2xl p-5">
        <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-5">Puntuación por Pilar</h3>
        <div className="space-y-4">
          {PILARES.map(({ key, label, color }) => {
            const val = subPilarScores[key] || 0;
            const level = getBaremoLevel(val);
            return (
              <div key={key}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-[9px] font-black uppercase tracking-widest ${level.color}`}>
                      {val > 0 ? level.nombre : 'Sin datos'}
                    </span>
                    <span className="text-[10px] font-black text-white">{val > 0 ? val : '—'}</span>
                  </div>
                </div>
                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${val}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${color}88, ${color})`,
                      boxShadow: `0 0 8px ${color}44`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────── */
function getBaremoLevel(value) {
  if (value >= 81) return { nombre: 'Excelente', color: 'text-emerald-400' };
  if (value >= 61) return { nombre: 'Muy Bueno', color: 'text-[#FFD700]' };
  if (value >= 41) return { nombre: 'Bueno',     color: 'text-cyan-400' };
  if (value >= 21) return { nombre: 'Regular',   color: 'text-orange-400' };
  return { nombre: 'Sin datos', color: 'text-gray-600' };
}

function StatCard({ label, value, color, large }) {
  const colors = {
    blue:   'text-blue-400 bg-blue-500/10 border-blue-500/20',
    green:  'text-green-400 bg-green-500/10 border-green-500/20',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    yellow: 'text-[#FFD700] bg-[#FFD700]/10 border-[#FFD700]/20',
  };
  return (
    <div className={`border rounded-xl p-3 ${colors[color] || colors.blue}`}>
      <p className="text-[8px] font-bold uppercase tracking-widest opacity-70 mb-1">{label}</p>
      <p className={`font-black leading-none ${large ? 'text-2xl' : 'text-base'}`}>{value}</p>
    </div>
  );
}
