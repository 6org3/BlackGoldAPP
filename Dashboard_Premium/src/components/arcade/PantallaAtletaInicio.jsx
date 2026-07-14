import { C, BORDER, GRAD, cut, HEX, PIXEL } from './arcadeTokens';
import HexAvatar from './HexAvatar';
import MicroLabel from './MicroLabel';
import XPCells from './XPCells';

/** A1 · Inicio / Base — hero de nivel/XP, hoy entrenas, alerta IA, misión
 *  destacada y próximo evento. Dirigida por ctx (buildAtletaCtx.ctxInicio). */
export default function PantallaAtletaInicio({ ctx }) {
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <MicroLabel color={C.goldDeep} size={9} tracking=".1em" style={{ marginBottom: 6 }}>{ctx.fechaLine}</MicroLabel>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.05 }}>
            Mi{' '}
            <span style={{ background: GRAD.goldText, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Base</span>
          </h1>
        </div>
        {ctx.racha ? (
          <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', border: `1px solid ${BORDER.warn}`, clipPath: cut(8) }}>
            <span aria-hidden="true" style={{ fontSize: 14 }}>🔥</span>
            <span style={{ fontFamily: PIXEL, fontSize: 9, color: C.warn }}>RACHA {ctx.racha}</span>
          </div>
        ) : null}
      </div>

      {/* Hero */}
      <div style={{ background: GRAD.heroGoldSoft, border: `1px solid ${BORDER.goldStrong}`, clipPath: cut(14), padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <HexAvatar size={64} initial={ctx.heroInicial} background={GRAD.infoAvatar} color={C.ink} glow style={{ fontSize: 22, filter: 'drop-shadow(0 0 14px rgba(96,165,250,.5))' }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontFamily: PIXEL, fontSize: 15, color: C.text }}>{(ctx.heroNombre || '').toUpperCase()}</p>
            <MicroLabel color={ctx.heroAccent} size={9.5} tracking="normal" style={{ marginTop: 4 }}>{ctx.nivelLine}</MicroLabel>
          </div>
          <div style={{ textAlign: 'center', flex: 'none' }}>
            <p style={{ margin: 0, fontFamily: PIXEL, fontSize: 22, color: C.gold }}>{ctx.pwr}</p>
            <MicroLabel color={C.text3} size={8} tracking=".04em" style={{ marginTop: 2 }}>PWR</MicroLabel>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <MicroLabel color={C.text3} size={8.5} tracking="normal">XP {ctx.xp.current.toLocaleString()} / {ctx.xp.required.toLocaleString()}</MicroLabel>
            <MicroLabel color={C.gold} size={8.5} tracking="normal">{ctx.xp.percentage}%</MicroLabel>
          </div>
          <XPCells filled={ctx.xp.filled} label="Progreso de XP" />
          <MicroLabel color={C.text3} size={8.5} tracking="normal" style={{ margin: '6px 0 0', textAlign: 'right' }}>
            {ctx.xp.esMax ? 'NIVEL MÁXIMO ⭐' : `FALTAN ${ctx.xp.faltan.toLocaleString()} XP → ${(ctx.xp.nextLevelName || '').toUpperCase()} ⭐`}
          </MicroLabel>
        </div>
      </div>

      {/* Hoy entrenas */}
      {ctx.hoyEntrenas && (
        <>
          <MicroLabel color={C.text3} size={9.5} style={{ margin: '0 0 8px' }}>HOY ENTRENAS</MicroLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.card, border: `1px solid ${BORDER.goldMid}`, clipPath: cut(12), padding: '13px 14px', marginBottom: 14 }}>
            <div style={{ width: 44, height: 44, clipPath: HEX, background: 'rgba(255,215,0,.16)', display: 'grid', placeItems: 'center', fontSize: 19, flex: 'none' }} aria-hidden="true">🏀</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800 }}>{[ctx.hoyEntrenas.time, ctx.hoyEntrenas.titulo].filter(Boolean).join(' · ')}</p>
              {ctx.hoyEntrenas.sub && <p style={{ margin: '2px 0 0', fontSize: 11, color: C.text2 }}>{ctx.hoyEntrenas.sub}</p>}
            </div>
            {ctx.hoyEntrenas.chip && (
              <span style={{ flex: 'none', fontFamily: PIXEL, fontSize: 9, color: C.cyan, border: `1px solid rgba(34,211,238,.35)`, padding: '7px 9px' }}>{ctx.hoyEntrenas.chip}</span>
            )}
          </div>
        </>
      )}

      {/* Alerta IA */}
      {ctx.alertaIA && (
        <div style={{ display: 'flex', gap: 11, background: 'rgba(34,211,238,.06)', border: `1px solid rgba(34,211,238,.25)`, clipPath: cut(10), padding: '12px 13px', marginBottom: 14 }}>
          <span aria-hidden="true" style={{ fontSize: 16, flex: 'none' }}>💧</span>
          <div>
            <MicroLabel color={C.cyan} size={8} tracking=".06em">TU ALERTA IA</MicroLabel>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.5, color: C.text }}>{ctx.alertaIA.text}</p>
          </div>
        </div>
      )}

      {/* Misión destacada */}
      {ctx.misionDestacada && (
        <>
          <MicroLabel color={C.ai} size={9.5} style={{ margin: '0 0 8px' }}>► MISIÓN DESTACADA</MicroLabel>
          <div style={{ background: C.card, border: `1px solid ${BORDER.ai}`, clipPath: cut(12), padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{ctx.misionDestacada.titulo}</p>
                {ctx.misionDestacada.sub && <p style={{ margin: '3px 0 0', fontSize: 11, color: C.text2 }}>{ctx.misionDestacada.sub}</p>}
              </div>
              <span style={{ fontFamily: PIXEL, fontSize: 11, color: C.gold, flex: 'none' }}>{ctx.misionDestacada.xpLabel}</span>
            </div>
            <div style={{ display: 'flex', gap: 3, marginTop: 12 }}>
              {ctx.misionDestacada.cells.map((c, i) => (
                <span key={i} style={{ flex: 1, height: 8, background: c }} />
              ))}
            </div>
            <button
              type="button"
              onClick={ctx.misionDestacada.onOpen}
              style={{ width: '100%', marginTop: 12, padding: 14, cursor: 'pointer', background: GRAD.goldCTA, color: C.ink, border: 'none', clipPath: cut(10), fontFamily: PIXEL, fontSize: 9, letterSpacing: '.04em' }}
            >
              {ctx.misionDestacada.ctaLabel}
            </button>
          </div>
        </>
      )}

      {/* Próximo evento */}
      {ctx.evento && (
        <>
          <MicroLabel color={C.text3} size={9.5} style={{ margin: '0 0 8px' }}>PRÓXIMO EVENTO</MicroLabel>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: C.card, border: `1px solid ${BORDER.neutral}`, clipPath: cut(10), padding: '12px 14px' }}>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>🏀 {ctx.evento.titulo}</p>
              {ctx.evento.sub && <p style={{ margin: '2px 0 0', fontSize: 10, color: C.text3 }}>{ctx.evento.sub}</p>}
            </div>
            <button
              type="button"
              onClick={ctx.evento.onVoy}
              style={{
                cursor: 'pointer',
                minHeight: 44,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 'none',
                fontFamily: PIXEL,
                fontSize: 9.5,
                padding: '9px 12px',
                background: ctx.evento.voyOn ? 'rgba(16,185,129,.15)' : 'transparent',
                border: `1px solid ${ctx.evento.voyOn ? 'rgba(16,185,129,.4)' : 'rgba(255,255,255,.14)'}`,
                color: ctx.evento.voyOn ? C.ok : C.text2,
              }}
            >
              {ctx.evento.voyLabel}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
