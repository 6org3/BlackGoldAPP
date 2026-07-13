import { C, BORDER, cut as cutPath, PIXEL, ROW_H, ROW_H_DENSE } from './arcadeTokens';

/**
 * Tabla-HUD (design_system_arcade.md §6.2) — el patrón data-denso del HUD para
 * roster, pagos, altas/bajas y auditorías. La tabla es una `CutCard` grande
 * cuyo interior es una rejilla real (`<table>` semántica), NO un marco de
 * teléfono. Reglas del §6.2 cableadas aquí:
 *
 * - Contenedor `cut(10)` sobre `C.card`, ancho completo, scroll-x propio en <md.
 * - Cabeceras de columna: MicroLabel (PIXEL MAYÚSCULA, `C.text3`, 9px) con
 *   `borderBottom` tenue; numéricas alineadas a la derecha.
 * - Celdas de texto en Outfit 12–13px; números/métricas en PIXEL con color
 *   semántico. Nunca PIXEL para nombres/textos largos.
 * - Estado de fila por borde-izquierdo semántico de 3px (`rowStatus`), NO por
 *   teñir toda la fila. Sin `cut` por celda (el chaflán es solo del contenedor).
 * - Fila ≥44px (densa desktop 36px con `dense`). Hover y foco en `tokens.css`.
 *
 * columns: [{ key, label, align?, numeric?, width?, color?(row), render?(row) }]
 *   numeric → PIXEL + alineado a la derecha; `color(row)` tiñe la celda
 *   (p.ej. `hueFg`/`C.ok`/`C.danger`); `render(row)` para contenido a medida.
 * rowStatus: (row) => color del borde-izquierdo (C.ok deuda al día / C.danger deuda) | undefined
 * onRowClick: (row) => void  — hace la fila accesible por teclado (Enter/Espacio)
 */
export default function TablaHUD({
  columns = [],
  rows = [],
  rowKey,
  rowStatus,
  onRowClick,
  dense = false,
  ariaLabel,
  rowAriaLabel,
  emptyLabel = 'Sin datos',
}) {
  const h = dense ? ROW_H_DENSE : ROW_H;
  const clickable = typeof onRowClick === 'function';

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${BORDER.neutral}`,
        clipPath: cutPath(10),
        overflowX: 'auto',
      }}
    >
      <table
        aria-label={ariaLabel}
        style={{ width: '100%', borderCollapse: 'collapse', minWidth: columns.length * 96 }}
      >
        <thead>
          <tr style={{ borderBottom: `1px solid ${BORDER.neutral06}` }}>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={{
                  textAlign: col.align || (col.numeric ? 'right' : 'left'),
                  padding: '10px 12px',
                  fontFamily: PIXEL,
                  fontSize: 9,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: C.text3,
                  fontWeight: 400,
                  width: col.width,
                  whiteSpace: 'nowrap',
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                style={{ padding: '18px 12px', textAlign: 'center', color: C.text3, fontSize: 12 }}
              >
                {emptyLabel}
              </td>
            </tr>
          )}
          {rows.map((row, i) => {
            const status = rowStatus?.(row);
            return (
              <tr
                key={rowKey ? rowKey(row, i) : i}
                className="tabla-hud-row"
                onClick={clickable ? () => onRowClick(row) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={clickable ? 0 : undefined}
                role={clickable ? 'button' : undefined}
                aria-label={clickable && rowAriaLabel ? rowAriaLabel(row) : undefined}
                style={{
                  borderBottom: `1px solid ${BORDER.neutral06}`,
                  cursor: clickable ? 'pointer' : undefined,
                }}
              >
                {columns.map((col, ci) => {
                  const cellColor = col.color?.(row);
                  return (
                    <td
                      key={col.key}
                      style={{
                        height: h,
                        padding: '0 12px',
                        verticalAlign: 'middle',
                        textAlign: col.align || (col.numeric ? 'right' : 'left'),
                        boxShadow: ci === 0 && status ? `inset 3px 0 0 ${status}` : undefined,
                        fontFamily: col.numeric ? PIXEL : undefined,
                        fontSize: col.numeric ? 12 : 13,
                        color: cellColor || (col.numeric ? C.text : C.text2),
                        fontWeight: col.numeric ? 400 : 600,
                        whiteSpace: col.numeric ? 'nowrap' : undefined,
                      }}
                    >
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
