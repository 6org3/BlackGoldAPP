import { C, PIXEL, cut } from './arcadeTokens';

/**
 * Botón de salida del HUD hacia un módulo /admin/*. Los paneles del dueño son
 * superficie de LECTURA: cuando el dato pide una herramienta (verificar un pago,
 * pasar lista, escribir a los de riesgo) se sale del marco por aquí.
 *
 * Molde extraído del "GESTIONAR EQUIPO ►" que PanelEquipo tenía inline — mismo
 * pixel dorado sobre corte, ahora en un solo sitio para que los cuatro paneles
 * no diverjan. La flecha ► es la marca de "esto te saca del HUD".
 */
export default function SalidaAdmin({ label, onClick }) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="cut-focus"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: 44,
        background: C.card,
        border: `1px solid rgba(255,215,0,.3)`,
        clipPath: cut(10),
        color: C.gold,
        fontFamily: PIXEL,
        fontSize: 8,
        cursor: 'pointer',
      }}
    >
      {label} ►
    </button>
  );
}
