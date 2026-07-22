import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  Home, Target, Calendar, BarChart2, TrendingUp,
  LogOut, User, Shield, Eye, EyeOff
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import BottomNav from './BottomNav';
import { CopilotoProvider } from './CopilotoLauncher';
import RangoProgreso from './RangoProgreso';
import MisionesPanel from './MisionesPanel';
import RadarChartComp from './RadarChartComp';
import EventosAtleta from './EventosAtleta';
import HistorialPruebas from './HistorialPruebas';
import EditarPerfilModal from './EditarPerfilModal';
import CardDiagnosticoIA from './CardDiagnosticoIA';
import Gauge from './Gauge';
import { evaluarDeficits } from '../lib/didacticEngine';
import { getSubPilarScores, RADAR_AXES } from '../lib/radarCalc';
import { getBaremoUI, COLORS, CHART } from '../lib/designTokens';
import { getXPProgress } from '../lib/xpProgress';
import { tieneDatosAntropometricos } from '../api/utilsAtletas';
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
  // null = cerrado; si no, el getBoundingClientRect() del disparador. El menú se
  // porta a document.body (ver render más abajo) porque el backdrop-blur del
  // header sticky ancestro crea un containing block para `fixed` y lo re-ancla
  // a la caja del header en vez del viewport; al portalizar se pierde el anclaje
  // CSS relativo al botón, así que se mide a mano y se vuelve a medir en
  // scroll/resize (sin cerrar), igual que ArcadePerfilMenu.
  const [mobileMenuRect, setMobileMenuRect] = useState(null);
  const mobileMenuTriggerRef = useRef(null);
  const showMobileMenu = mobileMenuRect !== null;

  const closeMobileMenu = useCallback(() => setMobileMenuRect(null), []);
  const repositionMobileMenu = useCallback(() => {
    const el = mobileMenuTriggerRef.current;
    if (el) setMobileMenuRect(el.getBoundingClientRect());
  }, []);

  useEffect(() => {
    if (!showMobileMenu) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMobileMenu();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', repositionMobileMenu);
    window.addEventListener('scroll', repositionMobileMenu, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', repositionMobileMenu);
      window.removeEventListener('scroll', repositionMobileMenu, true);
    };
  }, [showMobileMenu, closeMobileMenu, repositionMobileMenu]);

  const handleLogout = () => { logout(); navigate('/login'); };

  const handleTabChange = (id) => {
    setVisitedTabs(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
    setActiveTab(id);
    closeMobileMenu();
  };

  if (!atleta) return null;

  return (
    <CopilotoProvider atletaIdPorDefecto={atleta.atleta_id}>
    <div className="flex h-dvh bg-surface-base text-white overflow-hidden">
      {/* ── SIDEBAR (solo md+) ─────────────────────────────────── */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-surface-sunken border-r border-white/5 overflow-y-auto">
        {/* Brand */}
        <div className="px-5 pt-6 pb-4 border-b border-white/5">
          <div className="flex items-center space-x-2 mb-1">
            <div className="w-1.5 h-5 bg-brand rounded-full shadow-glow-bar" />
            <span className="text-sm font-black tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-r from-white to-fg-muted">
              Black Gold
            </span>
          </div>
          <p className="text-3xs text-fg-muted font-bold uppercase tracking-widest flex items-center">
            <Shield size={9} className="mr-1 text-brand" />
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
              <p className="text-2xs text-fg-muted font-bold uppercase tracking-widest truncate">
                {atleta.posicion || '—'}
              </p>
            </div>
          </div>

          {/* Category & age badges */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {atleta.categoria && (
              <span className="text-3xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-brand/30 text-brand bg-brand/5">
                {atleta.categoria}
              </span>
            )}
            {atleta.edad && (
              <span className="text-3xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-white/20 text-fg-secondary bg-white/5">
                {atleta.edad} años
              </span>
            )}
            {atleta.nivel_desarrollo && (
              <span className="text-3xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-success/30 text-success-soft bg-success/5">
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
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-control text-left transition duration-200 ${
                  active
                    ? 'bg-brand/10 border border-brand/20 text-brand'
                    : 'text-fg-muted hover:text-fg-secondary hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon size={16} className={active ? 'text-brand' : 'text-fg-muted'} />
                <span className="text-[11px] font-black uppercase tracking-widest">{label}</span>
                {active && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_6px_rgba(255,215,0,0.6)]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="px-3 py-4 border-t border-white/5 space-y-1">
          <button
            onClick={() => setShowEditProfile(true)}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-control text-fg-muted hover:text-fg-secondary hover:bg-white/5 transition border border-transparent text-left"
          >
            <User size={16} className="text-fg-muted" />
            <span className="text-[11px] font-black uppercase tracking-widest">Editar Perfil</span>
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-control text-fg-muted hover:text-danger-soft hover:bg-danger/5 transition border border-transparent text-left"
            data-testid="btn-logout"
          >
            <LogOut size={16} className="text-fg-muted" />
            <span className="text-[11px] font-black uppercase tracking-widest">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ───────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 w-[600px] h-[400px] bg-brand/4 blur-[150px] pointer-events-none rounded-full mix-blend-screen" />

        {/* Tab header */}
        <div className="sticky top-0 z-10 bg-surface-base/80 backdrop-blur-xl border-b border-white/5 px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {(() => {
              const tab = TABS.find(t => t.id === activeTab);
              const Icon = tab?.icon;
              return (
                <>
                  <Icon size={18} className="text-brand" />
                  <h2 className="text-lg font-black uppercase tracking-tight text-white">{tab?.label}</h2>
                </>
              );
            })()}
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center space-x-2 text-3xs text-fg-muted font-bold uppercase tracking-widest">
              <div className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
              <span>{user.nombre}</span>
            </div>
            {/* Menú de perfil (solo móvil): Editar Perfil / Cerrar Sesión */}
            <div className="relative md:hidden">
              <button
                ref={mobileMenuTriggerRef}
                onClick={() => (showMobileMenu ? closeMobileMenu() : repositionMobileMenu())}
                aria-label="Menú de perfil"
                aria-haspopup="menu"
                aria-expanded={showMobileMenu}
                className="min-h-11 min-w-11 flex items-center justify-center rounded-control bg-white/5 border border-white/10 text-fg-secondary hover:text-white transition-colors"
              >
                <User size={18} />
              </button>
              {showMobileMenu &&
                createPortal(
                  <>
                    <div className="fixed inset-0 z-[90]" onClick={closeMobileMenu} />
                    <div
                      role="menu"
                      aria-label="Menú de perfil"
                      className="fixed z-[100] w-52 bg-surface-raised border border-white/10 rounded-control shadow-modal overflow-hidden"
                      style={{
                        top: mobileMenuRect.bottom + 8,
                        right: Math.max(8, window.innerWidth - mobileMenuRect.right),
                        maxHeight: `calc(100dvh - ${mobileMenuRect.bottom + 16}px)`,
                        overflowY: 'auto',
                      }}
                    >
                      <button
                        onClick={() => { closeMobileMenu(); setShowEditProfile(true); }}
                        className="w-full flex items-center gap-3 px-4 py-3 min-h-11 text-left text-fg-secondary hover:bg-white/5 transition-colors"
                      >
                        <User size={16} className="text-fg-muted" />
                        <span className="text-[11px] font-black uppercase tracking-widest">Editar Perfil</span>
                      </button>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 min-h-11 text-left text-fg-secondary hover:bg-danger/10 hover:text-danger-soft transition-colors border-t border-white/5"
                      >
                        <LogOut size={16} className="text-fg-muted" />
                        <span className="text-[11px] font-black uppercase tracking-widest">Cerrar Sesión</span>
                      </button>
                    </div>
                  </>,
                  document.body
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
      <BottomNav
        items={TABS.map(({ id, label, icon }) => ({ key: id, label, Icono: icon }))}
        activo={activeTab}
        onSelect={handleTabChange}
      />

      {/* Modals */}
      {showEditProfile && (
        <EditarPerfilModal
          onClose={() => setShowEditProfile(false)}
          onRefresh={() => window.location.reload()}
        />
      )}
    </div>
    </CopilotoProvider>
  );
}

/* ── Toggle Categoría/Club del radar ─────────────────────────── */
function ToggleChip({ active, label, activeClasses, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 min-h-11 md:min-h-9 rounded-lg text-2xs font-bold uppercase tracking-widest transition-colors ${
        active ? activeClasses : 'bg-white/5 text-fg-muted border border-white/10'
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
  const xpProgress = useMemo(() => getXPProgress(atleta.xp_total || 0), [atleta.xp_total]);
  const rango = xpProgress.currentRango;
  const conAntropometria = tieneDatosAntropometricos(atleta);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Hero: overall + nivel (receta del hero de CoachHomePage) */}
      <div className="rounded-card border border-brand/20 bg-gradient-to-br from-brand/15 via-brand-strong/5 to-surface-card shadow-card p-5 flex items-center gap-4">
        <Gauge pct={atleta.overall_score || 0} label="overall" color={COLORS.gold[500]} />
        <div className="flex-1 min-w-0">
          <span className={`inline-flex items-center gap-1 text-2xs font-black uppercase tracking-widest ${rango.color}`}>
            <span aria-hidden="true">{rango.emoji}</span> {rango.nombre}
          </span>
          <p className="font-black text-base mt-1.5">Nivel {rango.nombre}</p>
          <p className="text-xs text-fg-secondary mt-1">
            {xpProgress.nextLevelName === 'MAX'
              ? 'Nivel máximo alcanzado'
              : `${xpProgress.current.toLocaleString()} / ${xpProgress.required.toLocaleString()} XP para ${xpProgress.nextLevelName}`}
          </p>
          <div className="w-full h-2 bg-surface-sunken rounded-full overflow-hidden border border-brand/20 mt-2">
            <div className="h-full rounded-full progress-bar-glow" style={{ width: `${xpProgress.percentage}%` }} />
          </div>
        </div>
      </div>

      {/* Measurements */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {conAntropometria ? (
          <>
            <StatCard label="Estatura" value={atleta.talla_cm ? `${atleta.talla_cm} cm` : '—'} color="blue" />
            <StatCard label="Peso" value={atleta.peso_kg ? `${atleta.peso_kg} kg` : '—'} color="green" />
            <StatCard label="IMC" value={atleta.imc || '—'} color="purple" />
            <StatCard label="Brazada Rel." value={atleta.brazada_relativa || '—'} color="yellow" />
          </>
        ) : (
          <div className="col-span-2 sm:col-span-4 border border-white/10 rounded-control p-3 bg-white/5">
            <p className="text-xs font-bold text-fg-faint">Sin datos antropométricos</p>
          </div>
        )}
      </div>

      {/* Recovery alerts */}
      {atleta.estado_recuperacion && atleta.estado_recuperacion !== 'Óptimo' && (
        <div className={`p-4 rounded-panel border backdrop-blur-md ${
          atleta.estado_recuperacion === 'Agotamiento Activo'
            ? 'bg-warning/10 border-warning/40'
            : 'bg-mental/10 border-mental/40'
        }`}>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full animate-pulse ${
              atleta.estado_recuperacion === 'Agotamiento Activo' ? 'bg-warning' : 'bg-mental'
            }`} />
            <span className={`text-3xs font-black uppercase tracking-widest ${
              atleta.estado_recuperacion === 'Agotamiento Activo' ? 'text-warning-soft' : 'text-mental-soft'
            }`}>{atleta.estado_recuperacion}</span>
          </div>
          <p className="mt-1 text-xs text-fg-secondary leading-relaxed">
            {atleta.estado_recuperacion === 'Agotamiento Activo'
              ? '⚠️ Ritmo cardíaco elevado. Priorizar sueño 10-12h y actividades recreativas.'
              : '⚠️ Rendimiento disminuido sin dolor aparente. Reducir volumen de entrenamiento.'}
          </p>
        </div>
      )}

      {/* Radar */}
      <div className="bg-surface-sunken border border-white/5 rounded-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-fg-secondary">Radar de Pilares</h3>
          <div className="flex gap-2">
            <ToggleChip
              active={showCategoria}
              label="Categoría"
              activeClasses="bg-success/20 text-success border border-success/30"
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

      {/* Diagnóstico del cerebro (brain-gateway) — tono simple para el atleta */}
      <CardDiagnosticoIA atletaId={atleta.atleta_id} tono="simple" />

      {/* Inteligencia Black Gold */}
      {deficits.length > 0 && (
        <div className="bg-surface-sunken border border-white/5 rounded-panel p-5">
          <div className="flex items-center space-x-2 mb-4">
            <Brain className="text-brand w-5 h-5" />
            <h3 className="text-xs font-black uppercase tracking-widest text-brand">
              Inteligencia Black Gold
            </h3>
          </div>
          <div className="space-y-2">
            {deficits.slice(0, 3).map((deficit) => (
              <div
                key={deficit.condicion}
                className={`p-3 rounded-panel border ${
                  deficit.prioridad === 'critica'
                    ? 'bg-danger/10 border-danger/40'
                    : deficit.prioridad === 'alta'
                    ? 'bg-warning/10 border-warning/40'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    deficit.prioridad === 'critica' ? 'bg-danger'
                    : deficit.prioridad === 'alta' ? 'bg-warning'
                    : 'bg-white/50'
                  }`} />
                  <span className={`text-3xs font-black uppercase tracking-widest ${
                    deficit.prioridad === 'critica' ? 'text-danger-soft'
                    : deficit.prioridad === 'alta' ? 'text-warning-soft'
                    : 'text-white'
                  }`}>
                    {deficit.prioridad === 'critica' ? 'Prioridad Crítica'
                      : deficit.prioridad === 'alta' ? 'Prioridad Alta'
                      : 'Sugerencia'}
                  </span>
                </div>
                <p className="text-2xs text-fg-secondary leading-relaxed">{deficit.mensaje}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Badges */}
      {(atleta.perfil_mental || atleta.prevencion_impacto) && (
        <div className="flex flex-wrap gap-2">
          {atleta.perfil_mental && (
            <span className="text-3xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-success/30 text-success-soft bg-success/5">
              Perfil: {atleta.perfil_mental}
            </span>
          )}
          {atleta.prevencion_impacto && (
            <span className="text-3xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-caution/30 text-caution-soft bg-caution/5">
              ⚠ Sensibilidad al Impacto
            </span>
          )}
          {atleta.estado_recuperacion && (
            <span className={`text-3xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border ${
              atleta.estado_recuperacion === 'Óptimo'
                ? 'border-info/30 text-info-soft bg-info/5'
                : 'border-white/10 text-fg-muted bg-white/5'
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
// Ejes derivados de la fuente única (RADAR_AXES); el color es presentación
// local desde la paleta CHART.pilares, con fallback neutro por si aparece
// un eje sin color asignado.
const PILARES = RADAR_AXES.map(({ key, label }) => ({
  key,
  label,
  color: CHART.pilares[key] || CHART.categorical.fallback,
}));

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
      <div className="bg-surface-sunken border border-white/5 rounded-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-fg-secondary">Comparativa de Pilares</h3>
          <div className="flex gap-2">
            <ToggleChip
              active={showCategoria}
              label="Categoría"
              activeClasses="bg-success/20 text-success border border-success/30"
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
      <div className="bg-surface-sunken border border-white/5 rounded-panel p-5">
        <h3 className="text-xs font-black uppercase tracking-widest text-fg-secondary mb-5">Puntuación por Pilar</h3>
        <div className="space-y-4">
          {PILARES.map(({ key, label, color }) => {
            const val = subPilarScores[key] || 0;
            const level = getBaremoUI(val);
            return (
              <div key={key}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-2xs font-bold uppercase tracking-widest text-fg-secondary">{label}</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-3xs font-black uppercase tracking-widest ${level.color}`}>
                      {val > 0 ? level.nombre : 'Sin datos'}
                    </span>
                    <span className="text-2xs font-black text-white">{val > 0 ? val : '—'}</span>
                  </div>
                </div>
                <div className="w-full h-2 bg-surface-sunken rounded-full overflow-hidden border border-white/5">
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
    blue:   'text-info-soft bg-info/10 border-info/20',
    green:  'text-success-soft bg-success/10 border-success/20',
    purple: 'text-mental-soft bg-mental/10 border-mental/20',
    yellow: 'text-brand bg-brand/10 border-brand/20',
  };
  return (
    <div className={`border rounded-control p-3 ${colors[color] || colors.blue}`}>
      <p className="text-3xs font-bold uppercase tracking-widest opacity-70 mb-1">{label}</p>
      <p className={`font-black leading-none ${large ? 'text-2xl' : 'text-base'}`}>{value}</p>
    </div>
  );
}
