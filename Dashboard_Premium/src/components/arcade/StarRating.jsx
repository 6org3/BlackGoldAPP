import { C, GLOW } from './arcadeTokens';

/**
 * 5 estrellas 1–5 para la evaluación subjetiva. Cada estrella es un botón
 * con área táctil ≥44px de alto (requisito del brief) aunque el glifo se
 * dibuje a 25px. `onRate(i)` fija el valor del eje.
 */
export default function StarRating({ value = 0, onRate, size = 25, label, readOnly = false }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 1, flex: 'none' }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const on = i <= value;
        return (
          <button
            key={i}
            type="button"
            disabled={readOnly}
            onClick={() => onRate?.(i)}
            aria-label={`${i} de 5`}
            aria-pressed={on}
            style={{
              appearance: 'none',
              background: 'none',
              border: 'none',
              padding: 0,
              minWidth: 44,
              minHeight: 44,
              display: 'grid',
              placeItems: 'center',
              lineHeight: 1,
              cursor: readOnly ? 'default' : 'pointer',
              fontSize: size,
              color: on ? C.gold : C.text4,
              textShadow: on ? GLOW.star : 'none',
              transition: 'color .15s, text-shadow .15s',
            }}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}
