import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { KeyRound, LogOut, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { cambiarPasswordPropia } from '../api/accesosService';
import { validarPasswordNueva, MIN_PASSWORD } from '../lib/passwordPolicy';
import CutCard from './arcade/CutCard';
import HexAvatar from './arcade/HexAvatar';
import MicroLabel from './arcade/MicroLabel';
import { C, BORDER, GRAD, GLOW, cut, gridBackground } from './arcade/arcadeTokens';

/**
 * Pantalla completa para quien todavía usa la contraseña que le repartió el
 * club. PrivateRoute la monta en lugar de cualquier ruta privada mientras el
 * JWT traiga `app_metadata.debe_cambiar_password` (entrega 1).
 *
 * No tiene forma de cerrarse ni de saltarse: la clave inicial se dicta por
 * teléfono o se manda por WhatsApp, así que mientras siga en pie está en manos
 * de más gente que su dueño. La única salida es cambiarla —o cerrar sesión—.
 */
export default function CambioPasswordObligatorio() {
  const navigate = useNavigate();
  const { user, logout, confirmarPasswordCambiada } = useAuth();

  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [visible, setVisible] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cerrarSesion = async () => {
    await logout();
    navigate('/login');
  };

  const enviar = async (e) => {
    e.preventDefault();
    setError('');

    // Los mismos datos que la Edge Function vuelve a comprobar por su cuenta:
    // aquí solo para avisar antes de gastar un viaje al servidor.
    const problema = validarPasswordNueva(nueva, {
      repetir,
      datosPersonales: [user?.cedula, user?.correo, user?.telefono],
    });
    if (problema) {
      setError(problema);
      return;
    }

    setGuardando(true);
    try {
      const { session } = await cambiarPasswordPropia(nueva);
      // El cambio revoca la sesión con la que se pidió, así que la función
      // devuelve una nueva: adoptarla es lo que evita que la persona acabe
      // fuera justo después de obedecer. Si no llegó, se va al login a entrar
      // con la contraseña que acaba de elegir.
      const sigueDentro = await confirmarPasswordCambiada(session);
      if (!sigueDentro) navigate('/login');
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la contraseña.');
      setGuardando(false);
    }
  };

  const campo = {
    width: '100%',
    background: C.cardAlt1,
    border: `1px solid ${BORDER.neutral}`,
    borderRadius: 8,
    padding: '13px 44px 13px 14px',
    color: C.text,
    fontSize: 16, // 16px o el navegador móvil hace zoom al enfocar el campo
    minHeight: 44,
  };

  return (
    <div
      className="flex flex-col items-center justify-center min-h-dvh px-6 py-10 relative overflow-hidden"
      style={{ ...gridBackground, color: C.text }}
    >
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-md relative z-10">
        <CutCard
          cut={14}
          background={C.card}
          border={BORDER.neutral}
          padding="40px 28px"
          style={{ boxShadow: GLOW.phone }}
        >
          <div className="flex justify-center mb-6">
            <HexAvatar size={60} background={GRAD.goldHex} color={C.ink}>
              <KeyRound size={26} strokeWidth={2.5} />
            </HexAvatar>
          </div>

          <div className="text-center">
            <MicroLabel style={{ marginBottom: 10, color: C.gold }}>Un paso antes de entrar</MicroLabel>
            <h1 className="text-2xl font-black uppercase tracking-tight mb-3" style={{ color: C.text }}>
              Elige tu contraseña
            </h1>
            <p className="text-sm mb-7" style={{ color: C.text2 }}>
              La que tienes ahora te la dio el club, así que la conoce más gente que tú.
              Cámbiala por una tuya y esa deja de servir.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 text-xs font-bold p-3"
              style={{ clipPath: cut(8), background: 'rgba(239,68,68,.12)', border: `1px solid ${BORDER.danger}`, color: C.danger }}
            >
              {error}
            </div>
          )}

          <form onSubmit={enviar} className="space-y-4">
            <div>
              <label htmlFor="pass-nueva" className="block text-2xs font-bold uppercase tracking-widest mb-1" style={{ color: C.text2 }}>
                Contraseña nueva
              </label>
              <div className="relative">
                <input
                  id="pass-nueva"
                  type={visible ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoFocus
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                  aria-describedby="pass-ayuda"
                  style={campo}
                />
                {/* Escribir 12 caracteres a ciegas en un teléfono es la vía
                    rápida a "no puedo entrar": el ojo deja verlos. */}
                <button
                  type="button"
                  onClick={() => setVisible((v) => !v)}
                  aria-label={visible ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
                  className="absolute right-0 top-0 h-full px-3 flex items-center"
                  style={{ color: C.text2, background: 'none', border: 'none' }}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p id="pass-ayuda" className="mt-2 text-2xs" style={{ color: C.text2 }}>
                Mínimo {MIN_PASSWORD} caracteres. Una frase que recuerdes es más segura y más fácil
                que mezclar símbolos: tres palabras seguidas ya sirven.
              </p>
            </div>

            <div>
              <label htmlFor="pass-repetir" className="block text-2xs font-bold uppercase tracking-widest mb-1" style={{ color: C.text2 }}>
                Repítela
              </label>
              <input
                id="pass-repetir"
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                value={repetir}
                onChange={(e) => setRepetir(e.target.value)}
                style={campo}
              />
            </div>

            <button
              type="submit"
              disabled={guardando}
              className="cut-focus w-full flex items-center justify-center gap-2 min-h-11 active:scale-[0.99] transition disabled:opacity-50"
              style={{ clipPath: cut(12), background: GRAD.goldCTA, color: C.ink, fontWeight: 900, fontSize: 14, letterSpacing: '.08em', textTransform: 'uppercase', border: 'none', padding: '13px' }}
            >
              <ShieldCheck size={16} strokeWidth={2.5} />
              {guardando ? 'Guardando…' : 'Guardar y entrar'}
            </button>
          </form>

          <button
            onClick={cerrarSesion}
            className="cut-focus w-full flex items-center justify-center gap-2 min-h-11 active:scale-[0.99] transition mt-3"
            style={{ clipPath: cut(12), background: C.cardAlt1, color: C.text2, fontWeight: 900, fontSize: 14, letterSpacing: '.08em', textTransform: 'uppercase', border: `1px solid ${BORDER.neutral}`, padding: '13px' }}
          >
            <LogOut size={16} strokeWidth={2.5} />
            Cerrar sesión
          </button>
        </CutCard>
      </motion.div>
    </div>
  );
}
