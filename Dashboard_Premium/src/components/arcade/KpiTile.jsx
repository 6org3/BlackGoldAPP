import { PIXEL, C, cut as cutPath } from './arcadeTokens';
import MicroLabel from './MicroLabel';

/** Celda KPI del dashboard del dueño (grid 2×2): micro-label + número Silkscreen
 *  semántico + subtexto. Superficie CutCard cut(10). */
export default function KpiTile({ label, val, color = C.gold, sub, border = 'rgba(255,255,255,.08)' }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${border}`, clipPath: cutPath(10), padding: '13px 14px' }}>
      <MicroLabel color={C.text3} size={7.5} tracking=".06em">{label}</MicroLabel>
      <p style={{ margin: '8px 0 0', fontFamily: PIXEL, fontSize: 21, color }}>{val}</p>
      {sub && <p style={{ margin: '6px 0 0', fontSize: 10.5, color: C.text2 }}>{sub}</p>}
    </div>
  );
}
