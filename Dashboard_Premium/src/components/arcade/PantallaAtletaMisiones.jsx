import { C, GRAD, cut, PIXEL } from './arcadeTokens';
import MicroLabel from './MicroLabel';
import Pill from './Pill';

/** A2 · Misiones — resumen, filtros por lugar y lista con estado + botón
 *  contextual (aceptar propuesta / abrir quiz / ver en revisión). */
export default function PantallaAtletaMisiones({ ctx }) {
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, letterSpacing: '-.03em' }}>Misiones</h1>
        <MicroLabel color={C.text3} size={8.5} tracking=".06em" style={{ marginTop: 5 }}>{ctx.resumen}</MicroLabel>
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
                {m.sub && <p style={{ margin: '2px 0 0', fontSize: 10.5, color: C.text2 }}>{m.sub}</p>}
              </div>
              <span style={{ fontFamily: PIXEL, fontSize: 10, color: C.gold, flex: 'none' }}>{m.xpLabel}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: C.text2, border: `1px solid rgba(255,255,255,.12)`, padding: '4px 7px' }}>{m.lugarLabel}</span>
              <span style={{ fontFamily: PIXEL, fontSize: 7.5, color: C.text2, border: `1px solid rgba(255,255,255,.12)`, padding: '4px 7px' }}>{m.pilarLabel}</span>
              <span style={{ marginLeft: 'auto', fontFamily: PIXEL, fontSize: 8, color: m.estadoColor, border: `1px solid ${m.estadoBorder}`, padding: '4px 8px' }}>{m.estadoLabel}</span>
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
                  padding: 13,
                  cursor: 'pointer',
                  clipPath: cut(10),
                  fontFamily: PIXEL,
                  fontSize: 9,
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
