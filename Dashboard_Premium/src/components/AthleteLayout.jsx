import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
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
import { getBaremoUI } from '../lib/designTokens';
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
  // Tabs ya visitados: se mantienen montados (ocultos con CSS) para no
  // refetchear todo su contenido en cada cambio de pestaña.
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(['inicio']));
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  const handleTabChange = (id) => {
    setVisitedTabs(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
    setActiveTab(id);
    setShowMobileMenu(false);
  };

  if (!atleta) return null;

  return (
    <div className="flex h-dvh bg-[#09090b] text-white overflow-hidden">
      {/* ── SIDEBAR (solo md+) ─────────────────────────────────── */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-[#0d0d0f] border-r border-white/5 overflow-y-auto">
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
                onClick={() => handleTabChange(id)}
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
        <div className="sticky top-0 z-10 bg-[#09090b]/80 backdrop-blur-xl border-b border-white/5 px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between">
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
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center space-x-2 text-[9px] text-gray-500 font-bold uppercase tracking-widest">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
              <span>{user.nombre}</span>
            </div>
            {/* Menú de perfil (solo móvil): Editar Perfil / Cerrar Sesión */}
            <div className="relative md:hidden">
              <button
                onClick={() => setShowMobileMenu(v => !v)}
                aria-label="Menú de perfil"
                className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white transition-colors"
              >
                <User size={18} />
              </button>
              {showMobileMenu && (
                <>
                  <div className="fixed inset-0" onClick={() => setShowMobileMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-52 bg-[#0d0d0f] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                    <button
                      onClick={() => { setShowMobileMenu(false); setShowEditProfile(true); }}
                      className="w-full flex items-center gap-3 px-4 py-3 min-h-11 text-left text-gray-300 hover:bg-white/5 transition-colors"
                    >
                      <User size={16} className="text-gray-500" />
                      <span className="text-[11px] font-black uppercase tracking-widest">Editar Perfil</span>
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 min-h-11 text-left text-gray-300 hover:bg-red-500/10 hover:text-red-400 transition-colors border-t border-white/5"
                    >
                      <LogOut size={16} className="text-gray-500" />
                      <span className="text-[11px] font-black uppercase tracking-widest">Cerrar Sesión</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tab content: los tabs visitados quedan montados y solo se ocultan,
            así volver a un tab no re-dispara sus fetches */}
        <div className="p-4 pb-24 sm:p-6 sm:pb-24 md:p-8 md:pb-8">
          {visitedTabs.has('inicio') && (
            <div className={activeTab === 'inicio' ? undefined : 'hidden'}>
              <TabInicio atleta={atleta} todosLosAtletas={todosLosAtletas} />
            </div>
          )}
          {visitedTabs.has('misiones') && (
            <div className={activeTab === 'misiones' ? undefined : 'hidden'}>
              <MisionesPanel atletaId={user.id} />
            </div>
          )}
          {visitedTabs.has('eventos') && (
            <div className={activeTab === 'eventos' ? undefined : 'hidden'}>
              <EventosAtleta atletaId={user.atleta_id} />
            </div>
          )}
          {visitedTabs.has('kpis') && (
            <div className={activeTab === 'kpis' ? undefined : 'hidden'}>
              <TabKPIs atleta={atleta} todosLosAtletas={todosLosAtletas} />
            </div>
          )}
          {visitedTabs.has('historial') && (
            <div className={activeTab === 'historial' ? undefined : 'hidden'}>
              <HistorialPruebas atletaId={user.atleta_id} />
            </div>
          )}
        </div>
      </main>

      {/* ── BOTTOM NAV (solo móvil) ────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-[#0d0d0f]/95 backdrop-blur-xl border-t border-white/5 flex pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[52px] transition-colors ${
                active ? 'text-[#FFD700]' : 'text-gray-500'
              }`}
            >
              <Icon size={20} />
              <span className="text-[10px] font-bold uppercase">{label}</span>
            </button>
          );
        })}
      </nav>

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

/* ── Toggle Categoría/Club del radar ─────────────────────────── */
function ToggleChip({ active, label, activeClasses, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${
        active ? activeClasses : 'bg-white/5 text-gray-500 border border-white/10'
      }`}
    >
      {active ? <Eye size={13} /> : <EyeOff size={13} />}
      <span>{label}</span>
    </button>
  );
}

/* ── TAB: INICIO ─────────────────────────────────────────────── */
function TabInicio({ atleta, todosLosAtletas }) {
  const [showCategoria, setShowCategoria] = useState(true);
  const [showClub, setShowClub] = useState(true);
  const deficits = useMemo(() => evaluarDeficits(atleta), [atleta]);

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
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Radar de Pilares</h3>
          <div className="flex gap-2">
            <ToggleChip
              active={showCategoria}
              label="Categoría"
              activeClasses="bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30"
              onClick={() => setShowCategoria(!showCategoria)}
            />
            <ToggleChip
              active={showClub}
              label="Club"
              activeClasses="bg-white/20 text-white border border-white/30"
              onClick={() => setShowClub(!showClub)}
            />
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
const PILARES = [
  { key: 'fuerza',       label: 'Fuerza',       color: '#f97316' },
  { key: 'explosividad', label: 'Explosividad',  color: '#eab308' },
  { key: 'movilidad',    label: 'Movilidad',     color: '#22c55e' },
  { key: 'tiro',         label: 'Técnica Tiro',  color: '#3b82f6' },
  { key: 'agilidad',     label: 'Agilidad',      color: '#a855f7' },
  { key: 'tactica',      label: 'Efic. Táctica', color: '#ec4899' },
  { key: 'resiliencia',  label: 'Resiliencia',   color: '#FFD700' },
];

function TabKPIs({ atleta, todosLosAtletas }) {
  const subPilarScores = useMemo(() => getSubPilarScores(atleta._evaluaciones || []), [atleta._evaluaciones]);
  const [showCategoria, setShowCategoria] = useState(true);
  const [showClub, setShowClub] = useState(true);

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
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Comparativa de Pilares</h3>
          <div className="flex gap-2">
            <ToggleChip
              active={showCategoria}
              label="Categoría"
              activeClasses="bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30"
              onClick={() => setShowCategoria(!showCategoria)}
            />
            <ToggleChip
              active={showClub}
              label="Club"
              activeClasses="bg-white/20 text-white border border-white/30"
              onClick={() => setShowClub(!showClub)}
            />
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
            const level = getBaremoUI(val);
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
