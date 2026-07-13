import { C, BORDER, GRAD, cut, HEX, PIXEL, GLOW } from './arcadeTokens';
import { ROSTER, AXES, XP_POR_DESTACADO } from './canchaMock';
import HexAvatar from './HexAvatar';
import MicroLabel from './MicroLabel';

export default function PantallaFin({ state, actions }) {
  const ids = Object.keys(state.destacados).filter((id) => state.destacados[id]);
  const xpTotal = ids.length * XP_POR_DESTACADO;

  return (
    <div>
      <div style={{ textAlign: 'center', padding: '14px 0 6px' }}>
        <div
          style={{
            width: 76,
            height: 76,
            margin: '0 auto 16px',
            clipPath: HEX,
            background: GRAD.goldHex,
            display: 'grid',
            placeItems: 'center',
            fontSize: 34,
            animation: 'bg-pop .5s ease-out',
            boxShadow: GLOW.trophy,
          }}
          aria-hidden="true"
        >
          🏆
        </div>
        <MicroLabel as="p" color={C.ok} size={11} tracking=".06em" style={{ animation: 'bg-blink 1.1s infinite' }}>
          CLASE FINALIZADA
        </MicroLabel>
        <h1 style={{ margin: '10px 0 0', fontSize: 30, fontWeight: 900, letterSpacing: '-.03em' }}>
          +{xpTotal}{' '}
          <span style={{ background: GRAD.goldText, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>XP</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: C.text2 }}>repartido entre {ids.length} destacados</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '18px 0' }}>
        {ids.map((id) => {
          const a = ROSTER.find((x) => x.id === id) || {};
          const sc = state.scores[id] || {};
          const nb = AXES.filter((ax) => (sc[ax.key] || 0) === 5).length;
          const note = nb > 0 ? `${nb} insignia${nb > 1 ? 's' : ''} · destacado` : 'Destacado de hoy';
          return (
            <div
              key={id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                background: C.card,
                border: `1px solid ${BORDER.gold16}`,
                clipPath: cut(10),
                padding: '11px 13px',
                animation: 'bg-rise .4s ease-out',
              }}
            >
              <HexAvatar size={34} hue={a.hue} initial={(a.name || '?').charAt(0)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{a.name}</p>
                <p style={{ margin: '1px 0 0', fontSize: 9.5, color: C.text3 }}>{note}</p>
              </div>
              <span style={{ fontFamily: PIXEL, fontSize: 12, color: C.gold }}>+{XP_POR_DESTACADO}</span>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={actions.reset}
        style={{
          width: '100%',
          textAlign: 'center',
          padding: 15,
          background: 'transparent',
          border: `1px solid ${BORDER.goldStrong}`,
          color: C.gold,
          clipPath: cut(10),
          fontFamily: PIXEL,
          fontSize: 10,
          letterSpacing: '.04em',
          cursor: 'pointer',
        }}
      >
        ◄ VOLVER A CANCHA
      </button>
    </div>
  );
}
