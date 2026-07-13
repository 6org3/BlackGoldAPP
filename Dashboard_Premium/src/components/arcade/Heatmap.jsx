import { PIXEL, C, cut } from './arcadeTokens';

/** Heatmap de ocupación (dueño · asistencia): grid 44px + 6 días, celdas táctiles
 *  con alpha por % y leyenda LIBRE→LLENO. Data-driven (rows con celdas ya
 *  calculadas por el selector) para poder cambiar la fuente sin refactor. */
export default function Heatmap({ days = [], rows = [] }) {
  return (
    <div style={{ background: C.card, border: '1px solid rgba(255,215,0,.14)', clipPath: cut(12), padding: 13 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(6, 1fr)', gap: 4, marginBottom: 5 }}>
        <span />
        {days.map((d, i) => (
          <span key={i} style={{ textAlign: 'center', fontFamily: PIXEL, fontSize: 7.5, color: C.text3 }}>{d}</span>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((hr, ri) => (
          <div key={ri} style={{ display: 'grid', gridTemplateColumns: '44px repeat(6, 1fr)', gap: 4 }}>
            <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: C.text3, alignSelf: 'center' }}>{hr.time}</span>
            {hr.cells.map((hc, ci) => (
              <button key={ci} type="button" onClick={hc.onPick} aria-label={hc.aria} style={{ height: 34, display: 'grid', placeItems: 'center', background: hc.bg, border: `1px solid ${hc.border}`, clipPath: cut(5), fontFamily: PIXEL, fontSize: 7.5, color: hc.fg, cursor: 'pointer' }}>{hc.label}</button>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 11 }}>
        <span style={{ fontFamily: PIXEL, fontSize: 7, color: C.text4 }}>LIBRE</span>
        <span style={{ width: 14, height: 8, background: 'rgba(255,255,255,.04)' }} />
        <span style={{ width: 14, height: 8, background: 'rgba(255,215,0,.18)' }} />
        <span style={{ width: 14, height: 8, background: 'rgba(255,215,0,.42)' }} />
        <span style={{ width: 14, height: 8, background: 'rgba(255,215,0,.75)' }} />
        <span style={{ fontFamily: PIXEL, fontSize: 7, color: C.text4 }}>LLENO</span>
      </div>
    </div>
  );
}
