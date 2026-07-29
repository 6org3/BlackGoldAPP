import { PIXEL, C, ROW_H, cut } from './arcadeTokens';

/* La rejilla necesita este ancho para que cada celda sea un objetivo táctil de
   ROW_H de lado: columna de hora + 6 días + los 6 gaps. Por debajo de eso el
   contenedor hace scroll horizontal en vez de encoger las celdas — a 360px de
   viewport se quedaban en 40px, y la respuesta correcta a una rejilla densa en
   una pantalla estrecha es desplazarla, no volverla impulsable. */
const COL_HORA = 38;
const GAP = 3;
const MIN_W = COL_HORA + ROW_H * 6 + GAP * 6;
const GRID = { display: 'grid', gridTemplateColumns: `${COL_HORA}px repeat(6, minmax(${ROW_H}px, 1fr))`, gap: GAP, minWidth: MIN_W };

/** Heatmap de ocupación (dueño · asistencia): columna de hora + 6 días, celdas
 *  táctiles con alpha por % y leyenda LIBRE→LLENO. Data-driven (rows con celdas
 *  ya calculadas por el selector) para poder cambiar la fuente sin refactor. */
export default function Heatmap({ days = [], rows = [] }) {
  return (
    <div style={{ background: C.card, border: '1px solid rgba(255,215,0,.14)', clipPath: cut(12), padding: 13 }}>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ ...GRID, marginBottom: 5 }}>
          <span />
          {days.map((d, i) => (
            <span key={i} style={{ textAlign: 'center', fontFamily: PIXEL, fontSize: 11, color: C.text3 }}>{d}</span>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rows.map((hr, ri) => (
            <div key={ri} style={GRID}>
              <span style={{ fontFamily: PIXEL, fontSize: 11, color: C.text3, alignSelf: 'center' }}>{hr.time}</span>
              {hr.cells.map((hc, ci) => (
                <button key={ci} type="button" onClick={hc.onPick} aria-label={hc.aria} style={{ height: ROW_H, display: 'grid', placeItems: 'center', background: hc.bg, border: `1px solid ${hc.border}`, clipPath: cut(5), fontFamily: PIXEL, fontSize: 11, color: hc.fg, cursor: 'pointer' }}>{hc.label}</button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 11 }}>
        <span style={{ fontFamily: PIXEL, fontSize: 11, color: C.text4 }}>LIBRE</span>
        <span style={{ width: 14, height: 8, background: 'rgba(255,255,255,.04)' }} />
        <span style={{ width: 14, height: 8, background: 'rgba(255,215,0,.18)' }} />
        <span style={{ width: 14, height: 8, background: 'rgba(255,215,0,.42)' }} />
        <span style={{ width: 14, height: 8, background: 'rgba(255,215,0,.75)' }} />
        <span style={{ fontFamily: PIXEL, fontSize: 11, color: C.text4 }}>LLENO</span>
      </div>
    </div>
  );
}
