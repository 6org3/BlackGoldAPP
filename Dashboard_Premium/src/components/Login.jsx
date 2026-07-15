import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { rutaHomeParaRol } from '../lib/featureFlags';
import { Sparkles, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import CutCard from './arcade/CutCard';
import HexAvatar from './arcade/HexAvatar';
import MicroLabel from './arcade/MicroLabel';
import { C, BORDER, GRAD, GLOW, TINT, cut, gridBackground } from './arcade/arcadeTokens';

/* Campo del Formulario-HUD (design_system_arcade.md §6.3): borde y foco por
   clase (el foco dorado no debe quedar pisado por un borde inline); color,
   forma cortada y fondo por arcadeTokens. */
const FIELD_CLASS =
  'cut-focus arcade-input w-full min-h-11 py-3 text-base md:text-sm border border-white/10 focus:outline-none focus:border-brand/60 transition-colors';
const FIELD_STYLE = { clipPath: cut(7), background: C.cardAlt1, color: C.text };

export default function Login() {
  const [identificador, setIdentificador] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  // ÚNICA salida de esta pantalla hacia dentro de la app, y cubre los dos
  // caminos: la sesión que ya venía viva (la PWA abre /login con la de
  // supabase-js aún vigente) y el login recién hecho — AuthContext.login() hace
  // setUser antes de resolver y loginUsuario lanza en todo camino de fallo, así
  // que éxito ⇒ hay user ⇒ este efecto dispara. No devolver un navigate al
  // submit: sería inalcanzable (este efecto gana igual) y reabriría la puerta a
  // que los dos destinos se desincronicen, que es el bug que se arregló aquí.
  //
  // El destino sale de rutaHomeParaRol —la misma fuente que RootRedirect
  // (main.jsx) y el ítem "Inicio" del Sidebar—: hardcodearlo aquí hacía que
  // un mismo usuario aterrizara en portales distintos según cómo entrara
  // (el atleta caía en el shell legacy /dashboard por el formulario y en el
  // portal Arcade /atleta por la raíz).
  //
  // replace: /login no queda en el historial, así que el botón atrás no vuelve
  // a un formulario que rebotaría hacia adelante otra vez.
  useEffect(() => {
    if (user) {
      navigate(rutaHomeParaRol(user.rol), { replace: true });
    }
  }, [user, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(identificador, password);
    setLoading(false);

    if (!result.success) setError(result.error);
  };

  return (
    <div
      className="flex items-center justify-center min-h-dvh px-4 relative overflow-hidden"
      style={{ ...gridBackground, color: C.text }}
    >
      {/* Entrada solo con opacity: el MotionConfig global reducedMotion="user"
          (main.jsx) congela los transforms en su valor `initial`, así que un
          scale/y de entrada dejaría la tarjeta encogida/desplazada —y los
          hit-targets bajo 44px— para usuarios con reduced-motion. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md relative z-10"
      >
        <CutCard
          cut={14}
          background={C.card}
          border={BORDER.gold16}
          padding="28px 24px 24px"
          style={{ boxShadow: GLOW.phone }}
        >
          {/* Identidad */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <HexAvatar size={64} background={GRAD.goldHex} color={C.ink}>
                <Sparkles size={28} strokeWidth={2.5} />
              </HexAvatar>
            </div>
            <h1 className="text-3xl font-black tracking-tight uppercase" style={{ color: C.text }}>
              Black <span style={{ color: C.gold }}>Gold</span>
            </h1>
            <MicroLabel style={{ marginTop: 6 }}>Plataforma Deportiva</MicroLabel>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <MicroLabel as="label" htmlFor="login-id" style={{ display: 'block', marginBottom: 8 }}>
                Correo, teléfono o cédula
              </MicroLabel>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none" style={{ color: C.text3 }} />
                <input
                  id="login-id"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={identificador}
                  onChange={(e) => setIdentificador(e.target.value)}
                  className={`${FIELD_CLASS} pl-11 pr-4`}
                  style={FIELD_STYLE}
                  placeholder="ejemplo@correo.com, 0999..., 172..."
                  required
                />
              </div>
            </div>

            <div>
              <MicroLabel as="label" htmlFor="login-pass" style={{ display: 'block', marginBottom: 8 }}>
                Contraseña
              </MicroLabel>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none" style={{ color: C.text3 }} />
                <input
                  id="login-pass"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${FIELD_CLASS} pl-11 pr-12`}
                  style={FIELD_STYLE}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="cut-focus absolute right-1 top-1/2 -translate-y-1/2 min-w-11 min-h-11 flex items-center justify-center transition-colors"
                  style={{ color: C.text3 }}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                role="alert"
                aria-live="assertive"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center px-3 py-2.5"
                style={{
                  clipPath: cut(6),
                  background: TINT.danger,
                  border: `1px solid ${BORDER.danger}`,
                  color: C.danger,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="cut-focus w-full flex items-center justify-center min-h-11 disabled:opacity-50 active:scale-[0.99] transition"
              style={{
                clipPath: cut(12),
                background: GRAD.goldCTA,
                color: C.ink,
                fontWeight: 900,
                fontSize: 14,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                border: 'none',
                padding: '13px',
              }}
            >
              {loading ? 'Ingresando…' : 'Iniciar Sesión'}
            </button>
          </form>

          <div className="mt-7 pt-6 text-center" style={{ borderTop: `1px solid ${BORDER.neutral}` }}>
            <MicroLabel style={{ marginBottom: 10 }}>Acceso solo para miembros</MicroLabel>
            <p className="text-sm" style={{ color: C.text2 }}>
              ¿No eres miembro aún?{' '}
              <button
                onClick={() => navigate('/registro')}
                className="cut-focus inline-flex items-center min-h-11 px-2 font-bold uppercase tracking-wide"
                style={{ color: C.gold }}
              >
                Regístrate aquí
              </button>
            </p>
          </div>
        </CutCard>
      </motion.div>
    </div>
  );
}
