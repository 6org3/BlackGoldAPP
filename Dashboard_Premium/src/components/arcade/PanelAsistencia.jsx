import { C, cut, PIXEL } from './arcadeTokens';
import MicroLabel from './MicroLabel';
import Pill from './Pill';
import Heatmap from './Heatmap';

/** D3 · Asistencia & Ocupación — filtro por categoría, media 30 días, por
 *  categoría y heatmap táctil de ocupación de la cancha. */
export default function PanelAsistencia({ ctx }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {ctx.cats.map((c) => (
          <Pill key={c.label} label={c.label} active={c.active} onClick={c.onPick} />
        ))}
      </div>

      {/* Media 30 días */}
      <div style={{ background: C.card, border: '1px solid rgba(52,211,153,.25)', clipPath: cut(14), padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div>
            <MicroLabel color={C.text3} size={7.5} tracking=".06em">ASISTENCIA MEDIA · 30 DÍAS</MicroLabel>
            <p style={{ margin: '5px 0 0', fontFamily: PIXEL, fontSize: 30, color: C.ok, lineHeight: 1 }}>{ctx.mediaLabel}</p>
          </div>
          <span style={{ flex: 'none', fontFamily: PIXEL, fontSize: 8.5, color: C.ok, border: '1px solid rgba(52,211,153,.35)', padding: '6px 9px' }}>{ctx.mediaTrend}</span>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {ctx.mediaCells.map((c, i) => <span key={i} style={{ flex: 1, height: 11, background: c }} />)}
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 11, color: C.text2 }}>{ctx.mediaSub}</p>
      </div>

      {/* Por categoría */}
      <MicroLabel color={C.text3} size={9.5} style={{ margin: '0 0 8px' }}>POR CATEGORÍA</MicroLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
        {ctx.catRows.map((cr, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.card, border: `1px solid ${cr.border}`, clipPath: cut(8), padding: '10px 12px' }}>
            <div style={{ width: 86, flex: 'none' }}>
              <MicroLabel color={cr.color} size={8.5} tracking="normal">{cr.label}</MicroLabel>
              <p style={{ margin: '2px 0 0', fontSize: 9, color: C.text3 }}>{cr.sub}</p>
            </div>
            <div style={{ flex: 1, display: 'flex', gap: 2 }}>
              {cr.cells.map((c, j) => <span key={j} style={{ flex: 1, height: 9, background: c }} />)}
            </div>
            <span style={{ flex: 'none', width: 34, textAlign: 'right', fontFamily: PIXEL, fontSize: 10.5, color: cr.color }}>{cr.pctLabel}</span>
          </div>
        ))}
      </div>

      {/* Ocupación */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <MicroLabel color={C.text3} size={9.5}>OCUPACIÓN · CANCHA CENTRAL</MicroLabel>
        <MicroLabel color={C.text4} size={8} tracking="normal">TOCA UNA CELDA</MicroLabel>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Heatmap days={ctx.heatDays} rows={ctx.heatRows} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,215,0,.06)', border: '1px solid rgba(255,215,0,.28)', clipPath: cut(10), padding: '12px 14px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <MicroLabel color={C.gold} size={8.5} tracking=".06em">{ctx.heatTitle}</MicroLabel>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: C.text2 }}>{ctx.heatSub}</p>
        </div>
        <span style={{ flex: 'none', fontFamily: PIXEL, fontSize: 17, color: C.gold }}>{ctx.heatPct}</span>
      </div>
    </div>
  );
}
