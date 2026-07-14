import { motion } from 'framer-motion';
import { LogOut, Menu, Shield, User } from 'lucide-react';
import MicroLabel from './arcade/MicroLabel';
import LiveDot from './arcade/LiveDot';
import { C, cut } from './arcade/arcadeTokens';

export default function AppHeader({ user, setIsMobileMenuOpen, setShowEditProfile, handleLogout }) {
  return (
    <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-12 relative z-10 gap-3 md:gap-6">
      <div className="flex items-center">
        <button
          aria-label="Abrir menú"
          className="cut-focus md:hidden mr-4 grid place-items-center min-h-11 min-w-11 bg-white/5 hover:bg-white/10 transition-colors"
          style={{ clipPath: cut(7), color: C.gold }}
          onClick={() => setIsMobileMenuOpen(true)}
        >
          <Menu size={24} />
        </button>
        {/* Entrada solo con opacity: el MotionConfig global reducedMotion="user"
            (main.jsx) congela los transforms en su valor `initial`, así que un
            x/y de entrada dejaría el header desplazado para reduced-motion. */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
          <div className="flex items-center gap-3 mb-1">
            <span aria-hidden="true" style={{ width: 4, height: 26, background: C.gold, clipPath: cut(2) }} />
            <h1 className="text-3xl md:text-5xl font-black tracking-tight uppercase" style={{ color: C.text }}>
              {user.rol === 'atleta' ? 'Mi Central' : 'Tripulación'}
            </h1>
          </div>
          <MicroLabel className="flex items-center gap-2" style={{ marginLeft: 16 }}>
            <Shield size={13} style={{ color: C.gold }} />
            {user.rol === 'atleta' ? 'Panel de Rendimiento' : 'Centro de Mando'}
          </MicroLabel>
        </motion.div>
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15, duration: 0.4 }} className="flex items-center gap-4">
        <div className="flex flex-col items-end mr-1">
          <MicroLabel style={{ marginBottom: 4 }}>{user.rol}</MicroLabel>
          <span className="font-black text-sm uppercase tracking-wide flex items-center gap-3" style={{ color: C.text }}>
            {user.nombre}
            <LiveDot size={8} />
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEditProfile(true)}
            className="cut-focus group flex items-center gap-2 min-h-11 px-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition duration-300"
            style={{ clipPath: cut(7) }}
            title="Editar Perfil"
          >
            <User size={16} className="text-fg-secondary group-hover:text-white transition-colors" />
            <span className="hidden sm:inline text-xs font-bold text-fg-secondary group-hover:text-white uppercase tracking-widest">Editar Perfil</span>
          </button>
          <button
            onClick={handleLogout}
            className="cut-focus group grid place-items-center min-h-11 min-w-11 bg-white/5 hover:bg-danger/10 border border-white/10 hover:border-danger/30 transition duration-300"
            style={{ clipPath: cut(7) }}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            data-testid="btn-logout"
          >
            <LogOut size={16} className="text-fg-secondary group-hover:text-danger-soft transition-colors" />
          </button>
        </div>
      </motion.div>
    </header>
  );
}
