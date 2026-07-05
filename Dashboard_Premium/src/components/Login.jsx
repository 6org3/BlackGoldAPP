import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { Sparkles, Mail, Lock, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [identificador, setIdentificador] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  // Si ya hay sesión activa (p. ej. la PWA abrió /login con la sesión de
  // supabase-js aún vigente), entrar directo al panel según el rol en vez
  // de volver a pedir credenciales.
  useEffect(() => {
    if (user) {
      navigate(user.rol === 'padre' ? '/padre' : '/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(identificador, password);
    setLoading(false);

    if (result.success) {
      if (result.user && result.user.rol === 'padre') {
        navigate('/padre');
      } else {
        navigate('/dashboard');
      }
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-dvh px-4 bg-[#09090b] text-white relative overflow-hidden">
      {/* Luces Ambientales */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#FFD700]/5 blur-[120px] rounded-full pointer-events-none mix-blend-screen"></div>
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="glass-card w-full max-w-md p-6 sm:p-10 rounded-3xl relative z-10 glow-border"
      >
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <Sparkles className="text-[#FFD700] w-12 h-12" />
          </div>
          <h1 className="text-4xl font-black tracking-tighter uppercase mb-2">
            Black Gold <span className="text-[#FFD700]">SaaS</span>
          </h1>
          <p className="text-xs text-gray-400 font-bold tracking-[0.2em] uppercase">Plataforma Educativa Deportiva</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="login-id" className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
              Ingresa tu correo, teléfono o cédula
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
              <input
                id="login-id"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                className="w-full bg-[#121214]/80 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-[#FFD700]/50 focus:shadow-[0_0_15px_rgba(255,215,0,0.2)] transition-all"
                placeholder="ejemplo@correo.com, 0999..., 172..."
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-pass" className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
              <input
                id="login-pass"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#121214]/80 border border-white/10 rounded-xl py-4 pl-12 pr-12 text-white focus:outline-none focus:border-[#FFD700]/50 focus:shadow-[0_0_15px_rgba(255,215,0,0.2)] transition-all"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 -mr-3 text-gray-500 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-500 text-xs font-bold bg-red-500/10 p-3 rounded-lg border border-red-500/20 text-center"
            >
              {error}
            </motion.p>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#FFD700] to-[#D4AF37] hover:from-[#ffeb66] hover:to-[#e8c14a] text-black font-black uppercase tracking-widest py-4 rounded-xl shadow-[0_0_20px_rgba(255,215,0,0.3)] transition-all disabled:opacity-50"
          >
            {loading ? 'Validando ADN...' : 'Desbloquear Poneglyph'}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-white/10 pt-6">
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-4">
            Acceso Autorizado Únicamente para Miembros
          </p>
          <p className="text-xs text-gray-400">
            ¿No eres miembro aún?{' '}
            <button
              onClick={() => navigate('/registro')}
              className="text-[#FFD700] hover:text-white transition-colors font-bold uppercase tracking-wider"
            >
              Regístrate Aquí
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
