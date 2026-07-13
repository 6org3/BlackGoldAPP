import { Home, Users, TrendingUp, Briefcase, Target, Calendar, MapPin, Zap } from 'lucide-react';
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

/**
 * Nav inferior del HUD. Coach: 5 zonas con botón hex central elevado
 * (Cancha). Padre: 4 zonas. `onNavigate(key)` enruta.
 */
export default function ArcadeBottomNav({ variant = 'coach', active, onNavigate }) {
  const isCoach = variant === 'coach';
  const items = isCoach ? COACH : PADRE;
  const accent = isCoach ? C.gold : C.info;

  return (
    <nav
      aria-label="Navegación principal"
      style={{
        flex: 'none',
        height: 78,
        background: 'rgba(5,5,7,.94)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        borderTop: `1px solid ${isCoach ? 'rgba(255,215,0,.16)' : 'rgba(96,165,250,.2)'}`,
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
                <Zap size={24} fill="currentColor" strokeWidth={0} />
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
