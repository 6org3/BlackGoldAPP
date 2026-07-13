import { C, BORDER, cut, PIXEL, fmtClock } from './arcadeTokens';
import { AXES } from './canchaMock';
import { presentesP } from './canchaSelectors';
import HexAvatar from './HexAvatar';
import MicroLabel from './MicroLabel';

export default function PantallaCierre({ state, actions, roster = [] }) {
  const present = presentesP(state, roster);
  const destacadoCount = present.filter((a) => state.destacados[a.id]).length;

  return (
    <div>
      <p style={{ margin: '0 0 4px', fontSize: 13, color: C.text2, lineHeight: 1.5 }}>
        La clase terminó en <b style={{ color: C.text }}>{fmtClock(state.lastElapsed)}</b>. Marca a los destacados y
        evalúalos antes de repartir XP.
      </p>
      <MicroLabel color={C.text3} style={{ margin: '16px 0 10px' }}>
        DESTACADOS DE HOY <span style={{ color: C.gold }}>· {destacadoCount} ELEGIDOS</span>
      </MicroLabel>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
        {present.map((a) => {
          const sel = !!state.destacados[a.id];
          const saved = !!state.savedIds[a.id];
          // Insignias desde el snapshot guardado (no scores en vivo): el chip
          // refleja lo realmente otorgado aunque se reabra y editen estrellas (#7).
          const sc = state.savedScores?.[a.id] || {};
          const insignias = Object.values(sc).filter((v) => v === 5).length; // ejes a 5★ (#10)
          let status, statusColor;
          if (!sel) {
            status = 'Toca el hexágono para destacar';
            statusColor = C.text3;
          } else if (saved) {
            status = insignias > 0 ? `✓ Evaluado · ${insignias} insignia${insignias === 1 ? '' : 's'}` : '✓ Evaluado';
            statusColor = C.ok;
          } else {
            status = '★ Destacado · falta evaluar';
            statusColor = C.gold;
          }
          return (
            <div
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                background: sel ? 'rgba(255,215,0,.08)' : C.card,
                border: `1px solid ${sel ? BORDER.goldStrong : BORDER.neutral}`,
                clipPath: cut(10),
                padding: '10px 12px',
              }}
            >
              <HexAvatar
                size={34}
                hue={a.hue}
                initial={a.name.charAt(0)}
                onClick={() => actions.toggleDestacado(a.id)}
                ariaLabel={`${sel ? 'Quitar de' : 'Marcar como'} destacado a ${a.name}`}
                style={sel ? { boxShadow: '0 0 0 2px rgba(255,215,0,.5)' } : undefined}
              />
              <button
                type="button"
                onClick={() => actions.toggleDestacado(a.id)}
                style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
              >
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{a.name}</p>
                <p style={{ margin: '1px 0 0', fontSize: 9.5, color: statusColor }}>{status}</p>
              </button>
              {sel && (
                <button
                  type="button"
                  onClick={() => actions.openEval(a.id)}
                  aria-label={`Evaluar a ${a.name}`}
                  style={{
                    flex: 'none',
                    padding: '9px 12px',
                    clipPath: cut(7),
                    background: saved ? 'rgba(52,211,153,.12)' : 'rgba(255,215,0,.1)',
                    border: `1px solid ${saved ? BORDER.okSoft : BORDER.goldStrong}`,
                    color: saved ? C.ok : C.gold,
                    fontFamily: PIXEL,
                    fontSize: 8.5,
                    letterSpacing: '.03em',
                    cursor: 'pointer',
                  }}
                >
                  {saved ? `✓ ${insignias}/${AXES.length}` : 'EVALUAR'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 11, color: C.text3, lineHeight: 1.5 }}>
        Toca el hexágono para marcar destacado · toca <b style={{ color: C.text2 }}>EVALUAR</b> para las estrellas.
      </p>
    </div>
  );
}
