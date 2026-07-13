import { C, BORDER, PIXEL } from './arcadeTokens';
import { LEVELS } from './canchaMock';
import CutCard from './CutCard';
import HexAvatar from './HexAvatar';
import MicroLabel from './MicroLabel';

// Colores por tier (Micro cian, Desarrollo oro, Elite verde) — del prototipo.
const TIER = {
  cyan: { ic: 'rgba(34,211,238,.18)', icf: C.cyan, br: 'rgba(34,211,238,.28)' },
  gold: { ic: 'rgba(255,215,0,.2)', icf: C.gold, br: BORDER.goldStrong },
  green: { ic: 'rgba(52,211,153,.18)', icf: C.ok, br: 'rgba(52,211,153,.3)' },
};

export default function PantallaNivel({ actions }) {
  return (
    <div>
      <p style={{ margin: '0 0 4px', fontSize: 13, color: C.text2, lineHeight: 1.5 }}>
        Sesión <b style={{ color: C.text }}>Sub-16 · Físico</b>. Elige el bloque de nivel para pasar lista.
      </p>
      <MicroLabel color={C.text3} style={{ margin: '14px 0 10px' }}>BLOQUE DE NIVEL</MicroLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {LEVELS.map((lv) => {
          const t = TIER[lv.hue] || TIER.gold;
          return (
            <CutCard
              key={lv.name}
              cut={12}
              onClick={() => actions.pickLevel(lv.name)}
              ariaLabel={`Bloque ${lv.name}, ${lv.count} atletas`}
              border={t.br}
              padding="16px"
              style={{ display: 'flex', alignItems: 'center', gap: 14 }}
            >
              <HexAvatar size={44} background={t.ic} color={t.icf}>
                <span style={{ fontFamily: PIXEL, fontSize: 15, fontWeight: 400 }}>{lv.tier}</span>
              </HexAvatar>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-.02em' }}>{lv.name}</p>
                <p style={{ margin: '3px 0 0', fontSize: 11, color: C.text2 }}>{lv.desc}</p>
              </div>
              <div style={{ textAlign: 'right', flex: 'none' }}>
                <p style={{ margin: 0, fontFamily: PIXEL, fontSize: 17, color: t.icf }}>{lv.count}</p>
                <MicroLabel color={C.text3} size={8} tracking="normal" style={{ margin: '2px 0 0' }}>ATLETAS</MicroLabel>
              </div>
            </CutCard>
          );
        })}
      </div>
    </div>
  );
}
