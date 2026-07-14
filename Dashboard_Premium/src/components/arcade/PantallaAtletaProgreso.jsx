import { C, BORDER, GRAD, cut, HEX, PIXEL } from './arcadeTokens';
import MicroLabel from './MicroLabel';
import RadarChart from './RadarChart';

const NODE = {
  done: { size: 40, bg: 'rgba(34,211,238,.16)', color: C.cyan, glow: 'none' },
  current: { size: 48, bg: GRAD.goldHex, color: C.ink, glow: 'drop-shadow(0 0 12px rgba(255,215,0,.5))' },
  locked: { size: 40, bg: 'rgba(255,255,255,.05)', color: C.text4, glow: 'none' },
};
const LABEL_COLOR = { done: C.cyan, current: C.gold, locked: C.text4 };

function Rango({ r, extra }) {
  const s = NODE[r.state];
  return (
    <div style={{ textAlign: 'center', flex: 'none' }}>
      <div style={{ width: s.size, height: s.size, margin: '0 auto', clipPath: HEX, background: s.bg, display: 'grid', placeItems: 'center', color: s.color, fontFamily: PIXEL, fontSize: r.state === 'current' ? 13 : 12, filter: s.glow }}>
        {r.tier}
      </div>
      <MicroLabel color={LABEL_COLOR[r.state]} size={7} tracking="normal" style={{ marginTop: 6 }}>
        {r.state === 'done' ? `${r.label} ✓` : extra ? `${r.label} · ${extra}` : r.label}
      </MicroLabel>
    </div>
  );
}

/** A4 · Progreso — rangos de desarrollo, radar táctil de 7 pilares, filas de
 *  pilares sincronizadas, insignias y XP semanal. Dirigida por ctx.ctxProgreso. */
export default function PantallaAtletaProgreso({ ctx }) {
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, letterSpacing: '-.03em' }}>Progreso</h1>
        <MicroLabel color={C.text3} size={8.5} tracking=".06em" style={{ marginTop: 5 }}>{ctx.resumenLine}</MicroLabel>
      </div>

      {/* Rangos */}
      <div style={{ display: 'flex', alignItems: 'center', background: C.card, border: `1px solid ${BORDER.gold16}`, clipPath: cut(12), padding: '14px 16px', marginBottom: 14 }}>
        {ctx.rangos.map((r, i) => (
          <div key={r.label} style={{ display: 'contents' }}>
            {i > 0 && (
              <div style={{ flex: 1, height: 2, margin: '0 8px 16px', background: r.state === 'locked' ? 'rgba(255,255,255,.1)' : 'linear-gradient(90deg,#22D3EE,#FFD700)' }} />
            )}
            <Rango r={r} extra={r.state === 'locked' ? '160 XP' : null} />
          </div>
        ))}
      </div>

      {/* Radar táctil */}
      <MicroLabel color={C.text3} size={9.5} style={{ margin: '0 0 8px' }}>MIS 7 PILARES · TOCA UNO</MicroLabel>
      <div style={{ background: C.card, border: `1px solid ${BORDER.gold}`, clipPath: cut(12), padding: '10px 14px 12px', marginBottom: 14, textAlign: 'center' }}>
        <RadarChart axes={ctx.radar} selectedKey={ctx.selKey} onSelect={ctx.onPilarPick} accent={C.gold} />
        <div style={{ textAlign: 'left', background: 'rgba(255,215,0,.05)', border: `1px solid rgba(255,215,0,.2)`, clipPath: cut(8), padding: '11px 12px', marginTop: 4 }}>
          <MicroLabel color={C.ai} size={8} tracking=".06em" style={{ marginBottom: 5 }}>✦ {ctx.pilarTipTitle}</MicroLabel>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>{ctx.pilarTipText}</p>
        </div>
      </div>

      {/* Filas de pilares */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
        {ctx.pilarRows.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={p.onPick}
            style={{ display: 'flex', alignItems: 'center', minHeight: 44, gap: 10, textAlign: 'left', cursor: 'pointer', background: C.card, border: `1px solid ${p.isSel ? BORDER.goldStrong : 'rgba(255,255,255,.07)'}`, clipPath: cut(8), padding: '10px 12px' }}
          >
            <span style={{ width: 92, flex: 'none', fontFamily: PIXEL, fontSize: 8, letterSpacing: '.04em', color: p.isSel ? C.gold : C.text2 }}>{p.label}</span>
            <div style={{ flex: 1, display: 'flex', gap: 2 }}>
              {p.cells.map((c, i) => (
                <span key={i} style={{ flex: 1, height: 9, background: c }} />
              ))}
            </div>
            <span style={{ flex: 'none', width: 26, textAlign: 'right', fontFamily: PIXEL, fontSize: 10, color: p.isSel ? C.gold : C.text2 }}>{p.valLabel}</span>
          </button>
        ))}
      </div>

      {/* Insignias */}
      <MicroLabel color={C.text3} size={9.5} style={{ margin: '0 0 10px' }}>MIS INSIGNIAS</MicroLabel>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {ctx.insignias.map((b, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ width: 54, height: 54, margin: '0 auto', clipPath: HEX, background: b.unlocked ? GRAD.goldHex : 'rgba(255,255,255,.04)', display: 'grid', placeItems: 'center', fontSize: 21, boxShadow: b.unlocked ? '0 0 20px rgba(255,215,0,.45)' : 'none', filter: b.unlocked ? 'none' : 'grayscale(1) opacity(.4)' }}>
              <span aria-hidden="true">{b.icon}</span>
            </div>
            <p style={{ margin: '7px 0 0', fontFamily: PIXEL, fontSize: 7, letterSpacing: '.02em', lineHeight: 1.35, whiteSpace: 'pre-line', color: b.unlocked ? C.gold : C.text4 }}>{b.name}</p>
            <p style={{ margin: '3px 0 0', fontFamily: PIXEL, fontSize: 8, color: b.unlocked ? C.text : C.text4 }}>{b.countLabel}</p>
          </div>
        ))}
      </div>

      {/* XP semanal */}
      <MicroLabel color={C.text3} size={9.5} style={{ margin: '0 0 10px' }}>XP · ÚLTIMAS 6 SEMANAS</MicroLabel>
      <div style={{ background: C.card, border: `1px solid ${BORDER.neutral}`, clipPath: cut(12), padding: '14px 16px 12px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          {ctx.weeks.map((w, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ margin: '0 0 5px', fontFamily: PIXEL, fontSize: 8, color: w.last ? C.gold : C.text3 }}>{w.xp}</p>
              <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 2, height: 56 }}>
                {w.cells.map((c, j) => (
                  <div key={j} style={{ height: 7, flex: 'none', background: c, clipPath: cut(2) }} />
                ))}
              </div>
              <p style={{ margin: '6px 0 0', fontFamily: PIXEL, fontSize: 7, color: C.text4 }}>{w.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
