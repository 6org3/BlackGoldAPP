import { cut as cutPath, C, BORDER } from './arcadeTokens';

/**
 * Contenedor con esquina cortada — la superficie base del HUD.
 * `cut` = tamaño del corte (8/10/12/14). Pasa `background`/`border` para
 * tonos (gold/verde/etc.); por defecto tarjeta neutra.
 *
 * Con `onClick` se vuelve un control accesible (rol button, foco y teclado)
 * sin cambiar el aspecto — cumple el requisito de hit-targets del brief.
 */
export default function CutCard({
  children,
  cut = 10,
  background = C.card,
  border = BORDER.neutral,
  padding = '12px 14px',
  onClick,
  ariaLabel,
  style,
  ...rest
}) {
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
        background,
        border: `1px solid ${border}`,
        clipPath: cutPath(cut),
        padding,
        cursor: interactive ? 'pointer' : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
