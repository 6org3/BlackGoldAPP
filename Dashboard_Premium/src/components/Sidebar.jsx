import React, { useState, useEffect } from 'react';
import { Activity, Users, ShieldAlert, Cross, Sparkles, Plus, Filter, FlaskConical, ClipboardList, DollarSign, MessageSquare, Zap, BarChart3, CalendarDays } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import ModoCanchaModal from './ModoCanchaModal';
import { supabase } from '../api/supabaseClient';

export default function Sidebar({ filtros, onFiltroChange, isMobileMenuOpen, setIsMobileMenuOpen }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showFiltros, setShowFiltros] = useState(true);

  const posiciones = ['Todas', 'Generador', 'Alero Físico', 'Ancla Fuerte', 'Escolta', 'Ala-Pívot'];
  const nivelesDesarrollo = [
    'Todos',
    'Micro Nv.1', 'Micro Nv.2', 'Micro Nv.3',
    'Desarrollo Nv.1', 'Desarrollo Nv.2', 'Desarrollo Nv.3',
    'Elite Nv.1', 'Elite Nv.2', 'Elite Nv.3',
  ];

  const [showModoCancha, setShowModoCancha] = useState(false);
  const [activeSessionCount, setActiveSessionCount] = useState(0);

  useEffect(() => {
    if (user && (user.rol === 'coach' || user.rol === 'owner' || user.rol === 'superadmin')) {
      const fetchActiveSession = async () => {
        const { data } = await supabase
          .from('sesiones_programadas')
          .select('id')
          .eq('coach_id', user.id)
          .eq('estado', 'Programada')
          .ilike('notas', '[EN_CURSO]%');
        if (data) setActiveSessionCount(data.length);
      };
      fetchActiveSession();
      
      const channel = supabase.channel('sesiones_sidebar')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sesiones_programadas', filter: `coach_id=eq.${user.id}` }, fetchActiveSession)
        .subscribe();
        
      return () => { supabase.removeChannel(channel); };
    }
  }, [user]);

  return (
    <>
      {/* Overlay Móvil */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`w-72 border-r border-white/5 bg-[#09090b]/95 backdrop-blur-xl flex-col fixed md:relative z-50 h-full transition-transform duration-300 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} flex`}>
      <div className="p-8 border-b border-white/5 relative">
        <div className="flex items-center space-x-3 mb-2">
          <Sparkles className="text-[#FFD700]" size={24} />
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(255,215,0,0.3)]">Black Gold</h1>
        </div>
        <p className="text-[10px] text-[#FFD700] font-bold tracking-[0.3em] uppercase ml-9">Intelligence</p>
        
        {/* Close Button Mobile */}
        <button 
          onClick={() => setIsMobileMenuOpen(false)}
          className="absolute top-8 right-4 md:hidden text-gray-500 hover:text-white"
        >
          <Cross size={20} className="rotate-45" />
        </button>
      </div>

      <nav className="flex-1 p-6 space-y-2 overflow-y-auto">
        {(user.rol === 'coach' || user.rol === 'owner' || user.rol === 'superadmin') && (
          <button
            onClick={() => setShowModoCancha(true)}
            className={`w-full flex items-center justify-between px-5 py-4 rounded-xl text-xs font-bold uppercase tracking-[0.15em] transition-all duration-300 mb-2
              ${activeSessionCount > 0 
                ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)] animate-pulse' 
                : showModoCancha
                  ? 'bg-gradient-to-r from-[#FFD700]/15 to-[#D4AF37]/5 text-[#FFD700] border border-[#FFD700]/30 shadow-[0_0_20px_rgba(255,215,0,0.15)]'
                  : 'bg-[#FFD700]/5 border border-[#FFD700]/10 text-[#FFD700]/80 hover:bg-[#FFD700]/10 hover:border-[#FFD700]/30 hover:shadow-[0_0_15px_rgba(255,215,0,0.1)]'
              }
            `}
          >
            <div className="flex items-center space-x-4">
              <span className={`drop-shadow-[0_0_8px_rgba(255,215,0,0.6)] ${activeSessionCount > 0 ? 'text-emerald-400' : ''}`}>
                <Zap size={18} />
              </span>
              <span>{activeSessionCount > 0 ? 'Clase en Curso' : 'Modo Cancha'}</span>
            </div>
            {activeSessionCount > 0 && (
              <span className="bg-emerald-500 text-black px-2 py-0.5 rounded-full text-[10px] font-black">{activeSessionCount}</span>
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
        {(user.rol === 'owner' || user.rol === 'superadmin') && (
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
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#FFD700] to-[#D4AF37] flex items-center justify-center text-black font-black shadow-[0_0_20px_rgba(255,215,0,0.4)]">
            {user.nombre?.charAt(0) || 'U'}
          </div>
          <div>
            <p className="text-sm font-bold text-white tracking-wide">{user.nombre}</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-[0.2em] mt-1">Rol: {user.rol}</p>
          </div>
        </div>
      </div>
    </aside>

    {/* Botón flotante Global Modo Cancha (para móviles) */}
    {(user.rol === 'coach' || user.rol === 'owner' || user.rol === 'superadmin') && (
      <>
        <button
          onClick={() => setShowModoCancha(true)}
          className="fixed bottom-6 right-6 z-40 bg-[#FFD700] text-black p-4 rounded-full shadow-[0_0_20px_rgba(255,215,0,0.4)] hover:scale-110 hover:shadow-[0_0_30px_rgba(255,215,0,0.6)] transition-all flex items-center justify-center md:hidden"
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
      className={`w-full flex items-center space-x-4 px-5 py-4 rounded-xl text-xs font-bold uppercase tracking-[0.15em] transition-all duration-300
        ${active ? 'bg-gradient-to-r from-[#FFD700]/10 to-transparent text-[#FFD700] border-l-2 border-[#FFD700]' : 'text-gray-500 hover:bg-white/5 hover:text-white border-l-2 border-transparent'}
      `}
    >
      <span className={`${active ? 'drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]' : ''}`}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
