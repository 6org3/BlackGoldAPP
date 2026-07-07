import { useState, useEffect } from 'react';
import { Activity, Users, Cross, Sparkles, Plus, FlaskConical, ClipboardList, DollarSign, MessageSquare, Zap, BarChart3, CalendarDays } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import ModoCanchaModal from './ModoCanchaModal';
import { supabase } from '../api/supabaseClient';

export default function Sidebar({ isMobileMenuOpen, setIsMobileMenuOpen }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [showModoCancha, setShowModoCancha] = useState(false);
  const [activeSessionCount, setActiveSessionCount] = useState(0);

  // Deps primitivas: un setUser con objeto nuevo pero mismo usuario no debe
  // destruir/recrear la suscripción realtime ni repetir el fetch.
  const userId = user?.id;
  const userRol = user?.rol;

  useEffect(() => {
    if (userId && (userRol === 'coach' || userRol === 'owner' || userRol === 'superadmin')) {
      const fetchActiveSession = async () => {
        const { data } = await supabase
          .from('sesiones_programadas')
          .select('id')
          .eq('coach_id', userId)
          .eq('estado', 'Programada')
          .ilike('notas', '[EN_CURSO]%');
        if (data) setActiveSessionCount(data.length);
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

  return (
    <>
      {/* Overlay Móvil */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`w-72 max-w-[85vw] border-r border-white/5 bg-surface-base/95 backdrop-blur-xl flex-col fixed md:relative z-50 h-dvh md:h-full transition-[transform,visibility] duration-300 ${isMobileMenuOpen ? 'translate-x-0 visible' : '-translate-x-full invisible md:visible md:translate-x-0'} flex`}>
      <div className="p-8 border-b border-white/5 relative">
        <div className="flex items-center space-x-3 mb-2">
          <Sparkles className="text-brand" size={24} />
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(255,215,0,0.3)]">Black Gold</h1>
        </div>
        <p className="text-2xs text-brand font-bold tracking-[0.3em] uppercase ml-9">Intelligence</p>
        
        {/* Close Button Mobile */}
        <button
          onClick={() => setIsMobileMenuOpen(false)}
          aria-label="Cerrar menú"
          className="absolute top-6 right-2 md:hidden text-fg-muted hover:text-white p-3"
        >
          <Cross size={20} className="rotate-45" />
        </button>
      </div>

      <nav className="flex-1 p-6 space-y-2 overflow-y-auto">
        {(user.rol === 'coach' || user.rol === 'owner' || user.rol === 'superadmin') && (
          <button
            onClick={() => setShowModoCancha(true)}
            className={`w-full flex items-center justify-between px-5 py-4 rounded-control text-xs font-bold uppercase tracking-[0.15em] transition duration-300 mb-2
              ${activeSessionCount > 0 
                ? 'bg-success/10 border-success/50 text-success-soft shadow-[0_0_20px_rgba(16,185,129,0.2)] animate-pulse' 
                : showModoCancha
                  ? 'bg-gradient-to-r from-brand/15 to-brand-strong/5 text-brand border border-brand/30 shadow-[0_0_20px_rgba(255,215,0,0.15)]'
                  : 'bg-brand/5 border border-brand/10 text-brand/80 hover:bg-brand/10 hover:border-brand/30 hover:shadow-[0_0_15px_rgba(255,215,0,0.1)]'
              }
            `}
          >
            <div className="flex items-center space-x-4">
              <span className={`drop-shadow-[0_0_8px_rgba(255,215,0,0.6)] ${activeSessionCount > 0 ? 'text-success-soft' : ''}`}>
                <Zap size={18} />
              </span>
              <span>{activeSessionCount > 0 ? 'Clase en Curso' : 'Modo Cancha'}</span>
            </div>
            {activeSessionCount > 0 && (
              <span className="bg-success text-black px-2 py-0.5 rounded-full text-2xs font-black">{activeSessionCount}</span>
            )}
          </button>
        )}
        <NavItem
          icon={<Users size={18} />}
          label="Tripulación"
          active={location.pathname === '/dashboard'}
          onClick={() => navigate('/dashboard')}
        />
        {(user.rol === 'coach' || user.rol === 'owner' || user.rol === 'superadmin') && (
          <NavItem
            icon={<Plus size={18} />}
            label="Gestionar Atletas"
            active={location.pathname === '/admin/atletas'}
            onClick={() => navigate('/admin/atletas')}
          />
        )}
        {(user.rol === 'coach' || user.rol === 'owner' || user.rol === 'superadmin') && (
          <NavItem
            icon={<Activity size={18} />}
            label="Gestionar Misiones"
            active={location.pathname === '/admin/misiones'}
            onClick={() => navigate('/admin/misiones')}
          />
        )}
        {/* El coach entra en modo cobro (registrar efectivo y recordar); la ruta
            ya lo admitía — ocultarle el enlace era una barrera cosmética. */}
        {(user.rol === 'coach' || user.rol === 'owner' || user.rol === 'superadmin') && (
          <NavItem
            icon={<DollarSign size={18} />}
            label="Control de Pagos"
            active={location.pathname === '/admin/pagos'}
            onClick={() => navigate('/admin/pagos')}
          />
        )}
        {(user.rol === 'coach' || user.rol === 'owner' || user.rol === 'superadmin') && (
          <NavItem
            icon={<MessageSquare size={18} />}
            label="Comunicaciones"
            active={location.pathname === '/admin/comunicaciones'}
            onClick={() => navigate('/admin/comunicaciones')}
          />
        )}
        {(user.rol === 'coach' || user.rol === 'owner' || user.rol === 'superadmin') && (
          <NavItem
            icon={<CalendarDays size={18} />}
            label="Eventos"
            active={location.pathname === '/admin/eventos'}
            onClick={() => navigate('/admin/eventos')}
          />
        )}
        {(user.rol === 'coach' || user.rol === 'owner' || user.rol === 'superadmin') && (
          <NavItem
            icon={<ClipboardList size={18} />}
            label="Asistencia"
            active={location.pathname === '/admin/asistencia'}
            onClick={() => navigate('/admin/asistencia')}
          />
        )}
        {(user.rol === 'coach' || user.rol === 'owner' || user.rol === 'superadmin') && (
          <NavItem
            icon={<FlaskConical size={18} />}
            label="Sesiones"
            active={location.pathname === '/admin/sesiones'}
            onClick={() => navigate('/admin/sesiones')}
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

      </nav>

      <div className="p-8 border-t border-white/5 bg-gradient-to-t from-black/50 to-transparent">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand to-brand-strong flex items-center justify-center text-black font-black shadow-glow-gold">
            {user.nombre?.charAt(0) || 'U'}
          </div>
          <div>
            <p className="text-sm font-bold text-white tracking-wide">{user.nombre}</p>
            <p className="text-2xs text-fg-secondary uppercase tracking-eyebrow mt-1">Rol: {user.rol}</p>
          </div>
        </div>
      </div>
    </aside>

    {/* Botón flotante Global Modo Cancha (para móviles) */}
    {(user.rol === 'coach' || user.rol === 'owner' || user.rol === 'superadmin') && (
      <>
        <button
          onClick={() => setShowModoCancha(true)}
          aria-label="Abrir Modo Cancha"
          className={`fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-6 z-40 bg-brand text-black p-4 rounded-full shadow-glow-gold hover:scale-110 hover:shadow-[0_0_30px_rgba(255,215,0,0.6)] transition flex items-center justify-center md:hidden ${isMobileMenuOpen ? 'hidden' : ''}`}
        >
          <Zap size={24} fill="currentColor" />
        </button>
        <ModoCanchaModal isOpen={showModoCancha} onClose={() => setShowModoCancha(false)} />
      </>
    )}
    </>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center space-x-4 px-5 py-4 rounded-control text-xs font-bold uppercase tracking-[0.15em] transition duration-300
        ${active ? 'bg-gradient-to-r from-brand/10 to-transparent text-brand border-l-2 border-brand' : 'text-fg-muted hover:bg-white/5 hover:text-white border-l-2 border-transparent'}
      `}
    >
      <span className={`${active ? 'drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]' : ''}`}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
