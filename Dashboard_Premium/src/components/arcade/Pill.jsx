import { PIXEL, C, BORDER, cut as cutPath } from './arcadeTokens';

/**
 * Chip de filtro/segmento genérico del HUD (misiones · finanzas · asistencia).
 * Activo: oro suave con borde dorado. Inactivo: tarjeta neutra. `SegmentToggle`
 * es específico de asistencia P/A; esta es la píldora de filtro reutilizable.
 */
export default function Pill({ label, active = false, onClick, accent = C.gold, cut = 7, size = 8.5, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '9px 12px',
        fontFamily: PIXEL,
        fontSize: size,
        letterSpacing: '.04em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        clipPath: cutPath(cut),
        background: active ? 'rgba(255,215,0,.12)' : C.card,
        color: active ? accent : C.text3,
        border: `1px solid ${active ? BORDER.goldStrong : BORDER.neutralSoft}`,
        ...style,
      }}
    >
      {label}
    </button>
  );
}
