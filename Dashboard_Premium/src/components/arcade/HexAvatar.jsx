import { HEX, C, hueBg, hueFg, GLOW } from './arcadeTokens';

/**
 * Avatar/badge hexagonal con inicial o icono. Tamaños del prototipo:
 * 34 / 44 / 54 / 66 / 76px. Colorea por `hue` del atleta, o pasa
 * `background`/`color` directos (p. ej. gradiente info del padre).
 */
export default function HexAvatar({
  initial,
  children,
  size = 44,
  hue,
  background,
  color,
  glow = false,
  onClick,
  ariaLabel,
  style,
}) {
  const bg = background || (hue ? hueBg(hue) : 'rgba(255,255,255,.06)');
  const fg = color || (hue ? hueFg(hue) : C.text);
  const interactive = typeof onClick === 'function';
  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? ariaLabel : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(e);
              }
            }
          : undefined
      }
      style={{
        width: size,
        height: size,
        flex: 'none',
        clipPath: HEX,
        background: bg,
        color: fg,
        display: 'grid',
        placeItems: 'center',
        fontWeight: 900,
        fontSize: Math.round(size * 0.34),
        filter: glow ? GLOW.hexGold : undefined,
        cursor: interactive ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children ?? initial}
    </div>
  );
}
