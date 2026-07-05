import { motion } from 'framer-motion';
import { LogOut, Menu, Shield, User } from 'lucide-react';

export default function AppHeader({ user, setIsMobileMenuOpen, setShowEditProfile, handleLogout }) {
  return (
    <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-12 relative z-10 gap-3 md:gap-6">
      <div className="flex items-center">
        <button
          aria-label="Abrir menú"
          className="md:hidden mr-4 text-brand p-2.5 bg-white/5 rounded-control hover:bg-white/10 transition-colors"
          onClick={() => setIsMobileMenuOpen(true)}
        >
          <Menu size={24} />
        </button>
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, ease: "easeOut" }}>
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-1.5 h-6 bg-brand rounded-full shadow-[0_0_10px_rgba(255,215,0,0.5)]"></div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-200 to-gray-500">
              {user.rol === 'atleta' ? 'Mi Central' : 'Tripulación'}
            </h1>
          </div>
          <p className="text-fg-secondary text-xs md:text-sm font-bold tracking-widest uppercase flex items-center">
            <Shield size={14} className="mr-2 text-brand" />
            {user.rol === 'atleta' ? 'Panel de Rendimiento' : 'Centro de Mando Élite'}
          </p>
        </motion.div>
      </div>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }} className="flex items-center gap-4">
        <div className="flex flex-col items-end mr-2">
          <span className="text-2xs font-bold text-fg-muted uppercase tracking-widest mb-1">{user.rol}</span>
          <span className="font-black text-sm uppercase tracking-wide flex items-center">
            {user.nombre}
            <div className="w-2 h-2 rounded-full bg-success ml-3 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowEditProfile(true)}
            className="group flex items-center space-x-2 px-4 py-2.5 rounded-control bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition duration-300"
            title="Editar Perfil"
          >
            <User size={16} className="text-fg-secondary group-hover:text-white transition-colors" />
            <span className="hidden sm:inline text-xs font-bold text-fg-secondary group-hover:text-white uppercase tracking-widest">Editar Perfil</span>
          </button>
          <button
            onClick={handleLogout}
            className="group p-3 rounded-control bg-white/5 hover:bg-danger/10 border border-white/10 hover:border-danger/30 transition duration-300"
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
