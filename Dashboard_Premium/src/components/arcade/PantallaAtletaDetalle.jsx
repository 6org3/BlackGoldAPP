import { C, BORDER, GRAD, cut, HEX, PIXEL } from './arcadeTokens';
import MicroLabel from './MicroLabel';

/** A3 · Misión detalle + mini-quiz. Body de la pantalla (el header de flujo y
 *  el footer CTA los pone VistaAtletaArcade). Dirigida por ctx.ctxDetalle. */
export default function PantallaAtletaDetalle({ ctx }) {
  return (
    <div>
      {/* Placeholder de video */}
      <div style={{ position: 'relative', height: 180, border: `1px solid ${BORDER.neutralSoft}`, clipPath: cut(12), background: 'repeating-linear-gradient(45deg, rgba(255,255,255,.035) 0 10px, rgba(13,13,16,.9) 10px 20px)', display: 'grid', placeItems: 'center', marginBottom: 8 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 54, height: 54, margin: '0 auto 10px', clipPath: HEX, background: GRAD.goldHex, display: 'grid', placeItems: 'center', color: C.ink, fontSize: 18 }} aria-hidden="true">▶</div>
          <MicroLabel color={C.text3} size={8} tracking=".08em">VIDEO · TÉCNICA DE LA MISIÓN</MicroLabel>
        </div>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 11, color: C.text3 }}>Mira el video del coach y practica antes de responder.</p>

      {/* Progreso de días */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.card, border: `1px solid rgba(255,215,0,.2)`, clipPath: cut(10), padding: '12px 14px', marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <MicroLabel color={C.text3} size={8.5} tracking=".06em">TU PROGRESO</MicroLabel>
          <p style={{ margin: '4px 0 0' }}>
            <span style={{ fontFamily: PIXEL, fontSize: 19, color: C.gold }}>3</span>
            <span style={{ fontFamily: PIXEL, fontSize: 12, color: C.text3 }}> / 5 DÍAS</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 3, width: 120 }}>
          {ctx.progCells.map((c, i) => (
            <span key={i} style={{ flex: 1, height: 16, background: c }} />
          ))}
        </div>
      </div>

      {/* Pasos */}
      <MicroLabel color={C.text3} size={9.5} style={{ margin: '0 0 8px' }}>PASOS</MicroLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
        {ctx.pasos.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <span style={{ fontFamily: PIXEL, fontSize: 9, color: C.gold, flex: 'none' }}>{i + 1}</span>
            <p style={{ margin: 0, fontSize: 12.5, color: C.text2, lineHeight: 1.5 }}>{p}</p>
          </div>
        ))}
      </div>

      {ctx.enviada && (
        <div style={{ textAlign: 'center', padding: 13, background: 'rgba(168,85,247,.1)', border: `1px solid rgba(168,85,247,.4)`, color: C.ai, clipPath: cut(10), fontFamily: PIXEL, fontSize: 9.5, marginBottom: 16, animation: 'bg-pop .4s ease-out' }}>
          ✓ ENVIADA · EL COACH LA REVISA
        </div>
      )}

      {/* Mini-quiz */}
      <MicroLabel color={C.ai} size={9.5} style={{ margin: '0 0 10px' }}>MINI-QUIZ · 3 PREGUNTAS</MicroLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ctx.quiz.map((q, qi) => (
          <div key={qi} style={{ background: C.card, border: `1px solid ${BORDER.neutral}`, clipPath: cut(10), padding: '13px 14px' }}>
            <p style={{ margin: '0 0 10px', fontSize: 13.5, fontWeight: 800 }}>{q.q}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {q.opts.map((o, oi) => (
                <button
                  key={oi}
                  type="button"
                  onClick={o.onPick}
                  disabled={!o.onPick}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '11px 12px',
                    cursor: o.onPick ? 'pointer' : 'default',
                    textAlign: 'left',
                    background: o.selected ? 'rgba(255,215,0,.1)' : 'rgba(255,255,255,.02)',
                    border: `1px solid ${o.selected ? BORDER.goldStrong : 'rgba(255,255,255,.09)'}`,
                    clipPath: cut(7),
                  }}
                >
                  <span style={{ fontFamily: PIXEL, fontSize: 10, color: o.selected ? C.gold : C.text4, flex: 'none' }}>{o.selected ? '■' : '□'}</span>
                  <span style={{ fontSize: 12.5, color: o.selected ? C.text : C.text2 }}>{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
