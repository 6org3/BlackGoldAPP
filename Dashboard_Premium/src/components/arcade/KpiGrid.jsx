/**
 * Grid auto-fit de KPIs/tarjetas — generaliza el grid 2×2 de `KpiTile` del
 * dueño a ancho completo (design_system_arcade.md §6.4). En el marco de 480px
 * o en móvil colapsa a 1–2 columnas; en desktop caben 4–6 por fila sin cambiar
 * el token de la celda. Envuelve `KpiTile` (o cualquier tarjeta) como hijos.
 *
 * `min` — ancho mínimo de columna antes de envolver (KPIs ~170; paneles ~280).
 */
export default function KpiGrid({ children, min = 170, gap = 10, style }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
