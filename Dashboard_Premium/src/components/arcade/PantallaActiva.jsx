import { ChevronRight } from 'lucide-react';
import { C, BORDER, GRAD, cut, HEX, PIXEL, GLOW, hueFg, fmtClock } from './arcadeTokens';
import MicroLabel from './MicroLabel';
import CutCard from './CutCard';
import LiveDot from './LiveDot';

export default function PantallaActiva({ focused, others, actions }) {
  const onFinish = () => (focused.evaluable ? actions.terminateEval(focused.id) : actions.terminateBg(focused.id));

  return (
    <div>
      {/* Sesión en foco */}
      <div
        style={{
          background: GRAD.activeGreen,
          border: `1px solid ${BORDER.ok}`,
          clipPath: cut(14),
          padding: 18,
          marginBottom: 14,
        }}
      >
        <MicroLabel color={C.ok} size={9.5} tracking="normal" style={{ marginBottom: 12 }}>
          <span aria-hidden="true" style={{ animation: 'bg-blink 1.3s infinite' }}>●</span> SESIÓN EN FOCO
        </MicroLabel>
        <div style={{ textAlign: 'center', padding: '6px 0 10px' }}>
          <p style={{ margin: 0, fontFamily: PIXEL, fontSize: 52, letterSpacing: '.02em', color: C.ok, lineHeight: 1, textShadow: GLOW.timer }}>
            {fmtClock(focused.elapsed)}
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 15, fontWeight: 800 }}>{focused.label}</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: C.text2 }}>
            {focused.block || '—'} · {focused.present} presentes · inicio {focused.start}
          </p>
        </div>
      </div>

      {/* Otras sesiones activas */}
      {others.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '2px 0 8px' }}>
            <MicroLabel color={C.text3} size={9.5}>OTRAS SESIONES ACTIVAS · {others.length}</MicroLabel>
            <MicroLabel color={C.text4} size={8} tracking="normal">TOCA PARA CAMBIAR</MicroLabel>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {others.map((o) => (
              <CutCard
                key={o.id}
                onClick={() => actions.focusSession(o.id)}
                ariaLabel={`Cambiar el foco a ${o.label}`}
                padding="11px 13px"
                style={{ display: 'flex', alignItems: 'center', gap: 11 }}
              >
                <LiveDot color={hueFg(o.hue)} speed="1.6s" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{o.label}</p>
                  <p style={{ margin: '1px 0 0', fontSize: 10, color: C.text3 }}>
                    {o.block} · {o.present} pres.
                  </p>
                </div>
                <span style={{ fontFamily: PIXEL, fontSize: 14, color: C.ok }}>{fmtClock(o.elapsed)}</span>
                <ChevronRight size={15} strokeWidth={2.4} color={C.text3} style={{ flex: 'none' }} />
              </CutCard>
            ))}
          </div>
        </>
      )}

      {/* En esta clase (solo sesión evaluable) */}
      {focused.evaluable && (
        <>
          <MicroLabel color={C.text3} size={9.5} style={{ marginBottom: 8 }}>EN ESTA CLASE</MicroLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.card, border: `1px solid ${BORDER.neutral}`, clipPath: cut(10), padding: '13px 14px' }}>
              <div style={{ width: 34, height: 34, clipPath: HEX, background: 'rgba(255,215,0,.16)', display: 'grid', placeItems: 'center', fontSize: 16, flex: 'none' }} aria-hidden="true">📋</div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Bloque físico · circuito</p>
                <p style={{ margin: '2px 0 0', fontSize: 10, color: C.text3 }}>Plantilla cargada · 4 estaciones</p>
              </div>
              <span style={{ fontFamily: PIXEL, fontSize: 9, color: C.ok }}>EN CURSO</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.card, border: `1px solid ${BORDER.neutral}`, clipPath: cut(10), padding: '13px 14px' }}>
              <div style={{ width: 34, height: 34, clipPath: HEX, background: 'rgba(96,165,250,.16)', display: 'grid', placeItems: 'center', fontSize: 16, flex: 'none' }} aria-hidden="true">💧</div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>Recordatorio hidratación</p>
                <p style={{ margin: '2px 0 0', fontSize: 10, color: C.text3 }}>Mateo Chávez · alerta IA</p>
              </div>
              <span style={{ fontFamily: PIXEL, fontSize: 9, color: C.gold }}>OK</span>
            </div>
          </div>
        </>
      )}

      {/* CTA terminar */}
      <button
        type="button"
        onClick={onFinish}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: 16,
          background: GRAD.goldCTA,
          color: C.ink,
          border: 'none',
          clipPath: cut(12),
          fontFamily: PIXEL,
          fontSize: 11,
          letterSpacing: '.04em',
          cursor: 'pointer',
        }}
      >
        {focused.evaluable ? '■ TERMINAR Y EVALUAR' : '■ TERMINAR SESIÓN'}
      </button>
    </div>
  );
}
