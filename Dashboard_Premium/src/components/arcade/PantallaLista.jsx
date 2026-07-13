import { C, BORDER, cut, PIXEL } from './arcadeTokens';
import { ROSTER } from './canchaMock';
import HexAvatar from './HexAvatar';
import MicroLabel from './MicroLabel';
import SegmentToggle from './SegmentToggle';

export default function PantallaLista({ state, actions }) {
  const listRoster = state.classType === '1v1' ? ROSTER.filter((a) => state.present[a.id]) : ROSTER;
  const presentCount = listRoster.filter((a) => state.present[a.id] === 'P').length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: C.text2 }}>
          Sub-16 · {state.level || '1v1'} · Físico
        </p>
        <button
          type="button"
          onClick={actions.allPresent}
          style={{
            flex: 'none',
            padding: '9px 12px',
            background: 'transparent',
            border: `1px solid ${BORDER.okStrong}`,
            color: C.ok,
            clipPath: cut(8),
            fontFamily: PIXEL,
            fontSize: 8.5,
            letterSpacing: '.04em',
            cursor: 'pointer',
          }}
        >
          TODOS ✓
        </button>
      </div>

      {/* Contador de presentes */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: C.card,
          border: `1px solid ${BORDER.goldMid}`,
          clipPath: cut(12),
          padding: '12px 14px',
          marginBottom: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <MicroLabel color={C.text3} size={8.5} tracking=".06em">PRESENTES</MicroLabel>
          <p style={{ margin: '4px 0 0' }}>
            <span style={{ fontFamily: PIXEL, fontSize: 21, color: C.ok }}>{presentCount}</span>
            <span style={{ fontFamily: PIXEL, fontSize: 13, color: C.text3 }}> / {listRoster.length}</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }} aria-hidden="true">
          {listRoster.map((a, i) => (
            <span key={a.id} style={{ width: 7, height: 20, background: i < presentCount ? C.ok : 'rgba(255,255,255,.1)' }} />
          ))}
        </div>
      </div>

      {/* Filas de roster */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {listRoster.map((a) => {
          const st = state.present[a.id];
          const rowBorder = st === 'P' ? 'rgba(16,185,129,.35)' : st === 'A' ? 'rgba(239,68,68,.3)' : BORDER.neutral;
          return (
            <div
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: C.card,
                border: `1px solid ${rowBorder}`,
                clipPath: cut(10),
                padding: '9px 11px',
              }}
            >
              <HexAvatar size={34} hue={a.hue} initial={a.name.charAt(0)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{a.name}</p>
                <p style={{ margin: '1px 0 0', fontSize: 9.5, color: C.text3 }}>{a.pos + (a.alert ? ` · ${a.alert}` : '')}</p>
              </div>
              <SegmentToggle
                value={st}
                name={a.name}
                onPresent={() => actions.mark(a.id, 'P')}
                onAbsent={() => actions.mark(a.id, 'A')}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
