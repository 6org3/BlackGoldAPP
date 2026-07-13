import { Home, Users, TrendingUp, Briefcase, Target, Calendar, MapPin, Zap, Activity, RotateCcw, DollarSign } from 'lucide-react';
import { HEX, C, GRAD, PIXEL } from './arcadeTokens';

const COACH = [
  { key: 'inicio', label: 'INICIO', Icon: Home },
  { key: 'plantel', label: 'PLANTEL', Icon: Users },
  { key: 'cancha', label: 'CANCHA', center: true },
  { key: 'analizar', label: 'ANALIZAR', Icon: TrendingUp },
  { key: 'club', label: 'CLUB', Icon: Briefcase },
];

const PADRE = [
  { key: 'base', label: 'BASE', Icon: Home },
  { key: 'misiones', label: 'MISIONES', Icon: Target },
  { key: 'eventos', label: 'EVENTOS', Icon: Calendar },
  { key: 'pagos', label: 'PAGOS', Icon: MapPin },
];

// Atleta: 4 zonas, acento oro (como el prototipo ScreenAtleta), sin hex central.
// La clave 'inicio' calza con state.aTab del portal (BASE es su etiqueta).
const ATLETA = [
  { key: 'inicio', label: 'BASE', Icon: Home },
  { key: 'misiones', label: 'MISIONES', Icon: Target },
  { key: 'progreso', label: 'PROGRESO', Icon: TrendingUp },
  { key: 'eventos', label: 'EVENTOS', Icon: Calendar },
];

// Dueño: 5 zonas con hex central elevado = FINANZAS (icono $), como Cancha del coach.
const DUENO = [
  { key: 'resumen', label: 'RESUMEN', Icon: Home },
  { key: 'asistencia', label: 'ASISTENCIA', Icon: Activity },
  { key: 'finanzas', label: 'FINANZAS', center: true },
  { key: 'equipo', label: 'EQUIPO', Icon: Users },
  { key: 'retencion', label: 'RETENCIÓN', Icon: RotateCcw },
];

const VARIANTS = {
  coach: { items: COACH, accent: C.gold, border: 'rgba(255,215,0,.16)', CenterIcon: Zap, centerFill: true },
  padre: { items: PADRE, accent: C.info, border: 'rgba(96,165,250,.2)' },
  atleta: { items: ATLETA, accent: C.gold, border: 'rgba(255,215,0,.16)' },
  dueno: { items: DUENO, accent: C.gold, border: 'rgba(255,215,0,.16)', CenterIcon: DollarSign, centerFill: false },
};

/**
 * Nav inferior del HUD. Coach: 5 zonas con hex central elevado (Cancha, rayo).
 * Dueño: 5 zonas con hex central ($, Finanzas). Padre/Atleta: 4 zonas.
 * `onNavigate(key)` enruta.
 */
export default function ArcadeBottomNav({ variant = 'coach', active, onNavigate }) {
  const v = VARIANTS[variant] || VARIANTS.coach;
  const items = v.items;
  const accent = v.accent;
  const CenterIcon = v.CenterIcon || Zap;

  return (
    <nav
      aria-label="Navegación principal"
      style={{
        flex: 'none',
        height: 78,
        background: 'rgba(5,5,7,.94)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        borderTop: `1px solid ${v.border}`,
        display: 'flex',
      }}
    >
      {items.map((it) => {
        if (it.center) {
          const on = active === it.key;
          return (
            <div key={it.key} style={{ flex: 1, position: 'relative' }}>
              <button
                type="button"
                onClick={() => onNavigate?.(it.key)}
                aria-label={it.label}
                aria-current={on ? 'page' : undefined}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: -20,
                  marginLeft: -31,
                  width: 62,
                  height: 62,
                  clipPath: HEX,
                  background: GRAD.goldCTA150,
                  border: 'none',
                  display: 'grid',
                  placeItems: 'center',
                  color: C.ink,
                  cursor: 'pointer',
                  filter: 'drop-shadow(0 0 16px rgba(255,215,0,.55))',
                }}
              >
                {v.centerFill ? (
                  <CenterIcon size={24} fill="currentColor" strokeWidth={0} />
                ) : (
                  <CenterIcon size={22} strokeWidth={2.4} />
                )}
              </button>
              <span
                style={{
                  position: 'absolute',
                  bottom: 9,
                  left: 0,
                  right: 0,
                  textAlign: 'center',
                  fontFamily: PIXEL,
                  fontSize: 8,
                  letterSpacing: '.04em',
                  color: accent,
                }}
              >
                {it.label}
              </span>
            </div>
          );
        }
        const on = active === it.key;
        const { Icon } = it;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onNavigate?.(it.key)}
            aria-current={on ? 'page' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              appearance: 'none',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: on ? accent : C.text3,
            }}
          >
            <Icon size={19} strokeWidth={2} />
            <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: '.04em' }}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
