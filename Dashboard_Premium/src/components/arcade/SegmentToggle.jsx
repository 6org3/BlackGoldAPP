import { cut, C, BORDER, PIXEL } from './arcadeTokens';

/**
 * Segmento P/A de asistencia. `value` = 'P' | 'A' | undefined.
 * Presente = verde, ausente = rojo, sin marcar = neutro. Dos botones
 * contiguos con corte de esquina; área táctil ≥44px.
 */
export default function SegmentToggle({ value, onPresent, onAbsent, name }) {
  const p = value === 'P';
  const a = value === 'A';
  const cell = {
    minWidth: 44,
    minHeight: 44,
    padding: '11px 0',
    textAlign: 'center',
    fontFamily: PIXEL,
    fontSize: 10,
    cursor: 'pointer',
    appearance: 'none',
    border: 'none',
    background: 'transparent',
  };
  return (
    <div
      role="group"
      aria-label={name ? `Asistencia de ${name}` : 'Asistencia'}
      style={{ display: 'flex', flex: 'none', clipPath: cut(7), border: `1px solid ${BORDER.neutralSoft}` }}
    >
      <button
        type="button"
        onClick={onPresent}
        aria-pressed={p}
        aria-label="Presente"
        style={{ ...cell, background: p ? C.okDeep : 'transparent', color: p ? C.inkGreen : C.text3 }}
      >
        P
      </button>
      <button
        type="button"
        onClick={onAbsent}
        aria-pressed={a}
        aria-label="Ausente"
        style={{
          ...cell,
          borderLeft: `1px solid ${BORDER.neutralSoft}`,
          background: a ? C.dangerDeep : 'transparent',
          color: a ? '#FFFFFF' : C.text2,
        }}
      >
        A
      </button>
    </div>
  );
}
