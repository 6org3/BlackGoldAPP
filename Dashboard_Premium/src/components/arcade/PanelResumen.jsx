import { C, BORDER, cut, PIXEL } from './arcadeTokens';
import MicroLabel from './MicroLabel';
import LiveDot from './LiveDot';
import KpiTile from './KpiTile';

/** D1 · Resumen — KPIs 2×2, alertas accionables y agenda "hoy en el club". */
export default function PanelResumen({ ctx }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        {ctx.kpis.map((k, i) => (
          <KpiTile key={i} label={k.label} val={k.val} color={k.color} sub={k.sub} border={k.border} />
        ))}
      </div>

      <MicroLabel color={C.text3} size={9.5} style={{ margin: '0 0 8px' }}>ALERTAS · REQUIEREN ACCIÓN</MicroLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {ctx.alertas.map((al, i) => (
          <button key={i} type="button" onClick={al.onGo} style={{ display: 'flex', alignItems: 'center', gap: 11, background: C.card, border: `1px solid ${al.border}`, clipPath: cut(10), padding: '12px 13px', cursor: 'pointer', textAlign: 'left' }}>
            <span aria-hidden="true" style={{ fontSize: 16, flex: 'none' }}>{al.icon}</span>
            <p style={{ margin: 0, flex: 1, fontSize: 12.5, fontWeight: 700, minWidth: 0 }}>{al.text}</p>
            <span style={{ flex: 'none', fontFamily: PIXEL, fontSize: 8, color: al.color }}>{al.cta}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <MicroLabel color={C.ok} size={9.5} tracking=".08em"><LiveDot color={C.ok} size={8} style={{ marginRight: 6 }} /> HOY EN EL CLUB</MicroLabel>
        <MicroLabel color={C.text3} size={8} tracking="normal">{ctx.hoy.length} SESIONES</MicroLabel>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ctx.hoy.map((h, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, background: C.card, border: `1px solid ${BORDER.neutral}`, clipPath: cut(10), padding: '12px 13px' }}>
            <span style={{ flex: 'none', fontFamily: PIXEL, fontSize: 11, color: C.goldDeep, width: 44 }}>{h.time}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{h.title}</p>
              <p style={{ margin: '1px 0 0', fontSize: 10, color: C.text3 }}>{h.sub}</p>
            </div>
            <span style={{ flex: 'none', fontFamily: PIXEL, fontSize: 8, color: h.chipColor, display: 'flex', alignItems: 'center', gap: 4 }}>
              {h.live && <LiveDot color={h.chipColor} size={6} />}{h.chip}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
