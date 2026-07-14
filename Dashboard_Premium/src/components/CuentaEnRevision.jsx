import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Hourglass, XCircle, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '../AuthContext';
import CutCard from './arcade/CutCard';
import HexAvatar from './arcade/HexAvatar';
import MicroLabel from './arcade/MicroLabel';
import { C, BORDER, GRAD, GLOW, TINT, cut, gridBackground } from './arcade/arcadeTokens';

/**
 * Pantalla completa para cuentas aún no aprobadas (v33). PrivateRoute la monta
 * en lugar de cualquier ruta privada cuando usuarios.estado es 'pendiente' o
 * 'rechazado' — aplica igual al atleta y a su representante.
 *
 * "Actualizar estado" recarga la página: el AuthProvider re-resuelve el perfil
 * al montar, así que si el owner ya aprobó, el usuario entra directo a su portal.
 */
export default function CuentaEnRevision({ estado }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const rechazado = estado === 'rechazado';

  const cerrarSesion = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div
      className="flex flex-col items-center justify-center min-h-dvh px-6 relative overflow-hidden"
      style={{ ...gridBackground, color: C.text }}
    >
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-md relative z-10">
        <CutCard
          cut={14}
          background={C.card}
          border={rechazado ? BORDER.danger : BORDER.neutral}
          padding="40px 28px"
          style={{ boxShadow: GLOW.phone, textAlign: 'center' }}
        >
          <div className="flex justify-center mb-6">
            <HexAvatar
              size={60}
              background={rechazado ? TINT.danger : GRAD.goldHex}
              color={rechazado ? C.danger : C.ink}
            >
              {rechazado ? <XCircle size={26} strokeWidth={2.5} /> : <Hourglass size={26} strokeWidth={2.5} />}
            </HexAvatar>
          </div>

          <MicroLabel style={{ marginBottom: 10, color: rechazado ? C.danger : C.gold }}>
            {rechazado ? 'Solicitud no aprobada' : 'Solicitud en revisión'}
          </MicroLabel>
          <h1 className="text-2xl font-black uppercase tracking-tight mb-3" style={{ color: C.text }}>
            {rechazado ? 'Tu solicitud no fue aprobada' : 'Tu solicitud está en revisión'}
          </h1>
          <p className="text-sm mb-8" style={{ color: C.text2 }}>
            {rechazado
              ? 'El club no aprobó tu inscripción. Si crees que se trata de un error, comunícate directamente con el club.'
              : 'El club está revisando tu inscripción. En cuanto sea aprobada podrás entrar a tu portal con estas mismas credenciales.'}
          </p>

          <div className="space-y-3">
            {!rechazado && (
              <button
                onClick={() => window.location.reload()}
                className="cut-focus w-full flex items-center justify-center gap-2 min-h-11 active:scale-[0.99] transition"
                style={{ clipPath: cut(12), background: GRAD.goldCTA, color: C.ink, fontWeight: 900, fontSize: 14, letterSpacing: '.08em', textTransform: 'uppercase', border: 'none', padding: '13px' }}
              >
                <RefreshCw size={16} strokeWidth={2.5} />
                Actualizar estado
              </button>
            )}
            <button
              onClick={cerrarSesion}
              className="cut-focus w-full flex items-center justify-center gap-2 min-h-11 active:scale-[0.99] transition"
              style={{ clipPath: cut(12), background: C.cardAlt1, color: C.text2, fontWeight: 900, fontSize: 14, letterSpacing: '.08em', textTransform: 'uppercase', border: `1px solid ${BORDER.neutral}`, padding: '13px' }}
            >
              <LogOut size={16} strokeWidth={2.5} />
              Cerrar sesión
            </button>
          </div>
        </CutCard>
      </motion.div>
    </div>
  );
}
