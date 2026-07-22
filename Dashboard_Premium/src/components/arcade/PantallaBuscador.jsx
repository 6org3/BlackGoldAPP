import { useState } from 'react';
import { Search } from 'lucide-react';
import { C, BORDER, cut, PIXEL } from './arcadeTokens';
import CutCard from './CutCard';
import HexAvatar from './HexAvatar';
import { coincideBusqueda } from '../../lib/normalizarTexto';

export default function PantallaBuscador({ state, actions, roster = [] }) {
  const [q, setQ] = useState('');
  const term = q.trim();
  // Filtra por nombre o cédula (el placeholder ya lo anuncia) (#9), insensible
  // a tildes como el buscador del plantel ('Nuñez' encuentra 'Núñez').
  const rows = term ? roster.filter((a) => coincideBusqueda(`${a.name} ${a.cedula || ''}`, term)) : roster;

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: C.text2, lineHeight: 1.5 }}>
        Sesión <b style={{ color: C.text }}>Privada 1v1</b>. Busca y elige al atleta.
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: C.card,
          border: `1px solid rgba(255,215,0,.2)`,
          clipPath: cut(10),
          padding: '13px 14px',
          marginBottom: 14,
        }}
      >
        <Search size={14} strokeWidth={2} color={C.text3} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar nombre o cédula…"
          aria-label="Buscar atleta"
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: C.text,
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((a) => {
          const chosen = !!state.present[a.id];
          return (
            <CutCard
              key={a.id}
              onClick={() => actions.chooseToggle(a.id)}
              ariaLabel={`${chosen ? 'Quitar' : 'Elegir'} a ${a.name}`}
              background={chosen ? 'rgba(255,215,0,.1)' : C.card}
              border={chosen ? 'rgba(255,215,0,.45)' : BORDER.neutral}
              padding="11px 12px"
              style={{ display: 'flex', alignItems: 'center', gap: 11 }}
            >
              <HexAvatar size={34} hue={a.hue} initial={a.name.charAt(0)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>{a.name}</p>
                <p style={{ margin: '1px 0 0', fontSize: 10, color: C.text3 }}>
                  {a.pos} · Sub-16 · PWR {a.pwr}
                </p>
              </div>
              <span style={{ fontFamily: PIXEL, fontSize: 14, color: chosen ? C.gold : C.text3 }}>
                {chosen ? '✓' : '+'}
              </span>
            </CutCard>
          );
        })}
      </div>
    </div>
  );
}
