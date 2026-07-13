import { C } from './arcadeTokens';
import MicroLabel from './MicroLabel';
import Pill from './Pill';
import RankRow from './RankRow';

/** D4 · Equipo (coaches) — ranking reordenable por asistencia / sesiones / XP. */
export default function PanelEquipo({ ctx }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <MicroLabel as="span" color={C.text3} size={8} tracking=".06em" style={{ marginRight: 2 }}>ORDENAR:</MicroLabel>
        {ctx.sorts.map((so) => (
          <Pill key={so.label} label={so.label} active={so.active} onClick={so.onPick} cut={6} size={8} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        {ctx.coaches.map((c, i) => <RankRow key={i} c={c} />)}
      </div>
      <p style={{ margin: 0, fontSize: 11, color: C.text3, lineHeight: 1.5 }}>Ranking según la métrica elegida · datos últimos 30 días.</p>
    </div>
  );
}
