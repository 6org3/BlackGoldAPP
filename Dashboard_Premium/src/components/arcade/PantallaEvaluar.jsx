import { C, BORDER, GRAD, cut, PIXEL } from './arcadeTokens';
import { AXES, BADGE_DEFS } from './canchaMock';
import HexAvatar from './HexAvatar';
import MicroLabel from './MicroLabel';
import StarRating from './StarRating';
import Badge from './Badge';

const ATLETA_FALLBACK = { name: 'Atleta', hue: 'blue', pos: '—', pwr: 0 };

export default function PantallaEvaluar({ state, actions, roster = [] }) {
  const a = roster.find((x) => x.id === state.evalTargetId) || roster[0] || ATLETA_FALLBACK;
  const sc = state.scores[state.evalTargetId] || {};

  return (
    <div>
      {/* Cabecera del atleta */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          background: GRAD.heroGoldSoft,
          border: '1px solid rgba(255,215,0,.3)',
          clipPath: cut(14),
          padding: 15,
          marginBottom: 16,
        }}
      >
        <HexAvatar size={56} hue={a.hue} initial={a.name.charAt(0)} style={{ filter: 'drop-shadow(0 0 12px rgba(255,215,0,.35))', fontSize: 20 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: '-.02em' }}>{a.name}</p>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: C.text2 }}>{a.pos} · Sub-16 · destacado de hoy</p>
        </div>
        <div style={{ textAlign: 'center', flex: 'none' }}>
          <p style={{ margin: 0, fontFamily: PIXEL, fontSize: 18, color: C.gold }}>{a.pwr}</p>
          <MicroLabel color={C.text3} size={8} tracking="normal" style={{ marginTop: 2 }}>PWR</MicroLabel>
        </div>
      </div>

      {/* Ejes de estrellas */}
      <MicroLabel color={C.text3} size={9.5} style={{ marginBottom: 10 }}>EVALUACIÓN SUBJETIVA · 1–5 ★</MicroLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {AXES.map((ax) => {
          const val = sc[ax.key] || 0;
          const full = val === 5;
          return (
            <div
              key={ax.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                background: C.card,
                border: `1px solid ${full ? BORDER.goldStrong : BORDER.neutral}`,
                clipPath: cut(10),
                padding: '12px 14px',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>{ax.label}</p>
                <p style={{ margin: '2px 0 0', fontFamily: PIXEL, fontSize: 8, letterSpacing: '.04em', color: full ? C.gold : C.text3 }}>
                  {ax.hint}
                </p>
              </div>
              <StarRating value={val} label={ax.label} onRate={(i) => actions.setStar(ax.key, i)} />
            </div>
          );
        })}
      </div>

      {/* Insignias automáticas */}
      <MicroLabel color={C.text3} size={9.5} style={{ marginBottom: 10 }}>
        INSIGNIAS AUTOMÁTICAS <span style={{ color: C.ai }}>· AL LLEGAR A 5★</span>
      </MicroLabel>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {BADGE_DEFS.map((bd) => {
          const ax = AXES.find((x) => x.badge === bd.key);
          const unlocked = (sc[ax?.key] || 0) === 5;
          return <Badge key={bd.key} icon={bd.icon} name={bd.name} unlocked={unlocked} />;
        })}
      </div>
    </div>
  );
}
