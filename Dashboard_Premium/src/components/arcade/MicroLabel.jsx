import { PIXEL, C, TEXT_MIN } from './arcadeTokens';

/**
 * Etiqueta pixel (Silkscreen) en MAYÚSCULA — la micro-tipografía del HUD
 * ("EN CURSO", "PWR", "DESTACADOS DE HOY"). Tracking generoso.
 *
 * Piso de tamaño: TEXT_MIN (11px). Estas etiquetas son texto FUNCIONAL —
 * nombran valores, filas y zonas de navegación —, no adorno: por debajo de
 * 11px dejan de leerse en un móvil a pleno sol, que es la condición real de
 * uso del portal del atleta. El carácter pixel del HUD lo da Silkscreen, no
 * el tamaño.
 */
export default function MicroLabel({
  children,
  size = TEXT_MIN,
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
