import { useState, useEffect } from 'react';
import { Activity, Users, Cross, Sparkles, Plus, FlaskConical, ClipboardList, DollarSign, MessageSquare, Zap, BarChart3, CalendarDays, TrendingUp, UserCog, Boxes, LogOut } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import ModoCanchaArcade from './arcade/ModoCanchaArcade';
import HexAvatar from './arcade/HexAvatar';
import MicroLabel from './arcade/MicroLabel';
import { C, BORDER, GRAD, GLOW, TINT, cut, HEX } from './arcade/arcadeTokens';
import { supabase } from '../api/supabaseClient';
import { fetchSesionesEnCurso } from '../api/sesionesService';
import { HOMES_POR_ROL, rutaHomeParaRol } from '../lib/featureFlags';

export default function Sidebar({ isMobileMenuOpen, setIsMobileMenuOpen, ocultarFabModoCancha = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Con el flag del rediseño activo, el ítem de entrada lleva al home nativo
  // del rol (/sistema, /club, /coach); apagado, conserva /dashboard.
  const homeNativoActivo = !!HOMES_POR_ROL[user?.rol];
  const rutaInicio = rutaHomeParaRol(user?.rol);

  const [showModoCancha, setShowModoCancha] = useState(false);
  const [activeSessionCount, setActiveSessionCount] = useState(0);

  // Deps primitivas: un setUser con objeto nuevo pero mismo usuario no debe
  // destruir/recrear la suscripción realtime ni repetir el fetch.
  const userId = user?.id;
  const userRol = user?.rol;

  useEffect(() => {
    if (userId && (userRol === 'coach' || userRol === 'owner' || userRol === 'superadmin')) {
      const fetchActiveSession = async () => {
        const data = await fetchSesionesEnCurso(userId);
        setActiveSessionCount(data.length);
      };
      fetchActiveSession();

      const channel = supabase.channel('sesiones_sidebar')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sesiones_programadas', filter: `coach_id=eq.${userId}` }, fetchActiveSession)
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [userId, userRol]);

  // Bloquea el scroll del contenido de fondo mientras el drawer está abierto.
  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, [isMobileMenuOpen]);

  const handleLogout = () => { logout(); navigate('/login'); };

  const esStaff = user.rol === 'coach' || user.rol === 'owner' || user.rol === 'superadmin';

  // Modo Cancha: tres estados (clase en curso = verde vivo, panel abierto = oro
  // fuerte, reposo = oro tenue). Colores/glow desde arcadeTokens, forma cut().
  const mcTono = activeSessionCount > 0
    ? { color: C.ok, background: TINT.ok, border: `1px solid ${BORDER.ok}`, boxShadow: GLOW.timer }
    : showModoCancha
      ? { color: C.gold, background: TINT.gold, border: `1px solid ${BORDER.goldStrong}`, boxShadow: GLOW.hexGoldMid }
      : { color: C.gold, background: TINT.gold, border: `1px solid ${BORDER.gold}`, boxShadow: 'none' };

  return (
    <>
      {/* Overlay Móvil */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`w-72 max-w-[85vw] backdrop-blur-xl flex-col fixed md:relative z-50 h-dvh md:h-full transition-[transform,visibility] duration-300 ${isMobileMenuOpen ? 'translate-x-0 visible' : '-translate-x-full invisible md:visible md:translate-x-0'} flex`}
        style={{ background: C.card, borderRight: `1px solid ${BORDER.neutral}` }}
      >
      <div className="p-6 relative" style={{ borderBottom: `1px solid ${BORDER.neutral}` }}>
        <div className="flex items-center gap-3">
          <HexAvatar size={40} background={GRAD.goldHex} color={C.ink} glow>
            <Sparkles size={20} strokeWidth={2.5} />
          </HexAvatar>
          <div>
            <h1 className="text-2xl font-black tracking-tight uppercase leading-none" style={{ color: C.text }}>Black Gold</h1>
            <MicroLabel style={{ marginTop: 4, color: C.gold }}>Intelligence</MicroLabel>
          </div>
        </div>

        {/* Cerrar drawer (móvil) */}
        <button
          onClick={() => setIsMobileMenuOpen(false)}
          aria-label="Cerrar menú"
          className="cut-focus absolute top-4 right-2 md:hidden grid place-items-center min-h-11 min-w-11 transition-colors"
          style={{ color: C.text3 }}
        >
          <Cross size={20} className="rotate-45" />
        </button>
      </div>

      <nav className="flex-1 p-5 space-y-1.5 overflow-y-auto">
        {esStaff && (
          <button
            onClick={() => {
              // Cerrar el drawer móvil al abrir Modo Cancha: si queda abierto
              // detrás del overlay, al salir del modo el usuario aterriza en
              // un drawer que ya no esperaba (y su scroll-lock sigue vivo).
              setIsMobileMenuOpen(false);
              setShowModoCancha(true);
            }}
            className={`cut-focus w-full flex items-center justify-between px-5 min-h-11 py-3.5 text-xs font-bold uppercase tracking-[0.15em] transition mb-2 ${activeSessionCount > 0 ? 'animate-pulse' : ''}`}
            style={{ ...mcTono, clipPath: cut(8) }}
          >
            <span className="flex items-center gap-3">
              <span style={{ filter: activeSessionCount > 0 ? undefined : GLOW.hexGold }}>
                <Zap size={18} />
              </span>
              <span>{activeSessionCount > 0 ? 'Clase en Curso' : 'Modo Cancha'}</span>
            </span>
            {activeSessionCount > 0 && (
              <span className="grid place-items-center text-2xs font-black" style={{ width: 20, height: 20, clipPath: HEX, background: C.ok, color: C.inkGreen }}>{activeSessionCount}</span>
            )}
          </button>
        )}
        <NavItem
          icon={<Users size={18} />}
          label={homeNativoActivo ? 'Inicio' : 'Tripulación'}
          active={location.pathname === rutaInicio || location.pathname === '/dashboard'}
          onClick={() => navigate(rutaInicio)}
        />
        {esStaff && (
          <NavItem
            icon={<Plus size={18} />}
            label="Gestionar Atletas"
            active={location.pathname === '/admin/atletas'}
            onClick={() => navigate('/admin/atletas')}
          />
        )}
        {esStaff && (
          <NavItem
            icon={<Activity size={18} />}
            label="Gestionar Misiones"
            active={location.pathname === '/admin/misiones'}
            onClick={() => navigate('/admin/misiones')}
          />
        )}
        {/* El coach entra en modo cobro (registrar efectivo y recordar); la ruta
            ya lo admitía — ocultarle el enlace era una barrera cosmética. */}
        {esStaff && (
          <NavItem
            icon={<DollarSign size={18} />}
            label="Control de Pagos"
            active={location.pathname === '/admin/pagos'}
            onClick={() => navigate('/admin/pagos')}
          />
        )}
        {esStaff && (
          <NavItem
            icon={<MessageSquare size={18} />}
            label="Comunicaciones"
            active={location.pathname === '/admin/comunicaciones'}
            onClick={() => navigate('/admin/comunicaciones')}
          />
        )}
        {esStaff && (
          <NavItem
            icon={<CalendarDays size={18} />}
            label="Eventos"
            active={location.pathname === '/admin/eventos'}
            onClick={() => navigate('/admin/eventos')}
          />
        )}
        {esStaff && (
          <NavItem
            icon={<ClipboardList size={18} />}
            label="Asistencia"
            active={location.pathname === '/admin/asistencia'}
            onClick={() => navigate('/admin/asistencia')}
          />
        )}
        {esStaff && (
          <NavItem
            icon={<FlaskConical size={18} />}
            label="Sesiones"
            active={location.pathname === '/admin/sesiones'}
            onClick={() => navigate('/admin/sesiones')}
          />
        )}
        {esStaff && (
          <NavItem
            icon={<Boxes size={18} />}
            label="Grupos"
            active={location.pathname === '/admin/grupos'}
            onClick={() => navigate('/admin/grupos')}
          />
        )}
        {esStaff && (
          <NavItem
            icon={<TrendingUp size={18} />}
            label="Comparar"
            active={location.pathname === '/admin/comparar'}
            onClick={() => navigate('/admin/comparar')}
          />
        )}
        {(user.rol === 'owner' || user.rol === 'superadmin') && (
          <NavItem
            icon={<BarChart3 size={18} />}
            label="KPIs del Club"
            active={location.pathname === '/admin/kpis'}
            onClick={() => navigate('/admin/kpis')}
          />
        )}
        {(user.rol === 'owner' || user.rol === 'superadmin') && (
          <NavItem
            icon={<UserCog size={18} />}
            label="Equipo Técnico"
            active={location.pathname === '/admin/equipo'}
            onClick={() => navigate('/admin/equipo')}
          />
        )}

      </nav>

      <div className="p-6" style={{ borderTop: `1px solid ${BORDER.neutral}` }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <HexAvatar size={40} background={GRAD.goldHex} color={C.ink}>
              {user.nombre?.charAt(0) || 'U'}
            </HexAvatar>
            <div className="min-w-0">
              <p className="text-sm font-bold tracking-wide truncate" style={{ color: C.text }}>{user.nombre}</p>
              <MicroLabel style={{ marginTop: 2 }}>Rol: {user.rol}</MicroLabel>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="cut-focus group grid place-items-center min-h-11 min-w-11 bg-white/5 hover:bg-danger/10 border border-white/10 hover:border-danger/30 transition duration-300 shrink-0"
            style={{ clipPath: cut(7) }}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            data-testid="btn-logout-sidebar"
          >
            <LogOut size={16} className="text-fg-secondary group-hover:text-danger-soft transition-colors" />
          </button>
        </div>
      </div>
    </aside>

    {/* Botón flotante Global Modo Cancha (para móviles) — oculto cuando la
        superficie ya monta su propia BottomNav + FAB Copiloto (PR7), para no
        apilar tres controles flotantes sobre el mismo rincón inferior. */}
    {!ocultarFabModoCancha && esStaff && (
      <button
        onClick={() => setShowModoCancha(true)}
        aria-label="Abrir Modo Cancha"
        className={`cut-focus fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-6 z-40 grid place-items-center w-14 h-14 rounded-full hover:scale-110 transition-transform md:hidden ${isMobileMenuOpen ? 'hidden' : ''}`}
        style={{ background: C.gold, color: C.ink, boxShadow: GLOW.hexGoldStrong }}
      >
        <Zap size={24} fill="currentColor" />
      </button>
    )}
    {/* El takeover se monta siempre para staff (NO gateado por
        ocultarFabModoCancha): el botón "Modo Cancha" del drawer —siempre
        visible— debe abrirlo en toda superficie, incluidas /admin/* y los
        homes por rol donde el FAB sí se oculta. */}
    {esStaff && (
      <ModoCanchaArcade isOpen={showModoCancha} onClose={() => setShowModoCancha(false)} />
    )}
    </>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`cut-focus w-full flex items-center gap-4 px-5 min-h-11 py-3 text-xs font-bold uppercase tracking-[0.15em] border-l-2 transition-colors ${active ? '' : 'text-fg-muted hover:bg-white/5 hover:text-white border-transparent'}`}
      style={active ? { color: C.gold, background: TINT.gold, borderLeftColor: C.gold } : undefined}
    >
      <span style={active ? { filter: GLOW.hexGold } : undefined}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
