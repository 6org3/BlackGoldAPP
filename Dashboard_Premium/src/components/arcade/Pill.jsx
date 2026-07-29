import { PIXEL, C, BORDER, ROW_H, TEXT_MIN, cut as cutPath } from './arcadeTokens';

/**
 * Chip de filtro/segmento genérico del HUD (misiones · finanzas · asistencia).
 * Activo: oro suave con borde dorado. Inactivo: tarjeta neutra. `SegmentToggle`
 * es específico de asistencia P/A; esta es la píldora de filtro reutilizable.
 *
 * Alto mínimo = ROW_H (44px), el objetivo táctil por defecto del §6.1. Solo el
 * padding daba 33px, por debajo de la norma del propio DS. Las superficies
 * densas de staff lo bajan a ROW_H_DENSE por `style` — es lo que ya hace
 * FilterBar con su prop `dense`.
 */
export default function Pill({ label, active = false, onClick, accent = C.gold, cut = 7, size = TEXT_MIN, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        minHeight: ROW_H,
        // minWidth también: un objetivo táctil es 44x44, y las píldoras de
        // label corto ("XP") se quedaban en 40px de ancho.
        minWidth: ROW_H,
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
