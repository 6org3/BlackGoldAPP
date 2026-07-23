import { ChevronRight } from 'lucide-react';
import { C, BORDER, GRAD, cut, PIXEL, GLOW, hueFg, fmtClock } from './arcadeTokens';
import { agruparDrillsPorTipo } from './canchaData';
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

      {/* Plan de sesión (drills de la plantilla elegida). Presente también al
          reanudar: la plantilla se persiste (v49) y se reconstruye al cargar.
          Ausente solo en sesiones iniciadas sin plantilla. */}
      {focused.plantilla?.drills?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <MicroLabel color={C.text3} size={9.5} style={{ margin: '2px 0 8px' }}>
            PLAN DE SESIÓN · {focused.plantilla.titulo}
          </MicroLabel>
          <div style={{ background: C.card, border: `1px solid ${BORDER.neutral}`, clipPath: cut(12), padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {agruparDrillsPorTipo(focused.plantilla.drills).map(([tipo, ds]) => (
              <div key={tipo}>
                <MicroLabel color={C.goldDeep} size={8} tracking=".08em" style={{ marginBottom: 5 }}>{tipo}</MicroLabel>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {ds.map((d, i) => (
                    <li key={i} style={{ fontSize: 12, color: C.text2, lineHeight: 1.6 }}>{d.nombre}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

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
