import { motion } from 'framer-motion';
import { Droplets } from 'lucide-react';
import { recoveryPill } from '../lib/recoveryPill';
import { tieneDatosAntropometricos } from '../api/utilsAtletas';
import HexAvatar from './arcade/HexAvatar';
import { cut } from './arcade/arcadeTokens';

// Hue del avatar hexagonal por readiness (misma semántica que AtletaCard):
// rojo agotamiento, naranja fatiga, verde óptimo, oro por defecto.
const HUE_READINESS = {
  'Agotamiento Activo': 'red',
  'Fatiga Silenciosa': 'orange',
  'Óptimo': 'green',
};

export default function AthleteGridCard({ atleta, onClick }) {
  const pillColor = recoveryPill(atleta.estado_recuperacion);
  const deshidratado = atleta.readiness_hoy && atleta.readiness_hoy.color_orina >= 5;
  const conAntropometria = tieneDatosAntropometricos(atleta);
  const avatarHue = HUE_READINESS[atleta.estado_recuperacion] || 'gold';

  return (
    <motion.div
      whileHover={{ y: -2 }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Ver perfil de ${atleta.nombre}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{ clipPath: cut(10) }}
      className="cut-focus bg-surface-card border border-white/10 p-5 hover:border-brand/30 transition cursor-pointer relative group"
    >
      {/* Recovery / Readiness alerts: pills con texto visible (nada de
          significado solo-hover en información médica) */}
      {(deshidratado || pillColor) && (
        <div className="flex flex-wrap items-center justify-end gap-1.5 mb-3">
          {deshidratado && (
            <span
              aria-label={`Alerta de hidratación (color de orina ${atleta.readiness_hoy.color_orina})`}
              className="flex items-center gap-1 text-3xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-brand/40 text-brand bg-brand/10"
            >
              <Droplets size={11} fill="currentColor" className="animate-pulse" />
              Hidratación
            </span>
          )}
          {pillColor && (
            <span
              aria-label={`Estado de recuperación: ${atleta.estado_recuperacion}`}
              className={`flex items-center gap-1 text-3xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${pillColor}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {atleta.estado_recuperacion}
            </span>
          )}
        </div>
      )}

      {/* Top: Avatar hexagonal (hue por readiness) + Identity */}
      <div className="flex items-center space-x-3 mb-4">
        <HexAvatar size={44} hue={avatarHue} initial={atleta.nombre?.charAt(0)?.toUpperCase()} />
        <div className="min-w-0">
          <p className="font-bold text-white truncate text-sm group-hover:text-brand transition-colors">
            {atleta.nombre}
          </p>
          <p className="text-xs text-fg-secondary truncate">
            {atleta.edad} años · {atleta.posicion}
          </p>
        </div>
      </div>

      {/* Rango badge and profile */}
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className={`text-2xs font-black uppercase tracking-widest ${atleta.rango?.textColor || 'text-fg-secondary'}`}>
            {atleta.rango?.nombre}
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          {atleta.perfil_mental && (
            <span className="text-2xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-success/30 text-success-soft bg-success/5">
              {atleta.perfil_mental}
            </span>
          )}
          {atleta.prevencion_impacto && (
            <span title="Sensibilidad al Impacto" className="text-2xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-caution/30 text-caution-soft bg-caution/5 flex items-center">
              ⚠ Impacto
            </span>
          )}
        </div>
      </div>

      {/* Mini metric pills - Anthropometry (rounded-lg como el molde AtletaCard; verde tokenizado a success) */}
      <div className="flex items-center gap-2 flex-wrap mt-2 pt-3 border-t border-white/5">
        {conAntropometria ? (
          <>
            <span title="Estatura" className="text-xs font-bold px-2 py-1 rounded-lg bg-info/10 text-info-soft border border-info/20">
              {atleta.talla_cm ? `${atleta.talla_cm} cm` : '—'}
            </span>
            <span title="Peso" className="text-xs font-bold px-2 py-1 rounded-lg bg-success/10 text-success-soft border border-success/20">
              {atleta.peso_kg ? `${atleta.peso_kg} kg` : '—'}
            </span>
            <span title="Índice de Masa Corporal (IMC)" className="text-xs font-bold px-2 py-1 rounded-lg bg-mental/10 text-mental-soft border border-mental/20">
              IMC: {atleta.imc || '—'}
            </span>
            <span title="Brazada Relativa" className="text-xs font-bold px-2 py-1 rounded-lg bg-brand/10 text-brand border border-brand/20">
              BR: {atleta.brazada_relativa || '—'}
            </span>
          </>
        ) : (
          <span className="text-xs font-bold px-2 py-1 rounded-lg bg-white/5 text-fg-faint border border-white/10">
            Sin datos antropométricos
          </span>
        )}
      </div>
    </motion.div>
  );
}
