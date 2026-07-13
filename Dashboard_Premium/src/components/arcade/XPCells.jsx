import { CELL, GRAD } from './arcadeTokens';

/**
 * Progreso como celdas segmentadas (no barra lisa) — XP, misiones.
 * Por defecto 10 celdas doradas con mini-corte y glow; parametrizable
 * para la barra morada de misión del padre (color sólido, sin corte).
 */
export default function XPCells({
  filled = 0,
  cells = 10,
  height = 12,
  gap = 3,
  fill = GRAD.goldText,
  fillGlow = '0 0 6px rgba(255,215,0,.35)',
  empty = 'rgba(255,255,255,.06)',
  cut = true,
  pct,
  label = 'Progreso',
  style,
}) {
  const n = pct != null ? Math.round((pct / 100) * cells) : filled;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct != null ? Math.round(pct) : Math.round((n / cells) * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ display: 'flex', gap, ...style }}
    >
      {Array.from({ length: cells }, (_, i) => {
        const on = i < n;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height,
              background: on ? fill : empty,
              boxShadow: on ? fillGlow : 'none',
              clipPath: cut ? CELL : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
