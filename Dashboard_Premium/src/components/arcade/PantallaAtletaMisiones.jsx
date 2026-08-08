import { C, GRAD, ROW_H, cut, PIXEL } from './arcadeTokens';
import MicroLabel from './MicroLabel';
import Pill from './Pill';

/** A2 · Misiones — resumen, filtros por lugar y lista con estado + botón
 *  contextual (aceptar propuesta / abrir quiz / ver en revisión). */
export default function PantallaAtletaMisiones({ ctx, embedded = false }) {
  const Heading = embedded ? 'h3' : 'h1';
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <Heading style={{ margin: 0, fontSize: embedded ? 18 : 24, fontWeight: 900, letterSpacing: '-.03em' }}>Misiones activas</Heading>
        <MicroLabel color={C.text3} size={11} tracking=".06em" style={{ marginTop: 5 }}>{ctx.resumen}</MicroLabel>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {ctx.filtros.map((f) => (
          <Pill key={f.label} label={f.label} active={f.active} onClick={f.onPick} />
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ctx.misiones.length === 0 && (
          <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>Sin misiones en este filtro.</p>
        )}
        {ctx.misiones.map((m) => (
          <div key={m.id} style={{ background: C.card, border: `1px solid ${m.border}`, clipPath: cut(12), padding: '13px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{m.titulo}</p>
                {m.sub && <p style={{ margin: '2px 0 0', fontSize: 11, color: C.text2 }}>{m.sub}</p>}
              </div>
              <span style={{ fontFamily: PIXEL, fontSize: 11, color: C.gold, flex: 'none' }}>{m.xpLabel}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: PIXEL, fontSize: 11, color: C.text2, border: `1px solid rgba(255,255,255,.12)`, padding: '4px 7px' }}>{m.lugarLabel}</span>
              <span style={{ fontFamily: PIXEL, fontSize: 11, color: C.text2, border: `1px solid rgba(255,255,255,.12)`, padding: '4px 7px' }}>{m.pilarLabel}</span>
              <span style={{ marginLeft: 'auto', fontFamily: PIXEL, fontSize: 11, color: m.estadoColor, border: `1px solid ${m.estadoBorder}`, padding: '4px 8px' }}>{m.estadoLabel}</span>
            </div>
            <div style={{ display: 'flex', gap: 3, marginTop: 11 }}>
              {m.cells.map((c, i) => (
                <span key={i} style={{ flex: 1, height: 7, background: c }} />
              ))}
            </div>
            {m.showBtn && (
              <button
                type="button"
                onClick={m.onBtn}
                style={{
                  width: '100%',
                  marginTop: 12,
                  minHeight: ROW_H,
                  padding: 13,
                  cursor: 'pointer',
                  clipPath: cut(10),
                  fontFamily: PIXEL,
                  fontSize: 11,
                  letterSpacing: '.04em',
                  background: m.btnPrimary ? GRAD.goldCTA : 'transparent',
                  color: m.btnPrimary ? C.ink : C.cyan,
                  border: `1px solid ${m.btnPrimary ? 'transparent' : 'rgba(34,211,238,.45)'}`,
                }}
              >
                {m.btnLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
