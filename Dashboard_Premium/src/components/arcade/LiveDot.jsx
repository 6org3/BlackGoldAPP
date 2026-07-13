import { C } from './arcadeTokens';

/**
 * Punto "vivo" que parpadea — sesión activa, dot de riesgo por hue.
 * `speed` permite desincronizar varios dots (1.3s / 1.6s en el prototipo).
 */
export default function LiveDot({ color = C.ok, size = 9, speed = '1.3s', glow = true, style }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: glow ? `0 0 8px ${color}` : 'none',
        animation: `bg-blink ${speed} infinite`,
        flex: 'none',
        display: 'inline-block',
        ...style,
      }}
    />
  );
}
