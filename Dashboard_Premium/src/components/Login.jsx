import { useState, useEffect } from 'react';
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
    <div className="flex items-center justify-center min-h-dvh px-4 bg-surface-base text-white relative overflow-hidden">
      {/* Luces Ambientales */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-brand/5 blur-[120px] rounded-full pointer-events-none mix-blend-screen"></div>
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="glass-card w-full max-w-md p-6 sm:p-10 rounded-card relative z-10 glow-border"
      >
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <Sparkles className="text-brand w-12 h-12" />
          </div>
          <h1 className="text-4xl font-black tracking-tighter uppercase mb-2">
            Black Gold <span className="text-brand">SaaS</span>
          </h1>
          <p className="text-xs text-fg-secondary font-bold tracking-eyebrow uppercase">Plataforma Educativa Deportiva</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="login-id" className="block text-xs font-bold text-fg-secondary uppercase tracking-widest mb-2">
              Ingresa tu correo, teléfono o cédula
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-fg-muted w-5 h-5" />
              <input
                id="login-id"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                className="w-full bg-surface-card/80 border border-white/10 rounded-control py-4 pl-12 pr-4 text-white focus:outline-none focus:border-brand/50 focus:shadow-[0_0_15px_rgba(255,215,0,0.2)] transition"
                placeholder="ejemplo@correo.com, 0999..., 172..."
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-pass" className="block text-xs font-bold text-fg-secondary uppercase tracking-widest mb-2">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-fg-muted w-5 h-5" />
              <input
                id="login-pass"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-card/80 border border-white/10 rounded-control py-4 pl-12 pr-12 text-white focus:outline-none focus:border-brand/50 focus:shadow-[0_0_15px_rgba(255,215,0,0.2)] transition"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 -mr-3 text-fg-muted hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-danger text-xs font-bold bg-danger/10 p-3 rounded-lg border border-danger/20 text-center"
            >
              {error}
            </motion.p>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-brand hover:bg-brand-hover text-on-brand border border-brand/50 font-black uppercase tracking-eyebrow py-4 rounded-control shadow-glow-gold transition disabled:opacity-50 active:scale-[0.99]"
          >
            {loading ? 'Validando ADN...' : 'Desbloquear Poneglyph'}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-white/10 pt-6">
          <p className="text-2xs text-fg-muted font-bold uppercase tracking-widest mb-4">
            Acceso Autorizado Únicamente para Miembros
          </p>
          <p className="text-xs text-fg-secondary">
            ¿No eres miembro aún?{' '}
            <button
              onClick={() => navigate('/registro')}
              className="text-brand hover:text-white transition-colors font-bold uppercase tracking-wider"
            >
              Regístrate Aquí
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
