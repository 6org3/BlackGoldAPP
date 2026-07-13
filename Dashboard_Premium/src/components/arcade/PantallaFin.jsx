import { C, BORDER, GRAD, cut, HEX, PIXEL, GLOW } from './arcadeTokens';
import { AXES } from './canchaMock';
import { xpClaseTotal } from './canchaSelectors';
import { xpEvaluacion } from '../../../../packages/analytics-core/xp.js';
import HexAvatar from './HexAvatar';
import MicroLabel from './MicroLabel';

export default function PantallaFin({ state, actions, roster = [] }) {
  // XP mostrado = lo realmente otorgado: asistencia (todos los presentes) +
  // evaluación (solo las GUARDADAS). Coincide con closeClass + saveSubjectiveEval (#7).
  const { total, base, presentCount, destacadoCount } = xpClaseTotal(state);
  // Lista a quienes contribuyen: destacados marcados + cualquiera con evaluación
  // guardada (por si se desmarcó tras guardar). XP/insignias desde el snapshot.
  const presentIds = Object.keys(state.present || {}).filter((id) => state.present[id] === 'P');
  const ids = presentIds.filter((id) => state.destacados[id] || state.savedIds?.[id]);

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
          +{total}{' '}
          <span style={{ background: GRAD.goldText, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>XP</span>
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: C.text2 }}>
          {presentCount} presente{presentCount === 1 ? '' : 's'} · {destacadoCount} destacado{destacadoCount === 1 ? '' : 's'}
        </p>
        {base > 0 && (
          <p style={{ margin: '3px 0 0', fontSize: 10.5, color: C.text3 }}>
            incluye +{base} XP base de asistencia
          </p>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '18px 0' }}>
        {ids.map((id) => {
          const a = roster.find((x) => x.id === id) || {};
          const sc = state.savedScores?.[id] || {};
          const nb = AXES.filter((ax) => (sc[ax.key] || 0) === 5).length;
          const xpA = xpEvaluacion(sc);
          const note = nb > 0 ? `${nb} insignia${nb > 1 ? 's' : ''} · destacado` : xpA > 0 ? 'Destacado evaluado' : 'Destacado · sin evaluar';
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
              <span style={{ fontFamily: PIXEL, fontSize: 12, color: xpA > 0 ? C.gold : C.text3 }}>+{xpA}</span>
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
