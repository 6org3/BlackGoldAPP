import { C, BORDER, GRAD, cut, HEX, PIXEL, hueBg, hueFg } from './arcadeTokens';
import MicroLabel from './MicroLabel';

/** A5 · Eventos — convocatorias con RSVP (¿VAS?/VOY) e historial W/L.
 *  Dirigida por ctx.ctxEventos. */
export default function PantallaAtletaEventos({ ctx }) {
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, letterSpacing: '-.03em' }}>Eventos</h1>
        <MicroLabel color={C.text3} size={8.5} tracking=".06em" style={{ marginTop: 5 }}>
          {ctx.eventos.length ? `${ctx.eventos.length} PRÓXIMOS · TU EQUIPO TE ESPERA` : 'SIN EVENTOS PRÓXIMOS'}
        </MicroLabel>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        {ctx.eventos.map((e, i) => (
          <div key={i} style={{ background: C.card, border: `1px solid ${e.voy ? 'rgba(52,211,153,.4)' : BORDER.neutral}`, clipPath: cut(12), padding: 15 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, clipPath: HEX, background: hueBg(e.iconHue), display: 'grid', placeItems: 'center', fontSize: 20, flex: 'none' }} aria-hidden="true">{e.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{e.titulo}</p>
                {e.sub && <p style={{ margin: '3px 0 0', fontSize: 11.5, color: C.text2 }}>{e.sub}</p>}
              </div>
              <MicroLabel color={C.text3} size={8.5} tracking="normal" style={{ flex: 'none' }}>{e.confLabel}</MicroLabel>
            </div>
            <button
              type="button"
              onClick={e.onVoy}
              style={{
                width: '100%',
                marginTop: 13,
                padding: 14,
                cursor: 'pointer',
                clipPath: cut(10),
                fontFamily: PIXEL,
                fontSize: 10,
                letterSpacing: '.04em',
                background: e.voy ? 'rgba(52,211,153,.14)' : GRAD.goldHex,
                color: e.voy ? C.ok : C.ink,
                border: `1px solid ${e.voy ? 'rgba(52,211,153,.4)' : 'transparent'}`,
              }}
            >
              {e.voyLabel}
            </button>
          </div>
        ))}
        {ctx.eventos.length === 0 && <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>No tienes convocatorias abiertas.</p>}
      </div>

      <MicroLabel color={C.text3} size={9.5} style={{ margin: '0 0 8px' }}>HISTORIAL</MicroLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ctx.historial.map((h, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, background: C.card, border: `1px solid ${BORDER.neutral}`, clipPath: cut(10), padding: '11px 13px' }}>
            <div style={{ width: 34, height: 34, clipPath: HEX, background: hueBg(h.resHue), display: 'grid', placeItems: 'center', color: hueFg(h.resHue), fontFamily: PIXEL, fontSize: 11, flex: 'none' }}>{h.res}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{h.titulo}</p>
              {h.sub && <p style={{ margin: '1px 0 0', fontSize: 9.5, color: C.text3 }}>{h.sub}</p>}
            </div>
            {h.score && <span style={{ fontFamily: PIXEL, fontSize: 12, color: hueFg(h.resHue) }}>{h.score}</span>}
          </div>
        ))}
        {ctx.historial.length === 0 && <p style={{ margin: 0, fontSize: 12, color: C.text3 }}>Aún no hay partidos jugados.</p>}
      </div>
    </div>
  );
}
