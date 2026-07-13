import { PIXEL, C } from './arcadeTokens';

/**
 * Etiqueta pixel (Silkscreen) en MAYÚSCULA — la micro-tipografía del HUD
 * ("EN CURSO", "PWR", "DESTACADOS DE HOY"). 8–9.5px, tracking generoso.
 */
export default function MicroLabel({
  children,
  size = 9.5,
  color = C.text3,
  tracking = '0.1em',
  as: Tag = 'p',
  style,
  ...rest
}) {
  return (
    <Tag
      style={{
        margin: 0,
        fontFamily: PIXEL,
        fontSize: size,
        letterSpacing: tracking,
        textTransform: 'uppercase',
        color,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
